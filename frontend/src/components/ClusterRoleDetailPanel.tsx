import { Pencil, Trash2 } from './Icons';
import type { ClusterRole } from '../types';
import { timeAgo } from '../utils';
import { ResourceDetailPanelLayout, PanelActionButton } from './ResourceDetailPanelLayout';
import { DrawerItem, DrawerTitle, DrawerLabelsAnnotations } from './drawer';

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
    <DrawerTitle>Property</DrawerTitle>
    <DrawerItem name="Name">{cr.name}</DrawerItem>
    <DrawerItem name="Rules">{cr.rules ?? '-'}</DrawerItem>
    <DrawerItem name="Age">{timeAgo(cr.age)}</DrawerItem>
    <DrawerLabelsAnnotations labels={cr.labels} annotations={cr.annotations} />
  </ResourceDetailPanelLayout>
);
