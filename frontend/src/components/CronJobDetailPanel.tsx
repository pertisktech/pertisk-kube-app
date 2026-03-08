import { Pencil, Trash2 } from './Icons';
import type { CronJob } from '../types';
import { timeAgo } from '../utils';
import { ResourceDetailPanelLayout, DetailSection, DetailRow, DetailLabelsSection, DetailAnnotationsSection, PanelActionButton } from './ResourceDetailPanelLayout';

interface CronJobDetailPanelProps {
  cronJob: CronJob;
  onClose: () => void;
  onOpenYamlEditor?: (cronJob: CronJob) => void;
  onDelete?: (namespace: string, name: string) => Promise<void>;
}

export const CronJobDetailPanel = ({ cronJob, onClose, onOpenYamlEditor, onDelete }: CronJobDetailPanelProps) => (
  <ResourceDetailPanelLayout
    title={cronJob.name}
    keyInfo={[
      { label: 'Namespace', value: cronJob.namespace },
      { label: 'Schedule', value: cronJob.schedule ?? '-' },
      { label: 'Age', value: timeAgo(cronJob.age) },
    ]}
    actions={
      <>
        <PanelActionButton icon={Pencil} label="Edit YAML" onClick={() => onOpenYamlEditor?.(cronJob)} />
        <PanelActionButton icon={Trash2} label="Delete" danger onClick={() => onDelete?.(cronJob.namespace, cronJob.name)} />
      </>
    }
    onClose={onClose}
  >
    <DetailSection title="CronJob">
      <DetailRow label="Name" value={cronJob.name} />
      <DetailRow label="Namespace" value={cronJob.namespace} />
      <DetailRow label="Schedule" value={cronJob.schedule ?? '-'} />
    </DetailSection>
    <DetailSection title="Status">
      <DetailRow label="Suspend" value={cronJob.suspend ? 'Yes' : 'No'} />
      <DetailRow label="Active" value={cronJob.active ?? 0} />
      <DetailRow label="Last Schedule" value={cronJob.last_schedule ? timeAgo(cronJob.last_schedule) : '-'} />
      <DetailRow label="Next Execution" value={cronJob.next_execution ? timeAgo(cronJob.next_execution) : '-'} />
      <DetailRow label="Time Zone" value={cronJob.time_zone ?? '-'} />
      <DetailRow label="Age" value={timeAgo(cronJob.age)} />
    </DetailSection>
    <DetailLabelsSection labels={cronJob.labels} />
    <DetailAnnotationsSection annotations={cronJob.annotations} />
  </ResourceDetailPanelLayout>
);
