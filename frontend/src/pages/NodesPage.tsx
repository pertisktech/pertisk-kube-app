import { useEffect, useMemo, useState } from 'react';
import { useNodes } from '../hooks/useKubernetes';
import { DataTable } from '../components/DataTable';
import { NodeDetailPanel } from '../components/NodeDetailPanel';
import { StatusBadge } from '../components/StatusBadge';
import type { K8sNode } from '../types';

type NodeSortKey = 'name' | 'status' | 'ip' | 'ipv6' | 'taints' | 'runtime';

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
      width: '14%',
      sortable: true,
      sortKey: 'runtime',
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
            className="fixed inset-0 z-40 bg-transparent"
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
