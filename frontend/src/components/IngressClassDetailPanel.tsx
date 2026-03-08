import { Pencil, Trash2 } from './Icons';
import type { IngressClass } from '../types';
import { timeAgo } from '../utils';
import { ResourceDetailPanelLayout, PanelActionButton } from './ResourceDetailPanelLayout';
import { DrawerItem, DrawerLabelsAnnotations } from './drawer';

interface IngressClassDetailPanelProps {
  ingressClass: IngressClass;
  onClose: () => void;
  onOpenYamlEditor?: (ingressClass: IngressClass) => void;
  onDelete?: (name: string) => Promise<void>;
}

export const IngressClassDetailPanel = ({ ingressClass, onClose, onOpenYamlEditor, onDelete }: IngressClassDetailPanelProps) => (
  <ResourceDetailPanelLayout
    title={ingressClass.name}
    keyInfo={[
      { label: 'Controller', value: ingressClass.controller ?? '-' },
      { label: 'Default', value: ingressClass.is_default ? 'Yes' : 'No' },
      { label: 'Age', value: timeAgo(ingressClass.age) },
    ]}
    actions={
      <>
        <PanelActionButton icon={Pencil} label="Edit YAML" onClick={() => onOpenYamlEditor?.(ingressClass)} />
        <PanelActionButton icon={Trash2} label="Delete" danger onClick={() => onDelete?.(ingressClass.name)} />
      </>
    }
    onClose={onClose}
  >
    <DrawerItem name="Name">{ingressClass.name}</DrawerItem>
    <DrawerItem name="Controller">{ingressClass.controller ?? '-'}</DrawerItem>
    <DrawerItem name="Default">{ingressClass.is_default ? 'Yes' : 'No'}</DrawerItem>
    <DrawerItem name="Parameters">{ingressClass.parameters ?? '-'}</DrawerItem>
    <DrawerItem name="Age">{timeAgo(ingressClass.age)}</DrawerItem>
    <DrawerLabelsAnnotations labels={ingressClass.labels} annotations={ingressClass.annotations} />
  </ResourceDetailPanelLayout>
);
