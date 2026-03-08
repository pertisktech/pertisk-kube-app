import { Pencil, Trash2 } from 'lucide-react';
import type { CronJob } from '../types';
import { timeAgo } from '../utils';
import { DetailPanelHeader } from './DetailPanelHeader';
import { ResizablePanel } from './ResizablePanel';

interface CronJobDetailPanelProps {
  cronJob: CronJob;
  onClose: () => void;
  onOpenYamlEditor?: (cronJob: CronJob) => void;
  onDelete?: (namespace: string, name: string) => Promise<void>;
}

export const CronJobDetailPanel = ({ cronJob, onClose, onOpenYamlEditor, onDelete }: CronJobDetailPanelProps) => {
  return (
    <ResizablePanel>
      <div className="h-full flex flex-col">
        <DetailPanelHeader title="CronJob Info" onClose={onClose}>
          <div className="flex gap-2">
            <div className="group relative">
              <button type="button" onClick={() => onOpenYamlEditor?.(cronJob)} className="p-2 rounded-md border border-[var(--color-primary)] text-[var(--color-primary)] hover:bg-[var(--color-primary)]/10 transition-colors" aria-label="Edit cronjob YAML"><Pencil size={12} /></button>
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-surface-elevated text-text text-xs rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 border border-border">Edit YAML</div>
            </div>
            <div className="group relative">
              <button type="button" onClick={() => onDelete?.(cronJob.namespace, cronJob.name)} className="p-2 rounded-md border border-[var(--color-icon-danger)] text-[var(--color-icon-danger)] hover:bg-[var(--color-icon-danger)]/10 transition-colors" aria-label="Delete cronjob"><Trash2 size={12} /></button>
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-surface-elevated text-text text-xs rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 border border-border">Delete</div>
            </div>
          </div>
        </DetailPanelHeader>

        <div className="flex-1 overflow-auto overflow-x-hidden p-5 space-y-5 text-sm">
          <section className="min-w-0 bg-surface border border-border rounded-lg p-4">
            <div className="space-y-3">
              <div>
                <p className="text-text-secondary">Name</p>
                <p className="text-primary font-medium break-all">{cronJob.name}</p>
              </div>
              <div>
                <p className="text-text-secondary">Namespace</p>
                <p className="text-text break-all">{cronJob.namespace}</p>
              </div>
              <div>
                <p className="text-text-secondary">Schedule</p>
                <p className="text-text break-all">{cronJob.schedule || '-'}</p>
              </div>
            </div>
          </section>

          <section className="min-w-0 bg-surface border border-border rounded-lg p-4">
            <div className="space-y-3">
              <div>
                <p className="text-text-secondary">Suspend</p>
                <p className={cronJob.suspend ? 'text-[var(--color-icon-warning)] font-medium' : 'text-[var(--color-icon-success)] font-medium'}>
                  {cronJob.suspend ? 'Yes' : 'No'}
                </p>
              </div>
              <div>
                <p className="text-text-secondary">Active</p>
                <p className="text-text">{cronJob.active ?? 0}</p>
              </div>
              <div>
                <p className="text-text-secondary">Last Schedule</p>
                <p className="text-text">{cronJob.last_schedule ? timeAgo(cronJob.last_schedule) : '-'}</p>
              </div>
              <div>
                <p className="text-text-secondary">Next Execution</p>
                <p className="text-text">{cronJob.next_execution ? timeAgo(cronJob.next_execution) : '-'}</p>
              </div>
              <div>
                <p className="text-text-secondary">Time Zone</p>
                <p className="text-text">{cronJob.time_zone || '-'}</p>
              </div>
              <div>
                <p className="text-text-secondary">Age</p>
                <p className="text-text">{timeAgo(cronJob.age)}</p>
              </div>
            </div>
          </section>
        </div>
      </div>
    </ResizablePanel>
  );
};
