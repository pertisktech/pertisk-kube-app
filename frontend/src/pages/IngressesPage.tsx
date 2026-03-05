import { useState } from 'react';
import { DataTable, type SortState } from '../components/DataTable';
import { useNamespace } from '../context/NamespaceContext';
import { useIngresses } from '../hooks/useKubernetes';
import type { Ingress } from '../types';
import { timeAgo } from '../utils';

export const IngressesPage = () => {
  const { data, isLoading, error } = useIngresses();
  const { selectedNamespaces } = useNamespace();
  const [sortState, setSortState] = useState<SortState>({ key: 'name', direction: 'asc' });

  const filteredData = data?.filter((item) =>
    selectedNamespaces.length === 0 || selectedNamespaces.includes(item.namespace)
  ) ?? [];

  const columns = [
    {
      header: 'Name',
      accessor: (item: Ingress) => <span className="font-medium text-primary">{item.name}</span>,
      width: '20%',
      sortable: true,
      sortKey: 'name',
    },
    {
      header: 'Namespace',
      accessor: 'namespace' as const,
      width: '16%',
      sortable: true,
      sortKey: 'namespace',
    },
    {
      header: 'Class',
      accessor: 'ingress_class' as const,
      width: '14%',
      sortable: true,
      sortKey: 'ingress_class',
    },
    {
      header: 'Hosts',
      accessor: 'hosts' as const,
      width: '20%',
      sortable: true,
      sortKey: 'hosts',
    },
    {
      header: 'Address',
      accessor: 'address' as const,
      width: '16%',
      sortable: true,
      sortKey: 'address',
    },
    {
      header: 'Rules',
      accessor: 'rules' as const,
      width: '6%',
      sortable: true,
      sortKey: 'rules',
    },
    {
      header: 'Age',
      accessor: (item: Ingress) => timeAgo(item.age),
      width: '8%',
      sortable: true,
      sortKey: 'age',
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-text">Ingresses</h1>
        <p className="text-text-secondary mt-1">View ingress hosts, addresses, and rules</p>
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
