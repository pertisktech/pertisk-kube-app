import { Pencil, Trash2 } from 'lucide-react';
import type { ResourceQuota } from '../types';
import { timeAgo } from '../utils';
import { ResourceDetailPanelLayout, DetailSection, DetailRow, DetailLabelsSection, DetailAnnotationsSection, PanelActionButton } from './ResourceDetailPanelLayout';

interface ResourceQuotaDetailPanelProps {
  resourceQuota: ResourceQuota;
  onClose: () => void;
  onOpenYamlEditor?: (resourceQuota: ResourceQuota) => void;
  onDelete?: (namespace: string, name: string) => Promise<void>;
}

export const ResourceQuotaDetailPanel = ({ resourceQuota, onClose, onOpenYamlEditor, onDelete }: ResourceQuotaDetailPanelProps) => (
  <ResourceDetailPanelLayout
    title={resourceQuota.name}
    keyInfo={[
      { label: 'Namespace', value: resourceQuota.namespace },
      { label: 'Status', value: resourceQuota.status ?? '-' },
      { label: 'Age', value: timeAgo(resourceQuota.age) },
    ]}
    actions={
      <>
        <PanelActionButton icon={Pencil} label="Edit YAML" onClick={() => onOpenYamlEditor?.(resourceQuota)} />
        <PanelActionButton icon={Trash2} label="Delete" danger onClick={() => onDelete?.(resourceQuota.namespace, resourceQuota.name)} />
      </>
    }
    onClose={onClose}
  >
    <DetailSection title="Resource Quota">
      <DetailRow label="Name" value={resourceQuota.name} />
      <DetailRow label="Namespace" value={resourceQuota.namespace} />
      <DetailRow label="Status" value={resourceQuota.status ?? '-'} />
      <DetailRow label="Age" value={timeAgo(resourceQuota.age)} />
    </DetailSection>
    <DetailLabelsSection labels={resourceQuota.labels} />
    <DetailAnnotationsSection annotations={resourceQuota.annotations} />
  </ResourceDetailPanelLayout>
);
