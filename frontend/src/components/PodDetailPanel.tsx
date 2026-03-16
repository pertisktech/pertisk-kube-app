import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { X, Pencil, Terminal, ScrollText, Trash2, Cable, Eye, EyeOff } from './Icons';
import { StatusBadge } from './StatusBadge';
import type { Pod } from '../types';
import { timeAgo, formatCpuRange, formatCpuCores, parseCpuToCores } from '../utils';
import { ResizablePanel } from './ResizablePanel';
import { PanelActionButton, PanelCloseButton } from './ResourceDetailPanelLayout';
import { DrawerItem, DrawerTitle, DrawerLabelsAnnotations, DrawerParamToggler } from './drawer';
import { WorkloadMetricGraphs } from './WorkloadMetricGraphs';
import { createPortForward, usePortForwards } from '../hooks/useKubernetes';

interface PodDetailPanelProps {
  pod: Pod;
  onClose: () => void;
  onOpenYamlEditor: (pod: Pod) => void;
  onOpenShell: (pod: Pod) => void;
  onOpenLogs: (pod: Pod) => void;
  onDelete?: (namespace: string, name: string) => Promise<void>;
  onPortForward?: (pod: Pod, port: string) => void;
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

/** Parse "cpu: 100m, memory: 128Mi" into ["cpu=100m", "memory=128Mi"] for badge display */
const parseResourceString = (s: string | undefined): string[] => {
  if (!s || s === '-') return [];
  return s
    .split(',')
    .map((part) => {
      const trimmed = part.trim();
      const colon = trimmed.indexOf(': ');
      if (colon === -1) return trimmed;
      return `${trimmed.slice(0, colon).trim()}=${trimmed.slice(colon + 2).trim()}`;
    })
    .filter(Boolean);
};

export const PodDetailPanel = ({ pod, onClose, onOpenYamlEditor, onOpenShell, onOpenLogs, onDelete }: PodDetailPanelProps) => {
  const queryClient = useQueryClient();
  const { data: portForwards = [] } = usePortForwards();
  const [portForwardModal, setPortForwardModal] = useState<{ remotePort: number; localPort: number } | null>(null);

  const createPfMutation = useMutation({
    mutationFn: createPortForward,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['port-forwards'] });
      setPortForwardModal(null);
    },
  });

  const activePodForwards = portForwards.filter(
    (pf) =>
      pf.resource_type === 'pod' &&
      pf.resource_name === pod.name &&
      pf.namespace === pod.namespace &&
      pf.status === 'running'
  );

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

  const requestsBadges = containers.flatMap((c) => parseResourceString(c.requests));
  const limitsBadges = containers.flatMap((c) => parseResourceString(c.limits));

  return (
    <>
    <ResizablePanel>
      <div className="h-full min-h-0 flex flex-col">
        {/* Header: same as Node panel (gradient + key info bar) */}
        <div className="bg-gradient-to-r from-surface to-surface-elevated border-b border-border px-5 py-4 flex-shrink-0">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <h2 className="text-lg font-bold truncate" style={{ color: 'var(--color-text)' }}>{pod.name || 'Pod'}</h2>
              <div className="mt-2">
                <StatusBadge status={status} />
              </div>
            </div>
            <div
              className="flex items-center flex-shrink-0 rounded-lg border"
              style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)' }}
            >
              <PanelActionButton icon={ScrollText} label="Logs" onClick={() => onOpenLogs(pod)} />
              <PanelActionButton icon={Terminal} label="Shell" onClick={() => onOpenShell(pod)} />
              <PanelActionButton icon={Pencil} label="Edit YAML" onClick={() => onOpenYamlEditor(pod)} />
              {onDelete && <PanelActionButton icon={Trash2} label="Delete" danger onClick={() => onDelete(pod.namespace, pod.name)} />}
              <PanelCloseButton
                onClick={onClose}
                borderLeft="1px solid var(--color-border)"
                label="Close pod panel"
              />
            </div>
          </div>

          <div className="flex items-center gap-3 text-xs mt-3 pt-3 border-t border-border">
            <div className="flex-1">
              <p className="mb-1" style={{ color: 'var(--color-text-secondary)' }}>Namespace</p>
              <p className="font-medium truncate" style={{ color: 'var(--color-text)' }}>{pod.namespace || '-'}</p>
            </div>
            <div className="flex-1">
              <p className="mb-1" style={{ color: 'var(--color-text-secondary)' }}>Ready</p>
              <p className="font-medium" style={{ color: 'var(--color-text)' }}>{pod.ready || '-'}</p>
            </div>
            <div className="flex-1">
              <p className="mb-1" style={{ color: 'var(--color-text-secondary)' }}>Restarts</p>
              <p className="font-medium" style={{ color: 'var(--color-text)' }}>{pod.restarts ?? 0}</p>
            </div>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-auto overflow-x-hidden px-5 py-5 text-xs drawer-content PodDetails" style={{ padding: 'var(--drawer-content-spacing, 1.5rem)' }}>
          <DrawerTitle>Property</DrawerTitle>
          <DrawerItem name="Status">{status}</DrawerItem>
          {pod.node && <DrawerItem name="Node">{pod.node}</DrawerItem>}
          {(podIps.length > 0 || pod.pod_ip) && (
            <DrawerItem name="Pod IPs" labelsOnly>
              <div className="flex flex-wrap gap-1.5">
                {(podIps.length ? podIps : [pod.pod_ip!].filter(Boolean)).map((ip) => (
                  <span key={ip} className="inline-flex px-2 py-0.5 rounded text-xs border border-border" style={{ backgroundColor: 'var(--color-hover)', color: 'var(--color-text)' }}>{ip}</span>
                ))}
              </div>
            </DrawerItem>
          )}
          <DrawerItem name="Service Account">{pod.service_account || '-'}</DrawerItem>
          <DrawerItem name="QoS Class">{pod.qos_class || pod.qos || '-'}</DrawerItem>
          <DrawerItem name="Created">{timeAgo(pod.created || pod.age)}</DrawerItem>
          <DrawerItem name="Controller">{pod.controlled_by || '-'}</DrawerItem>

          <DrawerLabelsAnnotations labels={labels} annotations={annotations} />

          {tolerations.length > 0 && (
            <DrawerItem name={`Tolerations (${tolerations.length})`} className="PodDetailsTolerations">
              <DrawerParamToggler label="">
                <div className="overflow-x-auto border border-border rounded-md">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border" style={{ backgroundColor: 'var(--color-bg)' }}>
                        <th className="text-left py-2 px-2 font-medium" style={{ color: 'var(--color-muted)' }}>Key</th>
                        <th className="text-left py-2 px-2 font-medium" style={{ color: 'var(--color-muted)' }}>Operator</th>
                        <th className="text-left py-2 px-2 font-medium" style={{ color: 'var(--color-muted)' }}>Effect</th>
                        <th className="text-left py-2 px-2 font-medium" style={{ color: 'var(--color-muted)' }}>Seconds</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tolerations.map((tol, idx) => (
                        <tr key={`${tol.key}-${tol.effect}-${idx}`} className="border-b border-border last:border-b-0">
                          <td className="py-2 px-2 break-all" style={{ color: 'var(--color-text)' }}>{tol.key}{tol.value ? `=${tol.value}` : ''}</td>
                          <td className="py-2 px-2" style={{ color: 'var(--color-text-secondary)' }}>{tol.operator}</td>
                          <td className="py-2 px-2" style={{ color: 'var(--color-text-secondary)' }}>{tol.effect}</td>
                          <td className="py-2 px-2" style={{ color: 'var(--color-text-secondary)' }}>{tol.seconds}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </DrawerParamToggler>
            </DrawerItem>
          )}

          {podAntiAffinities.length > 0 && (
            <DrawerItem name={`Affinities (${podAntiAffinities.length})`} className="PodDetailsAffinities">
              <DrawerParamToggler label="">
                <div className="space-y-1">
                  {podAntiAffinities.map((rule, idx) => (
                    <p key={`${rule}-${idx}`} className="break-all text-xs" style={{ color: 'var(--color-text)' }}>{rule}</p>
                  ))}
                </div>
              </DrawerParamToggler>
            </DrawerItem>
          )}

          {displayConditions.length > 0 && (
            <DrawerItem name="Conditions" labelsOnly className="conditions">
              <div className="flex flex-wrap gap-1.5">
                {displayConditions.map((condition) => {
                  const isTrue = String(condition.status).toLowerCase() === 'true';
                  return (
                    <span
                      key={condition.type}
                      className={`inline-flex px-2 py-0.5 rounded text-xs border ${
                        isTrue
                          ? 'bg-[var(--color-icon-success)]/10 text-[var(--color-icon-success)] border-[var(--color-icon-success)]/30'
                          : 'opacity-60 bg-[var(--color-icon-danger)]/10 text-[var(--color-icon-danger)] border-[var(--color-icon-danger)]/30'
                      }`}
                      title={[condition.type, condition.status, condition.reason].filter(Boolean).join(' — ')}
                    >
                      {condition.type}
                    </span>
                  );
                })}
              </div>
            </DrawerItem>
          )}

          {requestsBadges.length > 0 && (
            <DrawerItem name="Requests" labelsOnly>
              <div className="flex flex-wrap gap-1.5">
                {requestsBadges.map((r, i) => (
                  <span key={`req-${i}`} className="inline-flex px-2 py-0.5 rounded text-xs border border-border" style={{ backgroundColor: 'var(--color-hover)', color: 'var(--color-text)' }}>{r}</span>
                ))}
              </div>
            </DrawerItem>
          )}
          {limitsBadges.length > 0 && (
            <DrawerItem name="Limits" labelsOnly>
              <div className="flex flex-wrap gap-1.5">
                {limitsBadges.map((l, i) => (
                  <span key={`lim-${i}`} className="inline-flex px-2 py-0.5 rounded text-xs border border-border" style={{ backgroundColor: 'var(--color-hover)', color: 'var(--color-text)' }}>{l}</span>
                ))}
              </div>
            </DrawerItem>
          )}

          <DrawerItem name="CPU">
            {hasCpuMetrics
              ? `${formatCpuRange(pod.cpu, pod.cpu_capacity)} (${Math.round(cpuPercent)}%)`
              : pod.cpu != null && pod.cpu !== '' && pod.cpu !== '-'
                ? `${formatCpuCores(parseCpuToCores(String(pod.cpu)))} cores`
                : '—'}
          </DrawerItem>
          {hasCpuMetrics && (
            <div className="h-2 rounded-full overflow-hidden mb-2" style={{ backgroundColor: 'var(--color-hover)' }}>
              <div className="h-full rounded-full" style={{ width: `${usageBarWidth(cpuPercent)}%`, backgroundColor: usageBarColor(cpuPercent) }} />
            </div>
          )}

          <DrawerItem name="Memory">
            {hasMemoryMetrics ? `${pod.memory || '-'} / ${pod.memory_capacity || '-'} (${Math.round(memoryPercent)}%)` : pod.memory || '-'}
          </DrawerItem>
          {hasMemoryMetrics && (
            <div className="h-2 rounded-full overflow-hidden mb-2" style={{ backgroundColor: 'var(--color-hover)' }}>
              <div className="h-full rounded-full" style={{ width: `${usageBarWidth(memoryPercent)}%`, backgroundColor: usageBarColor(memoryPercent) }} />
            </div>
          )}

          <DrawerTitle>Metrics</DrawerTitle>
          <div className="mb-4">
            <WorkloadMetricGraphs />
          </div>

          <DrawerTitle>Containers</DrawerTitle>
          {containers.length > 0 ? (
            containers.map((c, i) => (
              <div key={`${c.name}-${i}`} className="PodDetailsContainer mt-4 mb-4">
                <div className="pod-container-title flex items-center gap-2 font-bold mb-2">
                  <span
                    className="StatusBrick w-2 h-2 rounded-sm flex-shrink-0"
                    style={{
                      backgroundColor: c.ready ? 'var(--color-icon-success)' : 'var(--color-icon-warning)',
                    }}
                    title={c.status || (c.ready ? 'Ready' : 'Not Ready')}
                  />
                  <span style={{ color: 'var(--color-text)' }}>{c.name}</span>
                </div>
                <DrawerItem name="Status">
                  <span className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                    {c.status || (c.ready ? 'ready' : 'not ready')}
                    {c.restart_count != null && c.restart_count > 0 ? `, restarted ${c.restart_count}` : ''}
                  </span>
                </DrawerItem>
                <DrawerItem name="Image">
                  <span className="inline-flex px-2 py-0.5 rounded text-xs border border-border" style={{ backgroundColor: 'var(--color-hover)', color: 'var(--color-text)' }}>{c.image || '-'}</span>
                </DrawerItem>
                {c.image_pull_policy && c.image_pull_policy !== 'IfNotPresent' && (
                  <DrawerItem name="ImagePullPolicy">{c.image_pull_policy}</DrawerItem>
                )}
                {c.ports && c.ports.length > 0 && (
                  <DrawerItem name="Ports">
                    <div className="w-full overflow-x-auto border border-border rounded-md">
                      <table className="w-full text-xs table-fixed">
                        <colgroup>
                          <col style={{ width: '70%' }} />
                          <col style={{ width: '30%' }} />
                        </colgroup>
                        <thead>
                          <tr className="border-b border-border" style={{ backgroundColor: 'var(--color-bg)' }}>
                            <th className="text-left py-1.5 px-3 font-medium" style={{ color: 'var(--color-muted)' }}>Port</th>
                            <th className="text-left py-1.5 px-3 font-medium" style={{ color: 'var(--color-muted)' }}>Forward</th>
                          </tr>
                        </thead>
                        <tbody>
                          {c.ports.map((port, portIdx) => {
                            const remotePort = parseInt(String(port).split('/')[0], 10) || 0;
                            const isForwarding = activePodForwards.some((pf) => pf.remote_port === remotePort);
                            return (
                              <tr key={`${c.name}-port-${portIdx}`} className="border-b border-border last:border-b-0">
                                <td className="py-1.5 px-3 font-mono align-middle break-all" style={{ color: 'var(--color-text)' }}>{port}</td>
                                <td className="py-1.5 px-3 align-middle">
                                  <button
                                    type="button"
                                    onClick={() => setPortForwardModal({ remotePort: remotePort || 8080, localPort: remotePort === 80 ? 8080 : remotePort })}
                                    disabled={createPfMutation.isPending || isForwarding || !remotePort}
                                    className="p-1 rounded border text-xs transition-colors"
                                    style={{ borderColor: 'var(--color-primary)', color: 'var(--color-primary)' }}
                                    title={isForwarding ? 'Port forward active' : 'Port forward'}
                                    aria-label={`Port forward ${port}`}
                                  >
                                    <Cable size={12} />
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </DrawerItem>
                )}
                {c.environment_variables && c.environment_variables.length > 0 && (
                  <div className="ContainerEnvironment w-full mt-2">
                    <DrawerParamToggler label={`Environment (${c.environment_variables.length})`}>
                      <div className="overflow-x-auto border border-border rounded-md w-full">
                        <table className="w-full text-xs table-fixed">
                          <colgroup>
                            <col style={{ width: '30%' }} />
                            <col style={{ width: '70%' }} />
                          </colgroup>
                          <thead>
                            <tr className="border-b border-border" style={{ backgroundColor: 'var(--color-bg)' }}>
                              <th className="text-left py-1.5 px-3 font-medium" style={{ color: 'var(--color-muted)' }}>Key</th>
                              <th className="text-left py-1.5 px-3 font-medium" style={{ color: 'var(--color-muted)' }}>Value</th>
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
                                if (env.source === 'secret') displayValue = env.decoded_value || `[Secret: ${env.value}]`;
                                else if (env.source === 'configMap') displayValue = `[ConfigMap: ${env.value}]`;
                                else if (env.source === 'fieldRef') displayValue = `[FieldRef: ${env.value}]`;
                                else displayValue = env.value || '(empty)';
                              }
                              return (
                                <tr key={`${c.name}-${env.key}-${idx}`} className="border-b border-border">
                                  <td className="py-1.5 px-3 font-mono align-top break-all" style={{ color: 'var(--color-text)' }}>{env.key}</td>
                                  <td className="py-1.5 px-3 font-mono align-top min-w-0 break-words whitespace-normal">
                                    <div className="flex items-start justify-between gap-2">
                                      <span className={`min-w-0 break-words whitespace-pre-wrap ${env.source === 'secret' && !shouldHide ? 'text-[var(--color-icon-warning)]' : ''}`} style={{ color: 'var(--color-text-secondary)' }}>{displayValue}</span>
                                      {isSensitive && (
                                        <button
                                          type="button"
                                          onClick={() => setHiddenEnvVars(prev => {
                                            const newSet = new Set(prev[c.name] ?? []);
                                            const key = `${env.key}-${idx}`;
                                            if (newSet.has(key)) newSet.delete(key);
                                            else newSet.add(key);
                                            return { ...prev, [c.name]: newSet };
                                          })}
                                          className="flex-shrink-0 p-0 border-0 bg-transparent cursor-pointer"
                                          style={{ color: 'var(--color-muted)' }}
                                          title={shouldHide ? 'Show value' : 'Hide value'}
                                        >
                                          {shouldHide ? <Eye size={14} /> : <EyeOff size={14} />}
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
                    </DrawerParamToggler>
                  </div>
                )}
                {c.mounts && c.mounts.length > 0 && (
                  <DrawerItem name="Mounts">
                    <span className="text-xs font-mono block" style={{ color: 'var(--color-text-secondary)' }}>{c.mounts.join(', ')}</span>
                  </DrawerItem>
                )}
                {(c.liveness || c.readiness || c.startup) && (
                  <>
                    {c.liveness && (
                      <DrawerItem name="Liveness" labelsOnly>
                        <span className="inline-flex px-2 py-0.5 rounded text-xs border border-border" style={{ backgroundColor: 'var(--color-hover)', color: 'var(--color-text)' }}>{c.liveness}</span>
                      </DrawerItem>
                    )}
                    {c.readiness && (
                      <DrawerItem name="Readiness" labelsOnly>
                        <span className="inline-flex px-2 py-0.5 rounded text-xs border border-border" style={{ backgroundColor: 'var(--color-hover)', color: 'var(--color-text)' }}>{c.readiness}</span>
                      </DrawerItem>
                    )}
                    {c.startup && (
                      <DrawerItem name="Startup" labelsOnly>
                        <span className="inline-flex px-2 py-0.5 rounded text-xs border border-border" style={{ backgroundColor: 'var(--color-hover)', color: 'var(--color-text)' }}>{c.startup}</span>
                      </DrawerItem>
                    )}
                  </>
                )}
                {(parseResourceString(c.requests).length > 0 || parseResourceString(c.limits).length > 0) && (
                  <>
                    {parseResourceString(c.requests).length > 0 && (
                      <DrawerItem name="Requests" labelsOnly>
                        <div className="flex flex-wrap gap-1.5">
                          {parseResourceString(c.requests).map((r, i) => (
                            <span key={`${c.name}-req-${i}`} className="inline-flex px-2 py-0.5 rounded text-xs border border-border" style={{ backgroundColor: 'var(--color-hover)', color: 'var(--color-text)' }}>{r}</span>
                          ))}
                        </div>
                      </DrawerItem>
                    )}
                    {parseResourceString(c.limits).length > 0 && (
                      <DrawerItem name="Limits" labelsOnly>
                        <div className="flex flex-wrap gap-1.5">
                          {parseResourceString(c.limits).map((l, i) => (
                            <span key={`${c.name}-lim-${i}`} className="inline-flex px-2 py-0.5 rounded text-xs border border-border" style={{ backgroundColor: 'var(--color-hover)', color: 'var(--color-text)' }}>{l}</span>
                          ))}
                        </div>
                      </DrawerItem>
                    )}
                  </>
                )}
              </div>
            ))
          ) : (
            <p className="text-xs py-2" style={{ color: 'var(--color-muted)' }}>No container data available</p>
          )}

          <DrawerTitle>Volumes ({volumes.length})</DrawerTitle>
          {volumes.length > 0 ? (
            <div className="space-y-2">
              {volumes.map((v, i) => (
                <div key={`${v.name}-${i}`} className="border border-border rounded-md p-2 text-xs">
                  <DrawerItem name="Name">{v.name}</DrawerItem>
                  <DrawerItem name="Type">{v.type || '-'}</DrawerItem>
                  <DrawerItem name="Source">{v.source || '-'}</DrawerItem>
                  <DrawerItem name="Read only">{v.read_only ? 'Yes' : 'No'}</DrawerItem>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs py-2" style={{ color: 'var(--color-muted)' }}>No volume data</p>
          )}

          <DrawerTitle>Events ({events.length})</DrawerTitle>
          {events.length > 0 ? (
            <div className="overflow-x-auto border border-border rounded-md -mx-4 px-4">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border" style={{ backgroundColor: 'var(--color-bg)' }}>
                    <th className="text-left py-2 px-2 font-medium" style={{ color: 'var(--color-muted)' }}>Summary</th>
                    <th className="text-left py-2 px-2 font-medium w-16" style={{ color: 'var(--color-muted)' }}>Count</th>
                    <th className="text-left py-2 px-2 font-medium w-20" style={{ color: 'var(--color-muted)' }}>Age</th>
                  </tr>
                </thead>
                <tbody>
                  {events.slice(0, 20).map((e, i) => (
                    <tr key={`${e.reason || 'event'}-${i}`} className="border-b border-border last:border-b-0">
                      <td className="py-2 px-2 align-top">
                        <p className="font-medium" style={{ color: 'var(--color-text)' }}>{e.reason || e.type || 'Event'}</p>
                        <p className="mt-1 break-all" style={{ color: 'var(--color-text-secondary)' }}>{e.message || '-'}</p>
                      </td>
                      <td className="py-2 px-2 align-top" style={{ color: 'var(--color-text)' }}>{e.count ?? 1}</td>
                      <td className="py-2 px-2 align-top" style={{ color: 'var(--color-text-secondary)' }}>{e.age || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-xs py-2" style={{ color: 'var(--color-muted)' }}>No recent events</p>
          )}
        </div>
      </div>
    </ResizablePanel>

    {portForwardModal && (
      <div
        className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60]"
        onClick={() => setPortForwardModal(null)}
        role="presentation"
      >
        <div
          className="rounded-lg p-4 w-full max-w-sm shadow-xl border border-border"
          style={{ backgroundColor: 'var(--color-surface)' }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-semibold" style={{ color: 'var(--color-text)' }}>
              Port forward pod/{pod.name}
            </h3>
            <button type="button" onClick={() => setPortForwardModal(null)} className="p-1 rounded hover:bg-hover text-text-secondary">
              <X size={16} />
            </button>
          </div>
          <p className="text-xs mb-3" style={{ color: 'var(--color-muted)' }}>
            Local port → remote port {portForwardModal.remotePort}
          </p>
          <div className="flex items-center gap-2 mb-3">
            <input
              type="number"
              min={1}
              max={65535}
              value={portForwardModal.localPort}
              onChange={(e) =>
                setPortForwardModal((prev) =>
                  prev ? { ...prev, localPort: parseInt(e.target.value, 10) || 8080 } : null
                )
              }
              className="flex-1 px-2 py-1.5 rounded border text-xs font-mono"
              style={{
                backgroundColor: 'var(--color-bg)',
                borderColor: 'var(--color-border)',
                color: 'var(--color-text)',
              }}
            />
            <span className="text-text-secondary">→</span>
            <span className="font-mono text-xs text-text">{portForwardModal.remotePort}</span>
          </div>
          {createPfMutation.isError && (
            <p className="text-xs text-red-400 mb-2">{(createPfMutation.error as Error).message}</p>
          )}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setPortForwardModal(null)}
              className="px-3 py-1.5 rounded border border-border text-text-secondary text-xs hover:bg-hover"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                createPfMutation.mutate({
                  namespace: pod.namespace,
                  resource_type: 'pod',
                  resource_name: pod.name,
                  local_port: portForwardModal.localPort,
                  remote_port: portForwardModal.remotePort,
                });
              }}
              disabled={createPfMutation.isPending}
              className="px-3 py-1.5 rounded bg-green-600 text-white text-xs hover:bg-green-700 disabled:opacity-50"
            >
              {createPfMutation.isPending ? 'Starting...' : 'Start'}
            </button>
          </div>
        </div>
      </div>
    )}
  </>
  );
};
