import { useEffect, useMemo, useState } from 'react';
import { useStatefulSets } from '../hooks/useKubernetes';
import { useNamespace } from '../context/NamespaceContext';
import { DataTable, StatefulSetDetailPanel } from '../components';
import type { StatefulSet } from '../types';
import { getStatusColor, timeAgo, truncateString } from '../utils';

type StatefulSetSortKey = 'name' | 'namespace' | 'status' | 'ready' | 'current' | 'updated' | 'images' | 'age';

export const StatefulSetsPage = () => {
  const { data, isLoading, error } = useStatefulSets();
  const { selectedNamespaces, setNamespaces } = useNamespace();
  const [selectedStatefulSet, setSelectedStatefulSet] = useState<StatefulSet | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [sortState, setSortState] = useState<{ key: StatefulSetSortKey; direction: 'asc' | 'desc' }>({
    key: 'name',
    direction: 'asc',
  });

  useEffect(() => {
    if (data && data.length > 0) {
      const uniqueNamespaces = Array.from(new Set(data.map((statefulSet) => statefulSet.namespace)));
      setNamespaces(uniqueNamespaces);
    }
  }, [data, setNamespaces]);

  useEffect(() => {
    if (!data || data.length === 0) {
      setSelectedStatefulSet(null);
      return;
    }

    if (!selectedStatefulSet) {
      setSelectedStatefulSet(data[0]);
      return;
    }

    const updatedSelected = data.find(
      (item) => item.name === selectedStatefulSet.name && item.namespace === selectedStatefulSet.namespace
    );
    setSelectedStatefulSet(updatedSelected ?? data[0]);
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
      accessor: (row: StatefulSet) => <span className="font-medium text-primary">{row.name}</span>,
      width: '22%',
      sortable: true,
      sortKey: 'name',
    },
    {
      header: 'Namespace',
      accessor: 'namespace' as const,
      width: '14%',
      sortable: true,
      sortKey: 'namespace',
    },
    {
      header: 'Status',
      accessor: (row: StatefulSet) => (
        <span className={`font-medium ${getStatusTextClass(row.status || 'Unknown')}`}>
          {row.status || 'Unknown'}
        </span>
      ),
      width: '10%',
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
      header: 'Current',
      accessor: 'current' as const,
      width: '10%',
      sortable: true,
      sortKey: 'current',
    },
    {
      header: 'Updated',
      accessor: 'updated' as const,
      width: '10%',
      sortable: true,
      sortKey: 'updated',
    },
    {
      header: 'Images',
      accessor: (row: StatefulSet) => truncateString(row.images?.join(', ') || '-', 24),
      width: '14%',
      sortable: true,
      sortKey: 'images',
    },
    {
      header: 'Age',
      accessor: (row: StatefulSet) => timeAgo(row.age),
      width: '10%',
      sortable: true,
      sortKey: 'age',
    },
  ];

  const sortedStatefulSets = useMemo(() => {
    let source = [...(data || [])];
    
    // Filter by selected namespaces (if any are selected)
    if (selectedNamespaces.length > 0) {
      source = source.filter((statefulSet) => selectedNamespaces.includes(statefulSet.namespace));
    }
    
    const factor = sortState.direction === 'asc' ? 1 : -1;

    return source.sort((first, second) => {
      if (sortState.key === 'name') return first.name.localeCompare(second.name) * factor;
      if (sortState.key === 'namespace') return first.namespace.localeCompare(second.namespace) * factor;
      if (sortState.key === 'status') return (first.status || '').localeCompare(second.status || '') * factor;
      if (sortState.key === 'ready') return (first.ready || '').localeCompare(second.ready || '') * factor;
      if (sortState.key === 'current') return ((first.current ?? 0) - (second.current ?? 0)) * factor;
      if (sortState.key === 'updated') return ((first.updated ?? 0) - (second.updated ?? 0)) * factor;
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
        <h1 className="text-3xl font-bold text-text">StatefulSets</h1>
        <p className="text-text-secondary mt-1">Manage StatefulSet resources</p>
      </div>

      <DataTable
        columns={columns}
        data={sortedStatefulSets}
        isLoading={isLoading}
        error={error?.message}
        rowKey="name"
        onRowClick={(row) => {
          setSelectedStatefulSet(row);
          setPanelOpen(true);
        }}
        selectedRowKey={panelOpen ? selectedStatefulSet?.name : undefined}
        sortState={sortState}
        onSortChange={(nextSort) =>
          setSortState(nextSort as { key: StatefulSetSortKey; direction: 'asc' | 'desc' })
        }
      />

      {panelOpen && selectedStatefulSet && (
        <>
          <div
            className="fixed inset-0 z-40 bg-transparent"
            onClick={() => setPanelOpen(false)}
          />
          <StatefulSetDetailPanel
            statefulSet={selectedStatefulSet}
            onClose={() => setPanelOpen(false)}
          />
        </>
      )}
    </div>
  );
};
