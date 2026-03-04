import { useEffect, useMemo, useState } from 'react';
import { usePods } from '../hooks/useKubernetes';
import { useNamespace } from '../context/NamespaceContext';
import { DataTable } from '../components/DataTable';
import { PodDetailPanel } from '../components/PodDetailPanel';
import { StatusBadge } from '../components/StatusBadge';
import type { Pod } from '../types';
import { timeAgo } from '../utils';

type PodSortKey = 'name' | 'namespace' | 'status' | 'ready' | 'restarts' | 'age';

export const PodsPage = () => {
  const { data, isLoading, error } = usePods();
  const { selectedNamespaces, setNamespaces } = useNamespace();
  const [selectedPod, setSelectedPod] = useState<Pod | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [selectedRows, setSelectedRows] = useState<string[]>([]);
  const [sortState, setSortState] = useState<{ key: PodSortKey; direction: 'asc' | 'desc' }>({
    key: 'name',
    direction: 'asc',
  });

  useEffect(() => {
    if (data && data.length > 0) {
      const uniqueNamespaces = Array.from(new Set(data.map((pod) => pod.namespace)));
      setNamespaces(uniqueNamespaces);
    }
  }, [data, setNamespaces]);

  useEffect(() => {
    if (!data || data.length === 0) {
      setSelectedPod(null);
      return;
    }

    if (!selectedPod) {
      setSelectedPod(data[0]);
      return;
    }

    const updatedSelected = data.find((item) => item.name === selectedPod.name && item.namespace === selectedPod.namespace);
    setSelectedPod(updatedSelected ?? data[0]);
  }, [data]);

  const columns = [
    {
      header: 'Name',
      accessor: (row: Pod) => (
        <span className="font-medium text-primary">{row.name}</span>
      ),
      width: '25%',
      sortable: true,
      sortKey: 'name',
    },
    {
      header: 'Namespace',
      accessor: 'namespace' as const,
      width: '15%',
      sortable: true,
      sortKey: 'namespace',
    },
    {
      header: 'Status',
      accessor: (row: Pod) => <StatusBadge status={row.status || row.phase || 'Unknown'} />,
      width: '12%',
      sortable: true,
      sortKey: 'status',
    },
    {
      header: 'Ready',
      accessor: 'ready' as const,
      width: '10%',
      sortable: true,
      sortKey: 'ready',
    },
    {
      header: 'Restarts',
      accessor: 'restarts' as const,
      width: '10%',
      sortable: true,
      sortKey: 'restarts',
    },
    {
      header: 'Age',
      accessor: (row: Pod) => timeAgo(row.age),
      width: '14%',
      sortable: true,
      sortKey: 'age',
    },
  ];

  const sortedPods = useMemo(() => {
    let source = [...(data || [])];
    
    // Filter by selected namespaces (if any are selected)
    if (selectedNamespaces.length > 0) {
      source = source.filter((pod) => selectedNamespaces.includes(pod.namespace));
    }
    
    const factor = sortState.direction === 'asc' ? 1 : -1;

    return source.sort((first, second) => {
      const firstStatus = first.status || first.phase || '';
      const secondStatus = second.status || second.phase || '';

      if (sortState.key === 'name') return first.name.localeCompare(second.name) * factor;
      if (sortState.key === 'namespace') return first.namespace.localeCompare(second.namespace) * factor;
      if (sortState.key === 'status') return firstStatus.localeCompare(secondStatus) * factor;
      if (sortState.key === 'ready') return (first.ready || '').localeCompare(second.ready || '') * factor;
      if (sortState.key === 'restarts') return ((first.restarts ?? 0) - (second.restarts ?? 0)) * factor;

      const firstAge = Date.parse(first.age || '');
      const secondAge = Date.parse(second.age || '');
      return ((Number.isNaN(firstAge) ? 0 : firstAge) - (Number.isNaN(secondAge) ? 0 : secondAge)) * factor;
    });
  }, [data, sortState, selectedNamespaces]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-text">Pods</h1>
        <p className="text-text-secondary mt-1">View all pods in the cluster</p>
      </div>

      <DataTable
        columns={columns}
        data={sortedPods}
        isLoading={isLoading}
        error={error?.message}
        rowKey="name"
        onRowClick={(row) => {
          setSelectedPod(row);
          setPanelOpen(true);
        }}
        selectedRowKey={panelOpen ? selectedPod?.name : undefined}
        sortState={sortState}
        onSortChange={(nextSort) => setSortState(nextSort as { key: PodSortKey; direction: 'asc' | 'desc' })}
        enableRowSelection={true}
        selectedRows={selectedRows}
        onRowSelectionChange={(rows) => setSelectedRows(rows)}
      />

      {panelOpen && selectedPod && (
        <>
          <div
            className="fixed inset-0 z-40 bg-transparent"
            onClick={() => setPanelOpen(false)}
          />
          <PodDetailPanel
            pod={selectedPod}
            onClose={() => setPanelOpen(false)}
          />
        </>
      )}
    </div>
  );
};
