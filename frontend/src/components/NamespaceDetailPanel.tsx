import { Pencil, Trash2 } from './Icons';
import type { Namespace } from '../types';
import { timeAgo } from '../utils';
import { ResourceDetailPanelLayout, DetailSection, DetailRow } from './ResourceDetailPanelLayout';

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

  const actions = (
    <>
      <div className="group relative">
        <button type="button" onClick={() => onOpenYamlEditor?.(namespace)} className="p-2 rounded-md border border-[var(--color-primary)] text-[var(--color-primary)] hover:bg-[var(--color-primary)]/10 transition-colors" aria-label="Edit namespace YAML"><Pencil size={12} /></button>
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-surface-elevated text-text text-xs rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 border border-border">Edit YAML</div>
      </div>
      <div className="group relative">
        <button type="button" onClick={() => onDelete?.(namespace.name)} className="p-2 rounded-md border border-[var(--color-icon-danger)] text-[var(--color-icon-danger)] hover:bg-[var(--color-icon-danger)]/10 transition-colors" aria-label="Delete namespace"><Trash2 size={12} /></button>
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-surface-elevated text-text text-xs rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 border border-border">Delete</div>
      </div>
    </>
  );

  return (
    <ResourceDetailPanelLayout
      title={namespace.name}
      status={namespace.phase}
      keyInfo={[
        { label: 'Phase', value: namespace.phase },
        { label: 'Age', value: timeAgo(namespace.age) },
      ]}
      actions={actions}
      onClose={onClose}
    >
      <DetailSection title="Namespace">
        <DetailRow label="Name" value={namespace.name} />
        <DetailRow label="Status" value={<span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${getStatusClass(namespace.phase)}`}>{namespace.phase}</span>} />
        <DetailRow label="Age" value={timeAgo(namespace.age)} />
      </DetailSection>
      <DetailSection title="Labels">
        {labelItems.length > 0 ? (
          <div className="min-w-0 flex flex-wrap gap-1.5">
            {labelItems.map((label) => (
              <span key={label} className="inline-flex max-w-full px-2 py-1 rounded-md bg-hover text-text text-xs break-all">
                {label}
              </span>
            ))}
          </div>
        ) : (
          <p className="text-text text-xs">-</p>
        )}
      </DetailSection>
    </ResourceDetailPanelLayout>
  );
};
