import { Pencil, Trash2 } from 'lucide-react';
import type { ReplicaSet } from '../types';
import { getStatusColor, timeAgo } from '../utils';
import { ResourceDetailPanelLayout, DetailSection, DetailRow, DetailLabelsSection, DetailAnnotationsSection, PanelActionButton } from './ResourceDetailPanelLayout';

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
    <DetailSection title="ReplicaSet">
      <DetailRow label="Name" value={replicaSet.name} />
      <DetailRow label="Namespace" value={replicaSet.namespace} />
      <DetailRow label="Status" value={<span className={getStatusTextClass(replicaSet.status || 'Unknown')}>{replicaSet.status || 'Unknown'}</span>} />
    </DetailSection>
    <DetailSection title="Replicas & images">
      <DetailRow label="Desired" value={replicaSet.desired ?? 0} />
      <DetailRow label="Current" value={replicaSet.current ?? 0} />
      <DetailRow label="Ready" value={replicaSet.ready ?? 0} />
      <DetailRow label="Available" value={replicaSet.available ?? 0} />
      <DetailRow label="Age" value={timeAgo(replicaSet.age)} />
      <div className="mt-2 pt-2 border-t border-border">
        <p className="text-text-secondary font-medium text-xs mb-1">Images</p>
        {replicaSet.images?.length ? (
          <div className="flex flex-wrap gap-1.5">
            {replicaSet.images.map((image) => (
              <span key={image} className="inline-flex px-2 py-1 rounded-md bg-hover text-text text-xs break-all">{image}</span>
            ))}
          </div>
        ) : (
          <p className="text-text text-xs">-</p>
        )}
      </div>
    </DetailSection>
    <DetailLabelsSection labels={replicaSet.labels} />
    <DetailAnnotationsSection annotations={replicaSet.annotations} />
  </ResourceDetailPanelLayout>
);
