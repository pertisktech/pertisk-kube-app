import { X } from 'lucide-react';
import type { StatefulSet } from '../types';
import { getStatusColor, timeAgo } from '../utils';

interface StatefulSetDetailPanelProps {
  statefulSet: StatefulSet;
  onClose: () => void;
}

export const StatefulSetDetailPanel = ({ statefulSet, onClose }: StatefulSetDetailPanelProps) => {
  const getStatusTextClass = (status: string) => {
    const color = getStatusColor(status);
    if (color === 'green') return 'text-[var(--color-icon-success)]';
    if (color === 'yellow') return 'text-[var(--color-icon-warning)]';
    if (color === 'red') return 'text-[var(--color-icon-danger)]';
    return 'text-text-secondary';
  };

  return (
    <aside className="fixed top-0 right-0 z-50 h-screen w-[420px] max-w-[94vw] bg-surface-elevated border-l border-border shadow-2xl">
      <div className="h-full flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-lg font-semibold text-text">StatefulSet Info</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-md hover:bg-hover text-text-secondary"
            aria-label="Close statefulset panel"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-auto overflow-x-hidden p-5 space-y-5 text-sm">
          <section className="min-w-0 bg-surface border border-border rounded-lg p-4">
            <p className="text-xs uppercase tracking-wide text-text-secondary mb-3">Item</p>
            <div className="space-y-3">
              <div>
                <p className="text-text-secondary">Name</p>
                <p className="text-primary font-medium break-all">{statefulSet.name}</p>
              </div>
              <div>
                <p className="text-text-secondary">Namespace</p>
                <p className="text-text break-all">{statefulSet.namespace}</p>
              </div>
              <div>
                <p className="text-text-secondary">Status</p>
                <p className={`mt-1 font-medium ${getStatusTextClass(statefulSet.status || 'Unknown')}`}>
                  {statefulSet.status || 'Unknown'}
                </p>
              </div>
            </div>
          </section>

          <section className="min-w-0 bg-surface border border-border rounded-lg p-4">
            <p className="text-xs uppercase tracking-wide text-text-secondary mb-3">Detail</p>
            <div className="space-y-3">
              <div>
                <p className="text-text-secondary">Ready</p>
                <p className="text-text break-all">{statefulSet.ready || '-'}</p>
              </div>
              <div>
                <p className="text-text-secondary">Current</p>
                <p className="text-text">{statefulSet.current ?? 0}</p>
              </div>
              <div>
                <p className="text-text-secondary">Updated</p>
                <p className="text-text">{statefulSet.updated ?? 0}</p>
              </div>
              <div>
                <p className="text-text-secondary">Age</p>
                <p className="text-text">{timeAgo(statefulSet.age)}</p>
              </div>

              <div>
                <p className="text-text-secondary mb-1">Images</p>
                {statefulSet.images?.length ? (
                  <div className="min-w-0 flex flex-wrap gap-1.5 max-w-full">
                    {statefulSet.images.map((image) => (
                      <span
                        key={image}
                        className="inline-flex max-w-full px-2 py-1 rounded-md bg-hover text-text text-xs break-all"
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
        </div>
      </div>
    </aside>
  );
};
