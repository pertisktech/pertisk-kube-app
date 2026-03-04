import { X } from 'lucide-react';
import { StatusBadge } from './StatusBadge';
import type { Pod } from '../types';
import { timeAgo } from '../utils';

interface PodDetailPanelProps {
  pod: Pod;
  onClose: () => void;
}

export const PodDetailPanel = ({ pod, onClose }: PodDetailPanelProps) => {
  const status = pod.status || pod.phase || 'Unknown';

  return (
    <aside className="fixed top-0 right-0 z-50 h-screen w-[420px] max-w-[94vw] bg-surface-elevated border-l border-border shadow-2xl">
      <div className="h-full flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-lg font-semibold text-text">Pod Info</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-md hover:bg-hover text-text-secondary"
            aria-label="Close pod panel"
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
                <p className="text-primary font-medium break-all">{pod.name}</p>
              </div>
              <div>
                <p className="text-text-secondary">Namespace</p>
                <p className="text-text break-all">{pod.namespace}</p>
              </div>
              <div>
                <p className="text-text-secondary">Status</p>
                <div className="mt-1">
                  <StatusBadge status={status} />
                </div>
              </div>
            </div>
          </section>

          <section className="min-w-0 bg-surface border border-border rounded-lg p-4">
            <p className="text-xs uppercase tracking-wide text-text-secondary mb-3">Detail</p>
            <div className="space-y-3">
              <div>
                <p className="text-text-secondary">Ready</p>
                <p className="text-text break-all">{pod.ready || '-'}</p>
              </div>
              <div>
                <p className="text-text-secondary">Restarts</p>
                <p className="text-text">{pod.restarts ?? 0}</p>
              </div>
              <div>
                <p className="text-text-secondary">Age</p>
                <p className="text-text">{timeAgo(pod.age)}</p>
              </div>
              <div>
                <p className="text-text-secondary">Node</p>
                <p className="text-text break-all">{pod.node || '-'}</p>
              </div>
              <div>
                <p className="text-text-secondary">Pod IP</p>
                <p className="text-text break-all">{pod.pod_ip || '-'}</p>
              </div>
              <div>
                <p className="text-text-secondary">CPU</p>
                <p className="text-text break-all">{pod.cpu || '-'}</p>
              </div>
              <div>
                <p className="text-text-secondary">Memory</p>
                <p className="text-text break-all">{pod.memory || '-'}</p>
              </div>
              <div>
                <p className="text-text-secondary">Controlled By</p>
                <p className="text-text break-all">{pod.controlled_by || '-'}</p>
              </div>
              <div>
                <p className="text-text-secondary">QoS</p>
                <p className="text-text break-all">{pod.qos || '-'}</p>
              </div>
            </div>
          </section>
        </div>
      </div>
    </aside>
  );
};
