import { useEffect, useMemo, useState } from 'react';
import { useDaemonSets } from '../hooks/useKubernetes';
import { useNamespace } from '../context/NamespaceContext';
import { DaemonSetDetailPanel, DataTable } from '../components';
import type { DaemonSet } from '../types';
import { getStatusColor, timeAgo, truncateString } from '../utils';

type DaemonSetSortKey =
  | 'name'
  | 'namespace'
  | 'status'
  | 'desired'
  | 'current'
  | 'ready'
  | 'available'
  | 'images'
  | 'age';

export const DaemonSetsPage = () => {
  const { data, isLoading, error } = useDaemonSets();
  const { selectedNamespaces, setNamespaces } = useNamespace();
  const [selectedDaemonSet, setSelectedDaemonSet] = useState<DaemonSet | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [selectedRows, setSelectedRows] = useState<string[]>([]);
  const [sortState, setSortState] = useState<{ key: DaemonSetSortKey; direction: 'asc' | 'desc' }>({
    key: 'name',
    direction: 'asc',
  });

  useEffect(() => {
    if (data && data.length > 0) {
      const uniqueNamespaces = Array.from(new Set(data.map((daemonSet) => daemonSet.namespace)));
      setNamespaces(uniqueNamespaces);
    }
  }, [data, setNamespaces]);

  useEffect(() => {
    if (!data || data.length === 0) {
      setSelectedDaemonSet(null);
      return;
    }

    if (!selectedDaemonSet) {
      setSelectedDaemonSet(data[0]);
      return;
    }

    const updatedSelected = data.find(
      (item) => item.name === selectedDaemonSet.name && item.namespace === selectedDaemonSet.namespace
    );
    setSelectedDaemonSet(updatedSelected ?? data[0]);
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
      accessor: (row: DaemonSet) => <span className="font-medium text-primary">{row.name}</span>,
      width: '20%',
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
      accessor: (row: DaemonSet) => (
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
      accessor: (row: DaemonSet) =>
        truncateString(row.images?.join(', ') || '-', 20),
      width: '15%',
      sortable: true,
      sortKey: 'images',
    },
    {
      header: 'Age',
      accessor: (row: DaemonSet) => timeAgo(row.age),
      width: '10%',
      sortable: true,
      sortKey: 'age',
    },
  ];

  const sortedDaemonSets = useMemo((): (DaemonSet & { id: string })[] => {
    let source = [...(data || [])];
    
    // Filter by selected namespaces (if any are selected)
    if (selectedNamespaces.length > 0) {
      source = source.filter((daemonSet) => selectedNamespaces.includes(daemonSet.namespace));
    }
    
    // Add unique id for row selection
    source = source.map((item) => ({
      ...item,
      id: `${item.namespace}/${item.name}`,
    })) as (DaemonSet & { id: string })[];
    
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
    }) as (DaemonSet & { id: string })[];
  }, [data, sortState, selectedNamespaces]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-text">DaemonSets</h1>
        <p className="text-text-secondary mt-1">Manage DaemonSet resources</p>
      </div>

      <DataTable
        columns={columns}
        data={sortedDaemonSets}
        isLoading={isLoading}
        error={error?.message}
        rowKey="id"
        onRowClick={(row) => {
          setSelectedDaemonSet(row);
          setPanelOpen(true);
        }}
        selectedRowKey={panelOpen && selectedDaemonSet ? `${selectedDaemonSet.namespace}/${selectedDaemonSet.name}` : undefined}
        sortState={sortState}
        onSortChange={(nextSort) => setSortState(nextSort as { key: DaemonSetSortKey; direction: 'asc' | 'desc' })}
        enableRowSelection={true}
        selectedRows={selectedRows}
        onRowSelectionChange={(rows) => setSelectedRows(rows)}
      />

      {panelOpen && selectedDaemonSet && (
        <>
          <div
            className="fixed inset-0 z-40 bg-transparent"
            onClick={() => setPanelOpen(false)}
          />
          <DaemonSetDetailPanel
            daemonSet={selectedDaemonSet}
            onClose={() => setPanelOpen(false)}
          />
        </>
      )}
    </div>
  );
};
