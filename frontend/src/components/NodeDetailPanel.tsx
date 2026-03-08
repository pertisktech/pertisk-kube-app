import { useState } from 'react';
import { X, Terminal, Trash2, Loader, ChevronDown, FileText, Lock, Unlock, Droplet } from './Icons';
import { StatusBadge } from './StatusBadge';
import { usePods } from '../hooks/useKubernetes';
import { ResizablePanel } from './ResizablePanel';
import { PanelActionButton } from './ResourceDetailPanelLayout';
import { formatMemoryUsedAlloc } from '../utils';
import type { K8sNode } from '../types';

interface NodeDetailPanelProps {
  node: K8sNode;
  events?: Array<{
    summary: string;
    message?: string;
    count: number;
    age: string;
  }>;
  onClose: () => void;
  onEditYaml?: (node: K8sNode) => void;
  onOpenShell?: (node: K8sNode) => void;
  onCordonToggle?: (node: K8sNode) => void;
  onDrain?: (node: K8sNode) => void;
  onDelete?: (node: K8sNode) => void;
  cordonLoading?: boolean;
}

const ResourceCard = ({ title, resources }: { title: string; resources: { cpu?: string; memory?: string; ephemeral_storage?: string; pods?: string } }) => {
  const resourceLabels: Record<string, string> = {
    cpu: 'CPU',
    memory: 'Memory',
    ephemeral_storage: 'Ephemeral Storage',
    pods: 'Pods',
  };

  const items = Object.entries(resources)
    .filter(([, value]) => value != null)
    .map(([key, value]) => ({
      key,
      label: resourceLabels[key as keyof typeof resourceLabels] || key,
      value: value || '-',
    }));

  if (items.length === 0) {
    return (
      <section className="bg-surface border border-border rounded-lg p-3.5">
        <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wide">{title}</h3>
        <p className="text-xs text-text-secondary mt-2">No data available</p>
      </section>
    );
  }

  return (
    <section className="bg-surface border border-border rounded-lg p-3.5">
      <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-3">{title}</h3>
      <div className="space-y-2">
        {items.map(({ key, label, value }, idx) => (
          <div key={key} className={`flex items-center justify-between text-xs py-2 ${idx > 0 ? 'border-t border-border pt-2' : ''}`}>
            <span className="text-text-secondary font-medium">{label}</span>
            <span className="text-text font-semibold break-all text-right">{value}</span>
          </div>
        ))}
      </div>
    </section>
  );
};

export const NodeDetailPanel = ({ node, events = [], onClose, onEditYaml, onOpenShell, onCordonToggle, onDrain, onDelete, cordonLoading }: NodeDetailPanelProps) => {
  const [expandedLabels, setExpandedLabels] = useState(false);
  const [expandedAnnotations, setExpandedAnnotations] = useState(false);

  const { data: allPods } = usePods();

  const status = String(node.ready).toLowerCase() === 'true' ? 'Ready' : 'NotReady';
  const taints = node.taints?.length ? node.taints : [];

  // Filter pods running on this node
  const nodePods = (allPods || []).filter((pod) => pod.node === node.name);

  // Resources: show used / allocatable for CPU and Memory (memory in GB)
  const resourcesUsedAlloc = {
    cpu: node.cpu != null ? `${node.cpu_used ?? '-'} / ${node.cpu}` : undefined,
    memory: node.memory != null ? formatMemoryUsedAlloc(node.memory_used, node.memory) : undefined,
    ephemeral_storage: node.ephemeral_storage,
    pods: node.pods,
  };

  const labelCount = node.labels ? Object.keys(node.labels).length : 0;
  const annotationCount = node.annotations ? Object.keys(node.annotations).length : 0;

  // Note: ResourceCard component is defined above

  return (
    <ResizablePanel>
      <div className="h-full flex flex-col">
      {/* Header: title + status on left; actions + close in toolbar on right */}
      <div className="bg-gradient-to-r from-surface to-surface-elevated border-b border-border px-5 py-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-bold text-text truncate">{node.name}</h2>
            <div className="mt-2">
              <StatusBadge status={status} />
            </div>
          </div>
          <div
            className="flex items-center flex-shrink-0 rounded-lg border overflow-hidden"
            style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)' }}
          >
            {onEditYaml && <PanelActionButton icon={FileText} label="Edit YAML" onClick={() => onEditYaml(node)} />}
            {onOpenShell && <PanelActionButton icon={Terminal} label="Node Shell" onClick={() => onOpenShell(node)} />}
            {onCordonToggle && (
              <div className="group relative">
                <button
                  type="button"
                  onClick={() => onCordonToggle(node)}
                  disabled={cordonLoading}
                  className="p-2 rounded-md text-amber-400 hover:bg-amber-500/20 hover:text-amber-300 disabled:opacity-50 transition-colors"
                  aria-label={node.unschedulable ? 'Uncordon' : 'Cordon'}
                >
                  {cordonLoading ? <Loader size={16} className="animate-spin" /> : node.unschedulable ? <Unlock size={16} /> : <Lock size={16} />}
                </button>
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 text-xs rounded-md whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 shadow-sm" style={{ backgroundColor: 'var(--color-surface-elevated)', color: 'var(--color-text)', border: '1px solid var(--color-border)' }}>
                  {node.unschedulable ? 'Uncordon' : 'Cordon'}
                </div>
              </div>
            )}
            {onDrain && (
              <PanelActionButton
                icon={Droplet}
                label="Drain"
                onClick={() => onDrain(node)}
                colorClass="text-amber-400 hover:bg-amber-500/20 hover:text-amber-300"
              />
            )}
            {onDelete && <PanelActionButton icon={Trash2} label="Delete node" danger onClick={() => onDelete(node)} />}
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-r-md transition-all duration-150 hover:opacity-80 flex-shrink-0"
              style={{
                color: 'var(--color-muted)',
                borderLeft: onEditYaml || onOpenShell || onCordonToggle || onDrain || onDelete ? '1px solid var(--color-border)' : 'none',
              }}
              aria-label="Close node panel"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Key Info Bar */}
        <div className="flex items-center gap-3 text-xs mt-3 pt-3 border-t border-border">
          <div className="flex-1">
            <p className="text-text-secondary mb-1">Role</p>
            <p className="text-text font-medium truncate">{node.roles.join(', ') || '-'}</p>
          </div>
          <div className="flex-1">
            <p className="text-text-secondary mb-1">Status</p>
            <p className={`font-medium ${node.unschedulable ? 'text-[var(--color-icon-warning)]' : 'text-[var(--color-icon-success)]'}`}>
              {node.unschedulable ? 'Cordoned' : 'Schedulable'}
            </p>
          </div>
        </div>
      </div>

      {/* Content Section */}
      <div className="flex-1 overflow-auto overflow-x-hidden p-4 space-y-4 text-sm">
        {/* System Info Card */}
        <section className="bg-surface border border-border rounded-lg p-3.5">
          <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-3">System Info</h3>
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs py-1.5">
              <span className="text-text-secondary">OS</span>
              <span className="text-text font-medium text-right truncate">
                {node.operating_system || '-'} ({node.architecture || '-'})
              </span>
            </div>
            <div className="flex items-center justify-between text-xs py-1.5 border-t border-border pt-2">
              <span className="text-text-secondary">OS Image</span>
              <span className="text-text font-medium text-right truncate">{node.os_image || '-'}</span>
            </div>
            <div className="flex items-center justify-between text-xs py-1.5 border-t border-border pt-2">
              <span className="text-text-secondary">Kernel Version</span>
              <span className="text-text font-medium text-right truncate">{node.kernel_version || '-'}</span>
            </div>
            <div className="flex items-center justify-between text-xs py-1.5 border-t border-border pt-2">
              <span className="text-text-secondary">Kubelet</span>
              <span className="text-text font-medium text-right truncate">{node.kubelet_version || '-'}</span>
            </div>
            <div className="flex items-center justify-between text-xs py-1.5 border-t border-border pt-2">
              <span className="text-text-secondary">Runtime</span>
              <span className="text-text font-medium text-right truncate">{node.runtime || '-'}</span>
            </div>
          </div>
        </section>

        {/* Network Info Card */}
        {(node.ip || node.internal_ip || node.external_ip || node.ipv4 || node.ipv6) && (
          <section className="bg-surface border border-border rounded-lg p-3.5">
            <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-3">Network</h3>
            <div className="space-y-2 text-xs">
              {node.internal_ip && (
                <div className="flex items-start justify-between">
                  <span className="text-text-secondary">Internal IP</span>
                  <span className="text-text font-medium text-right break-all">{node.internal_ip}</span>
                </div>
              )}
              {node.external_ip && (
                <div className="flex items-start justify-between border-t border-border pt-2">
                  <span className="text-text-secondary">External IP</span>
                  <span className="text-text font-medium text-right break-all">{node.external_ip}</span>
                </div>
              )}
              {node.ipv4 && (
                <div className="flex items-start justify-between border-t border-border pt-2">
                  <span className="text-text-secondary">IPv4</span>
                  <span className="text-text font-medium text-right break-all">{node.ipv4}</span>
                </div>
              )}
              {node.ipv6 && (
                <div className="flex items-start justify-between border-t border-border pt-2">
                  <span className="text-text-secondary">IPv6</span>
                  <span className="text-text font-medium text-right break-all">{node.ipv6}</span>
                </div>
              )}
            </div>
          </section>
        )}

        {/* Taints Card */}
        {taints.length > 0 && (
          <section className="bg-surface border border-border rounded-lg p-3.5">
            <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-3">Taints</h3>
            <div className="flex flex-wrap gap-2">
              {taints.map((taint) => (
                <span
                  key={taint}
                  className="inline-flex px-2.5 py-1 rounded-md bg-hover text-text text-xs break-all border border-border"
                >
                  {taint}
                </span>
              ))}
            </div>
          </section>
        )}

        {/* Resources: used / allocatable */}
        <ResourceCard title="Resources (used / allocatable)" resources={resourcesUsedAlloc} />


        {/* Labels Card */}
        {node.labels && Object.keys(node.labels).length > 0 && (
          <section className="bg-surface border border-border rounded-lg p-3.5">
            <button
              onClick={() => setExpandedLabels(!expandedLabels)}
              className="w-full flex items-center justify-between"
            >
              <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wide">Labels ({labelCount})</h3>
              <ChevronDown
                size={14}
                className={`transform transition-transform text-text-secondary ${expandedLabels ? 'rotate-180' : ''}`}
              />
            </button>
            {expandedLabels && (
              <div className="space-y-2 text-xs mt-3 pt-3 border-t border-border">
                {Object.entries(node.labels).map(([key, value]) => (
                  <div key={key} className="flex items-start justify-between gap-2">
                    <span className="text-text-secondary truncate">{key}:</span>
                    <span className="text-text font-medium text-right break-all">{value}</span>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {/* Annotations Card */}
        {node.annotations && Object.keys(node.annotations).length > 0 && (
          <section className="bg-surface border border-border rounded-lg p-3.5">
            <button
              onClick={() => setExpandedAnnotations(!expandedAnnotations)}
              className="w-full flex items-center justify-between"
            >
              <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wide">Annotations ({annotationCount})</h3>
              <ChevronDown
                size={14}
                className={`transform transition-transform text-text-secondary ${expandedAnnotations ? 'rotate-180' : ''}`}
              />
            </button>
            {expandedAnnotations && (
              <div className="space-y-2 text-xs mt-3 pt-3 border-t border-border">
                {Object.entries(node.annotations).map(([key, value]) => (
                  <div key={key} className="flex items-start justify-between gap-2">
                    <span className="text-text-secondary truncate">{key}:</span>
                    <span className="text-text font-medium text-right break-all">{value}</span>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {/* Pods Section */}
        <section className="bg-surface border border-border rounded-lg p-3.5">
          <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-3">Pods ({nodePods.length})</h3>
          {nodePods.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border bg-bg/50">
                    <th className="text-left py-1.5 px-2 text-text-secondary font-medium">Pod</th>
                    <th className="text-left py-1.5 px-2 text-text-secondary font-medium">Namespace</th>
                    <th className="text-left py-1.5 px-2 text-text-secondary font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {nodePods.map((pod) => (
                    <tr key={`${pod.namespace}/${pod.name}`} className="border-b border-border last:border-b-0 hover:bg-hover/50">
                      <td className="py-2 px-2">
                        <p className="text-text truncate font-medium">{pod.name}</p>
                      </td>
                      <td className="py-2 px-2">
                        <p className="text-text-secondary truncate">{pod.namespace}</p>
                      </td>
                      <td className="py-2 px-2">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                          pod.phase === 'Running'
                            ? 'bg-[var(--color-icon-success)]/10 text-[var(--color-icon-success)]'
                            : pod.phase === 'Pending'
                              ? 'bg-[var(--color-icon-warning)]/10 text-[var(--color-icon-warning)]'
                              : 'bg-[var(--color-icon-danger)]/10 text-[var(--color-icon-danger)]'
                        }`}>
                          {pod.phase || pod.status || 'Unknown'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-xs text-text-secondary">No pods running on this node</p>
          )}
        </section>

        <section className="bg-surface border border-border rounded-lg p-3.5">
          <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-3">Events ({events.length})</h3>
          {events.length > 0 ? (
            <div className="overflow-x-auto border border-border rounded-md">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border bg-bg/50">
                    <th className="text-left py-2 px-2 text-text-secondary font-medium">Summary</th>
                    <th className="text-left py-2 px-2 text-text-secondary font-medium w-16">Count</th>
                    <th className="text-left py-2 px-2 text-text-secondary font-medium w-20">Age</th>
                  </tr>
                </thead>
                <tbody>
                  {events.slice(0, 20).map((event, idx) => (
                    <tr key={`${event.summary}-${idx}`} className="border-b border-border last:border-b-0 hover:bg-hover/40">
                      <td className="py-2 px-2 align-top">
                        <p className="text-text font-medium">{event.summary}</p>
                        <p className="text-text-secondary mt-1 break-all">{event.message || '-'}</p>
                      </td>
                      <td className="py-2 px-2 align-top text-text">{event.count}</td>
                      <td className="py-2 px-2 align-top text-text-secondary">{event.age}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-xs text-text-secondary">No recent events</p>
          )}
        </section>
      </div>
    </div>
    </ResizablePanel>
  );
};
