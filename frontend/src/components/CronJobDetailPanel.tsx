import { X, Pencil, Trash2 } from 'lucide-react';
import type { CronJob } from '../types';
import { timeAgo } from '../utils';

interface CronJobDetailPanelProps {
  cronJob: CronJob;
  onClose: () => void;
  onOpenYamlEditor?: (cronJob: CronJob) => void;
  onDelete?: (namespace: string, name: string) => Promise<void>;
}

export const CronJobDetailPanel = ({ cronJob, onClose, onOpenYamlEditor, onDelete }: CronJobDetailPanelProps) => {
  return (
    <aside className="fixed top-0 right-0 z-[100] h-screen w-[420px] max-w-[94vw] bg-surface-elevated border-l border-border shadow-2xl">
      <div className="h-full flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-lg font-semibold text-text">CronJob Info</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-md hover:bg-hover text-text-secondary"
            aria-label="Close cronjob panel"
          >
            <X size={16} />
          </button>
        </div>

        <div className="px-5 py-3 border-b border-border">
          <div className="bg-surface border border-border rounded-lg p-1.5 flex items-center gap-2">
            <button
              type="button"
              onClick={() => onOpenYamlEditor?.(cronJob)}
              className="inline-flex items-center justify-center h-7 w-7 rounded-md border border-[var(--color-primary)] text-[var(--color-primary)] hover:bg-hover"
              aria-label="Edit cronjob YAML"
              title="Edit YAML"
            >
              <Pencil size={13} />
            </button>
            <button
              type="button"
              onClick={() => onDelete?.(cronJob.namespace, cronJob.name)}
              className="inline-flex items-center justify-center h-7 w-7 rounded-md border border-[var(--color-icon-danger)] text-[var(--color-icon-danger)] hover:bg-hover"
              aria-label="Delete cronjob"
              title="Delete CronJob"
            >
              <Trash2 size={13} />
            </button>
          </div>
        </div>

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
    </aside>
  );
};
