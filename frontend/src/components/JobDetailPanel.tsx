import { Pencil, Trash2 } from './Icons';
import type { Job } from '../types';
import { getStatusColor, timeAgo } from '../utils';
import { ResourceDetailPanelLayout, PanelActionButton } from './ResourceDetailPanelLayout';
import { DrawerItem, DrawerTitle, DrawerCollapsibleSection, DrawerLabelsAnnotations } from './drawer';

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
    <DrawerTitle>Property</DrawerTitle>
    <DrawerItem name="Name">{job.name}</DrawerItem>
    <DrawerItem name="Namespace">{job.namespace}</DrawerItem>
    <DrawerItem name="Status"><span className={getStatusTextClass(job.status || 'Pending')}>{job.status || 'Pending'}</span></DrawerItem>
    <DrawerItem name="Completions">{job.completions ?? '-'}</DrawerItem>
    <DrawerItem name="Duration">{job.duration ?? '-'}</DrawerItem>
    <DrawerItem name="Age">{timeAgo(job.age)}</DrawerItem>
    <DrawerCollapsibleSection title="Metadata">
      <DrawerLabelsAnnotations labels={job.labels} annotations={job.annotations} />
    </DrawerCollapsibleSection>
  </ResourceDetailPanelLayout>
);
