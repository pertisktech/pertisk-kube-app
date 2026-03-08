import { Pencil, Trash2 } from './Icons';
import type { Lease } from '../types';
import { timeAgo } from '../utils';
import { ResourceDetailPanelLayout, PanelActionButton } from './ResourceDetailPanelLayout';
import { DrawerItem, DrawerLabelsAnnotations } from './drawer';

interface LeaseDetailPanelProps {
  lease: Lease;
  onClose: () => void;
  onOpenYamlEditor?: (lease: Lease) => void;
  onDelete?: (namespace: string, name: string) => Promise<void>;
}

export const LeaseDetailPanel = ({ lease, onClose, onOpenYamlEditor, onDelete }: LeaseDetailPanelProps) => (
  <ResourceDetailPanelLayout
    title={lease.name}
    keyInfo={[
      { label: 'Namespace', value: lease.namespace },
      { label: 'Holder', value: lease.holder_identity ?? '-' },
      { label: 'Age', value: timeAgo(lease.age) },
    ]}
    actions={
      <>
        <PanelActionButton icon={Pencil} label="Edit YAML" onClick={() => onOpenYamlEditor?.(lease)} />
        <PanelActionButton icon={Trash2} label="Delete" danger onClick={() => onDelete?.(lease.namespace, lease.name)} />
      </>
    }
    onClose={onClose}
  >
    <DrawerItem name="Name">{lease.name}</DrawerItem>
    <DrawerItem name="Namespace">{lease.namespace}</DrawerItem>
    <DrawerItem name="Holder Identity">{lease.holder_identity ?? '-'}</DrawerItem>
    <DrawerItem name="Lease Duration">{lease.lease_duration_seconds != null ? `${lease.lease_duration_seconds}s` : '-'}</DrawerItem>
    <DrawerItem name="Age">{timeAgo(lease.age)}</DrawerItem>
    <DrawerLabelsAnnotations labels={lease.labels} annotations={lease.annotations} />
  </ResourceDetailPanelLayout>
);
