import { Pencil, Trash2 } from './Icons';
import type { PriorityClass } from '../types';
import { timeAgo } from '../utils';
import { ResourceDetailPanelLayout, PanelActionButton } from './ResourceDetailPanelLayout';
import { DrawerItem, DrawerTitle, DrawerLabelsAnnotations } from './drawer';

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
    <DrawerTitle>Property</DrawerTitle>
    <DrawerItem name="Name">{priorityClass.name}</DrawerItem>
    <DrawerItem name="Value">{priorityClass.value ?? '-'}</DrawerItem>
    <DrawerItem name="Global Default">{priorityClass.global_default ? 'Yes' : 'No'}</DrawerItem>
    <DrawerItem name="Age">{timeAgo(priorityClass.age)}</DrawerItem>
    <DrawerLabelsAnnotations labels={priorityClass.labels} annotations={priorityClass.annotations} />
  </ResourceDetailPanelLayout>
);
