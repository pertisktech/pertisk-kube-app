import { X, Pencil, Cpu, HardDrive, Trash2 } from 'lucide-react';
import { StatusBadge } from './StatusBadge';
import type { K8sNode } from '../types';

interface NodeDetailPanelProps {
  node: K8sNode;
  onClose: () => void;
  onOpenYamlEditor?: (node: K8sNode) => void;
  onDelete?: (name: string) => Promise<void>;
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

export const NodeDetailPanel = ({ node, onClose, onOpenYamlEditor, onDelete }: NodeDetailPanelProps) => {
  const status = String(node.ready).toLowerCase() === 'true' ? 'Ready' : 'NotReady';
  const taints = node.taints?.length ? node.taints : [];
  const cpuPercent = toPercent(node.cpu_usage_percent);
  const memoryPercent = toPercent(node.memory_usage_percent);
  const hasCpuMetrics = node.cpu_used != null && node.cpu_usage_percent != null;
  const hasMemoryMetrics = node.memory_used != null && node.memory_usage_percent != null;

  return (
    <aside className="fixed top-0 right-0 z-[100] h-screen w-[420px] max-w-[94vw] bg-surface-elevated border-l border-border shadow-2xl">
      <div className="h-full flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-lg font-semibold text-text">Node Info</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-md hover:bg-hover text-text-secondary"
            aria-label="Close node panel"
          >
            <X size={16} />
          </button>
        </div>

        <div className="px-5 py-3 border-b border-border">
          <div className="bg-surface border border-border rounded-lg p-1.5 flex items-center gap-2">
            <button
              type="button"
              onClick={() => onOpenYamlEditor?.(node)}
              className="inline-flex items-center justify-center h-7 w-7 rounded-md border border-[var(--color-primary)] text-[var(--color-primary)] hover:bg-hover"
              aria-label="Edit node YAML"
              title="Edit YAML"
            >
              <Pencil size={13} />
            </button>
            <button
              type="button"
              onClick={() => onDelete?.(node.name)}
              className="inline-flex items-center justify-center h-7 w-7 rounded-md border border-[var(--color-icon-danger)] text-[var(--color-icon-danger)] hover:bg-hover"
              aria-label="Delete node"
              title="Delete Node"
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
                <p className="text-primary font-medium break-all">{node.name}</p>
              </div>
              <div>
                <p className="text-text-secondary">Status</p>
                <div className="mt-1">
                  <StatusBadge status={status} />
                </div>
              </div>
              <div>
                <p className="text-text-secondary">Roles</p>
                <p className="text-text break-words">{node.roles.join(', ') || '-'}</p>
              </div>
            </div>
          </section>

          <section className="min-w-0 bg-surface border border-border rounded-lg p-4">
            <div className="space-y-3">
              <div>
                <p className="text-text-secondary">IP</p>
                <p className="text-text break-all">{node.ip || '-'}</p>
              </div>
              <div>
                <p className="text-text-secondary">IPv4</p>
                <p className="text-text break-all">{node.ipv4 || '-'}</p>
              </div>
              <div>
                <p className="text-text-secondary">IPv6</p>
                <p className="text-text break-all">{node.ipv6 || '-'}</p>
              </div>
              <div>
                <p className="text-text-secondary">Internal IP</p>
                <p className="text-text break-all">{node.internal_ip || '-'}</p>
              </div>
              <div>
                <p className="text-text-secondary">External IP</p>
                <p className="text-text break-all">{node.external_ip || '-'}</p>
              </div>
              <div>
                <p className="text-text-secondary">Runtime</p>
                <p className="text-text break-all">{node.runtime || '-'}</p>
              </div>
              <div>
                <p className="text-text-secondary mb-1">Taints</p>
                {taints.length > 0 ? (
                  <div className="min-w-0 flex flex-wrap gap-1.5">
                    {taints.map((taint) => (
                      <span
                        key={taint}
                        className="inline-flex max-w-full px-2 py-1 rounded-md bg-hover text-text text-xs break-all"
                      >
                        {taint}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-text">-</p>
                )}
              </div>
              <div>
                <p className="text-text-secondary">Kubelet Version</p>
                <p className="text-text break-all">{node.kubelet_version || '-'}</p>
              </div>
              <div>
                <p className="text-text-secondary">OS Image</p>
                <p className="text-text break-words">{node.os_image || '-'}</p>
              </div>
            </div>
          </section>

          {(node.cpu || node.memory || hasCpuMetrics || hasMemoryMetrics) && (
            <section className="min-w-0 bg-surface border border-border rounded-lg p-4">
              <p className="text-xs uppercase tracking-wide text-text-secondary mb-3">Metrics</p>
              <div className="space-y-4">
                {(node.cpu || hasCpuMetrics) && (
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <Cpu size={16} className="text-primary" />
                      <p className="text-sm font-medium text-text">CPU</p>
                    </div>
                    <p className="text-sm text-text-secondary ml-6">
                      {hasCpuMetrics
                        ? `${node.cpu_used} / ${node.cpu || '-'} (${Math.round(cpuPercent)}%)`
                        : `Allocatable: ${node.cpu || '-'}`}
                    </p>
                    {hasCpuMetrics && (
                      <div className="ml-6 mt-2 h-2 rounded-full bg-hover overflow-hidden">
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
                )}
                {(node.memory || hasMemoryMetrics) && (
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <HardDrive size={16} className="text-primary" />
                      <p className="text-sm font-medium text-text">Memory</p>
                    </div>
                    <p className="text-sm text-text-secondary ml-6">
                      {hasMemoryMetrics
                        ? `${node.memory_used} / ${node.memory || '-'} (${Math.round(memoryPercent)}%)`
                        : `Allocatable: ${node.memory || '-'}`}
                    </p>
                    {hasMemoryMetrics && (
                      <div className="ml-6 mt-2 h-2 rounded-full bg-hover overflow-hidden">
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
                )}
                {!hasCpuMetrics && !hasMemoryMetrics && (
                  <p className="text-xs text-text-secondary ml-6">
                    Live usage metrics unavailable. Showing allocatable values only.
                  </p>
                )}
              </div>
            </section>
          )}
        </div>
      </div>
    </aside>
  );
};
