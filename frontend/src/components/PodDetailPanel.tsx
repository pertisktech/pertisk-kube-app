import { Pencil, Terminal, ScrollText, Trash2 } from 'lucide-react';
import { StatusBadge } from './StatusBadge';
import type { Pod } from '../types';
import { timeAgo } from '../utils';
import { DetailPanelHeader } from './DetailPanelHeader';
import { ResizablePanel } from './ResizablePanel';

interface PodDetailPanelProps {
  pod: Pod;
  onClose: () => void;
  onOpenYamlEditor: (pod: Pod) => void;
  onOpenShell: (pod: Pod) => void;
  onOpenLogs: (pod: Pod) => void;
  onDelete?: (namespace: string, name: string) => Promise<void>;
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

export const PodDetailPanel = ({ pod, onClose, onOpenYamlEditor, onOpenShell, onOpenLogs, onDelete }: PodDetailPanelProps) => {
  const status = pod.status || pod.phase || 'Unknown';
  const hasCpuMetrics = pod.cpu_usage_percent != null;
  const hasMemoryMetrics = pod.memory_usage_percent != null;
  const cpuPercent = toPercent(pod.cpu_usage_percent);
  const memoryPercent = toPercent(pod.memory_usage_percent);

  return (
    <ResizablePanel>
      <div className="h-full flex flex-col">
        <DetailPanelHeader title="Pod Info" onClose={onClose}>
          <div className="flex gap-2">
            <div className="group relative">
              <button
                type="button"
                onClick={() => onOpenLogs(pod)}
                className="p-2 rounded-md border border-[var(--color-primary)] text-[var(--color-primary)] hover:bg-[var(--color-primary)]/10 transition-colors"
                aria-label="View pod logs"
              >
                <ScrollText size={12} />
              </button>
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-surface-elevated text-text text-xs rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 border border-border">
                View Logs
              </div>
            </div>
            <div className="group relative">
              <button
                type="button"
                onClick={() => onOpenShell(pod)}
                className="p-2 rounded-md border border-[var(--color-primary)] text-[var(--color-primary)] hover:bg-[var(--color-primary)]/10 transition-colors"
                aria-label="Open pod shell"
              >
                <Terminal size={12} />
              </button>
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-surface-elevated text-text text-xs rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 border border-border">
                Open Shell
              </div>
            </div>
            <div className="group relative">
              <button
                type="button"
                onClick={() => onOpenYamlEditor(pod)}
                className="p-2 rounded-md border border-[var(--color-primary)] text-[var(--color-primary)] hover:bg-[var(--color-primary)]/10 transition-colors"
                aria-label="Edit pod YAML"
              >
                <Pencil size={12} />
              </button>
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-surface-elevated text-text text-xs rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 border border-border">
                Edit YAML
              </div>
            </div>
            <div className="group relative">
              <button
                type="button"
                onClick={() => onDelete?.(pod.namespace, pod.name)}
                className="p-2 rounded-md border border-[var(--color-icon-danger)] text-[var(--color-icon-danger)] hover:bg-[var(--color-icon-danger)]/10 transition-colors"
                aria-label="Delete pod"
              >
                <Trash2 size={12} />
              </button>
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-surface-elevated text-text text-xs rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 border border-border">
                Delete
              </div>
            </div>
          </div>
        </DetailPanelHeader>

        <div className="flex-1 overflow-auto overflow-x-hidden p-5 space-y-5 text-sm">
          <section className="min-w-0 bg-surface border border-border rounded-lg p-4">
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

        </div>
      </div>
    </ResizablePanel>
  );
};
