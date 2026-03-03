import { X } from 'lucide-react';
import type { Job } from '../types';
import { getStatusColor, timeAgo } from '../utils';

interface JobDetailPanelProps {
  job: Job;
  onClose: () => void;
}

export const JobDetailPanel = ({ job, onClose }: JobDetailPanelProps) => {
  const getStatusTextClass = (status: string) => {
    const color = getStatusColor(status);
    if (color === 'green') return 'text-[var(--color-icon-success)]';
    if (color === 'yellow') return 'text-[var(--color-icon-warning)]';
    if (color === 'red') return 'text-[var(--color-icon-danger)]';
    return 'text-text-secondary';
  };

  return (
    <aside className="fixed top-0 right-0 z-50 h-screen w-[420px] max-w-[94vw] bg-surface-elevated border-l border-border shadow-2xl">
      <div className="h-full flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-lg font-semibold text-text">Job Info</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-md hover:bg-hover text-text-secondary"
            aria-label="Close job panel"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-auto overflow-x-hidden p-5 space-y-5 text-sm">
          <section className="min-w-0 bg-surface border border-border rounded-lg p-4">
            <p className="text-xs uppercase tracking-wide text-text-secondary mb-3">Item</p>
            <div className="space-y-3">
              <div>
                <p className="text-text-secondary">Name</p>
                <p className="text-primary font-medium break-all">{job.name}</p>
              </div>
              <div>
                <p className="text-text-secondary">Namespace</p>
                <p className="text-text break-all">{job.namespace}</p>
              </div>
              <div>
                <p className="text-text-secondary">Status</p>
                <p className={`mt-1 font-medium ${getStatusTextClass(job.status || 'Pending')}`}>
                  {job.status || 'Pending'}
                </p>
              </div>
            </div>
          </section>

          <section className="min-w-0 bg-surface border border-border rounded-lg p-4">
            <p className="text-xs uppercase tracking-wide text-text-secondary mb-3">Detail</p>
            <div className="space-y-3">
              <div>
                <p className="text-text-secondary">Completions</p>
                <p className="text-text">{job.completions || '-'}</p>
              </div>
              <div>
                <p className="text-text-secondary">Duration</p>
                <p className="text-text">{job.duration || '-'}</p>
              </div>
              <div>
                <p className="text-text-secondary">Age</p>
                <p className="text-text">{timeAgo(job.age)}</p>
              </div>
            </div>
          </section>
        </div>
      </div>
    </aside>
  );
};
