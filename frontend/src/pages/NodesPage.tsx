import { useEffect, useMemo, useState } from 'react';
import { X } from '../components/Icons';
import { useRealtimeNodes, useRealtimeEvents } from '../hooks/useRealtimeResources';
import { useNodes } from '../hooks/useKubernetes';
import { deleteNode, cordonNode, uncordonNode, drainNode } from '../hooks/useKubernetes';
import { DataTable } from '../components/DataTable';
import { NodeDetailPanel } from '../components/NodeDetailPanel';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { StatusBadge } from '../components/StatusBadge';
import { openPanelTab } from '../components/BottomPanel';
import { getAuthToken } from '../utils/auth';
import { timeAgo, formatMemoryUsedAlloc } from '../utils';
import type { K8sNode } from '../types';

type NodeSortKey =
  | 'name'
  | 'status'
  | 'ip'
  | 'ipv6'
  | 'taints'
  | 'runtime'
  | 'age'
  | 'cpu_used'
  | 'cpu_pct'
  | 'memory_used'
  | 'memory_pct';

const usageBarWidth = (percent: number) => {
  if (percent <= 0) return 0;
  return Math.max(percent, 6);
};

const toPercent = (value?: number) => {
  if (value == null || Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(100, value));
};

export const NodesPage = () => {
  const { data: realtimeNodes, isLoading, error } = useRealtimeNodes();
  const { data: apiNodes } = useNodes({ refetchInterval: 30_000 }); // REST: metrics from metrics.k8s.io (like kubectl top nodes), poll every 30s
  const { data: eventsData } = useRealtimeEvents();
  const [selectedNode, setSelectedNode] = useState<K8sNode | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);

  // Merge metrics (cpu/memory used + %) from REST into realtime node list
  const data = useMemo(() => {
    if (!realtimeNodes?.length) return realtimeNodes ?? [];
    const byName = new Map((apiNodes ?? []).map((n) => [n.name, n]));
    return realtimeNodes.map((node) => {
      const fromApi = byName.get(node.name);
      if (!fromApi) return node;
      return {
        ...node,
        cpu: fromApi.cpu ?? node.cpu,
        memory: fromApi.memory ?? node.memory,
        cpu_used: fromApi.cpu_used ?? node.cpu_used,
        memory_used: fromApi.memory_used ?? node.memory_used,
        cpu_usage_percent: fromApi.cpu_usage_percent ?? node.cpu_usage_percent,
        memory_usage_percent: fromApi.memory_usage_percent ?? node.memory_usage_percent,
      };
    });
  }, [realtimeNodes, apiNodes]);

  // Confirm dialog for delete/drain
  const [confirmAction, setConfirmAction] = useState<{ type: 'delete' | 'drain'; name: string } | null>(null);
  const [nodeActionLoading, setNodeActionLoading] = useState(false);
  const [nodeActionError, setNodeActionError] = useState<string | null>(null);
  const [cordonLoading, setCordonLoading] = useState(false);

  const [sortState, setSortState] = useState<{ key: NodeSortKey; direction: 'asc' | 'desc' }>({
    key: 'name',
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
      accessor: (row: K8sNode) => (
        <StatusBadge status={String(row.ready).toLowerCase() === 'true' ? 'Ready' : 'NotReady'} />
      ),
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
      accessor: (row: K8sNode) => row.roles.join(', ') || '-',
      width: '14%',
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
      header: 'CPU',
      accessor: (row: K8sNode) => {
        const used = row.cpu_used ?? '-';
        const alloc = row.cpu ?? '-';
        const label = alloc !== '-' ? `${used}/${alloc}` : '-';
        const percent = toPercent(row.cpu_usage_percent);
        const hasMetrics = row.cpu_usage_percent != null;

        return (
          <div className="flex items-center gap-2 w-full">
            <span className="text-xs text-text-secondary w-[5rem] flex-shrink-0 truncate" title={label}>{label}</span>
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
      width: '18%',
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
      const firstStatus = String(first.ready).toLowerCase() === 'true' ? 'ready' : 'notready';
      const secondStatus = String(second.ready).toLowerCase() === 'true' ? 'ready' : 'notready';

      if (sortState.key === 'name') return first.name.localeCompare(second.name) * factor;
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
      if (sortState.key === 'taints') {
        return ((first.taints?.length ?? 0) - (second.taints?.length ?? 0)) * factor;
      }
      if (sortState.key === 'age') {
        return (first.age || '').localeCompare(second.age || '') * factor;
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
