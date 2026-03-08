import { Pencil, Trash2 } from 'lucide-react';
import type { StorageClass } from '../types';
import { timeAgo } from '../utils';
import { StatusBadge } from './StatusBadge';
import { DetailPanelHeader } from './DetailPanelHeader';
import { ResizablePanel } from './ResizablePanel';

interface StorageClassDetailPanelProps {
  storageClass: StorageClass;
  onClose: () => void;
  onOpenYamlEditor?: (storageClass: StorageClass) => void;
  onDelete?: (name: string) => Promise<void>;
}

export const StorageClassDetailPanel = ({ storageClass, onClose, onOpenYamlEditor, onDelete }: StorageClassDetailPanelProps) => {
  return (
    <ResizablePanel>
      <div className="h-full flex flex-col">
        <DetailPanelHeader title="Storage Class Info" onClose={onClose}>
          <div className="flex gap-2">
            <div className="group relative">
              <button type="button" onClick={() => onOpenYamlEditor?.(storageClass)} className="p-2 rounded-md border border-[var(--color-primary)] text-[var(--color-primary)] hover:bg-[var(--color-primary)]/10 transition-colors" aria-label="Edit storage class YAML"><Pencil size={12} /></button>
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-surface-elevated text-text text-xs rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 border border-border">Edit YAML</div>
            </div>
            <div className="group relative">
              <button type="button" onClick={() => onDelete?.(storageClass.name)} className="p-2 rounded-md border border-[var(--color-icon-danger)] text-[var(--color-icon-danger)] hover:bg-[var(--color-icon-danger)]/10 transition-colors" aria-label="Delete storage class"><Trash2 size={12} /></button>
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-surface-elevated text-text text-xs rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 border border-border">Delete</div>
            </div>
          </div>
        </DetailPanelHeader>

        <div className="flex-1 overflow-auto overflow-x-hidden p-5 space-y-5 text-sm">
          <section className="min-w-0 bg-surface border border-border rounded-lg p-4">
            <div className="space-y-3">
              <div>
                <p className="text-text-secondary">Name</p>
                <p className="text-primary font-medium break-all">{storageClass.name}</p>
              </div>
              <div>
                <p className="text-text-secondary">Provisioner</p>
                <p className="text-text break-all">{storageClass.provisioner || '-'}</p>
              </div>
              <div>
                <p className="text-text-secondary">Reclaim Policy</p>
                <p className="text-text">{storageClass.reclaim_policy || '-'}</p>
              </div>
              <div>
                <p className="text-text-secondary">Volume Binding Mode</p>
                <p className="text-text">{storageClass.volume_binding_mode || '-'}</p>
              </div>
              <div>
                <p className="text-text-secondary">Allow Volume Expansion</p>
                <StatusBadge status={storageClass.allow_volume_expansion ? 'Yes' : 'No'} />
              </div>
              <div>
                <p className="text-text-secondary">Default</p>
                {storageClass.is_default ? <StatusBadge status="Default" /> : <p className="text-text">No</p>}
              </div>
              <div>
                <p className="text-text-secondary">Age</p>
                <p className="text-text">{timeAgo(storageClass.age)}</p>
              </div>
            </div>
          </section>
        </div>
      </div>
    </ResizablePanel>
  );
};
