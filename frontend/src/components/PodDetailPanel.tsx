import { X, Pencil, Terminal, ScrollText } from 'lucide-react';
import { StatusBadge } from './StatusBadge';
import type { Pod } from '../types';
import { timeAgo } from '../utils';

interface PodDetailPanelProps {
  pod: Pod;
  onClose: () => void;
  onOpenYamlEditor: (pod: Pod) => void;
  onOpenShell: (pod: Pod) => void;
  onOpenLogs: (pod: Pod) => void;
}

const usageBarColor = (percent: number) => {
  if (percent >= 90) return '#ef4444';
  if (percent >= 70) return '#f59e0b';
  return '#3b82f6';
};

const toPercent = (value?: number) => {
  if (value == null || Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(100, value));
};

const usageBarWidth = (percent: number) => {
  if (percent <= 0) return 0;
  return Math.max(percent, 6);
};

export const PodDetailPanel = ({ pod, onClose, onOpenYamlEditor, onOpenShell, onOpenLogs }: PodDetailPanelProps) => {
  const status = pod.status || pod.phase || 'Unknown';
  const hasCpuMetrics = pod.cpu_usage_percent != null;
  const hasMemoryMetrics = pod.memory_usage_percent != null;
  const cpuPercent = toPercent(pod.cpu_usage_percent);
  const memoryPercent = toPercent(pod.memory_usage_percent);

  return (
    <aside className="fixed top-0 right-0 z-[100] h-screen w-[420px] max-w-[94vw] bg-surface-elevated border-l border-border shadow-2xl">
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

        <div className="px-5 py-2 border-b border-border flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => onOpenLogs(pod)}
            className="inline-flex items-center justify-center h-8 w-8 rounded-md border border-[var(--color-primary)] text-[var(--color-primary)] hover:bg-hover"
            aria-label="View pod logs"
            title="View Logs"
          >
            <ScrollText size={15} />
          </button>
          <button
            type="button"
            onClick={() => onOpenShell(pod)}
            className="inline-flex items-center justify-center h-8 w-8 rounded-md border border-[var(--color-primary)] text-[var(--color-primary)] hover:bg-hover"
            aria-label="Open pod shell"
            title="Open Shell"
          >
            <Terminal size={15} />
          </button>
          <button
            type="button"
            onClick={() => onOpenYamlEditor(pod)}
            className="inline-flex items-center justify-center h-8 w-8 rounded-md border border-[var(--color-primary)] text-[var(--color-primary)] hover:bg-hover"
            aria-label="Edit pod YAML"
            title="Edit YAML"
          >
            <Pencil size={15} />
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
                <p className="text-text break-all">
                  {hasCpuMetrics
                    ? `${pod.cpu || '-'} / ${pod.cpu_capacity || '-'} (${Math.round(cpuPercent)}%)`
                    : pod.cpu || '-'}
                </p>
                {hasCpuMetrics && (
                  <div className="mt-2 h-2 rounded-full bg-hover overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${usageBarWidth(cpuPercent)}%`,
                        backgroundColor: usageBarColor(cpuPercent),
                      }}
                    />
                  </div>
                )}
              </div>
              <div>
                <p className="text-text-secondary">Memory</p>
                <p className="text-text break-all">
                  {hasMemoryMetrics
                    ? `${pod.memory || '-'} / ${pod.memory_capacity || '-'} (${Math.round(memoryPercent)}%)`
                    : pod.memory || '-'}
                </p>
                {hasMemoryMetrics && (
                  <div className="mt-2 h-2 rounded-full bg-hover overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${usageBarWidth(memoryPercent)}%`,
                        backgroundColor: usageBarColor(memoryPercent),
                      }}
                    />
                  </div>
                )}
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

          <section className="min-w-0 bg-surface border border-border rounded-lg p-4 space-y-3">
            <p className="text-xs uppercase tracking-wide text-text-secondary">Manifest</p>
            <div className="px-3 py-2 text-sm text-text-secondary border border-border rounded-md bg-surface-elevated">
              Use the pencil icon in the top-right corner to edit pod YAML in the bottom content tab.
            </div>
          </section>
        </div>
      </div>
    </aside>
  );
};
