import { Pencil, Trash2 } from 'lucide-react';
import type { PersistentVolumeClaim } from '../types';
import { timeAgo } from '../utils';
import { ResourceDetailPanelLayout, DetailSection, DetailRow, DetailLabelsSection, DetailAnnotationsSection, PanelActionButton } from './ResourceDetailPanelLayout';

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
    <DetailSection title="PVC">
      <DetailRow label="Name" value={pvc.name} />
      <DetailRow label="Namespace" value={pvc.namespace} />
      <DetailRow label="Status" value={pvc.status} />
      <DetailRow label="Volume" value={pvc.volume ?? '-'} />
      <DetailRow label="Capacity" value={pvc.capacity ?? '-'} />
      <DetailRow label="Access Modes" value={pvc.access_modes ?? '-'} />
      <DetailRow label="Storage Class" value={pvc.storage_class ?? '-'} />
      <DetailRow label="Age" value={timeAgo(pvc.age)} />
    </DetailSection>
    <DetailLabelsSection labels={pvc.labels} />
    <DetailAnnotationsSection annotations={pvc.annotations} />
  </ResourceDetailPanelLayout>
);
