import { X, Pencil, Trash2 } from 'lucide-react';
import type { RoleBinding } from '../types';
import { timeAgo } from '../utils';

interface RoleBindingDetailPanelProps {
  roleBinding: RoleBinding;
  onClose: () => void;
  onOpenYamlEditor?: (rb: RoleBinding) => void;
  onDelete?: (namespace: string, name: string) => Promise<void>;
}

export const RoleBindingDetailPanel = ({ roleBinding: rb, onClose, onOpenYamlEditor, onDelete }: RoleBindingDetailPanelProps) => {
  return (
    <aside className="fixed top-0 right-0 z-[100] h-screen w-[420px] max-w-[94vw] bg-surface-elevated border-l border-border shadow-2xl">
      <div className="h-full flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-lg font-semibold text-text">Role Binding Info</h2>
          <button type="button" onClick={onClose} className="p-2 rounded-md hover:bg-hover text-text-secondary" aria-label="Close panel"><X size={16} /></button>
        </div>
        <div className="px-5 py-3 border-b border-border">
          <div className="bg-surface border border-border rounded-lg p-1.5 flex items-center gap-2">
            <button type="button" onClick={() => onOpenYamlEditor?.(rb)} className="inline-flex items-center justify-center h-7 w-7 rounded-md border border-[var(--color-primary)] text-[var(--color-primary)] hover:bg-hover" title="Edit YAML"><Pencil size={13} /></button>
            <button type="button" onClick={() => onDelete?.(rb.namespace, rb.name)} className="inline-flex items-center justify-center h-7 w-7 rounded-md border border-[var(--color-icon-danger)] text-[var(--color-icon-danger)] hover:bg-hover" title="Delete"><Trash2 size={13} /></button>
          </div>
        </div>
        <div className="flex-1 overflow-auto overflow-x-hidden p-5 space-y-5 text-sm">
          <section className="min-w-0 bg-surface border border-border rounded-lg p-4">
            <div className="space-y-3">
              <div><p className="text-text-secondary">Name</p><p className="text-primary font-medium break-all">{rb.name}</p></div>
              <div><p className="text-text-secondary">Namespace</p><p className="text-text break-all">{rb.namespace}</p></div>
              <div><p className="text-text-secondary">Role</p><p className="text-text break-all">{rb.role || '-'}</p></div>
              <div><p className="text-text-secondary">Subjects</p><p className="text-text">{rb.subjects}</p></div>
              <div><p className="text-text-secondary">Age</p><p className="text-text">{timeAgo(rb.age)}</p></div>
            </div>
          </section>
        </div>
      </div>
    </aside>
  );
};
