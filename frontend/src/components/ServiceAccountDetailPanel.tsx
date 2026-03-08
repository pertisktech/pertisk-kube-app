import { Pencil, Trash2 } from './Icons';
import type { ServiceAccount } from '../types';
import { timeAgo } from '../utils';
import { ResourceDetailPanelLayout, DetailSection, DetailRow, DetailLabelsSection, DetailAnnotationsSection, PanelActionButton } from './ResourceDetailPanelLayout';

interface ServiceAccountDetailPanelProps {
  serviceAccount: ServiceAccount;
  onClose: () => void;
  onOpenYamlEditor?: (sa: ServiceAccount) => void;
  onDelete?: (namespace: string, name: string) => Promise<void>;
}

export const ServiceAccountDetailPanel = ({ serviceAccount: sa, onClose, onOpenYamlEditor, onDelete }: ServiceAccountDetailPanelProps) => (
  <ResourceDetailPanelLayout
    title={sa.name}
    keyInfo={[
      { label: 'Namespace', value: sa.namespace },
      { label: 'Secrets', value: sa.secrets ?? '-' },
      { label: 'Age', value: timeAgo(sa.age) },
    ]}
    actions={
      <>
        <PanelActionButton icon={Pencil} label="Edit YAML" onClick={() => onOpenYamlEditor?.(sa)} />
        <PanelActionButton icon={Trash2} label="Delete" danger onClick={() => onDelete?.(sa.namespace, sa.name)} />
      </>
    }
    onClose={onClose}
  >
    <DetailSection title="Service Account">
      <DetailRow label="Name" value={sa.name} />
      <DetailRow label="Namespace" value={sa.namespace} />
      <DetailRow label="Secrets" value={sa.secrets ?? '-'} />
      <DetailRow label="Age" value={timeAgo(sa.age)} />
    </DetailSection>
    <DetailLabelsSection labels={sa.labels} />
    <DetailAnnotationsSection annotations={sa.annotations} />
  </ResourceDetailPanelLayout>
);
