import { useEffect, useMemo, useState } from 'react';
import { X } from '../components/Icons';
import { useRealtimeNodes, useRealtimeEvents } from '../hooks/useRealtimeResources';
import { useNodes, deleteNode, cordonNode, uncordonNode, drainNode } from '../hooks/useKubernetes';
import { DataTable } from '../components/DataTable';
import { NodeDetailPanel } from '../components/NodeDetailPanel';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { openPanelTab } from '../components/BottomPanel';
import { getAuthToken } from '../utils/auth';
import { timeAgo, formatMemoryUsedAlloc, formatCpuRange, formatK8sQuantityUsedAlloc } from '../utils';
import { compareNodeRoleSets, sortNodeRoles } from '../utils/nodeRoles';
import type { K8sNode } from '../types';

type NodeSortKey =
  | 'name'
  | 'roles'
  | 'status'
  | 'ip'
  | 'ipv6'
  | 'taints'
  | 'runtime'
  | 'os_image'
  | 'kubelet_version'
  | 'age'
  | 'cpu_used'
  | 'cpu_pct'
  | 'memory_used'
  | 'memory_pct'
  | 'disk_pct';

const usageBarWidth = (percent: number) => {
  if (percent <= 0) return 0;
  return Math.max(percent, 6);
};

const toPercent = (value?: number) => {
  if (value == null || Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(100, value));
};

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

export const NodesPage = () => {
  const { data: realtimeNodes, isLoading, error } = useRealtimeNodes();
  const { data: apiNodes } = useNodes({ refetchInterval: 2_000 }); // REST safety-net for clusters where watch is unavailable or unstable
  const { data: eventsData } = useRealtimeEvents();
  const [selectedNode, setSelectedNode] = useState<K8sNode | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [suppressedDeletedNodes, setSuppressedDeletedNodes] = useState<string[]>([]);

  // Merge realtime + REST data.
  // Realtime remains primary, while REST polling fills gaps when watch events are missing.
  const data = useMemo(() => {
    const realtime = realtimeNodes ?? [];
    const api = apiNodes ?? [];

    if (realtime.length === 0) return api;
    if (api.length === 0) return realtime;

    const realtimeByName = new Map(realtime.map((n) => [n.name, n]));
    const merged = api.map((node) => {
      const fromRealtime = realtimeByName.get(node.name);
      if (!fromRealtime) return node;
      return {
        ...fromRealtime,
        // Keep critical node state fresh from API in case websocket stream stalls.
        ready: node.ready ?? fromRealtime.ready,
        unschedulable: node.unschedulable ?? fromRealtime.unschedulable,
        taints: node.taints ?? fromRealtime.taints,
        cpu: node.cpu ?? fromRealtime.cpu,
        memory: node.memory ?? fromRealtime.memory,
        ephemeral_storage: node.ephemeral_storage ?? fromRealtime.ephemeral_storage,
        cpu_used: node.cpu_used ?? fromRealtime.cpu_used,
        memory_used: node.memory_used ?? fromRealtime.memory_used,
        ephemeral_storage_used: node.ephemeral_storage_used ?? fromRealtime.ephemeral_storage_used,
        cpu_usage_percent: node.cpu_usage_percent ?? fromRealtime.cpu_usage_percent,
        memory_usage_percent: node.memory_usage_percent ?? fromRealtime.memory_usage_percent,
        ephemeral_storage_usage_percent:
          node.ephemeral_storage_usage_percent ?? fromRealtime.ephemeral_storage_usage_percent,
      };
    });

    // Include just-seen realtime nodes until the next REST poll catches up.
    for (const node of realtime) {
      if (!merged.some((item) => item.name === node.name)) {
        merged.push(node);
      }
    }

    return merged.filter((node) => !suppressedDeletedNodes.includes(node.name));
  }, [realtimeNodes, apiNodes, suppressedDeletedNodes]);

  useEffect(() => {
    if (suppressedDeletedNodes.length === 0) return;

    // Keep suppression briefly so stale watch/REST snapshots can't re-show deleted rows.
    const timeout = window.setTimeout(() => {
      setSuppressedDeletedNodes([]);
    }, 60000);

    return () => clearTimeout(timeout);
  }, [suppressedDeletedNodes]);

  // Confirm dialog for delete/drain
  const [confirmAction, setConfirmAction] = useState<{ type: 'delete' | 'drain'; name: string } | null>(null);
  const [nodeActionLoading, setNodeActionLoading] = useState(false);
  const [nodeActionError, setNodeActionError] = useState<string | null>(null);
  const [cordonLoading, setCordonLoading] = useState(false);

  const [sortState, setSortState] = useState<{ key: NodeSortKey; direction: 'asc' | 'desc' }>({
    key: 'roles',
    direction: 'asc',
  });

  useEffect(() => {
    if (!data || data.length === 0) {
      setSelectedNode(null);
      return;
    }

    if (!selectedNode) {
      setSelectedNode(data[0]);
      return;
    }

    const updatedSelected = data.find((item) => item.name === selectedNode.name);
    setSelectedNode(updatedSelected ?? data[0]);
  }, [data]);

  const handleNodeClick = (row: K8sNode) => {
    setSelectedNode(row);
    setPanelOpen(true);
  };

  const handleOpenYaml = async (node: K8sNode) => {
    setPanelOpen(false);
    try {
      const token = getAuthToken();
      const res = await fetch(`/api/nodes/${encodeURIComponent(node.name)}/yaml`, {
        headers: token ? { Authorization: token } : {},
      });
      if (!res.ok) throw new Error(`Failed: ${res.statusText}`);
      const yaml = await res.text();
      openPanelTab({ type: 'yaml-editor', yamlContent: yaml, title: node.name });
    } catch {
      openPanelTab({ type: 'yaml-editor' });
    }
  };

  const handleOpenShell = (node: K8sNode) => {
    setSelectedNode(node);
    setPanelOpen(false);
    openPanelTab({ type: 'node-exec', podName: node.name });
  };

  const handleCordonToggle = async (node: K8sNode) => {
    setCordonLoading(true);
    setNodeActionError(null);
    try {
      if (node.unschedulable) {
        await uncordonNode(node.name);
      } else {
        await cordonNode(node.name);
      }
    } catch (err) {
      setNodeActionError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setCordonLoading(false);
    }
  };

  const handleConfirmAction = async () => {
    if (!confirmAction) return;
    const deletedNodeName = confirmAction.type === 'delete' ? confirmAction.name : null;

    if (deletedNodeName) {
      setSuppressedDeletedNodes((prev) => (prev.includes(deletedNodeName) ? prev : [...prev, deletedNodeName]));
    }

    setNodeActionLoading(true);
    setNodeActionError(null);
    try {
      if (confirmAction.type === 'delete') {
        await deleteNode(confirmAction.name);
        setSelectedNode(null);
        setPanelOpen(false);
      } else if (confirmAction.type === 'drain') {
        await drainNode(confirmAction.name);
      }
      setConfirmAction(null);
    } catch (err) {
      if (deletedNodeName) {
        setSuppressedDeletedNodes((prev) => prev.filter((name) => name !== deletedNodeName));
      }
      setNodeActionError(err instanceof Error ? err.message : 'Unknown error');
      setConfirmAction(null);
    } finally {
      setNodeActionLoading(false);
    }
  };

  const columns = [
    {
      header: 'Name',
      accessor: (row: K8sNode) => (
        <span className="font-medium text-text">{row.name}</span>
      ),
      width: '18%',
      sortable: true,
      sortKey: 'name',
    },
    {
      header: 'Status',
      accessor: (row: K8sNode) => {
        const isReady = String(row.ready).toLowerCase() === 'true';
        return (
          <span
            className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap"
            style={{
              background: isReady ? 'var(--color-status-ready-bg)' : 'var(--color-dashboard-danger-bg)',
              color: isReady ? 'var(--color-status-ready)' : 'var(--color-dashboard-danger)',
            }}
          >
            <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: 'currentColor' }} />
            {isReady ? 'Ready' : 'Not Ready'}
          </span>
        );
      },
      width: '7%',
      sortable: true,
      sortKey: 'status',
    },
    {
      header: 'IP',
      accessor: (row: K8sNode) => row.ip || '-',
      width: '12%',
      sortable: true,
      sortKey: 'ip',
    },
    {
      header: 'IPv6',
      accessor: (row: K8sNode) => row.ipv6 || '-',
      width: '14%',
      sortable: true,
      sortKey: 'ipv6',
    },
    {
      header: 'Roles',
      accessor: (row: K8sNode) => {
        const orderedRoles = sortNodeRoles(row.roles);
        if (!orderedRoles.length) return '-';
        return (
          <div className="flex flex-wrap gap-1">
            {orderedRoles.map((role) => {
              const style = getRoleBadgeStyle(role);
              return (
                <span
                  key={role}
                  className="inline-flex px-2 py-0.5 rounded text-xs font-medium border"
                  style={{
                    backgroundColor: style.bg,
                    color: style.color,
                    borderColor: style.border,
                  }}
                >
                  {role}
                </span>
              );
            })}
          </div>
        );
      },
      width: '14%',
      sortable: true,
      sortKey: 'roles',
    },
    {
      header: 'Taints',
      accessor: (row: K8sNode) => {
        const count = row.taints?.length ?? 0;
        if (count === 0) {
          return <span className="text-xs text-text-secondary">0</span>;
        }
        const tooltip = row.taints!.join('\n');
        return (
          <span
            title={tooltip}
            className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-xs font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/30 cursor-default"
          >
            {count}
          </span>
        );
      },
      width: '5%',
      sortable: true,
      sortKey: 'taints',
    },
    {
      header: 'Runtime',
      accessor: (row: K8sNode) => row.runtime || '-',
      width: '12%',
      sortable: true,
      sortKey: 'runtime',
    },
    {
      header: 'OS',
      accessor: (row: K8sNode) => (
        <span className="text-xs text-text-secondary truncate block max-w-[140px]" title={row.os_image ?? ''}>
          {row.os_image ?? '-'}
        </span>
      ),
      width: '12%',
      sortable: true,
      sortKey: 'os_image',
    },
    {
      header: 'Version',
      accessor: (row: K8sNode) => (
        <span className="text-xs font-mono text-text-secondary" title={row.kubelet_version ?? ''}>
          {row.kubelet_version ?? '-'}
        </span>
      ),
      width: '11%',
      sortable: true,
      sortKey: 'kubelet_version',
    },
    {
      header: 'CPU',
      accessor: (row: K8sNode) => {
        const used = row.cpu_used ?? '-';
        const alloc = row.cpu ?? '-';
        const label = alloc !== '-' ? formatCpuRange(used, alloc) : '-';
        const percent = toPercent(row.cpu_usage_percent);
        const hasMetrics = row.cpu_usage_percent != null;

        return (
          <div className="flex items-center gap-2 w-full">
            <span className="text-xs text-text-secondary min-w-[10.5rem] flex-shrink-0 whitespace-nowrap" title={label}>{label}</span>
            {hasMetrics ? (
              <>
                <div className="h-1.5 w-16 flex-shrink-0 rounded-full bg-hover overflow-hidden">
                  <div
                    className="h-full rounded-full bg-blue-500"
                    style={{ width: `${usageBarWidth(percent)}%` }}
                  />
                </div>
                <span className="text-xs font-medium text-text w-9 text-right flex-shrink-0">{Math.round(percent)}%</span>
              </>
            ) : (
              <span className="text-xs text-text-secondary">-</span>
            )}
          </div>
        );
      },
      width: '20%',
      sortable: true,
      sortKey: 'cpu_pct',
    },
    {
      header: 'Memory',
      accessor: (row: K8sNode) => {
        const label = formatMemoryUsedAlloc(row.memory_used, row.memory);
        const percent = toPercent(row.memory_usage_percent);
        const hasMetrics = row.memory_usage_percent != null;

        return (
          <div className="flex items-center gap-2 w-full">
            <span className="text-xs text-text-secondary min-w-[11rem] flex-shrink-0 whitespace-nowrap" title={label}>{label}</span>
            {hasMetrics ? (
              <>
                <div className="h-1.5 w-16 flex-shrink-0 rounded-full bg-hover overflow-hidden">
                  <div
                    className="h-full rounded-full bg-purple-500"
                    style={{ width: `${usageBarWidth(percent)}%` }}
                  />
                </div>
                <span className="text-xs font-medium text-text w-9 text-right flex-shrink-0">{Math.round(percent)}%</span>
              </>
            ) : (
              <span className="text-xs text-text-secondary">-</span>
            )}
          </div>
        );
      },
      width: '18%',
      sortable: true,
      sortKey: 'memory_pct',
    },
    {
      header: 'Disk',
      accessor: (row: K8sNode) => {
        const label = formatK8sQuantityUsedAlloc(row.ephemeral_storage_used, row.ephemeral_storage);
        const percent = toPercent(row.ephemeral_storage_usage_percent);
        const hasMetrics = row.ephemeral_storage_usage_percent != null;

        return (
          <div className="flex items-center gap-2 w-full">
            <span className="text-xs text-text-secondary min-w-[11rem] flex-shrink-0 whitespace-nowrap" title={label}>{label}</span>
            {hasMetrics ? (
              <>
                <div className="h-1.5 w-16 flex-shrink-0 rounded-full bg-hover overflow-hidden">
                  <div
                    className="h-full rounded-full bg-emerald-500"
                    style={{ width: `${usageBarWidth(percent)}%` }}
                  />
                </div>
                <span className="text-xs font-medium text-text w-9 text-right flex-shrink-0">{Math.round(percent)}%</span>
              </>
            ) : (
              <span className="text-xs text-text-secondary">-</span>
            )}
          </div>
        );
      },
      width: '18%',
      sortable: true,
      sortKey: 'disk_pct',
    },
    {
      header: 'Age',
      accessor: (row: K8sNode) => timeAgo(row.age),
      width: '10%',
      sortable: true,
      sortKey: 'age',
    },
  ];

  const sortedNodes = useMemo(() => {
    const source = [...(data || [])];
    const factor = sortState.direction === 'asc' ? 1 : -1;

    return source.sort((first, second) => {
      const compareNames = () => first.name.localeCompare(second.name) * factor;
      const firstStatus = String(first.ready).toLowerCase() === 'true' ? 'ready' : 'notready';
      const secondStatus = String(second.ready).toLowerCase() === 'true' ? 'ready' : 'notready';

      if (sortState.key === 'name') return compareNames();
      if (sortState.key === 'roles') {
        const comparison = compareNodeRoleSets(first.roles, second.roles);
        return comparison !== 0 ? comparison * factor : compareNames();
      }
      if (sortState.key === 'status') return firstStatus.localeCompare(secondStatus) * factor;
      if (sortState.key === 'ip') return (first.ip || '').localeCompare(second.ip || '') * factor;
      if (sortState.key === 'ipv6') return (first.ipv6 || '').localeCompare(second.ipv6 || '') * factor;
      if (sortState.key === 'cpu_used') {
        return (first.cpu_used || first.cpu || '').localeCompare(second.cpu_used || second.cpu || '', undefined, {
          numeric: true,
          sensitivity: 'base',
        }) * factor;
      }
      if (sortState.key === 'cpu_pct') {
        return (toPercent(first.cpu_usage_percent) - toPercent(second.cpu_usage_percent)) * factor;
      }
      if (sortState.key === 'memory_used') {
        return (first.memory_used || first.memory || '').localeCompare(second.memory_used || second.memory || '', undefined, {
          numeric: true,
          sensitivity: 'base',
        }) * factor;
      }
      if (sortState.key === 'memory_pct') {
        return (toPercent(first.memory_usage_percent) - toPercent(second.memory_usage_percent)) * factor;
      }
      if (sortState.key === 'disk_pct') {
        return (toPercent(first.ephemeral_storage_usage_percent) - toPercent(second.ephemeral_storage_usage_percent)) * factor;
      }
      if (sortState.key === 'taints') {
        return ((first.taints?.length ?? 0) - (second.taints?.length ?? 0)) * factor;
      }
      if (sortState.key === 'age') {
        return (first.age || '').localeCompare(second.age || '') * factor;
      }
      if (sortState.key === 'os_image') {
        return (first.os_image || '').localeCompare(second.os_image || '') * factor;
      }
      if (sortState.key === 'kubelet_version') {
        return (first.kubelet_version || '').localeCompare(second.kubelet_version || '') * factor;
      }

      return (first.runtime || '').localeCompare(second.runtime || '') * factor;
    });
  }, [data, sortState]);

  const selectedNodeEvents = useMemo(() => {
    if (!selectedNode) return [];

    return (eventsData || [])
      .filter((event) => event.involved_object === `Node/${selectedNode.name}`)
      .sort((a, b) => {
        const aTs = Date.parse(a.last_timestamp || a.first_timestamp || '');
        const bTs = Date.parse(b.last_timestamp || b.first_timestamp || '');
        return (Number.isNaN(bTs) ? 0 : bTs) - (Number.isNaN(aTs) ? 0 : aTs);
      })
      .map((event) => ({
        summary: event.reason || event.type || 'Event',
        message: event.message || '-',
        count: event.count ?? 1,
        age: timeAgo(event.last_timestamp || event.first_timestamp || ''),
      }));
  }, [selectedNode, eventsData]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-text">Nodes <span className="text-base font-normal text-text-secondary">(View cluster nodes)</span></h1>
      </div>

      <DataTable
        columns={columns}
        data={sortedNodes}
        isLoading={isLoading}
        error={error}
        rowKey="name"
        onRowClick={handleNodeClick}
        selectedRowKey={panelOpen ? selectedNode?.name : undefined}
        sortState={sortState}
        onSortChange={(nextSort) => setSortState(nextSort as { key: NodeSortKey; direction: 'asc' | 'desc' })}
      />

      {/* Node action error toast */}
      {nodeActionError && (
        <div className="fixed top-4 right-4 z-[120] flex items-center gap-2 px-4 py-2 bg-[var(--color-icon-danger)]/10 border border-[var(--color-icon-danger)]/30 rounded-lg text-sm text-[var(--color-icon-danger)] shadow-lg">
          {nodeActionError}
          <button type="button" onClick={() => setNodeActionError(null)}>
            <X size={14} />
          </button>
        </div>
      )}


      {/* Detail panel */}
      {panelOpen && selectedNode && (
        <>
          <div
            className="fixed inset-0 z-[95] bg-black/20"
            onClick={() => setPanelOpen(false)}
          />
          <NodeDetailPanel
            node={selectedNode}
            events={selectedNodeEvents}
            onClose={() => setPanelOpen(false)}
            onEditYaml={handleOpenYaml}
            onOpenShell={handleOpenShell}
            onCordonToggle={handleCordonToggle}
            onDrain={(n) => setConfirmAction({ type: 'drain', name: n.name })}
            onDelete={(n) => setConfirmAction({ type: 'delete', name: n.name })}
            cordonLoading={cordonLoading}
          />
        </>
      )}

      {/* Confirm dialog */}
      <ConfirmDialog
        open={!!confirmAction}
        title={confirmAction?.type === 'delete' ? `Delete node "${confirmAction.name}"?` : `Drain node "${confirmAction?.name}"?`}
        description={
          confirmAction?.type === 'delete'
            ? 'This will remove the node from the cluster. This action cannot be undone.'
            : 'Draining will cordon the node and evict all pods. Pods managed by a controller will be rescheduled on other nodes.'
        }
        confirmLabel={confirmAction?.type === 'delete' ? 'Delete' : 'Drain'}
        destructive
        isLoading={nodeActionLoading}
        onConfirm={handleConfirmAction}
        onCancel={() => setConfirmAction(null)}
      />
    </div>
  );
};
