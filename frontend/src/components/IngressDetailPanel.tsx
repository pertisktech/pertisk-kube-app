import { Pencil, Trash2 } from 'lucide-react';
import type { Ingress } from '../types';
import { timeAgo } from '../utils';
import { ResourceDetailPanelLayout, DetailSection, DetailRow, DetailLabelsSection, DetailAnnotationsSection } from './ResourceDetailPanelLayout';

interface IngressDetailPanelProps {
  ingress: Ingress;
  onClose: () => void;
  onOpenYamlEditor?: (ingress: Ingress) => void;
  onDelete?: (namespace: string, name: string) => Promise<void>;
}

export const IngressDetailPanel = ({ ingress, onClose, onOpenYamlEditor, onDelete }: IngressDetailPanelProps) => {
  const actions = (
    <>
      <div className="group relative">
        <button type="button" onClick={() => onOpenYamlEditor?.(ingress)} className="p-2 rounded-md border border-[var(--color-primary)] text-[var(--color-primary)] hover:bg-[var(--color-primary)]/10 transition-colors" aria-label="Edit ingress YAML"><Pencil size={12} /></button>
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-surface-elevated text-text text-xs rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 border border-border">Edit YAML</div>
      </div>
      <div className="group relative">
        <button type="button" onClick={() => onDelete?.(ingress.namespace, ingress.name)} className="p-2 rounded-md border border-[var(--color-icon-danger)] text-[var(--color-icon-danger)] hover:bg-[var(--color-icon-danger)]/10 transition-colors" aria-label="Delete ingress"><Trash2 size={12} /></button>
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-surface-elevated text-text text-xs rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 border border-border">Delete</div>
      </div>
    </>
  );

  return (
    <ResourceDetailPanelLayout
      title={ingress.name}
      keyInfo={[
        { label: 'Namespace', value: ingress.namespace },
        { label: 'Class', value: ingress.ingress_class ?? '-' },
        { label: 'Age', value: timeAgo(ingress.age) },
      ]}
      actions={actions}
      onClose={onClose}
    >
      <DetailSection title="Ingress">
        <DetailRow label="Name" value={ingress.name} />
        <DetailRow label="Namespace" value={ingress.namespace} />
        <DetailRow label="Class" value={ingress.ingress_class ?? '-'} />
        <DetailRow label="Hosts" value={ingress.hosts ?? '-'} />
        <DetailRow label="Address" value={ingress.address ?? '-'} mono />
        <DetailRow label="Rules" value={ingress.rules ?? 0} />
        <DetailRow label="Age" value={timeAgo(ingress.age)} />
      </DetailSection>
      <DetailLabelsSection labels={ingress.labels} />
      <DetailAnnotationsSection annotations={ingress.annotations} />
    </ResourceDetailPanelLayout>
  );
};
