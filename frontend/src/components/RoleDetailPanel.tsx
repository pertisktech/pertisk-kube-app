import { Pencil, Trash2 } from './Icons';
import type { Role } from '../types';
import { timeAgo } from '../utils';
import { ResourceDetailPanelLayout, PanelActionButton } from './ResourceDetailPanelLayout';
import { DrawerItem, DrawerTitle, DrawerLabelsAnnotations } from './drawer';

interface RoleDetailPanelProps {
  role: Role;
  onClose: () => void;
  onOpenYamlEditor?: (role: Role) => void;
  onDelete?: (namespace: string, name: string) => Promise<void>;
}

export const RoleDetailPanel = ({ role, onClose, onOpenYamlEditor, onDelete }: RoleDetailPanelProps) => (
  <ResourceDetailPanelLayout
    title={role.name}
    keyInfo={[
      { label: 'Namespace', value: role.namespace },
      { label: 'Rules', value: role.rules ?? '-' },
      { label: 'Age', value: timeAgo(role.age) },
    ]}
    actions={
      <>
        <PanelActionButton icon={Pencil} label="Edit YAML" onClick={() => onOpenYamlEditor?.(role)} />
        <PanelActionButton icon={Trash2} label="Delete" danger onClick={() => onDelete?.(role.namespace, role.name)} />
      </>
    }
    onClose={onClose}
  >
    <DrawerTitle>Property</DrawerTitle>
    <DrawerItem name="Name">{role.name}</DrawerItem>
    <DrawerItem name="Namespace">{role.namespace}</DrawerItem>
    <DrawerItem name="Rules">{role.rules ?? '-'}</DrawerItem>
    <DrawerItem name="Age">{timeAgo(role.age)}</DrawerItem>
    <DrawerLabelsAnnotations labels={role.labels} annotations={role.annotations} />
  </ResourceDetailPanelLayout>
);
