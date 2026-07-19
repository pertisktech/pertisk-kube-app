import { useState } from 'react';
import { toast } from 'react-toastify';
import { Loader, Pencil, Play, Trash2 } from './Icons';
import type { CronJob } from '../types';
import { timeAgo, timeFromNow } from '../utils';
import { ResourceDetailPanelLayout, PanelActionButton } from './ResourceDetailPanelLayout';
import { DrawerItem, DrawerTitle, DrawerLabelsAnnotations } from './drawer';

interface CronJobDetailPanelProps {
  cronJob: CronJob;
  onClose: () => void;
  onOpenYamlEditor?: (cronJob: CronJob) => void;
  onRun?: (namespace: string, name: string) => Promise<string>;
  onDelete?: (namespace: string, name: string) => Promise<void>;
}

export const CronJobDetailPanel = ({
  cronJob,
  onClose,
  onOpenYamlEditor,
  onRun,
  onDelete,
}: CronJobDetailPanelProps) => {
  const [isRunning, setIsRunning] = useState(false);

  const handleRun = async () => {
    if (!onRun || isRunning) return;

    setIsRunning(true);
    try {
      const jobName = await onRun(cronJob.namespace, cronJob.name);
      toast.success(`Created Job ${jobName} from CronJob ${cronJob.namespace}/${cronJob.name}.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to run CronJob');
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <ResourceDetailPanelLayout
      title={cronJob.name}
      keyInfo={[
        { label: 'Namespace', value: cronJob.namespace },
        { label: 'Schedule', value: cronJob.schedule ?? '-' },
        { label: 'Age', value: timeAgo(cronJob.age) },
      ]}
      actions={
        <>
          <PanelActionButton
            icon={isRunning ? Loader : Play}
            iconClassName={isRunning ? 'h-4 w-4 shrink-0 animate-spin' : 'h-4 w-4 shrink-0'}
            label={isRunning ? 'Running...' : 'Run now'}
            onClick={handleRun}
            disabled={!onRun || isRunning}
            colorClass="text-green-400 hover:bg-green-500/20 hover:text-green-300"
          />
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
      <DrawerItem name="Next Execution">{cronJob.next_execution ? timeFromNow(cronJob.next_execution) : '-'}</DrawerItem>
      <DrawerItem name="Time Zone">{cronJob.time_zone ?? '-'}</DrawerItem>
      <DrawerItem name="Age">{timeAgo(cronJob.age)}</DrawerItem>
      <DrawerLabelsAnnotations labels={cronJob.labels} annotations={cronJob.annotations} />
    </ResourceDetailPanelLayout>
  );
};
