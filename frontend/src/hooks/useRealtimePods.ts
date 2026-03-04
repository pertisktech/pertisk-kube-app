import { useEffect, useState, useRef, useCallback } from 'react';
import { getAuthToken } from '../utils/auth';

export type ResourceType = 'pods' | 'deployments' | 'services' | 'nodes';

interface UseRealtimePodsOptions {
  enabled?: boolean;
  reconnectInterval?: number;
}

// Transform raw Kubernetes pod to frontend Pod type
const transformPod = (rawPod: any): any => {
  const metadata = rawPod.metadata || {};
  const status = rawPod.status || {};
  const spec = rawPod.spec || {};

  // Calculate ready status
  const containerStatuses = status.containerStatuses || [];
  const initContainerStatuses = status.initContainerStatuses || [];
  const containers = spec.containers || [];
  const ownerReferences = metadata.ownerReferences || [];
  const controlledBy = ownerReferences[0]?.kind || '-';
  const qos = status.qosClass || '-';
  const cpu = '-';
  const memory = '-';
  const readyCount = containerStatuses.filter((c: any) => c.ready).length;
  const totalCount = containers.length || containerStatuses.length || 0;
  const ready = totalCount > 0 ? `${readyCount}/${totalCount}` : '0/0';

  // Calculate restarts (both init and regular containers)
  const restarts = containerStatuses.reduce((sum: number, c: any) => sum + (c.restartCount || 0), 0);

  // Determine detailed pod status based on lifecycle
  let podStatus = status.phase || 'Unknown';
  const phase = status.phase || 'Unknown';
  
  // Priority 1: Check for deletion/termination
  if (metadata.deletionTimestamp) {
    podStatus = 'Terminating';
  }
  // Priority 2: Check init containers (they run first)
  else if (initContainerStatuses.length > 0 && phase === 'Pending') {
    for (const initStatus of initContainerStatuses) {
      if (initStatus.state?.waiting) {
        podStatus = initStatus.state.waiting.reason || 'PodInitializing';
        break;
      } else if (initStatus.state?.running) {
        podStatus = 'PodInitializing';
        break;
      } else if (initStatus.state?.terminated && initStatus.state.terminated.exitCode !== 0) {
        podStatus = 'Init:' + (initStatus.state.terminated.reason || 'Error');
        break;
      }
    }
  }
  // Priority 3: Handle Pending phase
  else if (phase === 'Pending') {
    const conditions = status.conditions || [];
    const scheduledCondition = conditions.find((c: any) => c.type === 'PodScheduled');
    
    // Check if pod is unschedulable
    if (scheduledCondition && scheduledCondition.status === 'False') {
      podStatus = scheduledCondition.reason || 'Unschedulable';
    }
    // Check container statuses for specific waiting reasons
    else if (containerStatuses.length > 0) {
      let foundWaitingReason = false;
      for (const containerStatus of containerStatuses) {
        if (containerStatus.state?.waiting) {
          const reason = containerStatus.state.waiting.reason;
          if (reason) {
            podStatus = reason;
            foundWaitingReason = true;
            break;
          }
        } else if (containerStatus.state?.running) {
          // Container is running but pod phase is still Pending
          // This can happen during startup - check if ready
          if (readyCount < totalCount) {
            podStatus = 'ContainerStarting';
            foundWaitingReason = true;
            break;
          }
        }
      }
      if (!foundWaitingReason) {
        podStatus = 'ContainerCreating';
      }
    } else {
      podStatus = 'ContainerCreating';
    }
  }
  // Priority 4: Handle Running phase - check for issues
  else if (phase === 'Running') {
    let hasError = false;
    const errorWaitingReasons = [
      'CrashLoopBackOff',
      'ImagePullBackOff',
      'ErrImagePull',
      'ErrImageNeverPull',
      'CreateContainerConfigError',
      'InvalidImageName',
      'CreateContainerError',
      'PreStartHookError',
      'PostStartHookError'
    ];
    
    // Check for container issues (CrashLoopBackOff, errors, etc.)
    for (const containerStatus of containerStatuses) {
      // Check waiting state - only flag actual errors, not normal startup
      if (containerStatus.state?.waiting) {
        const reason = containerStatus.state.waiting.reason;
        if (reason && errorWaitingReasons.includes(reason)) {
          podStatus = reason;
          hasError = true;
          break;
        }
      }
      // Check terminated state (container crashed)
      else if (containerStatus.state?.terminated) {
        const reason = containerStatus.state.terminated.reason;
        if (reason && reason !== 'Completed') {
          podStatus = reason;
          hasError = true;
          break;
        }
      }
    }
    
    // If no errors found, check readiness
    if (!hasError) {
      // Check if not all containers are ready
      if (readyCount < totalCount) {
        podStatus = 'NotReady';
      } else {
        podStatus = 'Running';
      }
    }
  }
  // Priority 5: Handle Succeeded phase
  else if (phase === 'Succeeded') {
    podStatus = 'Completed';
  }
  // Priority 6: Handle Failed phase
  else if (phase === 'Failed') {
    // Try to get more specific reason from containers
    for (const containerStatus of containerStatuses) {
      if (containerStatus.state?.terminated) {
        const reason = containerStatus.state.terminated.reason;
        if (reason) {
          podStatus = reason;
          break;
        }
      }
    }
    if (podStatus === phase) {
      podStatus = 'Error';
    }
  }

  return {
    name: metadata.name || '',
    namespace: metadata.namespace || '',
    status: podStatus,
    phase: phase,
    ready,
    restarts,
    age: metadata.creationTimestamp || '',
    node: spec.nodeName || '',
    pod_ip: status.podIP || '',
    cpu,
    memory,
    controlled_by: controlledBy,
    qos,
  };
};

export const useRealtimePods = <T>(options: UseRealtimePodsOptions = {}) => {
  const { enabled = true, reconnectInterval = 3000 } = options;
  
  const [data, setData] = useState<T[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<number>();
  const reconnectAttemptsRef = useRef(0);
  const maxReconnectAttempts = 10;
  const deletionTimeoutsRef = useRef<Map<string, number>>(new Map()); // Track deletion timeouts

  const syncPodDetails = useCallback(async () => {
    const token = getAuthToken();
    if (!token) return;

    try {
      const response = await fetch('/api/pods', {
        headers: {
          Authorization: token,
        },
      });

      if (!response.ok) return;

      const payload = await response.json();
      const apiPods: any[] = Array.isArray(payload?.data) ? (payload.data as any[]) : [];

      setData((prevData) => {
        const keyOf = (item: any) => `${item.namespace}/${item.name}`;
        const apiByKey = new Map<string, any>(apiPods.map((item: any) => [keyOf(item), item]));

        const merged = prevData.map((item: any) => {
          const apiItem = apiByKey.get(keyOf(item));
          if (!apiItem) return item;

          return {
            ...item,
            cpu: apiItem.cpu ?? item.cpu,
            memory: apiItem.memory ?? item.memory,
            controlled_by: apiItem.controlled_by ?? item.controlled_by,
            qos: apiItem.qos ?? item.qos,
          };
        });

        if (merged.length === 0 && apiPods.length > 0) {
          return apiPods as T[];
        }

        const existingKeys = new Set(merged.map((item: any) => keyOf(item)));
        for (const apiItem of apiPods) {
          const key = keyOf(apiItem);
          if (!existingKeys.has(key)) {
            merged.push(apiItem as T);
          }
        }

        return merged as T[];
      });
    } catch (syncError) {
      console.error('[useRealtimePods] Failed to sync pod details:', syncError);
    }
  }, []);

  const connect = useCallback(() => {
    if (!enabled) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.hostname;
    const port = window.location.port ? `:${window.location.port}` : '';
    const wsUrl = `${protocol}//${host}${port}/ws`;

    try {
      const ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        console.log('[useRealtimePods] WebSocket connected');
        setIsConnected(true);
        setError(null);
        reconnectAttemptsRef.current = 0;

        // Subscribe to pods
        ws.send(JSON.stringify({
          type: 'subscribe',
          resource: 'pods'
        }));
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);

          if (message.type === 'resource_update' && message.resource === 'pods') {
            const { action, data: rawPodData } = message;
            const transformedPod = transformPod(rawPodData);
            
            // Debug log for status changes
            if (transformedPod.status === 'NotReady' || 
                transformedPod.status === 'ContainerStarting' ||
                transformedPod.status === 'Terminating') {
              console.log(`[useRealtimePods] ${action} pod: ${transformedPod.namespace}/${transformedPod.name} - Status: ${transformedPod.status}, Ready: ${transformedPod.ready}`);
            }

            setData((prevData) => {
              switch (action) {
                case 'ADDED':
                  // Check if already exists
                  const exists = prevData.some((item: any) => {
                    const itemRaw = item as any;
                    return itemRaw.name === transformedPod.name && 
                           itemRaw.namespace === transformedPod.namespace;
                  });
                  if (exists) {
                    // Update existing pod instead of skipping
                    return prevData.map((item: any) => {
                      const itemRaw = item as any;
                      return (itemRaw.name === transformedPod.name && 
                             itemRaw.namespace === transformedPod.namespace) 
                        ? (transformedPod as T) 
                        : item;
                    });
                  }
                  return [...prevData, transformedPod as T];
                
                case 'MODIFIED':
                  // Upsert pattern: update if exists, add if not
                  const foundIndex = prevData.findIndex((item: any) => {
                    const itemRaw = item as any;
                    return itemRaw.name === transformedPod.name && 
                           itemRaw.namespace === transformedPod.namespace;
                  });
                  
                  const podKey = `${transformedPod.namespace}/${transformedPod.name}`;
                  
                  if (foundIndex >= 0) {
                    // Update existing
                    const updated = [...prevData];
                    const oldStatus = (updated[foundIndex] as any).status;
                    const existingPod = updated[foundIndex] as any;
                    // Preserve metrics and metadata from last API sync if websocket update returns '-'
                    const mergedPod = {
                      ...transformedPod,
                      cpu: transformedPod.cpu !== '-' ? transformedPod.cpu : (existingPod.cpu || '-'),
                      memory: transformedPod.memory !== '-' ? transformedPod.memory : (existingPod.memory || '-'),
                      controlled_by: transformedPod.controlled_by !== '-' ? transformedPod.controlled_by : (existingPod.controlled_by || '-'),
                      qos: transformedPod.qos !== '-' ? transformedPod.qos : (existingPod.qos || '-'),
                    };
                    updated[foundIndex] = mergedPod as T;
                    
                    // Log status transitions
                    if (oldStatus !== mergedPod.status) {
                      console.log(`[useRealtimePods] Status transition for ${podKey}: ${oldStatus} -> ${mergedPod.status}`);
                      
                      // If transitioning to Terminating, set a cleanup timeout
                      if (mergedPod.status === 'Terminating') {
                        // Clear any existing timeout
                        const existingTimeout = deletionTimeoutsRef.current.get(podKey);
                        if (existingTimeout) clearTimeout(existingTimeout);
                        
                        const terminatingCount = updated.filter((item: any) => (item as any).status === 'Terminating').length;
                        console.log(`[useRealtimePods] Total Terminating pods: ${terminatingCount}`);
                        
                        // Auto-remove after 10 seconds if not explicitly deleted
                        const timeout = window.setTimeout(() => {
                          console.log(`[useRealtimePods] Auto-removing Terminating pod after timeout: ${podKey}`);
                          deletionTimeoutsRef.current.delete(podKey);
                          setData((finalData) => 
                            finalData.filter((item: any) => !(item.namespace === transformedPod.namespace && item.name === transformedPod.name))
                          );
                        }, 10000);
                        
                        deletionTimeoutsRef.current.set(podKey, timeout);
                      }
                    }
                    
                    return updated;
                  } else {
                    // Add new (pod wasn't in initial list)
                    console.log(`[useRealtimePods] Adding pod from MODIFIED: ${podKey} (status: ${transformedPod.status})`);
                    const newList = [...prevData, transformedPod as T];
                    
                    // Show total terminating pods after adding
                    if (transformedPod.status === 'Terminating') {
                      const existingTimeout = deletionTimeoutsRef.current.get(podKey);
                      if (existingTimeout) clearTimeout(existingTimeout);
                      
                      const terminatingCount = newList.filter((item: any) => (item as any).status === 'Terminating').length;
                      console.log(`[useRealtimePods] Total Terminating pods: ${terminatingCount}`);
                      
                      // Auto-remove after 10 seconds if not explicitly deleted
                      const timeout = window.setTimeout(() => {
                        console.log(`[useRealtimePods] Auto-removing Terminating pod after timeout: ${podKey}`);
                        deletionTimeoutsRef.current.delete(podKey);
                        setData((finalData) => 
                          finalData.filter((item: any) => !(item.namespace === transformedPod.namespace && item.name === transformedPod.name))
                        );
                      }, 10000);
                      
                      deletionTimeoutsRef.current.set(podKey, timeout);
                    }
                    
                    return newList;
                  }
                
                case 'DELETED':
                  const podKeyForDeletion = `${transformedPod.namespace}/${transformedPod.name}`;
                  console.log(`[useRealtimePods] Scheduled deletion of pod: ${podKeyForDeletion}`);
                  
                  // Clear any pending auto-removal timeout
                  const existingTimeout = deletionTimeoutsRef.current.get(podKeyForDeletion);
                  if (existingTimeout) {
                    clearTimeout(existingTimeout);
                    deletionTimeoutsRef.current.delete(podKeyForDeletion);
                  }
                  
                  // Add a small delay before removing to allow UI to show Terminating status
                  setTimeout(() => {
                    setData((currentData) => {
                      const finalFiltered = currentData.filter((item: any) => {
                        const itemRaw = item as any;
                        return !(itemRaw.name === transformedPod.name && 
                                itemRaw.namespace === transformedPod.namespace);
                      });
                      
                      console.log(`[useRealtimePods] Actually removing pod: ${podKeyForDeletion}`);
                      console.log(`[useRealtimePods] Pod count: ${currentData.length} -> ${finalFiltered.length}`);
                      
                      return finalFiltered;
                    });
                  }, 500); // 500ms delay to show Terminating status
                  
                  return prevData;
                
                default:
                  return prevData;
              }
            });
          } else if (message.type === 'subscribed') {
            console.log('[useRealtimePods] Subscription confirmed');
          } else if (message.type === 'error') {
            console.error('[useRealtimePods] Server error:', message.message);
            setError(message.message);
          }
        } catch (err) {
          console.error('[useRealtimePods] Failed to parse message:', err);
        }
      };

      ws.onerror = (errorEvent) => {
        console.error('[useRealtimePods] WebSocket error:', errorEvent);
        setError('WebSocket connection error');
      };

      ws.onclose = () => {
        console.log('[useRealtimePods] WebSocket closed');
        setIsConnected(false);
        wsRef.current = null;

        // Attempt reconnection
        if (
          enabled &&
          reconnectAttemptsRef.current < maxReconnectAttempts
        ) {
          reconnectAttemptsRef.current += 1;
          console.log(
            `[useRealtimePods] Reconnecting... (attempt ${reconnectAttemptsRef.current}/${maxReconnectAttempts})`
          );
          reconnectTimeoutRef.current = setTimeout(() => {
            connect();
          }, reconnectInterval);
        } else if (reconnectAttemptsRef.current >= maxReconnectAttempts) {
          setError('Max reconnection attempts reached');
        }
      };

      wsRef.current = ws;
    } catch (err) {
      console.error('[useRealtimePods] Failed to create WebSocket:', err);
      setError('Failed to create WebSocket connection');
    }
  }, [enabled, reconnectInterval]);

  const disconnect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }
    
    // Clear all pending deletion timeouts
    deletionTimeoutsRef.current.forEach(timeout => clearTimeout(timeout));
    deletionTimeoutsRef.current.clear();
    
    setIsConnected(false);
  }, []);

  useEffect(() => {
    if (enabled) {
      connect();
    }

    return () => {
      disconnect();
      // Clear all deletion timeouts on unmount
      deletionTimeoutsRef.current.forEach(timeout => clearTimeout(timeout));
      deletionTimeoutsRef.current.clear();
    };
  }, [enabled, connect, disconnect]);

  useEffect(() => {
    if (!enabled) return;

    syncPodDetails();
    const interval = window.setInterval(() => {
      syncPodDetails();
    }, 15000);

    return () => clearInterval(interval);
  }, [enabled, syncPodDetails]);

  return {
    data,
    isConnected,
    error,
    reconnect: connect,
    disconnect,
  };
};
