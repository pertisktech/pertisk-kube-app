import { useEffect, useMemo, useState } from 'react';
import { useNodes } from '../hooks/useKubernetes';
import { DataTable } from '../components/DataTable';
import { NodeDetailPanel } from '../components/NodeDetailPanel';
import { StatusBadge } from '../components/StatusBadge';
import type { K8sNode } from '../types';

type NodeSortKey =
  | 'name'
  | 'status'
  | 'ip'
  | 'ipv6'
  | 'taints'
  | 'runtime'
  | 'cpu_used'
  | 'cpu_pct'
  | 'memory_used'
  | 'memory_pct';

const usageBarColor = (percent: number) => {
  if (percent >= 90) return '#ef4444';
  if (percent >= 70) return '#f59e0b';
  return '#3b82f6';
};

const usageBarWidth = (percent: number) => {
  if (percent <= 0) return 0;
  return Math.max(percent, 6);
};

const toPercent = (value?: number) => {
  if (value == null || Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(100, value));
};

export const NodesPage = () => {
  const { data, isLoading, error } = useNodes();
  const [selectedNode, setSelectedNode] = useState<K8sNode | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [selectedRows, setSelectedRows] = useState<string[]>([]);
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
      width: '10%',
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
      accessor: (row: K8sNode) => row.taints?.join(', ') || '-',
      width: '18%',
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
      header: 'CPU(cores)',
      accessor: (row: K8sNode) => row.cpu_used || row.cpu || '-',
      width: '10%',
      sortable: true,
      sortKey: 'cpu_used',
    },
    {
      header: 'CPU(%)',
      accessor: (row: K8sNode) => {
        const percent = toPercent(row.cpu_usage_percent);
        const hasMetrics = row.cpu_usage_percent != null;

        if (!hasMetrics) {
          return <span className="text-text-secondary">-</span>;
        }

        return (
          <div className="flex items-center gap-2 min-w-[120px]">
            <div className="h-2 flex-1 rounded-full bg-hover overflow-hidden">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${usageBarWidth(percent)}%`,
                  backgroundColor: usageBarColor(percent),
                }}
              />
            </div>
            <span className="text-xs font-medium text-text w-10 text-right">{Math.round(percent)}%</span>
          </div>
        );
      },
      width: '12%',
      sortable: true,
      sortKey: 'cpu_pct',
    },
    {
      header: 'MEMORY(bytes)',
      accessor: (row: K8sNode) => row.memory_used || row.memory || '-',
      width: '11%',
      sortable: true,
      sortKey: 'memory_used',
    },
    {
      header: 'MEMORY(%)',
      accessor: (row: K8sNode) => {
        const percent = toPercent(row.memory_usage_percent);
        const hasMetrics = row.memory_usage_percent != null;

        if (!hasMetrics) {
          return <span className="text-text-secondary">-</span>;
        }

        return (
          <div className="flex items-center gap-2 min-w-[120px]">
            <div className="h-2 flex-1 rounded-full bg-hover overflow-hidden">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${usageBarWidth(percent)}%`,
                  backgroundColor: usageBarColor(percent),
                }}
              />
            </div>
            <span className="text-xs font-medium text-text w-10 text-right">{Math.round(percent)}%</span>
          </div>
        );
      },
      width: '12%',
      sortable: true,
      sortKey: 'memory_pct',
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
        return (first.taints?.join(',') || '').localeCompare(second.taints?.join(',') || '') * factor;
      }

      return (first.runtime || '').localeCompare(second.runtime || '') * factor;
    });
  }, [data, sortState]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-text">Nodes</h1>
        <p className="text-text-secondary mt-1">View cluster nodes</p>
      </div>

      <DataTable
        columns={columns}
        data={sortedNodes}
        isLoading={isLoading}
        error={error?.message}
        rowKey="name"
        onRowClick={(row) => {
          setSelectedNode(row);
          setPanelOpen(true);
        }}
        selectedRowKey={panelOpen ? selectedNode?.name : undefined}
        sortState={sortState}
        onSortChange={(nextSort) => setSortState(nextSort as { key: NodeSortKey; direction: 'asc' | 'desc' })}
        enableRowSelection={true}
        selectedRows={selectedRows}
        onRowSelectionChange={(rows) => setSelectedRows(rows)}
      />

      {panelOpen && selectedNode && (
        <>
          <div
            className="fixed inset-0 z-[95] bg-black/20"
            onClick={() => setPanelOpen(false)}
          />
          <NodeDetailPanel
            node={selectedNode}
            onClose={() => setPanelOpen(false)}
          />
        </>
      )}
    </div>
  );
};
