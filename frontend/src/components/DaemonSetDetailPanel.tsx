import { Pencil, Trash2 } from 'lucide-react';
import type { DaemonSet } from '../types';
import { getStatusColor, timeAgo } from '../utils';
import { ResourceDetailPanelLayout, DetailSection, DetailRow, DetailLabelsSection, DetailAnnotationsSection, PanelActionButton } from './ResourceDetailPanelLayout';

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
      <DetailSection title="DaemonSet">
        <DetailRow label="Name" value={daemonSet.name} />
        <DetailRow label="Namespace" value={daemonSet.namespace} />
        <DetailRow label="Status" value={<span className={getStatusTextClass(daemonSet.status || 'Unknown')}>{daemonSet.status || 'Unknown'}</span>} />
      </DetailSection>
      <DetailSection title="Replicas & details">
        <DetailRow label="Desired" value={daemonSet.desired ?? 0} />
        <DetailRow label="Current" value={daemonSet.current ?? 0} />
        <DetailRow label="Ready" value={daemonSet.ready ?? 0} />
        <DetailRow label="Available" value={daemonSet.available ?? 0} />
        <DetailRow label="Updated" value={daemonSet.updated ?? 0} />
        <DetailRow label="Age" value={timeAgo(daemonSet.age)} />
        <div className="mt-2 pt-2 border-t border-border">
          <p className="text-text-secondary font-medium text-xs mb-1">Node Selector</p>
          {selectorEntries.length ? (
            <div className="flex flex-wrap gap-1.5">
              {selectorEntries.map(([key, value]) => (
                <span key={`${key}-${value}`} className="inline-flex px-2 py-1 rounded-md bg-hover text-text text-xs break-all">{key}={value}</span>
              ))}
            </div>
          ) : (
            <p className="text-text text-xs">-</p>
          )}
        </div>
        <div className="mt-2 pt-2 border-t border-border">
          <p className="text-text-secondary font-medium text-xs mb-1">Images</p>
          {daemonSet.images?.length ? (
            <div className="flex flex-wrap gap-1.5">
              {daemonSet.images.map((image) => (
                <span key={image} className="inline-flex px-2 py-1 rounded-md bg-hover text-text text-xs break-all">{image}</span>
              ))}
            </div>
          ) : (
            <p className="text-text text-xs">-</p>
          )}
        </div>
      </DetailSection>
      <DetailLabelsSection labels={daemonSet.labels} />
      <DetailAnnotationsSection annotations={daemonSet.annotations} />
    </ResourceDetailPanelLayout>
  );
};
