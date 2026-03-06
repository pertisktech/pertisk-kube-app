import { Pencil, X } from 'lucide-react';
import { useState } from 'react';
import type { Deployment } from '../types';
import { getStatusColor, timeAgo } from '../utils';

interface DeploymentDetailPanelProps {
  deployment: Deployment;
  onClose: () => void;
  onOpenYamlEditor: (deployment: Deployment) => void;
  onScale?: (namespace: string, name: string, replicas: number) => Promise<void>;
}

export const DeploymentDetailPanel = ({ deployment, onClose, onOpenYamlEditor, onScale }: DeploymentDetailPanelProps) => {
  const [scaleReplicas, setScaleReplicas] = useState<string>('');
  const [isScaling, setIsScaling] = useState(false);
  const [scaleError, setScaleError] = useState('');
  const [scaleSuccess, setScaleSuccess] = useState('');

  const getStatusTextClass = (status: string) => {
    const color = getStatusColor(status);
    if (color === 'green') return 'text-[var(--color-icon-success)]';
    if (color === 'yellow') return 'text-[var(--color-icon-warning)]';
    if (color === 'red') return 'text-[var(--color-icon-danger)]';
    return 'text-text-secondary';
  };

  const handleScale = async () => {
    const replicas = parseInt(scaleReplicas);
    if (isNaN(replicas) || replicas < 0) {
      setScaleError('Replicas must be a non-negative number');
      return;
    }

    setIsScaling(true);
    setScaleError('');
    setScaleSuccess('');

    try {
      if (onScale) {
        await onScale(deployment.namespace, deployment.name, replicas);
        setScaleSuccess(`Scaling to ${replicas} replicas...`);
        setScaleReplicas('');
        setTimeout(() => setScaleSuccess(''), 3000);
      }
    } catch (err) {
      setScaleError(err instanceof Error ? err.message : 'Failed to scale deployment');
    } finally {
      setIsScaling(false);
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

        <div className="px-5 py-2 border-b border-border flex items-center justify-end">
          <button
            type="button"
            onClick={() => onOpenYamlEditor(deployment)}
            className="inline-flex items-center justify-center h-8 w-8 rounded-md border border-[var(--color-primary)] text-[var(--color-primary)] hover:bg-hover"
            aria-label="Edit deployment YAML"
            title="Edit YAML"
          >
            <Pencil size={15} />
          </button>
        </div>

        <div className="flex-1 overflow-auto overflow-x-hidden p-5 space-y-5 text-sm">
          <section className="min-w-0 bg-surface border border-border rounded-lg p-4">
            <p className="text-xs uppercase tracking-wide text-text-secondary mb-3">Item</p>
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
            <p className="text-xs uppercase tracking-wide text-text-secondary mb-3">Detail</p>
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
            <p className="text-xs uppercase tracking-wide text-text-secondary">Scale Deployment</p>
            <div className="space-y-2">
              <div>
                <label className="text-xs text-text-secondary">Number of Replicas</label>
                <input
                  type="number"
                  min="0"
                  value={scaleReplicas}
                  onChange={(e) => setScaleReplicas(e.target.value)}
                  placeholder="Enter replicas"
                  className="w-full mt-1 px-3 py-2 rounded-md border border-border bg-bar text-text text-sm"
                />
              </div>
              <button
                onClick={handleScale}
                disabled={isScaling || !scaleReplicas}
                className="w-full px-3 py-2 rounded-md bg-primary text-white text-sm font-medium hover:opacity-90 disabled:opacity-50"
              >
                {isScaling ? 'Scaling...' : 'Scale'}
              </button>
              {scaleError && <p className="text-xs text-red-400">{scaleError}</p>}
              {scaleSuccess && <p className="text-xs text-green-400">{scaleSuccess}</p>}
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
