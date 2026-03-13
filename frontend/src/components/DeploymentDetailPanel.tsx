import { useEffect, useMemo, useState } from 'react';
import { Pencil, RotateCcw, Terminal, Trash2 } from './Icons';
import type { Deployment, Pod, ReplicaSet, KubernetesEvent } from '../types';
import { getStatusColor, timeAgo } from '../utils';
import { ResizablePanel } from './ResizablePanel';
import { PanelActionButton, PanelCloseButton } from './ResourceDetailPanelLayout';
import { DrawerItem, DrawerTitle, DrawerLabelsAnnotations } from './drawer';
import { useRealtimeReplicaSets, useRealtimeEvents } from '../hooks/useRealtimeResources';
import { usePods } from '../hooks/useKubernetes';

interface DeploymentDetailPanelProps {
  deployment: Deployment;
  onClose: () => void;
  onOpenYamlEditor: (deployment: Deployment) => void;
  onScale?: (namespace: string, name: string, replicas: number) => Promise<void>;
  onRestart?: (namespace: string, name: string) => Promise<void>;
  onTailLogs?: (deployment: Deployment) => void;
  onQuickUpdateTag?: (namespace: string, name: string, tag: string, image?: string) => Promise<void>;
  onDelete?: (namespace: string, name: string) => Promise<void>;
}

const imageWithoutDigest = (image: string): string => image.split('@')[0] ?? image;

const uniqueImagesPreferDigest = (images?: string[]): string[] => {
  if (!images || images.length === 0) return [];

  const selectedByBase = new Map<string, string>();
  const order: string[] = [];

  for (const image of images) {
    if (!image) continue;
    const base = imageWithoutDigest(image);
    const existing = selectedByBase.get(base);
    if (!existing) {
      selectedByBase.set(base, image);
      order.push(base);
      continue;
    }

    if (!existing.includes('@sha256:') && image.includes('@sha256:')) {
      selectedByBase.set(base, image);
    }
  }

  return order.map((base) => selectedByBase.get(base) ?? base);
};

const extractTag = (image?: string): string => {
  if (!image) return '';
  const noDigest = imageWithoutDigest(image);
  const slashIdx = noDigest.lastIndexOf('/');
  const colonIdx = noDigest.lastIndexOf(':');
  if (colonIdx > slashIdx) {
    return noDigest.substring(colonIdx + 1);
  }
  return '';
};

export const DeploymentDetailPanel = ({ deployment, onClose, onOpenYamlEditor, onScale, onRestart, onTailLogs, onQuickUpdateTag, onDelete }: DeploymentDetailPanelProps) => {
  const getReadyReplicaCounts = () => {
    const readyText = deployment.ready ?? '0/0';
    const [availableText, desiredText] = readyText.split('/');
    const available = Number.parseInt(availableText ?? '0', 10);
    const desired = Number.parseInt(desiredText ?? '0', 10);
    return {
      available: Number.isNaN(available) || available < 0 ? 0 : available,
      desired: Number.isNaN(desired) || desired < 0 ? 0 : desired,
    };
  };

  const { available: currentAvailableReplicas, desired: currentDesiredReplicas } = getReadyReplicaCounts();
  const [scaleReplicas, setScaleReplicas] = useState<string>(() => String(currentDesiredReplicas));
  const [isScaling, setIsScaling] = useState(false);
  const [isRestarting, setIsRestarting] = useState(false);
  const [scaleError, setScaleError] = useState('');
  const [scaleSuccess, setScaleSuccess] = useState('');
  const [restartError, setRestartError] = useState('');
  const [restartSuccess, setRestartSuccess] = useState('');
  const [tagValues, setTagValues] = useState<Record<string, string>>({});
  const [updatingImage, setUpdatingImage] = useState<string | null>(null);
  const [tagError, setTagError] = useState('');
  const [tagSuccess, setTagSuccess] = useState('');
  const quickUpdateImages = useMemo(() => uniqueImagesPreferDigest(deployment.images), [deployment.images]);

  useEffect(() => {
    setScaleReplicas(String(currentDesiredReplicas));
  }, [deployment.name, deployment.namespace, deployment.ready]);

  useEffect(() => {
    const nextTagValues: Record<string, string> = {};
    for (const image of quickUpdateImages) {
      const base = imageWithoutDigest(image);
      nextTagValues[base] = extractTag(image);
    }
    setTagValues(nextTagValues);
    setUpdatingImage(null);
    setTagError('');
    setTagSuccess('');
  }, [deployment.name, deployment.namespace, quickUpdateImages]);

  const submitScale = async (replicas: number) => {
    setIsScaling(true);
    setScaleError('');
    setScaleSuccess('');
    try {
      if (onScale) {
        await onScale(deployment.namespace, deployment.name, replicas);
        setScaleSuccess(`Scaling to ${replicas} replicas...`);
        setTimeout(() => setScaleSuccess(''), 3000);
      }
    } catch (err) {
      setScaleError(err instanceof Error ? err.message : 'Failed to scale deployment');
    } finally {
      setIsScaling(false);
    }
  };

  const handleScale = async () => {
    const replicas = Number.parseInt(scaleReplicas, 10);
    if (Number.isNaN(replicas) || replicas < 0) {
      setScaleError('Replicas must be a non-negative number');
      return;
    }
    if (replicas > 999) {
      setScaleError('Replicas must be between 0 and 999');
      return;
    }
    await submitScale(replicas);
  };

  const handleIncrement = async () => {
    const current = Number.parseInt(scaleReplicas, 10);
    const safeCurrent = Number.isNaN(current) || current < 0 ? 0 : current;
    const next = Math.min(999, safeCurrent + 1);
    setScaleReplicas(String(next));
    setScaleError('');
    await submitScale(next);
  };

  const handleDecrement = async () => {
    const current = Number.parseInt(scaleReplicas, 10);
    const safeCurrent = Number.isNaN(current) || current < 0 ? 0 : current;
    const next = Math.max(0, safeCurrent - 1);
    setScaleReplicas(String(next));
    setScaleError('');
    await submitScale(next);
  };

  const handleRestart = async () => {
    setIsRestarting(true);
    setRestartError('');
    setRestartSuccess('');
    try {
      if (onRestart) {
        await onRestart(deployment.namespace, deployment.name);
        setRestartSuccess('Deployment restart triggered');
        setTimeout(() => setRestartSuccess(''), 3000);
      }
    } catch (err) {
      setRestartError(err instanceof Error ? err.message : 'Failed to restart deployment');
    } finally {
      setIsRestarting(false);
    }
  };

  const handleQuickUpdateTag = async (image: string) => {
    const normalizedImage = imageWithoutDigest(image);
    const nextTag = (tagValues[normalizedImage] ?? '').trim();
    if (!nextTag) {
      setTagError('Tag is required');
      setTagSuccess('');
      return;
    }

    setUpdatingImage(normalizedImage);
    setTagError('');
    setTagSuccess('');
    try {
      if (onQuickUpdateTag) {
        await onQuickUpdateTag(deployment.namespace, deployment.name, nextTag, normalizedImage);
        setTagSuccess(`Updated ${normalizedImage} to tag ${nextTag}`);
        setTimeout(() => setTagSuccess(''), 3000);
      }
    } catch (err) {
      setTagError(err instanceof Error ? err.message : 'Failed to update image tag');
    } finally {
      setUpdatingImage(null);
    }
  };

  const status = deployment.status ?? 'Unknown';
  const statusColor = getStatusColor(status);
  const labels = deployment.labels ?? {};
  const annotations = deployment.annotations ?? {};

  const { data: allReplicaSets = [] } = useRealtimeReplicaSets();
  const { data: allPods = [] } = usePods();
  const { data: eventsData = [] } = useRealtimeEvents();

  const deploymentReplicaSets = useMemo(() => {
    return allReplicaSets.filter(
      (rs) => rs.namespace === deployment.namespace && rs.name.startsWith(`${deployment.name}-`)
    ) as ReplicaSet[];
  }, [allReplicaSets, deployment.namespace, deployment.name]);

  const deploymentPods = useMemo(() => {
    const deploymentOwner = `Deployment/${deployment.name}`;
    const replicaSetNames = new Set(deploymentReplicaSets.map((rs) => `ReplicaSet/${rs.name}`));
    return allPods.filter(
      (p) =>
        p.namespace === deployment.namespace &&
        (p.controlled_by === deploymentOwner || (p.controlled_by != null && replicaSetNames.has(p.controlled_by)))
    ) as Pod[];
  }, [allPods, deployment.namespace, deployment.name, deploymentReplicaSets]);

  const deploymentEvents = useMemo(() => {
    return (eventsData as KubernetesEvent[])
      .filter(
        (e) => e.namespace === deployment.namespace && e.involved_object === `Deployment/${deployment.name}`
      )
      .sort((a, b) => {
        const aTs = Date.parse(a.last_timestamp || a.first_timestamp || '');
        const bTs = Date.parse(b.last_timestamp || b.first_timestamp || '');
        return (Number.isNaN(bTs) ? 0 : bTs) - (Number.isNaN(aTs) ? 0 : aTs);
      })
      .slice(0, 20)
      .map((e) => ({
        summary: e.reason || e.type || 'Event',
        message: e.message || '-',
        count: e.count ?? 1,
        age: timeAgo(e.last_timestamp || e.first_timestamp || ''),
      }));
  }, [eventsData, deployment.namespace, deployment.name]);

  return (
    <ResizablePanel>
      <div className="h-full flex flex-col">
        {/* Header: same as Node/Pod (gradient + key info bar) */}
        <div className="bg-gradient-to-r from-surface to-surface-elevated border-b border-border px-5 py-4 flex-shrink-0">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <h2 className="text-lg font-bold truncate" style={{ color: 'var(--color-text)' }}>{deployment.name}</h2>
              <div className="mt-2 flex items-center gap-2">
                <span
                  className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${
                    statusColor === 'green' ? 'bg-[var(--color-icon-success)]/10 text-[var(--color-icon-success)]' :
                    statusColor === 'yellow' ? 'bg-[var(--color-icon-warning)]/10 text-[var(--color-icon-warning)]' :
                    statusColor === 'red' ? 'bg-[var(--color-icon-danger)]/10 text-[var(--color-icon-danger)]' :
                    'bg-gray-500/20 text-gray-400'
                  }`}
                >
                  {status}
                </span>
              </div>
            </div>
            <div
              className="flex items-center flex-shrink-0 rounded-lg border"
              style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)' }}
            >
              <PanelActionButton icon={RotateCcw} label="Restart" onClick={handleRestart} disabled={isRestarting} />
              {onTailLogs && <PanelActionButton icon={Terminal} label="Ktail Logs" onClick={() => onTailLogs(deployment)} />}
              <PanelActionButton icon={Pencil} label="Edit YAML" onClick={() => onOpenYamlEditor(deployment)} />
              {onDelete && (
                <PanelActionButton icon={Trash2} label="Delete" danger onClick={() => onDelete(deployment.namespace, deployment.name)} />
              )}
              <PanelCloseButton
                onClick={onClose}
                borderLeft="1px solid var(--color-border)"
                label="Close panel"
              />
            </div>
          </div>
          <div className="flex items-center gap-3 text-xs mt-3 pt-3 border-t border-border">
            <div className="flex-1">
              <p className="mb-1" style={{ color: 'var(--color-text-secondary)' }}>Namespace</p>
              <p className="font-medium truncate" style={{ color: 'var(--color-text)' }}>{deployment.namespace}</p>
            </div>
            <div className="flex-1">
              <p className="mb-1" style={{ color: 'var(--color-text-secondary)' }}>Ready</p>
              <p className="font-medium" style={{ color: 'var(--color-text)' }}>{deployment.ready ?? '-'}</p>
            </div>
            <div className="flex-1">
              <p className="mb-1" style={{ color: 'var(--color-text-secondary)' }}>Age</p>
              <p className="font-medium" style={{ color: 'var(--color-text)' }}>{timeAgo(deployment.age)}</p>
            </div>
          </div>
        </div>

        <div
          className="flex-1 overflow-auto overflow-x-hidden text-sm drawer-content DeploymentDetails"
          style={{ padding: 'var(--drawer-content-spacing, 1.5rem)' }}
        >
          <DrawerTitle>Property</DrawerTitle>
          <DrawerItem name="Name">{deployment.name}</DrawerItem>
          <DrawerItem name="Namespace">{deployment.namespace}</DrawerItem>
          <DrawerItem name="Status">{status}</DrawerItem>
          <DrawerItem name="Ready">{deployment.ready ?? '-'}</DrawerItem>
          <DrawerItem name="Updated">{deployment.updated ?? '-'}</DrawerItem>
          <DrawerItem name="Available">{deployment.available ?? '-'}</DrawerItem>
          <DrawerItem name="Age">{timeAgo(deployment.age)}</DrawerItem>

          <DrawerItem name="Images" labelsOnly>
            {deployment.images?.length > 0 ? (
              <div className="space-y-2">
                <div className="space-y-2">
                  {quickUpdateImages.map((image) => {
                    const normalizedImage = imageWithoutDigest(image);
                    const isUpdating = updatingImage === normalizedImage;
                    return (
                      <div
                        key={normalizedImage}
                        className="flex items-center gap-2 flex-wrap rounded-md border p-2"
                        style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-surface-elevated)' }}
                      >
                        <span
                          className="inline-flex px-2 py-0.5 rounded text-xs border border-border break-all"
                          style={{ backgroundColor: 'var(--color-hover)', color: 'var(--color-text)' }}
                          title={normalizedImage}
                        >
                          {normalizedImage}
                        </span>
                        <input
                          type="text"
                          value={tagValues[normalizedImage] ?? ''}
                          onChange={(e) => {
                            const nextTag = e.target.value;
                            setTagValues((prev) => ({ ...prev, [normalizedImage]: nextTag }));
                            setTagError('');
                          }}
                          onKeyDown={(e) => e.key === 'Enter' && void handleQuickUpdateTag(image)}
                          placeholder="e.g. 1.29.3"
                          className="h-7 px-2 rounded border border-border text-xs min-w-32"
                          style={{ backgroundColor: 'var(--color-bg)', color: 'var(--color-text)' }}
                          aria-label={`Image tag version for ${normalizedImage}`}
                        />
                        <button
                          type="button"
                          onClick={() => void handleQuickUpdateTag(image)}
                          disabled={isUpdating}
                          className="px-2 py-1 rounded border text-xs disabled:opacity-60"
                          style={{ borderColor: 'var(--color-primary)', color: 'var(--color-primary)' }}
                        >
                          {isUpdating ? 'Updating...' : 'Update Tag'}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <span style={{ color: 'var(--color-muted)' }}>-</span>
            )}
          </DrawerItem>

          <DrawerItem name="Replicas">
            {`${currentDesiredReplicas} desired, ${deployment.updated ?? 0} updated, `}
            {`${currentDesiredReplicas} total, ${currentAvailableReplicas} available, `}
            {`${Math.max(0, currentDesiredReplicas - currentAvailableReplicas)} unavailable`}
          </DrawerItem>

          <DrawerItem name="Scale">
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => void handleDecrement()}
                disabled={isScaling}
                className="inline-flex items-center justify-center h-7 w-7 rounded border border-border text-xs disabled:opacity-50"
                style={{ color: 'var(--color-text)' }}
                aria-label="Decrease replicas"
              >
                −
              </button>
              <input
                type="number"
                min={0}
                max={999}
                value={scaleReplicas}
                onChange={(e) => {
                  const raw = e.target.value;
                  if (raw === '') {
                    setScaleReplicas('');
                    setScaleError('');
                    return;
                  }
                  const n = Number.parseInt(raw, 10);
                  if (!Number.isNaN(n)) {
                    setScaleReplicas(String(Math.max(0, Math.min(999, n))));
                    setScaleError('');
                  }
                }}
                onKeyDown={(e) => e.key === 'Enter' && void handleScale()}
                className="w-12 h-7 px-1 text-center rounded border border-border text-xs"
                style={{ backgroundColor: 'var(--color-bg)', color: 'var(--color-text)' }}
                aria-label="Replicas"
              />
              <button
                type="button"
                onClick={() => void handleIncrement()}
                disabled={isScaling}
                className="inline-flex items-center justify-center h-7 w-7 rounded border border-border text-xs disabled:opacity-50"
                style={{ color: 'var(--color-text)' }}
                aria-label="Increase replicas"
              >
                +
              </button>
              <button
                type="button"
                onClick={() => void handleScale()}
                disabled={isScaling}
                className="px-2 py-1 rounded border text-xs"
                style={{ borderColor: 'var(--color-primary)', color: 'var(--color-primary)' }}
              >
                Apply
              </button>
            </div>
          </DrawerItem>

          {(scaleError || scaleSuccess || restartError || restartSuccess || tagError || tagSuccess) && (
            <div className="space-y-1">
              {scaleError && <p className="text-xs text-[var(--color-icon-danger)]">{scaleError}</p>}
              {scaleSuccess && <p className="text-xs text-[var(--color-icon-success)]">{scaleSuccess}</p>}
              {restartError && <p className="text-xs text-[var(--color-icon-danger)]">{restartError}</p>}
              {restartSuccess && <p className="text-xs text-[var(--color-icon-success)]">{restartSuccess}</p>}
              {tagError && <p className="text-xs text-[var(--color-icon-danger)]">{tagError}</p>}
              {tagSuccess && <p className="text-xs text-[var(--color-icon-success)]">{tagSuccess}</p>}
            </div>
          )}

          <DrawerLabelsAnnotations labels={labels} annotations={annotations} />

          <DrawerTitle>Deploy Revisions</DrawerTitle>
          {deploymentReplicaSets.length > 0 ? (
            <div className="overflow-x-auto border border-border rounded-md w-full">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border" style={{ backgroundColor: 'var(--color-bg)' }}>
                    <th className="text-left py-2 px-3 font-medium" style={{ color: 'var(--color-muted)' }}>Name</th>
                    <th className="text-left py-2 px-3 font-medium" style={{ color: 'var(--color-muted)' }}>Namespace</th>
                    <th className="text-left py-2 px-3 font-medium" style={{ color: 'var(--color-muted)' }}>Pods</th>
                    <th className="text-left py-2 px-3 font-medium" style={{ color: 'var(--color-muted)' }}>Age</th>
                  </tr>
                </thead>
                <tbody>
                  {deploymentReplicaSets.map((rs) => (
                    <tr key={`${rs.namespace}/${rs.name}`} className="border-b border-border last:border-b-0">
                      <td className="py-2 px-3 font-medium truncate" style={{ color: 'var(--color-text)' }}>{rs.name}</td>
                      <td className="py-2 px-3 truncate" style={{ color: 'var(--color-text-secondary)' }}>{rs.namespace}</td>
                      <td className="py-2 px-3" style={{ color: 'var(--color-text)' }}>{rs.ready ?? 0}/{rs.desired ?? 0}</td>
                      <td className="py-2 px-3" style={{ color: 'var(--color-text-secondary)' }}>{timeAgo(rs.age)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-xs py-2" style={{ color: 'var(--color-muted)' }}>No replica sets</p>
          )}

          <DrawerTitle>Pods ({deploymentPods.length})</DrawerTitle>
          {deploymentPods.length > 0 ? (
            <div className="overflow-x-auto border border-border rounded-md w-full">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border" style={{ backgroundColor: 'var(--color-bg)' }}>
                    <th className="text-left py-2 px-3 font-medium" style={{ color: 'var(--color-muted)' }}>Pod</th>
                    <th className="text-left py-2 px-3 font-medium" style={{ color: 'var(--color-muted)' }}>Namespace</th>
                    <th className="text-left py-2 px-3 font-medium" style={{ color: 'var(--color-muted)' }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {deploymentPods.map((pod) => (
                    <tr key={`${pod.namespace}/${pod.name}`} className="border-b border-border last:border-b-0">
                      <td className="py-2 px-3 font-medium truncate" style={{ color: 'var(--color-text)' }}>{pod.name}</td>
                      <td className="py-2 px-3 truncate" style={{ color: 'var(--color-text-secondary)' }}>{pod.namespace}</td>
                      <td className="py-2 px-3">
                        <span
                          className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                            pod.phase === 'Running'
                              ? 'bg-[var(--color-icon-success)]/10 text-[var(--color-icon-success)]'
                              : pod.phase === 'Pending'
                                ? 'bg-[var(--color-icon-warning)]/10 text-[var(--color-icon-warning)]'
                                : 'bg-[var(--color-icon-danger)]/10 text-[var(--color-icon-danger)]'
                          }`}
                        >
                          {pod.phase || pod.status || 'Unknown'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-xs py-2" style={{ color: 'var(--color-muted)' }}>No pods</p>
          )}

          <DrawerTitle>Events ({deploymentEvents.length})</DrawerTitle>
          {deploymentEvents.length > 0 ? (
            <div className="overflow-x-auto border border-border rounded-md w-full">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border" style={{ backgroundColor: 'var(--color-bg)' }}>
                    <th className="text-left py-2 px-3 font-medium" style={{ color: 'var(--color-muted)' }}>Summary</th>
                    <th className="text-left py-2 px-3 font-medium w-16" style={{ color: 'var(--color-muted)' }}>Count</th>
                    <th className="text-left py-2 px-3 font-medium w-20" style={{ color: 'var(--color-muted)' }}>Age</th>
                  </tr>
                </thead>
                <tbody>
                  {deploymentEvents.map((event, idx) => (
                    <tr key={`${event.summary}-${idx}`} className="border-b border-border last:border-b-0">
                      <td className="py-2 px-3 align-top">
                        <p className="font-medium" style={{ color: 'var(--color-text)' }}>{event.summary}</p>
                        {event.message && event.message !== '-' && (
                          <p className="mt-1 break-all text-xs" style={{ color: 'var(--color-text-secondary)' }}>{event.message}</p>
                        )}
                      </td>
                      <td className="py-2 px-3 align-top" style={{ color: 'var(--color-text)' }}>{event.count}</td>
                      <td className="py-2 px-3 align-top" style={{ color: 'var(--color-text-secondary)' }}>{event.age}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-xs py-2" style={{ color: 'var(--color-muted)' }}>No recent events</p>
          )}
        </div>
      </div>
    </ResizablePanel>
  );
};
