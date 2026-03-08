import { Pencil, Trash2 } from './Icons';
import type { RoleBinding } from '../types';
import { timeAgo } from '../utils';
import { ResourceDetailPanelLayout, PanelActionButton } from './ResourceDetailPanelLayout';
import { DrawerItem, DrawerTitle, DrawerLabelsAnnotations } from './drawer';

interface RoleBindingDetailPanelProps {
  roleBinding: RoleBinding;
  onClose: () => void;
  onOpenYamlEditor?: (rb: RoleBinding) => void;
  onDelete?: (namespace: string, name: string) => Promise<void>;
}

export const RoleBindingDetailPanel = ({ roleBinding: rb, onClose, onOpenYamlEditor, onDelete }: RoleBindingDetailPanelProps) => (
  <ResourceDetailPanelLayout
    title={rb.name}
    keyInfo={[
      { label: 'Namespace', value: rb.namespace },
      { label: 'Role', value: rb.role ?? '-' },
      { label: 'Age', value: timeAgo(rb.age) },
    ]}
    actions={
      <>
        <PanelActionButton icon={Pencil} label="Edit YAML" onClick={() => onOpenYamlEditor?.(rb)} />
        <PanelActionButton icon={Trash2} label="Delete" danger onClick={() => onDelete?.(rb.namespace, rb.name)} />
      </>
    }
    onClose={onClose}
  >
    <DrawerTitle>Property</DrawerTitle>
    <DrawerItem name="Name">{rb.name}</DrawerItem>
    <DrawerItem name="Namespace">{rb.namespace}</DrawerItem>
    <DrawerItem name="Role">{rb.role ?? '-'}</DrawerItem>
    <DrawerItem name="Subjects">{rb.subjects ?? '-'}</DrawerItem>
    <DrawerItem name="Age">{timeAgo(rb.age)}</DrawerItem>
    <DrawerLabelsAnnotations labels={rb.labels} annotations={rb.annotations} />
  </ResourceDetailPanelLayout>
);
