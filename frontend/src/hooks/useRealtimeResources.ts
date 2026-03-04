import { useEffect, useState } from 'react';
import {
  Namespace,
  Deployment,
  StatefulSet,
  DaemonSet,
  ReplicaSet,
  Job,
  CronJob,
  KubernetesEvent,
} from '../types';

interface WebSocketMessage {
  type: string;
  resource?: string;
  action?: string;
  data?: unknown;
  message?: string;
}

// Transformation functions to convert raw K8s objects to frontend format
function transformNamespace(raw: any): Namespace {
  const metadata = raw.metadata || {};
  const status = raw.status || {};

  const labelsObj = metadata.labels || {};
  const labels = Object.entries(labelsObj)
    .map(([key, value]) => `${key}=${String(value)}`)
    .join(', ');

  return {
    name: metadata.name || '',
    phase: status.phase || 'Unknown',
    labels,
    age: metadata.creationTimestamp || '',
  };
}

function transformDeployment(raw: any): Deployment {
  const metadata = raw.metadata || {};
  const spec = raw.spec || {};
  const status = raw.status || {};
  
  const desired = spec.replicas || 1;
  const ready = status.readyReplicas || 0;
  const updated = status.updatedReplicas || 0;
  const available = status.availableReplicas || 0;
  
  const images = spec.template?.spec?.containers
    ?.map((c: any) => c.image)
    .filter((img: string) => img) || [];
  
  const statusText = desired === 0
    ? 'Stopped'
    : updated >= desired && available >= desired
    ? 'Running'
    : updated > 0 || available > 0
    ? 'Progressing'
    : 'Pending';
  
  return {
    name: metadata.name || '',
    namespace: metadata.namespace || 'default',
    status: statusText,
    ready: `${ready}/${desired}`,
    updated,
    available,
    images,
    age: metadata.creationTimestamp || '',
  };
}

function transformStatefulSet(raw: any): StatefulSet {
  const metadata = raw.metadata || {};
  const spec = raw.spec || {};
  const status = raw.status || {};
  
  const desired = spec.replicas || 0;
  const ready = status.readyReplicas || 0;
  const current = status.currentReplicas || 0;
  const updated = status.updatedReplicas || 0;
  
  const images = spec.template?.spec?.containers
    ?.map((c: any) => c.image)
    .filter((img: string) => img) || [];
  
  const statusText = desired === 0
    ? 'Stopped'
    : ready >= desired
    ? 'Running'
    : current > 0 || updated > 0
    ? 'Progressing'
    : 'Pending';
  
  return {
    name: metadata.name || '',
    namespace: metadata.namespace || 'default',
    status: statusText,
    ready: `${ready}/${desired}`,
    current,
    updated,
    images,
    age: metadata.creationTimestamp || '',
  };
}

function transformDaemonSet(raw: any): DaemonSet {
  const metadata = raw.metadata || {};
  const spec = raw.spec || {};
  const status = raw.status || {};
  
  const desired = status.desiredNumberScheduled || 0;
  const current = status.currentNumberScheduled || 0;
  const ready = status.numberReady || 0;
  const available = status.numberAvailable || 0;
  const updated = status.updatedNumberScheduled || 0;
  
  const images = spec.template?.spec?.containers
    ?.map((c: any) => c.image)
    .filter((img: string) => img) || [];
  
  const statusText = desired === 0
    ? 'Stopped'
    : ready >= desired && available >= desired
    ? 'Running'
    : current > 0
    ? 'Progressing'
    : 'Pending';
  
  return {
    name: metadata.name || '',
    namespace: metadata.namespace || 'default',
    status: statusText,
    desired,
    current,
    ready,
    available,
    updated,
    node_selector: spec.template?.spec?.nodeSelector || {},
    images,
    age: metadata.creationTimestamp || '',
  };
}

function transformReplicaSet(raw: any): ReplicaSet {
  const metadata = raw.metadata || {};
  const spec = raw.spec || {};
  const status = raw.status || {};
  
  const desired = spec.replicas || 0;
  const current = status.replicas || 0;
  const ready = status.readyReplicas || 0;
  const available = status.availableReplicas || 0;
  
  const images = spec.template?.spec?.containers
    ?.map((c: any) => c.image)
    .filter((img: string) => img) || [];
  
  const statusText = desired === 0
    ? 'Stopped'
    : ready >= desired && available >= desired
    ? 'Running'
    : current > 0 || ready > 0
    ? 'Progressing'
    : 'Pending';
  
  return {
    name: metadata.name || '',
    namespace: metadata.namespace || 'default',
    status: statusText,
    desired,
    current,
    ready,
    available,
    images,
    age: metadata.creationTimestamp || '',
  };
}

function transformJob(raw: any): Job {
  const metadata = raw.metadata || {};
  const spec = raw.spec || {};
  const status = raw.status || {};
  
  const completions = spec.completions || 1;
  const succeeded = status.succeeded || 0;
  const failed = status.failed || 0;
  const active = status.active || 0;
  
  let statusText = 'Pending';
  if (succeeded >= completions) {
    statusText = 'Complete';
  } else if (failed > 0) {
    statusText = 'Failed';
  } else if (active > 0) {
    statusText = 'Running';
  }
  
  // Calculate duration
  let duration = '-';
  if (status.startTime) {
    const start = new Date(status.startTime).getTime();
    const end = status.completionTime
      ? new Date(status.completionTime).getTime()
      : Date.now();
    const seconds = Math.floor((end - start) / 1000);
    
    if (seconds < 60) duration = `${seconds}s`;
    else if (seconds < 3600) duration = `${Math.floor(seconds / 60)}m`;
    else if (seconds < 86400) duration = `${Math.floor(seconds / 3600)}h`;
    else duration = `${Math.floor(seconds / 86400)}d`;
  }
  
  return {
    name: metadata.name || '',
    namespace: metadata.namespace || 'default',
    status: statusText,
    completions: `${succeeded}/${completions}`,
    duration,
    age: metadata.creationTimestamp || '',
  };
}

function transformCronJob(raw: any): CronJob {
  const metadata = raw.metadata || {};
  const spec = raw.spec || {};
  const status = raw.status || {};
  
  const schedule = spec.schedule || '';
  const suspend = spec.suspend || false;
  const active = status.active?.length || 0;
  const lastSchedule = status.lastScheduleTime || '-';
  
  // Estimate next execution (simplified)
  let nextExecution = '-';
  if (!suspend && lastSchedule !== '-') {
    // This is a simplified estimation - actual cron parsing would be more complex
    nextExecution = 'Calculating...';
  }
  
  return {
    name: metadata.name || '',
    namespace: metadata.namespace || 'default',
    schedule,
    suspend,
    active,
    last_schedule: lastSchedule,
    next_execution: nextExecution,
    time_zone: spec.timeZone || 'UTC',
    age: metadata.creationTimestamp || '',
  };
}

function transformEvent(raw: any): KubernetesEvent {
  const metadata = raw.metadata || {};
  const involvedObject = raw.involvedObject || {};
  
  return {
    name: metadata.name || '',
    namespace: metadata.namespace || 'default',
    involved_object: `${involvedObject.kind || ''}/${involvedObject.name || ''}`,
    reason: raw.reason || '',
    message: raw.message || '',
    count: raw.count || 1,
    first_timestamp: raw.firstTimestamp || metadata.creationTimestamp || '',
    last_timestamp: raw.lastTimestamp || raw.eventTime || metadata.creationTimestamp || '',
    type: raw.type || 'Normal',
  };
}

// Generic hook factory for realtime resources
function createRealtimeHook<T>(
  resourceType: string,
  displayName: string,
  transformFn: (raw: any) => T,
  getKey: (item: T) => string
) {
  return function useRealtimeResource(): {
    data: T[];
    isLoading: boolean;
    error: string | null;
  } {
    const [data, setData] = useState<T[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
      let ws: WebSocket | null = null;
      let reconnectTimeout: ReturnType<typeof setTimeout>;
      let messageQueue: WebSocketMessage[] = [];

      const connect = () => {
        try {
          // WebSocket URL construction
          const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
          const host = window.location.host;
          const wsUrl = `${protocol}://${host}/ws`;

          ws = new WebSocket(wsUrl);

          ws.onopen = () => {
            console.log(`WebSocket connected for ${displayName}`);
            setError(null);

            // Subscribe to resource
            ws!.send(
              JSON.stringify({
                type: 'subscribe',
                resource: resourceType,
              })
            );

            // Flush queued messages if any
            while (messageQueue.length > 0) {
              const msg = messageQueue.shift();
              if (msg) {
                ws!.send(JSON.stringify(msg));
              }
            }

            setIsLoading(false);
          };

          ws.onmessage = (event) => {
            try {
              const message: WebSocketMessage = JSON.parse(event.data);

              if (message.type === 'resource_update' && message.resource === resourceType) {
                const action = message.action?.toUpperCase();
                const rawItem = message.data;

                if (!rawItem) return;

                // Transform raw K8s object to frontend format
                const item = transformFn(rawItem);

                if (action === 'ADDED' || action === 'MODIFIED') {
                  setData((prev) => {
                    const itemKey = getKey(item);
                    const existingIndex = prev.findIndex((p) => getKey(p) === itemKey);

                    if (existingIndex >= 0) {
                      // Update existing item
                      const updated = [...prev];
                      updated[existingIndex] = item;
                      return updated;
                    } else {
                      // Add new item
                      return [...prev, item];
                    }
                  });
                } else if (action === 'DELETED') {
                  const itemKey = getKey(item);
                  setData((prev) => prev.filter((p) => getKey(p) !== itemKey));
                }
              } else if (message.type === 'subscribed' && message.resource === resourceType) {
                console.log(`Subscribed to ${displayName}`);
              } else if (message.type === 'error') {
                console.error(`WebSocket error for ${displayName}:`, message.message);
                setError(message.message || 'Unknown error');
              }
            } catch (e) {
              console.error(`Error parsing ${displayName} message:`, e);
            }
          };

          ws.onerror = (event) => {
            console.error(`WebSocket error for ${displayName}:`, event);
            setError(`Connection error for ${displayName}`);
          };

          ws.onclose = () => {
            console.log(`WebSocket disconnected for ${displayName}`);

            // Attempt to reconnect after 3 seconds
            reconnectTimeout = setTimeout(() => {
              console.log(`Attempting to reconnect to ${displayName}...`);
              connect();
            }, 3000);
          };
        } catch (err) {
          console.error(`Failed to connect WebSocket for ${displayName}:`, err);
          setError(`Failed to connect to ${displayName} stream`);

          // Attempt to reconnect
          reconnectTimeout = setTimeout(connect, 3000);
        }
      };

      connect();

      return () => {
        if (reconnectTimeout) {
          clearTimeout(reconnectTimeout);
        }
        if (ws) {
          ws.close();
        }
      };
    }, []);

    return { data, isLoading, error };
  };
}

// Create hooks for each resource type
export const useRealtimeNamespaces = createRealtimeHook<Namespace>(
  'namespaces',
  'Namespaces',
  transformNamespace,
  (item) => item.name
);
export const useRealtimeDeployments = createRealtimeHook<Deployment>(
  'deployments',
  'Deployments',
  transformDeployment,
  (item) => `${item.namespace}/${item.name}`
);
export const useRealtimeStatefulSets = createRealtimeHook<StatefulSet>(
  'statefulsets',
  'StatefulSets',
  transformStatefulSet,
  (item) => `${item.namespace}/${item.name}`
);
export const useRealtimeDaemonSets = createRealtimeHook<DaemonSet>(
  'daemonsets',
  'DaemonSets',
  transformDaemonSet,
  (item) => `${item.namespace}/${item.name}`
);
export const useRealtimeReplicaSets = createRealtimeHook<ReplicaSet>(
  'replicasets',
  'ReplicaSets',
  transformReplicaSet,
  (item) => `${item.namespace}/${item.name}`
);
export const useRealtimeJobs = createRealtimeHook<Job>(
  'jobs',
  'Jobs',
  transformJob,
  (item) => `${item.namespace}/${item.name}`
);
export const useRealtimeCronJobs = createRealtimeHook<CronJob>(
  'cronjobs',
  'CronJobs',
  transformCronJob,
  (item) => `${item.namespace}/${item.name}`
);
export const useRealtimeEvents = createRealtimeHook<KubernetesEvent>(
  'events',
  'Events',
  transformEvent,
  (item) => `${item.namespace}/${item.name}`
);
