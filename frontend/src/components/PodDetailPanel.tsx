import { useState } from 'react';
import { X, Pencil, Terminal, ScrollText, Trash2, ChevronDown } from 'lucide-react';
import { StatusBadge } from './StatusBadge';
import type { Pod } from '../types';
import { timeAgo } from '../utils';
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
  const [expandedLabels, setExpandedLabels] = useState(false);
  const [expandedAnnotations, setExpandedAnnotations] = useState(false);
  const [expandedTolerations, setExpandedTolerations] = useState(false);
  const [expandedEnvVars, setExpandedEnvVars] = useState<Record<string, boolean>>({});
  const [hiddenEnvVars, setHiddenEnvVars] = useState<Record<string, Set<string>>>({});
  const status = pod.status || pod.phase || 'Unknown';
  const hasCpuMetrics = pod.cpu_usage_percent != null;
  const hasMemoryMetrics = pod.memory_usage_percent != null;
  const cpuPercent = toPercent(pod.cpu_usage_percent);
  const memoryPercent = toPercent(pod.memory_usage_percent);
  const volumes = pod.volumes || [];
  const containers = pod.containers || [];
  const events = pod.events || [];
  const labels = pod.labels || {};
  const annotations = pod.annotations || {};
  const conditions = pod.conditions || [];
  const tolerations = pod.tolerations || [];
  const podAntiAffinities = pod.pod_anti_affinities || [];
  const podIps = pod.pod_ips || [];
  const conditionOrder = ['PodReadyToStartContainers', 'Initialized', 'Ready', 'ContainersReady', 'PodScheduled'];
  const conditionMap = new Map(conditions.map((condition) => [condition.type, condition]));
  const orderedConditions = conditionOrder
    .map((type) => conditionMap.get(type))
    .filter((condition): condition is NonNullable<typeof condition> => Boolean(condition));
  const extraConditions = conditions.filter((condition) => !conditionOrder.includes(condition.type));
  const displayConditions = [...orderedConditions, ...extraConditions];

  return (
    <ResizablePanel>
      <div className="h-full flex flex-col">
        <div className="bg-gradient-to-r from-surface to-surface-elevated border-b border-border px-5 py-4">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div className="flex-1 min-w-0">
              <h2 className="text-lg font-bold text-text truncate">{pod.name || 'Pod'}</h2>
              <div className="mt-2">
                <StatusBadge status={status} />
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-hover text-text-secondary transition-colors flex-shrink-0"
              aria-label="Close pod panel"
            >
              <X size={18} />
            </button>
          </div>

          <div className="flex gap-2 mt-3">
            <div className="group relative">
              <button type="button" onClick={() => onOpenLogs(pod)} className="p-2 rounded-md border border-[var(--color-primary)] text-[var(--color-primary)] hover:bg-[var(--color-primary)]/10 transition-colors" aria-label="View pod logs">
                <ScrollText size={12} />
              </button>
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-surface-elevated text-text text-xs rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 border border-border">View Logs</div>
            </div>
            <div className="group relative">
              <button type="button" onClick={() => onOpenShell(pod)} className="p-2 rounded-md border border-[var(--color-primary)] text-[var(--color-primary)] hover:bg-[var(--color-primary)]/10 transition-colors" aria-label="Open pod shell">
                <Terminal size={12} />
              </button>
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-surface-elevated text-text text-xs rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 border border-border">Open Shell</div>
            </div>
            <div className="group relative">
              <button type="button" onClick={() => onOpenYamlEditor(pod)} className="p-2 rounded-md border border-[var(--color-primary)] text-[var(--color-primary)] hover:bg-[var(--color-primary)]/10 transition-colors" aria-label="Edit pod YAML">
                <Pencil size={12} />
              </button>
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-surface-elevated text-text text-xs rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 border border-border">Edit YAML</div>
            </div>
            <div className="group relative">
              <button type="button" onClick={() => onDelete?.(pod.namespace, pod.name)} className="p-2 rounded-md border border-[var(--color-icon-danger)] text-[var(--color-icon-danger)] hover:bg-[var(--color-icon-danger)]/10 transition-colors" aria-label="Delete pod">
                <Trash2 size={12} />
              </button>
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-surface-elevated text-text text-xs rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 border border-border">Delete</div>
            </div>
          </div>

          <div className="flex items-center gap-3 text-xs mt-3 pt-3 border-t border-border">
            <div className="flex-1">
              <p className="text-text-secondary mb-1">Namespace</p>
              <p className="text-text font-medium truncate">{pod.namespace || '-'}</p>
            </div>
            <div className="flex-1">
              <p className="text-text-secondary mb-1">Ready</p>
              <p className="text-text font-medium">{pod.ready || '-'}</p>
            </div>
            <div className="flex-1">
              <p className="text-text-secondary mb-1">Restarts</p>
              <p className="text-text font-medium">{pod.restarts ?? 0}</p>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-auto overflow-x-hidden p-4 space-y-4 text-sm">
          <section className="bg-surface border border-border rounded-lg p-3.5">
            <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-3">Properties</h3>
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs py-1.5"><span className="text-text-secondary">Created</span><span className="text-text font-medium">{timeAgo(pod.created || pod.age)}</span></div>
              <div className="flex items-center justify-between text-xs py-1.5 border-t border-border pt-2"><span className="text-text-secondary">Name</span><span className="text-text font-medium text-right break-all">{pod.name || '-'}</span></div>
              <div className="flex items-center justify-between text-xs py-1.5 border-t border-border pt-2"><span className="text-text-secondary">Namespace</span><span className="text-text font-medium text-right break-all">{pod.namespace || '-'}</span></div>
              <div className="flex items-center justify-between text-xs py-1.5 border-t border-border pt-2"><span className="text-text-secondary">Status</span><span className="text-text font-medium text-right break-all">{status}</span></div>
              <div className="flex items-center justify-between text-xs py-1.5 border-t border-border pt-2"><span className="text-text-secondary">Controller By</span><span className="text-text font-medium text-right break-all">{pod.controlled_by || '-'}</span></div>
              <div className="flex items-center justify-between text-xs py-1.5 border-t border-border pt-2"><span className="text-text-secondary">Pod IP</span><span className="text-text font-medium text-right break-all">{pod.pod_ip || '-'}</span></div>
              <div className="border-t border-border pt-2">
                <p className="text-xs text-text-secondary">Pod IPs</p>
                <p className="text-text font-medium text-xs mt-1 break-all">{podIps.length > 0 ? podIps.join(', ') : '-'}</p>
              </div>
              <div className="flex items-center justify-between text-xs py-1.5 border-t border-border pt-2"><span className="text-text-secondary">Service Account</span><span className="text-text font-medium text-right break-all">{pod.service_account || '-'}</span></div>
              <div className="flex items-center justify-between text-xs py-1.5 border-t border-border pt-2"><span className="text-text-secondary">QoS Class</span><span className="text-text font-medium text-right break-all">{pod.qos_class || pod.qos || '-'}</span></div>
              <div className="border-t border-border pt-2">
                <p className="text-xs text-text-secondary">Conditions</p>
                {displayConditions.length > 0 ? (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {displayConditions.map((condition, idx) => {
                      const isTrue = String(condition.status).toLowerCase() === 'true';
                      return (
                        <span
                          key={`${condition.type}-${idx}`}
                          className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs border ${
                            isTrue
                              ? 'bg-[var(--color-icon-success)]/10 text-[var(--color-icon-success)] border-[var(--color-icon-success)]/30'
                              : 'bg-[var(--color-icon-danger)]/10 text-[var(--color-icon-danger)] border-[var(--color-icon-danger)]/30'
                          }`}
                          title={condition.reason || condition.type}
                        >
                          <span>{condition.type}</span>
                          <span className="opacity-80">{isTrue ? 'True' : 'False'}</span>
                        </span>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-text font-medium text-xs mt-1">-</p>
                )}
              </div>
              <div className="border-t border-border pt-2">
                <button
                  type="button"
                  onClick={() => setExpandedTolerations((prev) => !prev)}
                  className="w-full flex items-center justify-between"
                >
                  <p className="text-xs text-text-secondary">Tolerations ({tolerations.length})</p>
                  <ChevronDown
                    size={14}
                    className={`transform transition-transform text-text-secondary ${expandedTolerations ? 'rotate-180' : ''}`}
                  />
                </button>
                {expandedTolerations && (
                  tolerations.length > 0 ? (
                    <div className="mt-2 overflow-x-auto border border-border rounded-md">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b border-border bg-bg/50">
                            <th className="text-left py-2 px-2 text-text-secondary font-medium">Key</th>
                            <th className="text-left py-2 px-2 text-text-secondary font-medium">Operation</th>
                            <th className="text-left py-2 px-2 text-text-secondary font-medium">Effect</th>
                            <th className="text-left py-2 px-2 text-text-secondary font-medium">Seconds</th>
                          </tr>
                        </thead>
                        <tbody>
                          {tolerations.map((tol, idx) => (
                            <tr key={`${tol.key}-${tol.effect}-${idx}`} className="border-b border-border last:border-b-0 hover:bg-hover/40">
                              <td className="py-2 px-2 text-text break-all">{tol.key}{tol.value ? `=${tol.value}` : ''}</td>
                              <td className="py-2 px-2 text-text-secondary">{tol.operator}</td>
                              <td className="py-2 px-2 text-text-secondary">{tol.effect}</td>
                              <td className="py-2 px-2 text-text-secondary">{tol.seconds}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="text-text font-medium text-xs mt-2">-</p>
                  )
                )}
              </div>
              <div className="border-t border-border pt-2">
                <p className="text-xs text-text-secondary">Pod Anti Affinities</p>
                {podAntiAffinities.length > 0 ? (
                  <div className="mt-1 space-y-1">
                    {podAntiAffinities.map((rule, idx) => (
                      <p key={`${rule}-${idx}`} className="text-text font-medium text-xs break-all">{rule}</p>
                    ))}
                  </div>
                ) : (
                  <p className="text-text font-medium text-xs mt-1">-</p>
                )}
              </div>
              <div className="border-t border-border pt-2">
                <button
                  type="button"
                  onClick={() => setExpandedLabels((prev) => !prev)}
                  className="w-full flex items-center justify-between"
                >
                  <p className="text-xs text-text-secondary">Labels ({Object.keys(labels).length})</p>
                  <ChevronDown
                    size={14}
                    className={`transform transition-transform text-text-secondary ${expandedLabels ? 'rotate-180' : ''}`}
                  />
                </button>
                {expandedLabels && (
                  Object.keys(labels).length > 0 ? (
                    <div className="mt-2 space-y-1">
                      {Object.entries(labels).map(([key, value]) => (
                        <p key={key} className="text-text font-medium text-xs break-all">{key}: {value}</p>
                      ))}
                    </div>
                  ) : (
                    <p className="text-text font-medium text-xs mt-2">-</p>
                  )
                )}
              </div>
              <div className="border-t border-border pt-2">
                <button
                  type="button"
                  onClick={() => setExpandedAnnotations((prev) => !prev)}
                  className="w-full flex items-center justify-between"
                >
                  <p className="text-xs text-text-secondary">Annotations ({Object.keys(annotations).length})</p>
                  <ChevronDown
                    size={14}
                    className={`transform transition-transform text-text-secondary ${expandedAnnotations ? 'rotate-180' : ''}`}
                  />
                </button>
                {expandedAnnotations && (
                  Object.keys(annotations).length > 0 ? (
                    <div className="mt-2 space-y-1">
                      {Object.entries(annotations).map(([key, value]) => (
                        <p key={key} className="text-text font-medium text-xs break-all">{key}: {value}</p>
                      ))}
                    </div>
                  ) : (
                    <p className="text-text font-medium text-xs mt-2">-</p>
                  )
                )}
              </div>

              <div className="border-t border-border pt-2">
                <p className="text-xs text-text-secondary">CPU</p>
                <p className="text-text font-medium text-xs mt-1 break-all">{hasCpuMetrics ? `${pod.cpu || '-'} / ${pod.cpu_capacity || '-'} (${Math.round(cpuPercent)}%)` : pod.cpu || '-'}</p>
                {hasCpuMetrics && (
                  <div className="mt-2 h-2 rounded-full bg-hover overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${usageBarWidth(cpuPercent)}%`, backgroundColor: usageBarColor(cpuPercent) }} />
                  </div>
                )}
              </div>

              <div className="border-t border-border pt-2">
                <p className="text-xs text-text-secondary">Memory</p>
                <p className="text-text font-medium text-xs mt-1 break-all">{hasMemoryMetrics ? `${pod.memory || '-'} / ${pod.memory_capacity || '-'} (${Math.round(memoryPercent)}%)` : pod.memory || '-'}</p>
                {hasMemoryMetrics && (
                  <div className="mt-2 h-2 rounded-full bg-hover overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${usageBarWidth(memoryPercent)}%`, backgroundColor: usageBarColor(memoryPercent) }} />
                  </div>
                )}
              </div>
            </div>
          </section>

          <section className="bg-surface border border-border rounded-lg p-3.5">
            <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-3">Pod Volumes ({volumes.length})</h3>
            {volumes.length > 0 ? (
              <div className="space-y-2 text-xs">
                {volumes.map((v, i) => (
                  <div key={`${v.name}-${i}`} className="border border-border rounded-md p-2">
                    <p className="text-text font-medium break-all">{v.name}</p>
                    <p className="text-text-secondary mt-1 break-all">Type: {v.type || '-'}</p>
                    <p className="text-text-secondary mt-1 break-all">Source: {v.source || '-'}</p>
                    <p className="text-text-secondary mt-1">Read only: {v.read_only ? 'Yes' : 'No'}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-text-secondary">No volume data available</p>
            )}
          </section>

          <section className="bg-surface border border-border rounded-lg p-3.5">
            <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-3">Containers ({containers.length})</h3>
            {containers.length > 0 ? (
              <div className="space-y-2">
                {containers.map((c, i) => (
                  <div key={`${c.name}-${i}`} className="border border-border rounded-md p-2">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-text font-medium text-xs break-all">{c.name}</p>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${c.ready ? 'bg-[var(--color-icon-success)]/10 text-[var(--color-icon-success)]' : 'bg-[var(--color-icon-warning)]/10 text-[var(--color-icon-warning)]'}`}>
                        {c.status || (c.ready ? 'Ready' : 'Not Ready')}
                      </span>
                    </div>
                    <div className="mt-2 space-y-1">
                      <p className="text-xs text-text-secondary break-all"><span className="text-text">Image:</span> {c.image || '-'}</p>
                      <p className="text-xs text-text-secondary break-all"><span className="text-text">Image Pull Policy:</span> {c.image_pull_policy || '-'}</p>
                      <p className="text-xs text-text-secondary break-all"><span className="text-text">Ports:</span> {c.ports && c.ports.length > 0 ? c.ports.join(', ') : '-'}</p>
                      {c.environment_variables && c.environment_variables.length > 0 ? (
                        <div className="mt-2 border border-border rounded-md overflow-hidden">
                          <button
                            onClick={() => setExpandedEnvVars(prev => ({
                              ...prev,
                              [c.name]: !prev[c.name]
                            }))}
                            className="w-full flex items-center justify-between bg-bg/50 hover:bg-bg/70 px-2 py-1.5 transition-colors"
                          >
                            <span className="text-xs text-text font-medium">Environment Variables ({c.environment_variables.length})</span>
                            <ChevronDown size={14} className={`text-text-secondary transition-transform ${expandedEnvVars[c.name] ? '' : '-rotate-90'}`} />
                          </button>
                          {expandedEnvVars[c.name] && (
                            <div className="border-t border-border overflow-x-auto">
                              <table className="w-full text-xs">
                                <thead>
                                  <tr className="border-b border-border bg-bg/50">
                                    <th className="text-left py-1.5 px-2 text-text-secondary font-medium w-32">Key</th>
                                    <th className="text-left py-1.5 px-2 text-text-secondary font-medium">Value</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {c.environment_variables.map((env, idx) => {
                                    const isSensitive = env.source === 'secret' || (env.value && env.value.length > 50);
                                    const isExplicitlyShown = hiddenEnvVars[c.name]?.has(`${env.key}-${idx}`);
                                    const shouldHide = isSensitive && !isExplicitlyShown;
                                    let displayValue = '';
                                    if (shouldHide) {
                                      displayValue = env.source === 'secret' ? '[Secret value hidden]' : '••••••••';
                                    } else {
                                      if (env.source === 'secret') {
                                        displayValue = env.decoded_value || `[Secret: ${env.value}]`;
                                      } else if (env.source === 'configMap') {
                                        displayValue = `[ConfigMap: ${env.value}]`;
                                      } else if (env.source === 'fieldRef') {
                                        displayValue = `[FieldRef: ${env.value}]`;
                                      } else {
                                        displayValue = env.value || '(empty)';
                                      }
                                    }
                                    return (
                                      <tr key={`${c.name}-${env.key}-${idx}`} className="border-b border-border hover:bg-bg/30">
                                        <td className="py-1.5 px-2 text-text break-all font-mono text-xs align-top">{env.key}</td>
                                        <td className="py-1.5 px-2 text-text-secondary font-mono text-xs">
                                          <div className="flex items-center justify-between gap-2">
                                            <span className={env.source === 'secret' && !shouldHide ? 'text-[var(--color-icon-warning)]' : ''}>{displayValue}</span>
                                            {isSensitive && (
                                              <button
                                                onClick={() => setHiddenEnvVars(prev => {
                                                  const newSet = new Set(prev[c.name]);
                                                  const key = `${env.key}-${idx}`;
                                                  if (newSet.has(key)) newSet.delete(key);
                                                  else newSet.add(key);
                                                  return { ...prev, [c.name]: newSet };
                                                })}
                                                className="flex-shrink-0 text-text-secondary hover:text-text transition-colors"
                                                title={shouldHide ? 'Show value' : 'Hide value'}
                                              >
                                                {shouldHide ? '🔒' : '👁'}
                                              </button>
                                            )}
                                          </div>
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      ) : (
                        <p className="text-xs text-text-secondary break-all"><span className="text-text">Environment Variables:</span> -</p>
                      )}
                      <p className="text-xs text-text-secondary break-all"><span className="text-text">Mounts:</span> {c.mounts && c.mounts.length > 0 ? c.mounts.join(' | ') : '-'}</p>
                      <p className="text-xs text-text-secondary break-all"><span className="text-text">Liveness:</span> {c.liveness || '-'}</p>
                      <p className="text-xs text-text-secondary break-all"><span className="text-text">Readiness:</span> {c.readiness || '-'}</p>
                      <p className="text-xs text-text-secondary break-all"><span className="text-text">Startup:</span> {c.startup || '-'}</p>
                      <p className="text-xs text-text-secondary break-all"><span className="text-text">Requests:</span> {c.requests || '-'}</p>
                      <p className="text-xs text-text-secondary break-all"><span className="text-text">Limits:</span> {c.limits || '-'}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-text-secondary">No container data available</p>
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
                    {events.slice(0, 20).map((e, i) => (
                      <tr key={`${e.reason || 'event'}-${i}`} className="border-b border-border last:border-b-0 hover:bg-hover/40">
                        <td className="py-2 px-2 align-top">
                          <p className="text-text font-medium">{e.reason || e.type || 'Event'}</p>
                          <p className="text-text-secondary mt-1 break-all">{e.message || '-'}</p>
                        </td>
                        <td className="py-2 px-2 align-top text-text">{e.count ?? 1}</td>
                        <td className="py-2 px-2 align-top text-text-secondary">{e.age || '-'}</td>
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
