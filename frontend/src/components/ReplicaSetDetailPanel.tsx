import { Pencil, Trash2 } from './Icons';
import type { ReplicaSet } from '../types';
import { getStatusColor, timeAgo } from '../utils';
import { ResourceDetailPanelLayout, PanelActionButton } from './ResourceDetailPanelLayout';
import { DrawerItem, DrawerTitle, DrawerLabelsAnnotations } from './drawer';

interface ReplicaSetDetailPanelProps {
  replicaSet: ReplicaSet;
  onClose: () => void;
  onOpenYamlEditor?: (replicaSet: ReplicaSet) => void;
  onDelete?: (namespace: string, name: string) => Promise<void>;
}

const getStatusTextClass = (status: string) => {
  const color = getStatusColor(status);
  if (color === 'green') return 'text-[var(--color-icon-success)]';
  if (color === 'yellow') return 'text-[var(--color-icon-warning)]';
  if (color === 'red') return 'text-[var(--color-icon-danger)]';
  return 'text-text-secondary';
};

export const ReplicaSetDetailPanel = ({ replicaSet, onClose, onOpenYamlEditor, onDelete }: ReplicaSetDetailPanelProps) => (
  <ResourceDetailPanelLayout
    title={replicaSet.name}
    status={replicaSet.status ?? undefined}
    keyInfo={[
      { label: 'Namespace', value: replicaSet.namespace },
      { label: 'Ready', value: `${replicaSet.ready ?? 0}/${replicaSet.desired ?? 0}` },
      { label: 'Age', value: timeAgo(replicaSet.age) },
    ]}
    actions={
      <>
        <PanelActionButton icon={Pencil} label="Edit YAML" onClick={() => onOpenYamlEditor?.(replicaSet)} />
        <PanelActionButton icon={Trash2} label="Delete" danger onClick={() => onDelete?.(replicaSet.namespace, replicaSet.name)} />
      </>
    }
    onClose={onClose}
  >
    <DrawerTitle>Property</DrawerTitle>
    <DrawerItem name="Name">{replicaSet.name}</DrawerItem>
    <DrawerItem name="Namespace">{replicaSet.namespace}</DrawerItem>
    <DrawerItem name="Status"><span className={getStatusTextClass(replicaSet.status || 'Unknown')}>{replicaSet.status || 'Unknown'}</span></DrawerItem>
    <DrawerItem name="Desired">{replicaSet.desired ?? 0}</DrawerItem>
    <DrawerItem name="Current">{replicaSet.current ?? 0}</DrawerItem>
    <DrawerItem name="Ready">{replicaSet.ready ?? 0}</DrawerItem>
    <DrawerItem name="Available">{replicaSet.available ?? 0}</DrawerItem>
    <DrawerItem name="Age">{timeAgo(replicaSet.age)}</DrawerItem>
    {replicaSet.images?.length ? (
      <DrawerItem name="Images" labelsOnly>
        <div className="flex flex-wrap gap-1.5">
          {replicaSet.images.map((image) => (
            <span key={image} className="inline-flex px-2 py-0.5 rounded text-xs border border-border" style={{ backgroundColor: 'var(--color-hover)', color: 'var(--color-text)' }}>{image}</span>
          ))}
        </div>
      </DrawerItem>
    ) : null}
    <DrawerLabelsAnnotations labels={replicaSet.labels} annotations={replicaSet.annotations} />
  </ResourceDetailPanelLayout>
);
