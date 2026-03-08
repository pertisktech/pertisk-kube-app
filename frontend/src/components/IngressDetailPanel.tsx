import { Pencil, Trash2 } from './Icons';
import type { Ingress } from '../types';
import { timeAgo } from '../utils';
import { ResourceDetailPanelLayout, PanelActionButton } from './ResourceDetailPanelLayout';
import { DrawerItem, DrawerLabelsAnnotations } from './drawer';

interface IngressDetailPanelProps {
  ingress: Ingress;
  onClose: () => void;
  onOpenYamlEditor?: (ingress: Ingress) => void;
  onDelete?: (namespace: string, name: string) => Promise<void>;
}

export const IngressDetailPanel = ({ ingress, onClose, onOpenYamlEditor, onDelete }: IngressDetailPanelProps) => (
  <ResourceDetailPanelLayout
    title={ingress.name}
    keyInfo={[
      { label: 'Namespace', value: ingress.namespace },
      { label: 'Class', value: ingress.ingress_class ?? '-' },
      { label: 'Age', value: timeAgo(ingress.age) },
    ]}
    actions={
      <>
        <PanelActionButton icon={Pencil} label="Edit YAML" onClick={() => onOpenYamlEditor?.(ingress)} />
        {onDelete && <PanelActionButton icon={Trash2} label="Delete" danger onClick={() => onDelete(ingress.namespace, ingress.name)} />}
      </>
    }
    onClose={onClose}
  >
    <DrawerItem name="Name">{ingress.name}</DrawerItem>
    <DrawerItem name="Namespace">{ingress.namespace}</DrawerItem>
    <DrawerItem name="Class">{ingress.ingress_class ?? '-'}</DrawerItem>
    <DrawerItem name="Hosts">{ingress.hosts ?? '-'}</DrawerItem>
    <DrawerItem name="Address">{ingress.address ?? '-'}</DrawerItem>
    <DrawerItem name="Rules">{ingress.rules ?? 0}</DrawerItem>
    <DrawerItem name="Age">{timeAgo(ingress.age)}</DrawerItem>
    <DrawerLabelsAnnotations labels={ingress.labels} annotations={ingress.annotations} />
  </ResourceDetailPanelLayout>
);
