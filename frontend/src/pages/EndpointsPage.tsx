import { useState } from 'react';
import { DataTable, type SortState } from '../components/DataTable';
import { useNamespace } from '../context/NamespaceContext';
import { useEndpoints } from '../hooks/useKubernetes';
import type { Endpoint } from '../types';
import { timeAgo } from '../utils';

export const EndpointsPage = () => {
  const { data, isLoading, error } = useEndpoints();
  const { selectedNamespaces } = useNamespace();
  const [sortState, setSortState] = useState<SortState>({ key: 'name', direction: 'asc' });

  const filteredData = data?.filter((item) =>
    selectedNamespaces.length === 0 || selectedNamespaces.includes(item.namespace)
  ) ?? [];

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
        data={filteredData}
        rowKey="name"
        isLoading={isLoading}
        error={error?.message || null}
        sortState={sortState}
        onSortChange={(newSort) => setSortState(newSort)}
      />
    </div>
  );
};
