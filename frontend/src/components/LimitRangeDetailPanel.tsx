import { Pencil, Trash2 } from './Icons';
import type { LimitRange } from '../types';
import { timeAgo } from '../utils';
import { ResourceDetailPanelLayout, PanelActionButton } from './ResourceDetailPanelLayout';
import { DrawerItem, DrawerLabelsAnnotations } from './drawer';

interface LimitRangeDetailPanelProps {
  limitRange: LimitRange;
  onClose: () => void;
  onOpenYamlEditor?: (limitRange: LimitRange) => void;
  onDelete?: (namespace: string, name: string) => Promise<void>;
}

export const LimitRangeDetailPanel = ({ limitRange, onClose, onOpenYamlEditor, onDelete }: LimitRangeDetailPanelProps) => (
  <ResourceDetailPanelLayout
    title={limitRange.name}
    keyInfo={[
      { label: 'Namespace', value: limitRange.namespace },
      { label: 'Limits', value: limitRange.limits ?? '-' },
      { label: 'Age', value: timeAgo(limitRange.age) },
    ]}
    actions={
      <>
        <PanelActionButton icon={Pencil} label="Edit YAML" onClick={() => onOpenYamlEditor?.(limitRange)} />
        <PanelActionButton icon={Trash2} label="Delete" danger onClick={() => onDelete?.(limitRange.namespace, limitRange.name)} />
      </>
    }
    onClose={onClose}
  >
    <DrawerItem name="Name">{limitRange.name}</DrawerItem>
    <DrawerItem name="Namespace">{limitRange.namespace}</DrawerItem>
    <DrawerItem name="Limits">{limitRange.limits ?? '-'}</DrawerItem>
    <DrawerItem name="Age">{timeAgo(limitRange.age)}</DrawerItem>
    <DrawerLabelsAnnotations labels={limitRange.labels} annotations={limitRange.annotations} />
  </ResourceDetailPanelLayout>
);
