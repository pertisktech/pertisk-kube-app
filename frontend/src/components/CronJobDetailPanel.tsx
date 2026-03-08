import { Pencil, Trash2 } from './Icons';
import type { CronJob } from '../types';
import { timeAgo } from '../utils';
import { ResourceDetailPanelLayout, PanelActionButton } from './ResourceDetailPanelLayout';
import { DrawerItem, DrawerTitle, DrawerCollapsibleSection, DrawerLabelsAnnotations } from './drawer';

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
    <DrawerTitle>Property</DrawerTitle>
    <DrawerItem name="Name">{cronJob.name}</DrawerItem>
    <DrawerItem name="Namespace">{cronJob.namespace}</DrawerItem>
    <DrawerItem name="Schedule">{cronJob.schedule ?? '-'}</DrawerItem>
    <DrawerItem name="Suspend">{cronJob.suspend ? 'Yes' : 'No'}</DrawerItem>
    <DrawerItem name="Active">{cronJob.active ?? 0}</DrawerItem>
    <DrawerItem name="Last Schedule">{cronJob.last_schedule ? timeAgo(cronJob.last_schedule) : '-'}</DrawerItem>
    <DrawerItem name="Next Execution">{cronJob.next_execution ? timeAgo(cronJob.next_execution) : '-'}</DrawerItem>
    <DrawerItem name="Time Zone">{cronJob.time_zone ?? '-'}</DrawerItem>
    <DrawerItem name="Age">{timeAgo(cronJob.age)}</DrawerItem>
    <DrawerCollapsibleSection title="Metadata">
      <DrawerLabelsAnnotations labels={cronJob.labels} annotations={cronJob.annotations} />
    </DrawerCollapsibleSection>
  </ResourceDetailPanelLayout>
);
