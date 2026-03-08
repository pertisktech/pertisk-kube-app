import { Pencil, Trash2 } from './Icons';
import type { Lease } from '../types';
import { timeAgo } from '../utils';
import { ResourceDetailPanelLayout, DetailSection, DetailRow, DetailLabelsSection, DetailAnnotationsSection, PanelActionButton } from './ResourceDetailPanelLayout';

interface LeaseDetailPanelProps {
  lease: Lease;
  onClose: () => void;
  onOpenYamlEditor?: (lease: Lease) => void;
  onDelete?: (namespace: string, name: string) => Promise<void>;
}

export const LeaseDetailPanel = ({ lease, onClose, onOpenYamlEditor, onDelete }: LeaseDetailPanelProps) => (
  <ResourceDetailPanelLayout
    title={lease.name}
    keyInfo={[
      { label: 'Namespace', value: lease.namespace },
      { label: 'Holder', value: lease.holder_identity ?? '-' },
      { label: 'Age', value: timeAgo(lease.age) },
    ]}
    actions={
      <>
        <PanelActionButton icon={Pencil} label="Edit YAML" onClick={() => onOpenYamlEditor?.(lease)} />
        <PanelActionButton icon={Trash2} label="Delete" danger onClick={() => onDelete?.(lease.namespace, lease.name)} />
      </>
    }
    onClose={onClose}
  >
    <DetailSection title="Lease">
      <DetailRow label="Name" value={lease.name} />
      <DetailRow label="Namespace" value={lease.namespace} />
      <DetailRow label="Holder Identity" value={lease.holder_identity ?? '-'} />
      <DetailRow label="Lease Duration" value={lease.lease_duration_seconds != null ? `${lease.lease_duration_seconds}s` : '-'} />
      <DetailRow label="Age" value={timeAgo(lease.age)} />
    </DetailSection>
    <DetailLabelsSection labels={lease.labels} />
    <DetailAnnotationsSection annotations={lease.annotations} />
  </ResourceDetailPanelLayout>
);
