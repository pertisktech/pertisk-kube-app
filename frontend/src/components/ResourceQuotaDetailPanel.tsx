import { Pencil, Trash2 } from './Icons';
import type { ResourceQuota } from '../types';
import { timeAgo } from '../utils';
import { ResourceDetailPanelLayout, PanelActionButton } from './ResourceDetailPanelLayout';
import { DrawerItem, DrawerLabelsAnnotations } from './drawer';

interface ResourceQuotaDetailPanelProps {
  resourceQuota: ResourceQuota;
  onClose: () => void;
  onOpenYamlEditor?: (resourceQuota: ResourceQuota) => void;
  onDelete?: (namespace: string, name: string) => Promise<void>;
}

export const ResourceQuotaDetailPanel = ({ resourceQuota, onClose, onOpenYamlEditor, onDelete }: ResourceQuotaDetailPanelProps) => (
  <ResourceDetailPanelLayout
    title={resourceQuota.name}
    keyInfo={[
      { label: 'Namespace', value: resourceQuota.namespace },
      { label: 'Status', value: resourceQuota.status ?? '-' },
      { label: 'Age', value: timeAgo(resourceQuota.age) },
    ]}
    actions={
      <>
        <PanelActionButton icon={Pencil} label="Edit YAML" onClick={() => onOpenYamlEditor?.(resourceQuota)} />
        <PanelActionButton icon={Trash2} label="Delete" danger onClick={() => onDelete?.(resourceQuota.namespace, resourceQuota.name)} />
      </>
    }
    onClose={onClose}
  >
    <DrawerItem name="Name">{resourceQuota.name}</DrawerItem>
    <DrawerItem name="Namespace">{resourceQuota.namespace}</DrawerItem>
    <DrawerItem name="Status">{resourceQuota.status ?? '-'}</DrawerItem>
    <DrawerItem name="Age">{timeAgo(resourceQuota.age)}</DrawerItem>
    <DrawerLabelsAnnotations labels={resourceQuota.labels} annotations={resourceQuota.annotations} />
  </ResourceDetailPanelLayout>
);
