import { Pencil, Trash2 } from 'lucide-react';
import type { RuntimeClass } from '../types';
import { timeAgo } from '../utils';
import { ResourceDetailPanelLayout, DetailSection, DetailRow, PanelActionButton } from './ResourceDetailPanelLayout';

interface RuntimeClassDetailPanelProps {
  runtimeClass: RuntimeClass;
  onClose: () => void;
  onOpenYamlEditor?: (runtimeClass: RuntimeClass) => void;
  onDelete?: (name: string) => Promise<void>;
}

export const RuntimeClassDetailPanel = ({ runtimeClass, onClose, onOpenYamlEditor, onDelete }: RuntimeClassDetailPanelProps) => (
  <ResourceDetailPanelLayout
    title={runtimeClass.name}
    keyInfo={[
      { label: 'Handler', value: runtimeClass.handler ?? '-' },
      { label: 'Scheduling', value: runtimeClass.scheduling ?? '-' },
      { label: 'Age', value: timeAgo(runtimeClass.age) },
    ]}
    actions={
      <>
        <PanelActionButton icon={Pencil} label="Edit YAML" onClick={() => onOpenYamlEditor?.(runtimeClass)} />
        <PanelActionButton icon={Trash2} label="Delete" danger onClick={() => onDelete?.(runtimeClass.name)} />
      </>
    }
    onClose={onClose}
  >
    <DetailSection title="Runtime Class">
      <DetailRow label="Name" value={runtimeClass.name} />
      <DetailRow label="Handler" value={runtimeClass.handler ?? '-'} />
      <DetailRow label="Scheduling" value={runtimeClass.scheduling ?? '-'} />
      <DetailRow label="Age" value={timeAgo(runtimeClass.age)} />
    </DetailSection>
  </ResourceDetailPanelLayout>
);
