import { useEffect, useMemo, useState } from 'react';
import { useReplicaSets } from '../hooks/useKubernetes';
import { useNamespace } from '../context/NamespaceContext';
import { DataTable, ReplicaSetDetailPanel } from '../components';
import type { ReplicaSet } from '../types';
import { getStatusColor, timeAgo, truncateString } from '../utils';

type ReplicaSetSortKey =
  | 'name'
  | 'namespace'
  | 'status'
  | 'desired'
  | 'current'
  | 'ready'
  | 'available'
  | 'images'
  | 'age';

export const ReplicaSetsPage = () => {
  const { data, isLoading, error } = useReplicaSets();
  const { selectedNamespaces, setNamespaces } = useNamespace();
  const [selectedReplicaSet, setSelectedReplicaSet] = useState<ReplicaSet | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [sortState, setSortState] = useState<{ key: ReplicaSetSortKey; direction: 'asc' | 'desc' }>({
    key: 'name',
    direction: 'asc',
  });

  useEffect(() => {
    if (data && data.length > 0) {
      const uniqueNamespaces = Array.from(new Set(data.map((replicaSet) => replicaSet.namespace)));
      setNamespaces(uniqueNamespaces);
    }
  }, [data, setNamespaces]);

  useEffect(() => {
    if (!data || data.length === 0) {
      setSelectedReplicaSet(null);
      return;
    }

    if (!selectedReplicaSet) {
      setSelectedReplicaSet(data[0]);
      return;
    }

    const updatedSelected = data.find(
      (item) => item.name === selectedReplicaSet.name && item.namespace === selectedReplicaSet.namespace
    );
    setSelectedReplicaSet(updatedSelected ?? data[0]);
  }, [data]);

  const getStatusTextClass = (status: string) => {
    const color = getStatusColor(status);
    if (color === 'green') return 'text-[var(--color-icon-success)]';
    if (color === 'yellow') return 'text-[var(--color-icon-warning)]';
    if (color === 'red') return 'text-[var(--color-icon-danger)]';
    return 'text-text-secondary';
  };

  const columns = [
    {
      header: 'Name',
      accessor: (row: ReplicaSet) => <span className="font-medium text-primary">{row.name}</span>,
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
      accessor: (row: ReplicaSet) => (
        <span className={`font-medium ${getStatusTextClass(row.status || 'Unknown')}`}>
          {row.status || 'Unknown'}
        </span>
      ),
      width: '10%',
      sortable: true,
      sortKey: 'status',
    },
    {
      header: 'Desired',
      accessor: 'desired' as const,
      width: '10%',
      sortable: true,
      sortKey: 'desired',
    },
    {
      header: 'Current',
      accessor: 'current' as const,
      width: '10%',
      sortable: true,
      sortKey: 'current',
    },
    {
      header: 'Ready',
      accessor: 'ready' as const,
      width: '10%',
      sortable: true,
      sortKey: 'ready',
    },
    {
      header: 'Available',
      accessor: 'available' as const,
      width: '10%',
      sortable: true,
      sortKey: 'available',
    },
    {
      header: 'Images',
      accessor: (row: ReplicaSet) =>
        truncateString(row.images?.join(', ') || '-', 25),
      width: '20%',
      sortable: true,
      sortKey: 'images',
    },
    {
      header: 'Age',
      accessor: (row: ReplicaSet) => timeAgo(row.age),
      width: '10%',
      sortable: true,
      sortKey: 'age',
    },
  ];

  const sortedReplicaSets = useMemo(() => {
    let source = [...(data || [])];
    
    // Filter by selected namespaces (if any are selected)
    if (selectedNamespaces.length > 0) {
      source = source.filter((replicaSet) => selectedNamespaces.includes(replicaSet.namespace));
    }
    
    const factor = sortState.direction === 'asc' ? 1 : -1;

    return source.sort((first, second) => {
      if (sortState.key === 'name') return first.name.localeCompare(second.name) * factor;
      if (sortState.key === 'namespace') return first.namespace.localeCompare(second.namespace) * factor;
      if (sortState.key === 'status') return (first.status || '').localeCompare(second.status || '') * factor;
      if (sortState.key === 'desired') return ((first.desired ?? 0) - (second.desired ?? 0)) * factor;
      if (sortState.key === 'current') return ((first.current ?? 0) - (second.current ?? 0)) * factor;
      if (sortState.key === 'ready') return ((first.ready ?? 0) - (second.ready ?? 0)) * factor;
      if (sortState.key === 'available') return ((first.available ?? 0) - (second.available ?? 0)) * factor;
      if (sortState.key === 'images') {
        return (first.images?.join(',') || '').localeCompare(second.images?.join(',') || '') * factor;
      }

      const firstAge = Date.parse(first.age || '');
      const secondAge = Date.parse(second.age || '');
      return ((Number.isNaN(firstAge) ? 0 : firstAge) - (Number.isNaN(secondAge) ? 0 : secondAge)) * factor;
    });
  }, [data, sortState, selectedNamespaces]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-text">ReplicaSets</h1>
        <p className="text-text-secondary mt-1">Manage ReplicaSet resources</p>
      </div>

      <DataTable
        columns={columns}
        data={sortedReplicaSets}
        isLoading={isLoading}
        error={error?.message}
        rowKey="name"
        onRowClick={(row) => {
          setSelectedReplicaSet(row);
          setPanelOpen(true);
        }}
        selectedRowKey={panelOpen ? selectedReplicaSet?.name : undefined}
        sortState={sortState}
        onSortChange={(nextSort) => setSortState(nextSort as { key: ReplicaSetSortKey; direction: 'asc' | 'desc' })}
      />

      {panelOpen && selectedReplicaSet && (
        <>
          <div
            className="fixed inset-0 z-40 bg-transparent"
            onClick={() => setPanelOpen(false)}
          />
          <ReplicaSetDetailPanel
            replicaSet={selectedReplicaSet}
            onClose={() => setPanelOpen(false)}
          />
        </>
      )}
    </div>
  );
};
