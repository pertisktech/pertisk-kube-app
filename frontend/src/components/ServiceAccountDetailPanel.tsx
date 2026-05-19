import { Pencil, Trash2 } from './Icons';
import type { ServiceAccount } from '../types';
import { timeAgo } from '../utils';
import { ResourceDetailPanelLayout, PanelActionButton } from './ResourceDetailPanelLayout';
import { DrawerItem, DrawerTitle, DrawerLabelsAnnotations } from './drawer';
import classNames from 'classnames';

interface ServiceAccountDetailPanelProps {
  serviceAccount: ServiceAccount;
  onClose: () => void;
  onOpenYamlEditor?: (sa: ServiceAccount) => void;
  onDelete?: (namespace: string, name: string) => Promise<void>;
}

export const ServiceAccountDetailPanel = ({ serviceAccount: sa, onClose, onOpenYamlEditor, onDelete }: ServiceAccountDetailPanelProps) => (
  <ResourceDetailPanelLayout
    title={sa.name}
    keyInfo={[
      { label: 'Namespace', value: sa.namespace },
      { label: 'Secrets', value: sa.secrets ?? '-' },
      { label: 'Age', value: timeAgo(sa.age) },
    ]}
    actions={
      <>
        <PanelActionButton icon={Pencil} label="Edit YAML" onClick={() => onOpenYamlEditor?.(sa)} />
        <PanelActionButton icon={Trash2} label="Delete" danger onClick={() => onDelete?.(sa.namespace, sa.name)} />
      </>
    }
    onClose={onClose}
  >
    <DrawerTitle>Property</DrawerTitle>
    <DrawerItem name="Name">{sa.name}</DrawerItem>
    <DrawerItem name="Namespace" className={classNames({ 'text-left': sa.namespace.length > 20 })}>{sa.namespace}</DrawerItem>
    <DrawerItem name="Secrets">{sa.secrets ?? '-'}</DrawerItem>
    <DrawerItem name="Age">{timeAgo(sa.age)}</DrawerItem>
    <DrawerLabelsAnnotations labels={sa.labels} annotations={sa.annotations} />
  </ResourceDetailPanelLayout>
);
