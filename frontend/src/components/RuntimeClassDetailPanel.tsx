import { X, Pencil, Trash2 } from 'lucide-react';
import type { RuntimeClass } from '../types';
import { timeAgo } from '../utils';

interface RuntimeClassDetailPanelProps {
  runtimeClass: RuntimeClass;
  onClose: () => void;
  onOpenYamlEditor?: (runtimeClass: RuntimeClass) => void;
  onDelete?: (name: string) => Promise<void>;
}

export const RuntimeClassDetailPanel = ({ runtimeClass, onClose, onOpenYamlEditor, onDelete }: RuntimeClassDetailPanelProps) => {
  return (
    <aside className="fixed top-0 right-0 z-[100] h-screen w-[420px] max-w-[94vw] bg-surface-elevated border-l border-border shadow-2xl">
      <div className="h-full flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-lg font-semibold text-text">RuntimeClass Info</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-md hover:bg-hover text-text-secondary"
            aria-label="Close runtimeclass panel"
          >
            <X size={16} />
          </button>
        </div>

        <div className="px-5 py-3 border-b border-border">
          <div className="bg-surface border border-border rounded-lg p-1.5 flex items-center gap-2">
            <button
              type="button"
              onClick={() => onOpenYamlEditor?.(runtimeClass)}
              className="inline-flex items-center justify-center h-7 w-7 rounded-md border border-[var(--color-primary)] text-[var(--color-primary)] hover:bg-hover"
              aria-label="Edit runtimeclass YAML"
              data-tooltip="Edit YAML"
            >
              <Pencil size={13} />
            </button>
            <button
              type="button"
              onClick={() => onDelete?.(runtimeClass.name)}
              className="inline-flex items-center justify-center h-7 w-7 rounded-md border border-[var(--color-icon-danger)] text-[var(--color-icon-danger)] hover:bg-hover"
              aria-label="Delete runtimeclass"
              data-tooltip="Delete RuntimeClass"
            >
              <Trash2 size={13} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-auto overflow-x-hidden p-5 space-y-5 text-sm">
          <section className="min-w-0 bg-surface border border-border rounded-lg p-4">
            <div className="space-y-3">
              <div>
                <p className="text-text-secondary">Name</p>
                <p className="text-primary font-medium break-all">{runtimeClass.name}</p>
              </div>
              <div>
                <p className="text-text-secondary">Handler</p>
                <p className="text-text break-all">{runtimeClass.handler}</p>
              </div>
              <div>
                <p className="text-text-secondary">Scheduling</p>
                <p className="text-text break-all">{runtimeClass.scheduling}</p>
              </div>
              <div>
                <p className="text-text-secondary">Age</p>
                <p className="text-text">{timeAgo(runtimeClass.age)}</p>
              </div>
            </div>
          </section>
        </div>
      </div>
    </aside>
  );
};
