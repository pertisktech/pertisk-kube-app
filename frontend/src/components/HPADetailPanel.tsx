import { Pencil, Trash2 } from 'lucide-react';
import type { HPA } from '../types';
import { timeAgo } from '../utils';
import { DetailPanelHeader } from './DetailPanelHeader';
import { ResizablePanel } from './ResizablePanel';

interface HPADetailPanelProps {
  hpa: HPA;
  onClose: () => void;
  onOpenYamlEditor?: (hpa: HPA) => void;
  onDelete?: (namespace: string, name: string) => Promise<void>;
}

export const HPADetailPanel = ({ hpa, onClose, onOpenYamlEditor, onDelete }: HPADetailPanelProps) => {
  return (
    <ResizablePanel>
      <div className="h-full flex flex-col">
        <DetailPanelHeader title="HPA Info" onClose={onClose}>
          <div className="flex gap-2">
            <div className="group relative">
              <button type="button" onClick={() => onOpenYamlEditor?.(hpa)} className="p-2 rounded-md border border-[var(--color-primary)] text-[var(--color-primary)] hover:bg-[var(--color-primary)]/10 transition-colors" aria-label="Edit hpa YAML"><Pencil size={12} /></button>
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-surface-elevated text-text text-xs rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 border border-border">Edit YAML</div>
            </div>
            <div className="group relative">
              <button type="button" onClick={() => onDelete?.(hpa.namespace, hpa.name)} className="p-2 rounded-md border border-[var(--color-icon-danger)] text-[var(--color-icon-danger)] hover:bg-[var(--color-icon-danger)]/10 transition-colors" aria-label="Delete hpa"><Trash2 size={12} /></button>
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-surface-elevated text-text text-xs rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 border border-border">Delete</div>
            </div>
          </div>
        </DetailPanelHeader>

        <div className="flex-1 overflow-auto overflow-x-hidden p-5 space-y-5 text-sm">
          <section className="min-w-0 bg-surface border border-border rounded-lg p-4">
            <div className="space-y-3">
              <div>
                <p className="text-text-secondary">Name</p>
                <p className="text-primary font-medium break-all">{hpa.name}</p>
              </div>
              <div>
                <p className="text-text-secondary">Namespace</p>
                <p className="text-text break-all">{hpa.namespace}</p>
              </div>
              <div>
                <p className="text-text-secondary">Reference</p>
                <p className="text-text break-all">{hpa.reference}</p>
              </div>
              <div>
                <p className="text-text-secondary">Replicas</p>
                <p className="text-text">
                  Current: {hpa.current_replicas} / Desired: {hpa.desired_replicas}
                </p>
              </div>
              <div>
                <p className="text-text-secondary">Min/Max Replicas</p>
                <p className="text-text">{hpa.min_replicas} / {hpa.max_replicas}</p>
              </div>
              <div>
                <p className="text-text-secondary">Targets</p>
                <p className="text-text">{hpa.targets}</p>
              </div>
              <div>
                <p className="text-text-secondary">Age</p>
                <p className="text-text">{timeAgo(hpa.age)}</p>
              </div>
            </div>
          </section>
        </div>
      </div>
    </ResizablePanel>
  );
};
