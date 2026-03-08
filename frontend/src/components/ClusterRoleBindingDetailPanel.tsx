import { Pencil, Trash2 } from 'lucide-react';
import type { ClusterRoleBinding } from '../types';
import { timeAgo } from '../utils';
import { ResourceDetailPanelLayout, DetailSection, DetailRow, PanelActionButton } from './ResourceDetailPanelLayout';

interface ClusterRoleBindingDetailPanelProps {
  clusterRoleBinding: ClusterRoleBinding;
  onClose: () => void;
  onOpenYamlEditor?: (crb: ClusterRoleBinding) => void;
  onDelete?: (name: string) => Promise<void>;
}

export const ClusterRoleBindingDetailPanel = ({ clusterRoleBinding: crb, onClose, onOpenYamlEditor, onDelete }: ClusterRoleBindingDetailPanelProps) => (
  <ResourceDetailPanelLayout
    title={crb.name}
    keyInfo={[
      { label: 'Role', value: crb.role ?? '-' },
      { label: 'Subjects', value: crb.subjects ?? '-' },
      { label: 'Age', value: timeAgo(crb.age) },
    ]}
    actions={
      <>
        <PanelActionButton icon={Pencil} label="Edit YAML" onClick={() => onOpenYamlEditor?.(crb)} />
        <PanelActionButton icon={Trash2} label="Delete" danger onClick={() => onDelete?.(crb.name)} />
      </>
    }
    onClose={onClose}
  >
    <DetailSection title="Cluster Role Binding">
      <DetailRow label="Name" value={crb.name} />
      <DetailRow label="Role" value={crb.role ?? '-'} />
      <DetailRow label="Subjects" value={crb.subjects ?? '-'} />
      <DetailRow label="Age" value={timeAgo(crb.age)} />
    </DetailSection>
  </ResourceDetailPanelLayout>
);
