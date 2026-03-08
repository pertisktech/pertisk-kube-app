import { Layers, Clock, Pencil, RotateCcw, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { Deployment } from '../types';
import { getStatusColor, timeAgo } from '../utils';
import {
  ResourceDetailPanelLayout,
  DetailSection,
  DetailRow,
  DetailLabelsSection,
  DetailAnnotationsSection,
  PanelActionButton,
} from './ResourceDetailPanelLayout';

interface DeploymentDetailPanelProps {
  deployment: Deployment;
  onClose: () => void;
  onOpenYamlEditor: (deployment: Deployment) => void;
  onScale?: (namespace: string, name: string, replicas: number) => Promise<void>;
  onRestart?: (namespace: string, name: string) => Promise<void>;
  onDelete?: (namespace: string, name: string) => Promise<void>;
}

export const DeploymentDetailPanel = ({ deployment, onClose, onOpenYamlEditor, onScale, onRestart, onDelete }: DeploymentDetailPanelProps) => {
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

  useEffect(() => {
    setScaleReplicas(String(currentDesiredReplicas));
  }, [deployment.name, deployment.namespace, deployment.ready]);

  const getStatusTextClass = (status: string) => {
    const color = getStatusColor(status);
    if (color === 'green') return 'text-[var(--color-icon-success)]';
    if (color === 'yellow') return 'text-[var(--color-icon-warning)]';
    if (color === 'red') return 'text-[var(--color-icon-danger)]';
    return 'text-text-secondary';
  };

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

  const status = deployment.status ?? 'Unknown';
  const statusColor = getStatusColor(status);
  const statusBgClass =
    statusColor === 'green'
      ? 'bg-green-500/20'
      : statusColor === 'yellow'
        ? 'bg-yellow-500/20'
        : statusColor === 'red'
          ? 'bg-red-500/20'
          : 'bg-gray-500/20';
  const statusTextClass =
    statusColor === 'green'
      ? 'text-green-400'
      : statusColor === 'yellow'
        ? 'text-yellow-400'
        : statusColor === 'red'
          ? 'text-red-400'
          : 'text-gray-400';

  const actions = (
    <>
      <PanelActionButton
        icon={RotateCcw}
        label="Restart"
        onClick={handleRestart}
        disabled={isRestarting}
        colorClass="text-cyan-400 hover:bg-cyan-500/20 hover:text-cyan-300"
      />
      <PanelActionButton icon={Pencil} label="Edit YAML" onClick={() => onOpenYamlEditor(deployment)} colorClass="text-amber-400 hover:bg-amber-500/20 hover:text-amber-300" />
      <PanelActionButton
        icon={Trash2}
        label="Delete"
        onClick={() => onDelete?.(deployment.namespace, deployment.name)}
        danger
      />
    </>
  );

  return (
    <ResourceDetailPanelLayout
      kind="DEPLOYMENT"
      kindIcon={Layers}
      title={deployment.name}
      keyInfo={[
        { label: 'Namespace', value: deployment.namespace },
        { label: 'Ready', value: deployment.ready ?? '-' },
        { label: 'Age', value: timeAgo(deployment.age) },
      ]}
      statusCards={[
        { label: 'Status', value: status, colorClass: statusTextClass, bgClass: statusBgClass },
        { label: 'Ready', value: deployment.ready ?? '-' },
        { label: 'Updated', value: deployment.updated ?? '-' },
      ]}
      quickInfo={[{ icon: Clock, label: 'Age', value: timeAgo(deployment.age) }]}
      actions={actions}
      onClose={onClose}
    >
      <div className="border-b border-border pb-4 -mt-1">
          <div className="grid grid-cols-1 gap-2">
            <div className="bg-surface border border-border rounded-lg p-2 space-y-2">
              <p className="text-[11px] uppercase tracking-wide text-text-secondary">Scale</p>
              <p className="text-xs text-text-secondary">
                Current: {currentAvailableReplicas}/{currentDesiredReplicas}
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void handleDecrement()}
                  disabled={isScaling}
                  className="inline-flex items-center justify-center h-8 w-8 rounded-md border border-border text-text hover:bg-hover disabled:opacity-50 disabled:cursor-not-allowed"
                  aria-label="Decrease replicas"
                  data-tooltip="Decrease replicas"
                >
                  -
                </button>
                <input
                  type="number"
                  min="0"
                  max="999"
                  value={scaleReplicas}
                  onChange={(e) => {
                    const rawValue = e.target.value;
                    if (rawValue === '') {
                      setScaleReplicas('');
                      setScaleError('');
                      return;
                    }

                    const numericValue = Number.parseInt(rawValue, 10);
                    if (Number.isNaN(numericValue)) {
                      return;
                    }

                    const clamped = Math.max(0, Math.min(999, numericValue));
                    setScaleReplicas(String(clamped));
                    setScaleError('');
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      void handleScale();
                    }
                  }}
                  className="w-14 h-8 px-1 text-center rounded-md border border-border bg-surface-elevated text-text text-sm outline-none focus:ring-1 focus:ring-[var(--color-primary)] focus:border-[var(--color-primary)]"
                  aria-label="Replicas"
                  data-tooltip="Replicas"
                />
                <button
                  type="button"
                  onClick={() => void handleIncrement()}
                  disabled={isScaling}
                  className="inline-flex items-center justify-center h-8 w-8 rounded-md border border-border text-text hover:bg-hover disabled:opacity-50 disabled:cursor-not-allowed"
                  aria-label="Increase replicas"
                  data-tooltip="Increase replicas"
                >
                  +
                </button>
              </div>
            </div>
          </div>
        </div>

        {(restartError || restartSuccess || scaleError || scaleSuccess) && (
          <div className="py-2 border-b border-border space-y-1">
            {restartError && <p className="text-xs text-red-400">{restartError}</p>}
            {restartSuccess && <p className="text-xs text-green-400">{restartSuccess}</p>}
            {scaleError && <p className="text-xs text-red-400">{scaleError}</p>}
            {scaleSuccess && <p className="text-xs text-green-400">{scaleSuccess}</p>}
          </div>
        )}

        <DetailSection title="Details">
          <DetailRow label="Name" value={deployment.name} />
          <DetailRow label="Namespace" value={deployment.namespace} />
          <DetailRow label="Status" value={<span className={getStatusTextClass(deployment.status || 'Unknown')}>{deployment.status || 'Unknown'}</span>} />
          <DetailRow label="Ready" value={deployment.ready ?? '-'} />
        </DetailSection>

        <DetailSection title="Replicas & images">
          <DetailRow label="Updated" value={deployment.updated ?? 0} />
          <DetailRow label="Available" value={deployment.available ?? 0} />
          <DetailRow label="Age" value={timeAgo(deployment.age)} />
          <div className="mt-2 pt-2 border-t border-border">
            <p className="text-text-secondary font-medium text-xs mb-1">Images</p>
            {deployment.images?.length ? (
              <div className="flex flex-wrap gap-1.5 min-w-0 max-w-full">
                {deployment.images.map((image) => (
                  <span key={image} className="inline-flex px-2 py-1 rounded-md bg-hover text-text text-xs max-w-full break-all">
                    {image}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-text text-xs">-</p>
            )}
          </div>
        </DetailSection>

        <DetailSection title="Manifest">
          <div className="px-3 py-2 text-sm text-text-secondary border border-border rounded-md bg-surface-elevated">
            Use the pencil icon above to edit deployment YAML in the bottom panel.
          </div>
        </DetailSection>
        <DetailLabelsSection labels={deployment.labels} />
        <DetailAnnotationsSection annotations={deployment.annotations} />
    </ResourceDetailPanelLayout>
  );
};
