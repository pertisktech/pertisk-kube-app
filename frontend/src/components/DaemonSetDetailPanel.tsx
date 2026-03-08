import { Pencil, Trash2 } from './Icons';
import type { DaemonSet } from '../types';
import { getStatusColor, timeAgo } from '../utils';
import { ResourceDetailPanelLayout, PanelActionButton } from './ResourceDetailPanelLayout';
import { DrawerItem, DrawerLabelsAnnotations } from './drawer';

interface DaemonSetDetailPanelProps {
  daemonSet: DaemonSet;
  onClose: () => void;
  onOpenYamlEditor?: (daemonSet: DaemonSet) => void;
  onDelete?: (namespace: string, name: string) => Promise<void>;
}

const getStatusTextClass = (status: string) => {
  const color = getStatusColor(status);
  if (color === 'green') return 'text-[var(--color-icon-success)]';
  if (color === 'yellow') return 'text-[var(--color-icon-warning)]';
  if (color === 'red') return 'text-[var(--color-icon-danger)]';
  return 'text-text-secondary';
};

export const DaemonSetDetailPanel = ({ daemonSet, onClose, onOpenYamlEditor, onDelete }: DaemonSetDetailPanelProps) => {
  const selectorEntries = Object.entries(daemonSet.node_selector || {});
  return (
    <ResourceDetailPanelLayout
      title={daemonSet.name}
      status={daemonSet.status ?? undefined}
      keyInfo={[
        { label: 'Namespace', value: daemonSet.namespace },
        { label: 'Ready', value: `${daemonSet.ready ?? 0}/${daemonSet.desired ?? 0}` },
        { label: 'Age', value: timeAgo(daemonSet.age) },
      ]}
      actions={
        <>
          <PanelActionButton icon={Pencil} label="Edit YAML" onClick={() => onOpenYamlEditor?.(daemonSet)} />
          <PanelActionButton icon={Trash2} label="Delete" danger onClick={() => onDelete?.(daemonSet.namespace, daemonSet.name)} />
        </>
      }
      onClose={onClose}
    >
      <DrawerItem name="Name">{daemonSet.name}</DrawerItem>
      <DrawerItem name="Namespace">{daemonSet.namespace}</DrawerItem>
      <DrawerItem name="Status"><span className={getStatusTextClass(daemonSet.status || 'Unknown')}>{daemonSet.status || 'Unknown'}</span></DrawerItem>
      <DrawerItem name="Desired">{daemonSet.desired ?? 0}</DrawerItem>
      <DrawerItem name="Current">{daemonSet.current ?? 0}</DrawerItem>
      <DrawerItem name="Ready">{daemonSet.ready ?? 0}</DrawerItem>
      <DrawerItem name="Available">{daemonSet.available ?? 0}</DrawerItem>
      <DrawerItem name="Updated">{daemonSet.updated ?? 0}</DrawerItem>
      <DrawerItem name="Age">{timeAgo(daemonSet.age)}</DrawerItem>
      {selectorEntries.length > 0 ? (
        <DrawerItem name="Node Selector" labelsOnly>
          <div className="flex flex-wrap gap-1.5">
            {selectorEntries.map(([key, value]) => (
              <span key={`${key}-${value}`} className="inline-flex px-2 py-0.5 rounded text-xs border border-border" style={{ backgroundColor: 'var(--color-hover)', color: 'var(--color-text)' }}>{key}={value}</span>
            ))}
          </div>
        </DrawerItem>
      ) : null}
      {daemonSet.images?.length ? (
        <DrawerItem name="Images" labelsOnly>
          <div className="flex flex-wrap gap-1.5">
            {daemonSet.images.map((image) => (
              <span key={image} className="inline-flex px-2 py-0.5 rounded text-xs border border-border" style={{ backgroundColor: 'var(--color-hover)', color: 'var(--color-text)' }}>{image}</span>
            ))}
          </div>
        </DrawerItem>
      ) : null}
      <DrawerLabelsAnnotations labels={daemonSet.labels} annotations={daemonSet.annotations} />
    </ResourceDetailPanelLayout>
  );
};
