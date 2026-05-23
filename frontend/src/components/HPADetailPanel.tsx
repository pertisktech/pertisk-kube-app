import { Pencil, Trash2 } from './Icons';
import type { HPA } from '../types';
import { timeAgo } from '../utils';
import { ResourceDetailPanelLayout, PanelActionButton } from './ResourceDetailPanelLayout';
import { DrawerItem, DrawerTitle, DrawerLabelsAnnotations } from './drawer';
import classNames from 'classnames';

interface HPADetailPanelProps {
  hpa: HPA;
  onClose: () => void;
  onOpenYamlEditor?: (hpa: HPA) => void;
  onDelete?: (namespace: string, name: string) => Promise<void>;
}

const formatMetricPair = (current?: string, target?: string): string => {
  if (!current && !target) return '-';
  return `${current ?? '-'} / ${target ?? '-'}`;
};

export const HPADetailPanel = ({ hpa, onClose, onOpenYamlEditor, onDelete }: HPADetailPanelProps) => (
  <ResourceDetailPanelLayout
    title={hpa.name}
    keyInfo={[
      { label: 'Namespace', value: hpa.namespace },
      { label: 'Replicas', value: `${hpa.current_replicas} / ${hpa.desired_replicas}` },
      { label: 'Age', value: timeAgo(hpa.age) },
    ]}
    actions={
      <>
        <PanelActionButton icon={Pencil} label="Edit YAML" onClick={() => onOpenYamlEditor?.(hpa)} />
        <PanelActionButton icon={Trash2} label="Delete" danger onClick={() => onDelete?.(hpa.namespace, hpa.name)} />
      </>
    }
    onClose={onClose}
  >
    <DrawerTitle>Property</DrawerTitle>
    <DrawerItem name="Name">{hpa.name}</DrawerItem>
    <DrawerItem name="Namespace" className={classNames({ 'text-left': hpa.namespace.length > 20 })}>{hpa.namespace}</DrawerItem>
    <DrawerItem name="Reference">{hpa.reference ?? '-'}</DrawerItem>
    <DrawerItem name="Replicas">{`Current: ${hpa.current_replicas} / Desired: ${hpa.desired_replicas}`}</DrawerItem>
    <DrawerItem name="Min/Max Replicas">{`${hpa.min_replicas} / ${hpa.max_replicas}`}</DrawerItem>
    <DrawerItem name="Targets">{hpa.targets ?? '-'}</DrawerItem>
    {formatMetricPair(hpa.cpu_current, hpa.cpu_target) !== '-' && (
      <DrawerItem name="CPU Metric (Current / Target)">{formatMetricPair(hpa.cpu_current, hpa.cpu_target)}</DrawerItem>
    )}
    {formatMetricPair(hpa.memory_current, hpa.memory_target) !== '-' && (
      <DrawerItem name="Memory Metric (Current / Target)">{formatMetricPair(hpa.memory_current, hpa.memory_target)}</DrawerItem>
    )}
    <DrawerItem name="Age">{timeAgo(hpa.age)}</DrawerItem>
    <DrawerLabelsAnnotations labels={hpa.labels} annotations={hpa.annotations} />
  </ResourceDetailPanelLayout>
);
