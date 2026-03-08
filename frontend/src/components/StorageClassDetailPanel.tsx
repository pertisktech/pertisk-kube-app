import { Pencil, Trash2 } from 'lucide-react';
import type { StorageClass } from '../types';
import { timeAgo } from '../utils';
import { StatusBadge } from './StatusBadge';
import { ResourceDetailPanelLayout, DetailSection, DetailRow, PanelActionButton } from './ResourceDetailPanelLayout';

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
    <DetailSection title="Storage Class">
      <DetailRow label="Name" value={storageClass.name} />
      <DetailRow label="Provisioner" value={storageClass.provisioner ?? '-'} />
      <DetailRow label="Reclaim Policy" value={storageClass.reclaim_policy ?? '-'} />
      <DetailRow label="Volume Binding Mode" value={storageClass.volume_binding_mode ?? '-'} />
      <DetailRow label="Allow Volume Expansion" value={<StatusBadge status={storageClass.allow_volume_expansion ? 'Yes' : 'No'} />} />
      <DetailRow label="Default" value={storageClass.is_default ? <StatusBadge status="Default" /> : 'No'} />
      <DetailRow label="Age" value={timeAgo(storageClass.age)} />
    </DetailSection>
  </ResourceDetailPanelLayout>
);
