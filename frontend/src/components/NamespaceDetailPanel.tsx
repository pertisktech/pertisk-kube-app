import { X } from 'lucide-react';
import type { Namespace } from '../types';
import { timeAgo } from '../utils';

interface NamespaceDetailPanelProps {
  namespace: Namespace;
  onClose: () => void;
  getStatusClass: (phase: string) => string;
}

export const NamespaceDetailPanel = ({ namespace, onClose, getStatusClass }: NamespaceDetailPanelProps) => {
  const labelItems = namespace.labels && namespace.labels !== '-'
    ? namespace.labels.split(',').map((item) => item.trim()).filter(Boolean)
    : [];

  return (
    <aside className="fixed top-0 right-0 z-50 h-screen w-[420px] max-w-[94vw] bg-surface-elevated border-l border-border shadow-2xl">
      <div className="h-full flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-lg font-semibold text-text">Namespace Info</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-md hover:bg-hover text-text-secondary"
            aria-label="Close namespace panel"
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
                <p className="text-primary font-medium break-all">{namespace.name}</p>
              </div>
              <div>
                <p className="text-text-secondary">Status</p>
                <span
                  className={`inline-flex mt-1 px-2.5 py-1 rounded-full text-xs font-medium ${getStatusClass(namespace.phase)}`}
                >
                  {namespace.phase}
                </span>
              </div>
            </div>
          </section>

          <section className="min-w-0 bg-surface border border-border rounded-lg p-4">
            <p className="text-xs uppercase tracking-wide text-text-secondary mb-3">Detail</p>
            <div className="space-y-3">
              <div>
                <p className="text-text-secondary">Age</p>
                <p className="text-text">{timeAgo(namespace.age)}</p>
              </div>

              <div>
                <p className="text-text-secondary mb-1">Labels</p>
                {labelItems.length > 0 ? (
                  <div className="min-w-0 flex flex-wrap gap-1.5">
                    {labelItems.map((label) => (
                      <span
                        key={label}
                        className="inline-flex max-w-full px-2 py-1 rounded-md bg-hover text-text text-xs break-all"
                      >
                        {label}
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
