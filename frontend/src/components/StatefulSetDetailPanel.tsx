import { useState } from 'react';
import { toast } from 'react-toastify';
import { Loader, Pencil, RefreshCw, Trash2 } from './Icons';
import type { StatefulSet } from '../types';
import { getStatusColor, timeAgo } from '../utils';
import { ResourceDetailPanelLayout, PanelActionButton } from './ResourceDetailPanelLayout';
import { DrawerItem, DrawerTitle, DrawerLabelsAnnotations } from './drawer';
import { WorkloadMetricGraphs } from './WorkloadMetricGraphs';

interface StatefulSetDetailPanelProps {
  statefulSet: StatefulSet;
  onClose: () => void;
  onOpenYamlEditor?: (statefulSet: StatefulSet) => void;
  onRestart?: (namespace: string, name: string) => Promise<void>;
  onDelete?: (namespace: string, name: string) => Promise<void>;
}

const getStatusTextClass = (status: string) => {
  const color = getStatusColor(status);
  if (color === 'green') return 'text-[var(--color-icon-success)]';
  if (color === 'yellow') return 'text-[var(--color-icon-warning)]';
  if (color === 'red') return 'text-[var(--color-icon-danger)]';
  return 'text-text-secondary';
};

export const StatefulSetDetailPanel = ({ statefulSet, onClose, onOpenYamlEditor, onRestart, onDelete }: StatefulSetDetailPanelProps) => {
  const [isRestarting, setIsRestarting] = useState(false);

  const handleRestart = async () => {
    if (!onRestart || isRestarting) return;
    setIsRestarting(true);
    try {
      await onRestart(statefulSet.namespace, statefulSet.name);
      toast.success(`Restart triggered for StatefulSet ${statefulSet.namespace}/${statefulSet.name}.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to restart StatefulSet');
    } finally {
      setIsRestarting(false);
    }
  };

  return (
  <ResourceDetailPanelLayout
    title={statefulSet.name}
    status={statefulSet.status ?? undefined}
    keyInfo={[
      { label: 'Namespace', value: statefulSet.namespace },
      { label: 'Ready', value: statefulSet.ready ?? '-' },
      { label: 'Age', value: timeAgo(statefulSet.age) },
    ]}
    actions={
      <>
        <PanelActionButton
          icon={isRestarting ? Loader : RefreshCw}
          iconClassName={isRestarting ? 'h-4 w-4 shrink-0 animate-spin' : 'h-4 w-4 shrink-0'}
          label={isRestarting ? 'Restarting...' : 'Restart'}
          onClick={handleRestart}
          disabled={isRestarting || !onRestart}
        />
        <PanelActionButton icon={Pencil} label="Edit YAML" onClick={() => onOpenYamlEditor?.(statefulSet)} />
        <PanelActionButton icon={Trash2} label="Delete" danger onClick={() => onDelete?.(statefulSet.namespace, statefulSet.name)} />
      </>
    }
    onClose={onClose}
  >
    <DrawerTitle>Metrics</DrawerTitle>
    <div className="mb-4">
      <WorkloadMetricGraphs />
    </div>

    <DrawerTitle>Property</DrawerTitle>
    <DrawerItem name="Name">{statefulSet.name}</DrawerItem>
    <DrawerItem name="Namespace">{statefulSet.namespace}</DrawerItem>
    <DrawerItem name="Status">
      <span className={getStatusTextClass(statefulSet.status || 'Unknown')}>{statefulSet.status || 'Unknown'}</span>
    </DrawerItem>
    <DrawerItem name="Ready">{statefulSet.ready ?? '-'}</DrawerItem>
    <DrawerItem name="Current">{statefulSet.current ?? 0}</DrawerItem>
    <DrawerItem name="Updated">{statefulSet.updated ?? 0}</DrawerItem>
    <DrawerItem name="Age">{timeAgo(statefulSet.age)}</DrawerItem>
    {statefulSet.images?.length ? (
      <DrawerItem name="Images" labelsOnly>
        <div className="flex flex-wrap gap-1.5">
          {statefulSet.images.map((image) => (
            <span key={image} className="inline-flex px-2 py-0.5 rounded text-xs border border-border" style={{ backgroundColor: 'var(--color-hover)', color: 'var(--color-text)' }}>{image}</span>
          ))}
        </div>
      </DrawerItem>
    ) : null}
    <DrawerLabelsAnnotations labels={statefulSet.labels} annotations={statefulSet.annotations} />
  </ResourceDetailPanelLayout>
  );
};
