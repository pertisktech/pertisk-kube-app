import { Pencil, Trash2 } from 'lucide-react';
import type { DaemonSet } from '../types';
import { getStatusColor, timeAgo } from '../utils';
import { DetailPanelHeader } from './DetailPanelHeader';
import { ResizablePanel } from './ResizablePanel';
interface DaemonSetDetailPanelProps {
  daemonSet: DaemonSet;
  onClose: () => void;
  onOpenYamlEditor?: (daemonSet: DaemonSet) => void;
  onDelete?: (namespace: string, name: string) => Promise<void>;
}

export const DaemonSetDetailPanel = ({ daemonSet, onClose, onOpenYamlEditor, onDelete }: DaemonSetDetailPanelProps) => {
  const getStatusTextClass = (status: string) => {
    const color = getStatusColor(status);
    if (color === 'green') return 'text-[var(--color-icon-success)]';
    if (color === 'yellow') return 'text-[var(--color-icon-warning)]';
    if (color === 'red') return 'text-[var(--color-icon-danger)]';
    return 'text-text-secondary';
  };

  const selectorEntries = Object.entries(daemonSet.node_selector || {});

  return (
    <ResizablePanel>
      <div className="h-full flex flex-col">
        <DetailPanelHeader title="DaemonSet Info" onClose={onClose}>
          <div className="flex gap-2">
            <div className="group relative">
              <button type="button" onClick={() => onOpenYamlEditor?.(daemonSet)} className="p-2 rounded-md border border-[var(--color-primary)] text-[var(--color-primary)] hover:bg-[var(--color-primary)]/10 transition-colors" aria-label="Edit daemonset YAML"><Pencil size={12} /></button>
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-surface-elevated text-text text-xs rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 border border-border">Edit YAML</div>
            </div>
            <div className="group relative">
              <button type="button" onClick={() => onDelete?.(daemonSet.namespace, daemonSet.name)} className="p-2 rounded-md border border-[var(--color-icon-danger)] text-[var(--color-icon-danger)] hover:bg-[var(--color-icon-danger)]/10 transition-colors" aria-label="Delete daemonset"><Trash2 size={12} /></button>
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-surface-elevated text-text text-xs rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 border border-border">Delete</div>
            </div>
          </div>
        </DetailPanelHeader>

        <div className="flex-1 overflow-auto overflow-x-hidden p-5 space-y-5 text-sm">
          <section className="min-w-0 bg-surface border border-border rounded-lg p-4">
            <div className="space-y-3">
              <div>
                <p className="text-text-secondary">Name</p>
                <p className="text-primary font-medium break-all">{daemonSet.name}</p>
              </div>
              <div>
                <p className="text-text-secondary">Namespace</p>
                <p className="text-text break-all">{daemonSet.namespace}</p>
              </div>
              <div>
                <p className="text-text-secondary">Status</p>
                <p className={`mt-1 font-medium ${getStatusTextClass(daemonSet.status || 'Unknown')}`}>
                  {daemonSet.status || 'Unknown'}
                </p>
              </div>
            </div>
          </section>

          <section className="min-w-0 bg-surface border border-border rounded-lg p-4">
            <div className="space-y-3">
              <div>
                <p className="text-text-secondary">Desired</p>
                <p className="text-text">{daemonSet.desired ?? 0}</p>
              </div>
              <div>
                <p className="text-text-secondary">Current</p>
                <p className="text-text">{daemonSet.current ?? 0}</p>
              </div>
              <div>
                <p className="text-text-secondary">Ready</p>
                <p className="text-text">{daemonSet.ready ?? 0}</p>
              </div>
              <div>
                <p className="text-text-secondary">Available</p>
                <p className="text-text">{daemonSet.available ?? 0}</p>
              </div>
              <div>
                <p className="text-text-secondary">Updated</p>
                <p className="text-text">{daemonSet.updated ?? 0}</p>
              </div>
              <div>
                <p className="text-text-secondary">Age</p>
                <p className="text-text">{timeAgo(daemonSet.age)}</p>
              </div>

              <div>
                <p className="text-text-secondary mb-1">Node Selector</p>
                {selectorEntries.length ? (
                  <div className="min-w-0 flex flex-wrap gap-1.5">
                    {selectorEntries.map(([key, value]) => (
                      <span
                        key={`${key}-${value}`}
                        className="inline-flex max-w-full px-2 py-1 rounded-md bg-hover text-text text-xs break-all"
                      >
                        {key}={value}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-text">-</p>
                )}
              </div>

              <div>
                <p className="text-text-secondary mb-1">Images</p>
                {daemonSet.images?.length ? (
                  <div className="min-w-0 flex flex-wrap gap-1.5 max-w-full">
                    {daemonSet.images.map((image) => (
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
    </ResizablePanel>
  );
};
