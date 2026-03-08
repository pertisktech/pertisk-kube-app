import { Pencil, Trash2 } from './Icons';
import type { StorageClass } from '../types';
import { timeAgo } from '../utils';
import { StatusBadge } from './StatusBadge';
import { ResourceDetailPanelLayout, PanelActionButton } from './ResourceDetailPanelLayout';
import { DrawerItem, DrawerLabelsAnnotations } from './drawer';

interface StorageClassDetailPanelProps {
  storageClass: StorageClass;
  onClose: () => void;
  onOpenYamlEditor?: (storageClass: StorageClass) => void;
  onDelete?: (name: string) => Promise<void>;
}

export const StorageClassDetailPanel = ({ storageClass, onClose, onOpenYamlEditor, onDelete }: StorageClassDetailPanelProps) => (
  <ResourceDetailPanelLayout
    title={storageClass.name}
    keyInfo={[
      { label: 'Provisioner', value: storageClass.provisioner ?? '-' },
      { label: 'Reclaim Policy', value: storageClass.reclaim_policy ?? '-' },
      { label: 'Age', value: timeAgo(storageClass.age) },
    ]}
    actions={
      <>
        <PanelActionButton icon={Pencil} label="Edit YAML" onClick={() => onOpenYamlEditor?.(storageClass)} />
        <PanelActionButton icon={Trash2} label="Delete" danger onClick={() => onDelete?.(storageClass.name)} />
      </>
    }
    onClose={onClose}
  >
    <DrawerItem name="Name">{storageClass.name}</DrawerItem>
    <DrawerItem name="Provisioner">{storageClass.provisioner ?? '-'}</DrawerItem>
    <DrawerItem name="Reclaim Policy">{storageClass.reclaim_policy ?? '-'}</DrawerItem>
    <DrawerItem name="Volume Binding Mode">{storageClass.volume_binding_mode ?? '-'}</DrawerItem>
    <DrawerItem name="Allow Volume Expansion"><StatusBadge status={storageClass.allow_volume_expansion ? 'Yes' : 'No'} /></DrawerItem>
    <DrawerItem name="Default">{storageClass.is_default ? <StatusBadge status="Default" /> : 'No'}</DrawerItem>
    <DrawerItem name="Age">{timeAgo(storageClass.age)}</DrawerItem>
    <DrawerLabelsAnnotations labels={storageClass.labels} annotations={storageClass.annotations} />
  </ResourceDetailPanelLayout>
);
