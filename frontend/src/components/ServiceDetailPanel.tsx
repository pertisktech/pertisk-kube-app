import { Pencil, Trash2 } from 'lucide-react';
import type { Service } from '../types';
import { timeAgo } from '../utils';
import { ResourceDetailPanelLayout, DetailSection, DetailRow } from './ResourceDetailPanelLayout';

interface ServiceDetailPanelProps {
  service: Service;
  onClose: () => void;
  onOpenYamlEditor?: (service: Service) => void;
  onDelete?: (namespace: string, name: string) => Promise<void>;
}

export const ServiceDetailPanel = ({ service, onClose, onOpenYamlEditor, onDelete }: ServiceDetailPanelProps) => {
  const actions = (
    <>
      <div className="group relative">
        <button
          type="button"
          onClick={() => onOpenYamlEditor?.(service)}
          className="p-2 rounded-md border border-[var(--color-primary)] text-[var(--color-primary)] hover:bg-[var(--color-primary)]/10 transition-colors"
          aria-label="Edit service YAML"
        >
          <Pencil size={12} />
        </button>
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-surface-elevated text-text text-xs rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 border border-border">Edit YAML</div>
      </div>
      <div className="group relative">
        <button
          type="button"
          onClick={() => onDelete?.(service.namespace, service.name)}
          className="p-2 rounded-md border border-[var(--color-icon-danger)] text-[var(--color-icon-danger)] hover:bg-[var(--color-icon-danger)]/10 transition-colors"
          aria-label="Delete service"
        >
          <Trash2 size={12} />
        </button>
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-surface-elevated text-text text-xs rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 border border-border">Delete</div>
      </div>
    </>
  );

  return (
    <ResourceDetailPanelLayout
      title={service.name}
      keyInfo={[
        { label: 'Namespace', value: service.namespace },
        { label: 'Type', value: service.service_type ?? '-' },
        { label: 'Age', value: timeAgo(service.age) },
      ]}
      actions={actions}
      onClose={onClose}
    >
      <DetailSection title="Service">
        <DetailRow label="Name" value={service.name} />
        <DetailRow label="Namespace" value={service.namespace} />
        <DetailRow label="Type" value={service.service_type ?? '-'} />
        <DetailRow label="Cluster IP" value={service.cluster_ip ?? '-'} mono />
        <DetailRow label="External IP" value={service.external_ip ?? '-'} mono />
        <DetailRow label="Ports" value={service.ports ?? '-'} mono />
        <DetailRow label="Age" value={timeAgo(service.age)} />
      </DetailSection>
    </ResourceDetailPanelLayout>
  );
};
