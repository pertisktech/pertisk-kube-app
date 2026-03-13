import { useState } from 'react';
import { Terminal, Trash2, Loader, ChevronDown, FileText, Lock, Unlock, Droplet } from './Icons';
import { StatusBadge } from './StatusBadge';
import { usePods } from '../hooks/useKubernetes';
import { ResizablePanel } from './ResizablePanel';
import { PanelActionButton, PanelCloseButton } from './ResourceDetailPanelLayout';
import { DrawerItem, DrawerTitle } from './drawer';
import { formatMemoryUsedAlloc, formatCpuRange, formatCpuCores, parseCpuToCores, formatK8sQuantity } from '../utils';
import type { K8sNode } from '../types';

function getRoleBadgeStyle(role: string): { bg: string; color: string; border: string } {
  const r = role.toLowerCase();
  if (r === 'control-plane') {
    return {
      bg: 'var(--color-dashboard-metric-secondary-bg)',
      color: 'var(--color-dashboard-metric-secondary)',
      border: 'color-mix(in srgb, var(--color-dashboard-metric-secondary) 40%, transparent)',
    };
  }
  if (r === 'master') {
    return {
      bg: 'var(--color-dashboard-warning-bg)',
      color: 'var(--color-dashboard-warning)',
      border: 'color-mix(in srgb, var(--color-dashboard-warning) 40%, transparent)',
    };
  }
  if (r === 'worker') {
    return {
      bg: 'var(--color-dashboard-metric-quaternary-bg)',
      color: 'var(--color-dashboard-metric-quaternary)',
      border: 'color-mix(in srgb, var(--color-dashboard-metric-quaternary) 40%, transparent)',
    };
  }

  return {
    bg: 'var(--color-hover)',
    color: 'var(--color-text-secondary)',
    border: 'var(--color-border)',
  };
}

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

/** Freelens-style resource rows for Capacity / Allocatable */
const NodeDetailsResources = ({
  type,
  node,
}: {
  type: 'capacity' | 'allocatable';
  node: K8sNode;
}) => {
  const items: Array<{ key: string; label: string; value: string }> = [];
  if (type === 'capacity') {
    if (node.cpu != null) items.push({ key: 'cpu', label: 'CPU', value: `${formatCpuCores(parseCpuToCores(node.cpu))} cores` });
    if (node.memory != null) items.push({ key: 'memory', label: 'Memory', value: formatK8sQuantity(node.memory) });
    if (node.ephemeral_storage) items.push({ key: 'ephemeral-storage', label: 'Ephemeral Storage', value: formatK8sQuantity(node.ephemeral_storage) });
    if (node.pods) items.push({ key: 'pods', label: 'Pods', value: node.pods });
  } else {
    const cpuVal = node.cpu != null
      ? (node.cpu_used != null ? formatCpuRange(node.cpu_used, node.cpu) : `${formatCpuCores(parseCpuToCores(node.cpu))} cores`)
      : undefined;
    const memVal = node.memory != null ? formatMemoryUsedAlloc(node.memory_used, node.memory) : undefined;
    if (cpuVal) items.push({ key: 'cpu', label: 'CPU', value: cpuVal });
    if (memVal) items.push({ key: 'memory', label: 'Memory', value: memVal });
    if (node.ephemeral_storage) items.push({ key: 'ephemeral-storage', label: 'Ephemeral Storage', value: formatK8sQuantity(node.ephemeral_storage) });
    if (node.pods) items.push({ key: 'pods', label: 'Pods', value: node.pods });
  }
  if (items.length === 0) return null;
  return (
    <>
      {items.map(({ key, label, value }) => (
        <DrawerItem key={key} name={label}>
          {value}
        </DrawerItem>
      ))}
    </>
  );
};

export const NodeDetailPanel = ({ node, events = [], onClose, onEditYaml, onOpenShell, onCordonToggle, onDrain, onDelete, cordonLoading }: NodeDetailPanelProps) => {
  const [expandedLabels, setExpandedLabels] = useState(false);
  const [expandedAnnotations, setExpandedAnnotations] = useState(false);

  const { data: allPods } = usePods();

  const status = String(node.ready).toLowerCase() === 'true' ? 'Ready' : 'NotReady';
  const taints = node.taints?.length ? node.taints : [];

  const nodePods = (allPods || []).filter((pod) => pod.node === node.name);

  const labelCount = node.labels ? Object.keys(node.labels).length : 0;
  const annotationCount = node.annotations ? Object.keys(node.annotations).length : 0;

  const hasAddresses = node.internal_ip || node.external_ip || node.ipv4 || node.ipv6 || node.ip;

  return (
    <ResizablePanel>
      <div className="h-full flex flex-col NodeDetailPanel">
        {/* Header: old background (gradient surface), title, toolbar, close */}
        <div className="bg-gradient-to-r from-surface to-surface-elevated border-b border-border px-5 py-4 flex-shrink-0">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <h2 className="text-lg font-bold truncate" style={{ color: 'var(--color-text)' }}>{node.name}</h2>
              <div className="mt-2">
                <StatusBadge status={status} />
              </div>
            </div>
            <div
              className="flex items-center flex-shrink-0 rounded-lg border"
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
              <PanelCloseButton
                onClick={onClose}
                borderLeft={onEditYaml || onOpenShell || onCordonToggle || onDrain || onDelete ? '1px solid var(--color-border)' : 'none'}
                label="Close node panel"
              />
            </div>
          </div>

          {/* Key Info Bar */}
          <div className="flex items-center gap-3 text-xs mt-3 pt-3 border-t border-border">
            <div className="flex-1">
              <p className="mb-1" style={{ color: 'var(--color-text-secondary)' }}>Roles</p>
              {node.roles?.length ? (
                <div className="flex flex-wrap gap-1.5">
                  {node.roles.map((role) => {
                    const roleStyle = getRoleBadgeStyle(role);
                    return (
                      <span
                        key={role}
                        className="inline-flex px-2 py-0.5 rounded text-xs font-medium border"
                        style={{
                          backgroundColor: roleStyle.bg,
                          color: roleStyle.color,
                          borderColor: roleStyle.border,
                        }}
                      >
                        {role}
                      </span>
                    );
                  })}
                </div>
              ) : (
                <p className="font-medium" style={{ color: 'var(--color-text)' }}>-</p>
              )}
            </div>
            <div className="flex-1">
              <p className="mb-1" style={{ color: 'var(--color-text-secondary)' }}>Status</p>
              <p className={`font-medium ${node.unschedulable ? 'text-[var(--color-icon-warning)]' : 'text-[var(--color-icon-success)]'}`}>
                {node.unschedulable ? 'Cordoned' : 'Schedulable'}
              </p>
            </div>
          </div>
        </div>

        {/* Scrollable content: DrawerItem / DrawerTitle layout like freelens */}
        <div className="flex-1 overflow-auto overflow-x-hidden text-xs drawer-content" style={{ padding: 'var(--drawer-content-spacing, 1.5rem)' }}>
          <DrawerTitle>Property</DrawerTitle>
          {hasAddresses && (
            <DrawerItem name="Addresses">
              <div className="space-y-1">
                {node.internal_ip && <p>{`InternalIP: ${node.internal_ip}`}</p>}
                {node.external_ip && <p>{`ExternalIP: ${node.external_ip}`}</p>}
                {node.ipv4 && <p>{`IPv4: ${node.ipv4}`}</p>}
                {node.ipv6 && <p>{`IPv6: ${node.ipv6}`}</p>}
                {node.ip && !node.internal_ip && !node.external_ip && <p>{node.ip}</p>}
              </div>
            </DrawerItem>
          )}

          <DrawerItem name="OS">
            {node.operating_system ?? '-'} ({node.architecture ?? '-'})
          </DrawerItem>
          <DrawerItem name="OS Image">{node.os_image ?? '-'}</DrawerItem>
          <DrawerItem name="Kernel version">{node.kernel_version ?? '-'}</DrawerItem>
          <DrawerItem name="Container runtime">{node.runtime ?? '-'}</DrawerItem>
          <DrawerItem name="Kubelet version">{node.kubelet_version ?? '-'}</DrawerItem>

          {taints.length > 0 && (
            <DrawerItem name="Taints" labelsOnly>
              <div className="flex flex-wrap gap-1.5">
                {taints.map((t) => (
                  <span
                    key={t}
                    className="inline-flex px-2 py-0.5 rounded text-xs border border-border"
                    style={{ backgroundColor: 'var(--color-hover)', color: 'var(--color-text)' }}
                  >
                    {t}
                  </span>
                ))}
              </div>
            </DrawerItem>
          )}

          <DrawerTitle>Capacity</DrawerTitle>
          <NodeDetailsResources type="capacity" node={node} />

          <DrawerTitle>Allocatable</DrawerTitle>
          <NodeDetailsResources type="allocatable" node={node} />

          {/* Labels expandable */}
          {node.labels && Object.keys(node.labels).length > 0 && (
            <div className="mt-4">
              <button
                type="button"
                onClick={() => setExpandedLabels(!expandedLabels)}
                className="w-full flex items-center justify-between py-2 text-left"
              >
                <span className="text-xs font-semibold tracking-wide" style={{ color: 'var(--color-muted)' }}>Labels ({labelCount})</span>
                <span style={{ color: 'var(--color-primary)' }}>
                  <ChevronDown size={14} color="var(--color-primary)" className={`transition-transform ${expandedLabels ? 'rotate-180' : ''}`} />
                </span>
              </button>
              {expandedLabels && (
                <div className="space-y-0 border-t border-border pt-2">
                  {Object.entries(node.labels).map(([key, value]) => (
                    <DrawerItem key={key} name={key}>
                      {value}
                    </DrawerItem>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Annotations expandable */}
          {node.annotations && Object.keys(node.annotations).length > 0 && (
            <div className="mt-4">
              <button
                type="button"
                onClick={() => setExpandedAnnotations(!expandedAnnotations)}
                className="w-full flex items-center justify-between py-2 text-left"
              >
                <span className="text-xs font-semibold tracking-wide" style={{ color: 'var(--color-muted)' }}>Annotations ({annotationCount})</span>
                <span style={{ color: 'var(--color-primary)' }}>
                  <ChevronDown size={14} color="var(--color-primary)" className={`transition-transform ${expandedAnnotations ? 'rotate-180' : ''}`} />
                </span>
              </button>
              {expandedAnnotations && (
                <div className="space-y-0 border-t border-border pt-2">
                  {Object.entries(node.annotations).map(([key, value]) => (
                    <DrawerItem key={key} name={key}>
                      {value}
                    </DrawerItem>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Pods */}
          <DrawerTitle>Pods ({nodePods.length})</DrawerTitle>
          {nodePods.length > 0 ? (
            <div className="overflow-x-auto -mx-4 px-4">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border" style={{ backgroundColor: 'var(--color-bg)' }}>
                    <th className="text-left py-1.5 px-2 font-medium" style={{ color: 'var(--color-muted)' }}>Pod</th>
                    <th className="text-left py-1.5 px-2 font-medium" style={{ color: 'var(--color-muted)' }}>Namespace</th>
                    <th className="text-left py-1.5 px-2 font-medium" style={{ color: 'var(--color-muted)' }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {nodePods.map((pod) => (
                    <tr key={`${pod.namespace}/${pod.name}`} className="border-b border-border last:border-b-0 hover:opacity-90">
                      <td className="py-2 px-2 font-medium truncate" style={{ color: 'var(--color-text)' }}>{pod.name}</td>
                      <td className="py-2 px-2 truncate" style={{ color: 'var(--color-text-secondary)' }}>{pod.namespace}</td>
                      <td className="py-2 px-2">
                        <span
                          className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                            pod.phase === 'Running'
                              ? 'bg-[var(--color-icon-success)]/10 text-[var(--color-icon-success)]'
                              : pod.phase === 'Pending'
                                ? 'bg-[var(--color-icon-warning)]/10 text-[var(--color-icon-warning)]'
                                : 'bg-[var(--color-icon-danger)]/10 text-[var(--color-icon-danger)]'
                          }`}
                        >
                          {pod.phase || pod.status || 'Unknown'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-xs py-2" style={{ color: 'var(--color-muted)' }}>No pods on this node</p>
          )}

          {/* Events */}
          <DrawerTitle>Events ({events.length})</DrawerTitle>
          {events.length > 0 ? (
            <div className="overflow-x-auto -mx-4 px-4 border border-border rounded-md">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border" style={{ backgroundColor: 'var(--color-bg)' }}>
                    <th className="text-left py-2 px-2 font-medium" style={{ color: 'var(--color-muted)' }}>Summary</th>
                    <th className="text-left py-2 px-2 font-medium w-16" style={{ color: 'var(--color-muted)' }}>Count</th>
                    <th className="text-left py-2 px-2 font-medium w-20" style={{ color: 'var(--color-muted)' }}>Age</th>
                  </tr>
                </thead>
                <tbody>
                  {events.slice(0, 20).map((event, idx) => (
                    <tr key={`${event.summary}-${idx}`} className="border-b border-border last:border-b-0 hover:opacity-90">
                      <td className="py-2 px-2 align-top">
                        <p className="font-medium" style={{ color: 'var(--color-text)' }}>{event.summary}</p>
                        {event.message && <p className="mt-1 break-all" style={{ color: 'var(--color-text-secondary)' }}>{event.message}</p>}
                      </td>
                      <td className="py-2 px-2 align-top" style={{ color: 'var(--color-text)' }}>{event.count}</td>
                      <td className="py-2 px-2 align-top" style={{ color: 'var(--color-text-secondary)' }}>{event.age}</td>
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
  );
};
