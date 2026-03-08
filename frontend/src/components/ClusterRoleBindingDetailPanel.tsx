import { Pencil, Trash2 } from './Icons';
import type { ClusterRoleBinding } from '../types';
import { timeAgo } from '../utils';
import { ResourceDetailPanelLayout, PanelActionButton } from './ResourceDetailPanelLayout';
import { DrawerItem, DrawerTitle, DrawerCollapsibleSection, DrawerLabelsAnnotations } from './drawer';

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
    <DrawerTitle>Property</DrawerTitle>
    <DrawerItem name="Name">{crb.name}</DrawerItem>
    <DrawerItem name="Role">{crb.role ?? '-'}</DrawerItem>
    <DrawerItem name="Subjects">{crb.subjects ?? '-'}</DrawerItem>
    <DrawerItem name="Age">{timeAgo(crb.age)}</DrawerItem>
    <DrawerCollapsibleSection title="Metadata">
      <DrawerLabelsAnnotations labels={crb.labels} annotations={crb.annotations} />
    </DrawerCollapsibleSection>
  </ResourceDetailPanelLayout>
);
