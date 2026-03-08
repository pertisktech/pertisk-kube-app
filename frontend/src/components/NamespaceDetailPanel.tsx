import { Pencil, Trash2 } from 'lucide-react';
import type { Namespace } from '../types';
import { timeAgo } from '../utils';
import { DetailPanelHeader } from './DetailPanelHeader';
import { ResizablePanel } from './ResizablePanel';

interface NamespaceDetailPanelProps {
  namespace: Namespace;
  onClose: () => void;
  getStatusClass: (phase: string) => string;
  onOpenYamlEditor?: (namespace: Namespace) => void;
  onDelete?: (name: string) => Promise<void>;
}

export const NamespaceDetailPanel = ({ namespace, onClose, getStatusClass, onOpenYamlEditor, onDelete }: NamespaceDetailPanelProps) => {
  const labelItems = namespace.labels && namespace.labels !== '-'
    ? namespace.labels.split(',').map((item) => item.trim()).filter(Boolean)
    : [];

  return (
    <ResizablePanel>
      <div className="h-full flex flex-col">
        <DetailPanelHeader title="Namespace Info" onClose={onClose}>
          <div className="flex gap-2">
            <div className="group relative">
              <button type="button" onClick={() => onOpenYamlEditor?.(namespace)} className="p-2 rounded-md border border-[var(--color-primary)] text-[var(--color-primary)] hover:bg-[var(--color-primary)]/10 transition-colors" aria-label="Edit namespace YAML"><Pencil size={12} /></button>
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-surface-elevated text-text text-xs rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 border border-border">Edit YAML</div>
            </div>
            <div className="group relative">
              <button type="button" onClick={() => onDelete?.(namespace.name)} className="p-2 rounded-md border border-[var(--color-icon-danger)] text-[var(--color-icon-danger)] hover:bg-[var(--color-icon-danger)]/10 transition-colors" aria-label="Delete namespace"><Trash2 size={12} /></button>
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-surface-elevated text-text text-xs rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 border border-border">Delete</div>
            </div>
          </div>
        </DetailPanelHeader>
        <div className="flex-1 overflow-auto overflow-x-hidden p-5 space-y-5 text-sm">
          <section className="min-w-0 bg-surface border border-border rounded-lg p-4">
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
    </ResizablePanel>
  );
};
