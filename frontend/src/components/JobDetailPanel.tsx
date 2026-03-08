import { Pencil, Trash2 } from 'lucide-react';
import type { Job } from '../types';
import { getStatusColor, timeAgo } from '../utils';
import { ResourceDetailPanelLayout, DetailSection, DetailRow, PanelActionButton } from './ResourceDetailPanelLayout';

interface JobDetailPanelProps {
  job: Job;
  onClose: () => void;
  onOpenYamlEditor?: (job: Job) => void;
  onDelete?: (namespace: string, name: string) => Promise<void>;
}

const getStatusTextClass = (status: string) => {
  const color = getStatusColor(status);
  if (color === 'green') return 'text-[var(--color-icon-success)]';
  if (color === 'yellow') return 'text-[var(--color-icon-warning)]';
  if (color === 'red') return 'text-[var(--color-icon-danger)]';
  return 'text-text-secondary';
};

export const JobDetailPanel = ({ job, onClose, onOpenYamlEditor, onDelete }: JobDetailPanelProps) => (
  <ResourceDetailPanelLayout
    title={job.name}
    status={job.status ?? undefined}
    keyInfo={[
      { label: 'Namespace', value: job.namespace },
      { label: 'Completions', value: job.completions ?? '-' },
      { label: 'Age', value: timeAgo(job.age) },
    ]}
    actions={
      <>
        <PanelActionButton icon={Pencil} label="Edit YAML" onClick={() => onOpenYamlEditor?.(job)} />
        <PanelActionButton icon={Trash2} label="Delete" danger onClick={() => onDelete?.(job.namespace, job.name)} />
      </>
    }
    onClose={onClose}
  >
    <DetailSection title="Job">
      <DetailRow label="Name" value={job.name} />
      <DetailRow label="Namespace" value={job.namespace} />
      <DetailRow label="Status" value={<span className={getStatusTextClass(job.status || 'Pending')}>{job.status || 'Pending'}</span>} />
    </DetailSection>
    <DetailSection title="Details">
      <DetailRow label="Completions" value={job.completions ?? '-'} />
      <DetailRow label="Duration" value={job.duration ?? '-'} />
      <DetailRow label="Age" value={timeAgo(job.age)} />
    </DetailSection>
  </ResourceDetailPanelLayout>
);
