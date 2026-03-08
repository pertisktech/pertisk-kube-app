import { Pencil, Trash2 } from './Icons';
import type { RuntimeClass } from '../types';
import { timeAgo } from '../utils';
import { ResourceDetailPanelLayout, PanelActionButton } from './ResourceDetailPanelLayout';
import { DrawerItem, DrawerTitle, DrawerCollapsibleSection, DrawerLabelsAnnotations } from './drawer';

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
    <DrawerTitle>Property</DrawerTitle>
    <DrawerItem name="Name">{runtimeClass.name}</DrawerItem>
    <DrawerItem name="Handler">{runtimeClass.handler ?? '-'}</DrawerItem>
    <DrawerItem name="Scheduling">{runtimeClass.scheduling ?? '-'}</DrawerItem>
    <DrawerItem name="Age">{timeAgo(runtimeClass.age)}</DrawerItem>
    <DrawerCollapsibleSection title="Metadata">
      <DrawerLabelsAnnotations labels={runtimeClass.labels} annotations={runtimeClass.annotations} />
    </DrawerCollapsibleSection>
  </ResourceDetailPanelLayout>
);
