import { Pencil, Trash2 } from './Icons';
import type { PriorityClass } from '../types';
import { timeAgo } from '../utils';
import { ResourceDetailPanelLayout, DetailSection, DetailRow, DetailLabelsSection, DetailAnnotationsSection, PanelActionButton } from './ResourceDetailPanelLayout';

interface PriorityClassDetailPanelProps {
  priorityClass: PriorityClass;
  onClose: () => void;
  onOpenYamlEditor?: (priorityClass: PriorityClass) => void;
  onDelete?: (name: string) => Promise<void>;
}

export const PriorityClassDetailPanel = ({ priorityClass, onClose, onOpenYamlEditor, onDelete }: PriorityClassDetailPanelProps) => (
  <ResourceDetailPanelLayout
    title={priorityClass.name}
    keyInfo={[
      { label: 'Value', value: priorityClass.value ?? '-' },
      { label: 'Global Default', value: priorityClass.global_default ? 'Yes' : 'No' },
      { label: 'Age', value: timeAgo(priorityClass.age) },
    ]}
    actions={
      <>
        <PanelActionButton icon={Pencil} label="Edit YAML" onClick={() => onOpenYamlEditor?.(priorityClass)} />
        <PanelActionButton icon={Trash2} label="Delete" danger onClick={() => onDelete?.(priorityClass.name)} />
      </>
    }
    onClose={onClose}
  >
    <DetailSection title="Priority Class">
      <DetailRow label="Name" value={priorityClass.name} />
      <DetailRow label="Value" value={priorityClass.value ?? '-'} />
      <DetailRow label="Global Default" value={priorityClass.global_default ? 'Yes' : 'No'} />
      <DetailRow label="Age" value={timeAgo(priorityClass.age)} />
    </DetailSection>
    <DetailLabelsSection labels={priorityClass.labels} />
    <DetailAnnotationsSection annotations={priorityClass.annotations} />
  </ResourceDetailPanelLayout>
);
