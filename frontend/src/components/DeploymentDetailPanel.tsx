import { Pencil, RotateCcw, X, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { Deployment } from '../types';
import { getStatusColor, timeAgo } from '../utils';

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

  return (
    <aside className="fixed top-0 right-0 z-[100] h-screen w-[420px] max-w-[94vw] bg-surface-elevated border-l border-border shadow-2xl">
      <div className="h-full flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-lg font-semibold text-text">Deployment Info</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-md hover:bg-hover text-text-secondary"
            aria-label="Close deployment panel"
          >
            <X size={16} />
          </button>
        </div>

        <div className="px-5 py-3 border-b border-border">
          <div className="grid grid-cols-1 gap-2">
            <div className="bg-surface border border-border rounded-lg p-1.5 flex items-center gap-2">
              <button
                type="button"
                onClick={handleRestart}
                disabled={isRestarting}
                className="inline-flex items-center justify-center h-7 w-7 rounded-md border border-[var(--color-primary)] text-[var(--color-primary)] hover:bg-hover disabled:opacity-50 disabled:cursor-not-allowed"
                aria-label="Restart deployment"
                title="Restart Deployment"
              >
                <RotateCcw size={13} className={isRestarting ? 'animate-spin' : ''} />
              </button>
              <button
                type="button"
                onClick={() => onOpenYamlEditor(deployment)}
                className="inline-flex items-center justify-center h-7 w-7 rounded-md border border-[var(--color-primary)] text-[var(--color-primary)] hover:bg-hover"
                aria-label="Edit deployment YAML"
                title="Edit YAML"
              >
                <Pencil size={13} />
              </button>
              <button
                type="button"
                onClick={() => onDelete?.(deployment.namespace, deployment.name)}
                className="inline-flex items-center justify-center h-7 w-7 rounded-md border border-[var(--color-icon-danger)] text-[var(--color-icon-danger)] hover:bg-hover"
                aria-label="Delete deployment"
                title="Delete Deployment"
              >
                <Trash2 size={13} />
              </button>
            </div>

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
                  title="Decrease replicas"
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
                  title="Replicas"
                />
                <button
                  type="button"
                  onClick={() => void handleIncrement()}
                  disabled={isScaling}
                  className="inline-flex items-center justify-center h-8 w-8 rounded-md border border-border text-text hover:bg-hover disabled:opacity-50 disabled:cursor-not-allowed"
                  aria-label="Increase replicas"
                  title="Increase replicas"
                >
                  +
                </button>
              </div>
            </div>
          </div>
        </div>

        {(restartError || restartSuccess || scaleError || scaleSuccess) && (
          <div className="px-5 py-2 border-b border-border space-y-1">
            {restartError && <p className="text-xs text-red-400">{restartError}</p>}
            {restartSuccess && <p className="text-xs text-green-400">{restartSuccess}</p>}
            {scaleError && <p className="text-xs text-red-400">{scaleError}</p>}
            {scaleSuccess && <p className="text-xs text-green-400">{scaleSuccess}</p>}
          </div>
        )}

        <div className="flex-1 overflow-auto overflow-x-hidden p-5 space-y-5 text-sm">
          <section className="min-w-0 bg-surface border border-border rounded-lg p-4">
            <div className="space-y-3">
              <div>
                <p className="text-text-secondary">Name</p>
                <p className="text-primary font-medium break-all">{deployment.name}</p>
              </div>
              <div>
                <p className="text-text-secondary">Namespace</p>
                <p className="text-text break-all">{deployment.namespace}</p>
              </div>
              <div>
                <p className="text-text-secondary">Status</p>
                <p className={`mt-1 font-medium ${getStatusTextClass(deployment.status || 'Unknown')}`}>
                  {deployment.status || 'Unknown'}
                </p>
              </div>
              <div>
                <p className="text-text-secondary">Ready</p>
                <p className="text-text break-all">{deployment.ready || '-'}</p>
              </div>
            </div>
          </section>

          <section className="min-w-0 bg-surface border border-border rounded-lg p-4">
            <div className="space-y-3">
              <div>
                <p className="text-text-secondary">Updated</p>
                <p className="text-text">{deployment.updated ?? 0}</p>
              </div>
              <div>
                <p className="text-text-secondary">Available</p>
                <p className="text-text">{deployment.available ?? 0}</p>
              </div>
              <div>
                <p className="text-text-secondary">Age</p>
                <p className="text-text">{timeAgo(deployment.age)}</p>
              </div>
              <div>
                <p className="text-text-secondary mb-1">Images</p>
                {deployment.images?.length ? (
                  <div className="flex flex-wrap gap-1.5 min-w-0 max-w-full">
                    {deployment.images.map((image) => (
                      <span
                        key={image}
                        className="inline-flex px-2 py-1 rounded-md bg-hover text-text text-xs max-w-full break-all"
                      >
                        {image}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-text">-</p>
                )}
              </div>
            </div>
          </section>

          <section className="min-w-0 bg-surface border border-border rounded-lg p-4 space-y-3">
            <p className="text-xs uppercase tracking-wide text-text-secondary">Manifest</p>
            <div className="px-3 py-2 text-sm text-text-secondary border border-border rounded-md bg-surface-elevated">
              Use the pencil icon in the top-right corner to edit deployment YAML in the bottom content tab.
            </div>
          </section>
        </div>
      </div>
    </aside>
  );
};
