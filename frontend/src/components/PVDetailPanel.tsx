import { Pencil, Trash2 } from 'lucide-react';
import type { PersistentVolume } from '../types';
import { timeAgo } from '../utils';
import { ResourceDetailPanelLayout, DetailSection, DetailRow, PanelActionButton } from './ResourceDetailPanelLayout';

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
    <DetailSection title="Persistent Volume">
      <DetailRow label="Name" value={pv.name} />
      <DetailRow label="Capacity" value={pv.capacity ?? '-'} />
      <DetailRow label="Access Modes" value={pv.access_modes ?? '-'} />
      <DetailRow label="Reclaim Policy" value={pv.reclaim_policy ?? '-'} />
      <DetailRow label="Status" value={pv.status} />
      <DetailRow label="Claim" value={pv.claim ?? '-'} />
      <DetailRow label="Storage Class" value={pv.storage_class ?? '-'} />
      <DetailRow label="Age" value={timeAgo(pv.age)} />
    </DetailSection>
  </ResourceDetailPanelLayout>
);
