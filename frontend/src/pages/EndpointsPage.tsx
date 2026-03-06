import { useState, useMemo } from 'react';
import { DataTable, type SortState } from '../components/DataTable';
import { useNamespace } from '../context/NamespaceContext';
import { useEndpoints } from '../hooks/useKubernetes';
import type { Endpoint } from '../types';
import { timeAgo } from '../utils';

export const EndpointsPage = () => {
  const { data, isLoading, error } = useEndpoints();
  const { selectedNamespaces } = useNamespace();
  const [sortState, setSortState] = useState<SortState>({ key: 'name', direction: 'asc' });

  const sortedAndFilteredData = useMemo(() => {
    if (!data) return [];
    const filtered = data.filter((item) =>
      selectedNamespaces.length === 0 || selectedNamespaces.includes(item.namespace)
    );
    const sorted = [...filtered];
    const factor = sortState.direction === 'asc' ? 1 : -1;
    sorted.sort((a, b) => {
      if (sortState.key === 'name') return String(a.name || '').localeCompare(String(b.name || '')) * factor;
      if (sortState.key === 'namespace') return String(a.namespace || '').localeCompare(String(b.namespace || '')) * factor;
      if (sortState.key === 'addresses') {
        return ((a.addresses || 0) - (b.addresses || 0)) * factor;
      }
      if (sortState.key === 'not_ready') {
        return ((a.not_ready || 0) - (b.not_ready || 0)) * factor;
      }
      if (sortState.key === 'ports') {
        return String(a.ports || '').localeCompare(String(b.ports || '')) * factor;
      }
      if (sortState.key === 'age') {
        const aTime = Date.parse(a.age || '');
        const bTime = Date.parse(b.age || '');
        return ((Number.isNaN(aTime) ? 0 : aTime) - (Number.isNaN(bTime) ? 0 : bTime)) * factor;
      }
      return 0;
    });
    return sorted;
  }, [data, sortState, selectedNamespaces]);

  const columns = [
    {
      header: 'Name',
      accessor: (item: Endpoint) => <span className="font-medium text-primary">{item.name}</span>,
      width: '24%',
      sortable: true,
      sortKey: 'name',
    },
    {
      header: 'Namespace',
      accessor: 'namespace' as const,
      width: '18%',
      sortable: true,
      sortKey: 'namespace',
    },
    {
      header: 'Ready',
      accessor: 'addresses' as const,
      width: '10%',
      sortable: true,
      sortKey: 'addresses',
    },
    {
      header: 'Not Ready',
      accessor: 'not_ready' as const,
      width: '12%',
      sortable: true,
      sortKey: 'not_ready',
    },
    {
      header: 'Ports',
      accessor: 'ports' as const,
      width: '24%',
      sortable: true,
      sortKey: 'ports',
    },
    {
      header: 'Age',
      accessor: (item: Endpoint) => timeAgo(item.age),
      width: '12%',
      sortable: true,
      sortKey: 'age',
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-text">Endpoints</h1>
        <p className="text-text-secondary mt-1">Inspect endpoint addresses and ports</p>
      </div>

      <DataTable
        columns={columns}
        data={sortedAndFilteredData}
        rowKey={(row) => `${row.namespace}/${row.name}`}
        isLoading={isLoading}
        error={error?.message || null}
        sortState={sortState}
        onSortChange={(newSort) => setSortState(newSort)}
      />
    </div>
  );
};
