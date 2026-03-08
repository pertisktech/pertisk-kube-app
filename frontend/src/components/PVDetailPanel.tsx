import { Pencil, Trash2 } from './Icons';
import type { PersistentVolume } from '../types';
import { timeAgo } from '../utils';
import { ResourceDetailPanelLayout, PanelActionButton } from './ResourceDetailPanelLayout';
import { DrawerItem, DrawerLabelsAnnotations } from './drawer';

interface PVDetailPanelProps {
  pv: PersistentVolume;
  onClose: () => void;
  onOpenYamlEditor?: (pv: PersistentVolume) => void;
  onDelete?: (name: string) => Promise<void>;
}

export const PVDetailPanel = ({ pv, onClose, onOpenYamlEditor, onDelete }: PVDetailPanelProps) => (
  <ResourceDetailPanelLayout
    title={pv.name}
    status={pv.status}
    keyInfo={[
      { label: 'Capacity', value: pv.capacity ?? '-' },
      { label: 'Claim', value: pv.claim ?? '-' },
      { label: 'Age', value: timeAgo(pv.age) },
    ]}
    actions={
      <>
        <PanelActionButton icon={Pencil} label="Edit YAML" onClick={() => onOpenYamlEditor?.(pv)} />
        <PanelActionButton icon={Trash2} label="Delete" danger onClick={() => onDelete?.(pv.name)} />
      </>
    }
    onClose={onClose}
  >
    <DrawerItem name="Name">{pv.name}</DrawerItem>
    <DrawerItem name="Capacity">{pv.capacity ?? '-'}</DrawerItem>
    <DrawerItem name="Access Modes">{pv.access_modes ?? '-'}</DrawerItem>
    <DrawerItem name="Reclaim Policy">{pv.reclaim_policy ?? '-'}</DrawerItem>
    <DrawerItem name="Status">{pv.status}</DrawerItem>
    <DrawerItem name="Claim">{pv.claim ?? '-'}</DrawerItem>
    <DrawerItem name="Storage Class">{pv.storage_class ?? '-'}</DrawerItem>
    <DrawerItem name="Age">{timeAgo(pv.age)}</DrawerItem>
    <DrawerLabelsAnnotations labels={pv.labels} annotations={pv.annotations} />
  </ResourceDetailPanelLayout>
);
