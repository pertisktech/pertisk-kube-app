import { Pencil, Trash2 } from 'lucide-react';
import type { ClusterRole } from '../types';
import { timeAgo } from '../utils';
import { ResourceDetailPanelLayout, DetailSection, DetailRow, DetailLabelsSection, DetailAnnotationsSection, PanelActionButton } from './ResourceDetailPanelLayout';

interface ClusterRoleDetailPanelProps {
  clusterRole: ClusterRole;
  onClose: () => void;
  onOpenYamlEditor?: (cr: ClusterRole) => void;
  onDelete?: (name: string) => Promise<void>;
}

export const ClusterRoleDetailPanel = ({ clusterRole: cr, onClose, onOpenYamlEditor, onDelete }: ClusterRoleDetailPanelProps) => (
  <ResourceDetailPanelLayout
    title={cr.name}
    keyInfo={[
      { label: 'Rules', value: cr.rules ?? '-' },
      { label: 'Age', value: timeAgo(cr.age) },
    ]}
    actions={
      <>
        <PanelActionButton icon={Pencil} label="Edit YAML" onClick={() => onOpenYamlEditor?.(cr)} />
        <PanelActionButton icon={Trash2} label="Delete" danger onClick={() => onDelete?.(cr.name)} />
      </>
    }
    onClose={onClose}
  >
    <DetailSection title="Cluster Role">
      <DetailRow label="Name" value={cr.name} />
      <DetailRow label="Rules" value={cr.rules ?? '-'} />
      <DetailRow label="Age" value={timeAgo(cr.age)} />
    </DetailSection>
    <DetailLabelsSection labels={cr.labels} />
    <DetailAnnotationsSection annotations={cr.annotations} />
  </ResourceDetailPanelLayout>
);
