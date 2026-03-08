import { Pencil, Trash2 } from './Icons';
import type { StatefulSet } from '../types';
import { getStatusColor, timeAgo } from '../utils';
import { ResourceDetailPanelLayout, DetailSection, DetailRow, DetailLabelsSection, DetailAnnotationsSection, PanelActionButton } from './ResourceDetailPanelLayout';

interface StatefulSetDetailPanelProps {
  statefulSet: StatefulSet;
  onClose: () => void;
  onOpenYamlEditor?: (statefulSet: StatefulSet) => void;
  onDelete?: (namespace: string, name: string) => Promise<void>;
}

const getStatusTextClass = (status: string) => {
  const color = getStatusColor(status);
  if (color === 'green') return 'text-[var(--color-icon-success)]';
  if (color === 'yellow') return 'text-[var(--color-icon-warning)]';
  if (color === 'red') return 'text-[var(--color-icon-danger)]';
  return 'text-text-secondary';
};

export const StatefulSetDetailPanel = ({ statefulSet, onClose, onOpenYamlEditor, onDelete }: StatefulSetDetailPanelProps) => (
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
        <PanelActionButton icon={Pencil} label="Edit YAML" onClick={() => onOpenYamlEditor?.(statefulSet)} />
        <PanelActionButton icon={Trash2} label="Delete" danger onClick={() => onDelete?.(statefulSet.namespace, statefulSet.name)} />
      </>
    }
    onClose={onClose}
  >
    <DetailSection title="StatefulSet">
      <DetailRow label="Name" value={statefulSet.name} />
      <DetailRow label="Namespace" value={statefulSet.namespace} />
      <DetailRow label="Status" value={<span className={getStatusTextClass(statefulSet.status || 'Unknown')}>{statefulSet.status || 'Unknown'}</span>} />
    </DetailSection>
    <DetailSection title="Replicas & images">
      <DetailRow label="Ready" value={statefulSet.ready ?? '-'} />
      <DetailRow label="Current" value={statefulSet.current ?? 0} />
      <DetailRow label="Updated" value={statefulSet.updated ?? 0} />
      <DetailRow label="Age" value={timeAgo(statefulSet.age)} />
      <div className="mt-2 pt-2 border-t border-border">
        <p className="text-text-secondary font-medium text-xs mb-1">Images</p>
        {statefulSet.images?.length ? (
          <div className="flex flex-wrap gap-1.5">
            {statefulSet.images.map((image) => (
              <span key={image} className="inline-flex px-2 py-1 rounded-md bg-hover text-text text-xs break-all">{image}</span>
            ))}
          </div>
        ) : (
          <p className="text-text text-xs">-</p>
        )}
      </div>
    </DetailSection>
    <DetailLabelsSection labels={statefulSet.labels} />
    <DetailAnnotationsSection annotations={statefulSet.annotations} />
  </ResourceDetailPanelLayout>
);
