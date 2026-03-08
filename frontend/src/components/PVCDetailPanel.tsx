import { Pencil, Trash2 } from './Icons';
import type { PersistentVolumeClaim } from '../types';
import { timeAgo } from '../utils';
import { ResourceDetailPanelLayout, PanelActionButton } from './ResourceDetailPanelLayout';
import { DrawerItem, DrawerLabelsAnnotations } from './drawer';

interface PVCDetailPanelProps {
  pvc: PersistentVolumeClaim;
  onClose: () => void;
  onOpenYamlEditor?: (pvc: PersistentVolumeClaim) => void;
  onDelete?: (namespace: string, name: string) => Promise<void>;
}

export const PVCDetailPanel = ({ pvc, onClose, onOpenYamlEditor, onDelete }: PVCDetailPanelProps) => (
  <ResourceDetailPanelLayout
    title={pvc.name}
    status={pvc.status}
    keyInfo={[
      { label: 'Namespace', value: pvc.namespace },
      { label: 'Volume', value: pvc.volume ?? '-' },
      { label: 'Age', value: timeAgo(pvc.age) },
    ]}
    actions={
      <>
        <PanelActionButton icon={Pencil} label="Edit YAML" onClick={() => onOpenYamlEditor?.(pvc)} />
        <PanelActionButton icon={Trash2} label="Delete" danger onClick={() => onDelete?.(pvc.namespace, pvc.name)} />
      </>
    }
    onClose={onClose}
  >
    <DrawerItem name="Name">{pvc.name}</DrawerItem>
    <DrawerItem name="Namespace">{pvc.namespace}</DrawerItem>
    <DrawerItem name="Status">{pvc.status}</DrawerItem>
    <DrawerItem name="Volume">{pvc.volume ?? '-'}</DrawerItem>
    <DrawerItem name="Capacity">{pvc.capacity ?? '-'}</DrawerItem>
    <DrawerItem name="Access Modes">{pvc.access_modes ?? '-'}</DrawerItem>
    <DrawerItem name="Storage Class">{pvc.storage_class ?? '-'}</DrawerItem>
    <DrawerItem name="Age">{timeAgo(pvc.age)}</DrawerItem>
    <DrawerLabelsAnnotations labels={pvc.labels} annotations={pvc.annotations} />
  </ResourceDetailPanelLayout>
);
