import { useState } from 'react';
import { useLeases } from '../hooks/useKubernetes';
import { useNamespace } from '../context/NamespaceContext';
import { DataTable, type SortState } from '../components/DataTable';
import type { Lease } from '../types';
import { timeAgo } from '../utils';

export const LeasesPage = () => {
  const { data, isLoading, error } = useLeases();
  const { selectedNamespaces } = useNamespace();
  const [sortState, setSortState] = useState<SortState>({ key: 'name', direction: 'asc' });

  const filteredData = data?.filter((lease) =>
    selectedNamespaces.length === 0 || selectedNamespaces.includes(lease.namespace)
  ) ?? [];

  const columns = [
    {
      header: 'Name',
      accessor: (lease: Lease) => <span className="font-medium text-primary">{lease.name}</span>,
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
      header: 'Holder Identity',
      accessor: (lease: Lease) => (
        <span className="text-text-secondary text-sm font-mono">
          {lease.holder_identity || '-'}
        </span>
      ),
      width: '30%',
      sortable: true,
      sortKey: 'holder_identity',
    },
    {
      header: 'Duration (s)',
      accessor: 'lease_duration_seconds' as const,
      width: '15%',
      sortable: true,
      sortKey: 'lease_duration_seconds',
    },
    {
      header: 'Age',
      accessor: (lease: Lease) => timeAgo(lease.age),
      width: '15%',
      sortable: true,
      sortKey: 'age',
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-text">Leases</h1>
        <p className="text-text-secondary mt-1">Manage Kubernetes Leases</p>
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
