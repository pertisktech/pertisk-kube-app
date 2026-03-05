import { useState } from 'react';
import { useResourceQuotas } from '../hooks/useKubernetes';
import { useNamespace } from '../context/NamespaceContext';
import { DataTable, type SortState } from '../components/DataTable';
import type { ResourceQuota } from '../types';
import { timeAgo } from '../utils';

export const ResourceQuotasPage = () => {
  const { data, isLoading, error } = useResourceQuotas();
  const { selectedNamespaces } = useNamespace();
  const [sortState, setSortState] = useState<SortState>({ key: 'name', direction: 'asc' });

  const filteredData = data?.filter((rq) =>
    selectedNamespaces.length === 0 || selectedNamespaces.includes(rq.namespace)
  ) ?? [];

  const columns = [
    {
      header: 'Name',
      accessor: (rq: ResourceQuota) => <span className="font-medium text-primary">{rq.name}</span>,
      width: '30%',
      sortable: true,
      sortKey: 'name',
    },
    {
      header: 'Namespace',
      accessor: 'namespace' as const,
      width: '25%',
      sortable: true,
      sortKey: 'namespace',
    },
    {
      header: 'Status',
      accessor: (rq: ResourceQuota) => (
        <span className="inline-block px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm">
          {rq.status}
        </span>
      ),
      width: '20%',
      sortable: true,
      sortKey: 'status',
    },
    {
      header: 'Age',
      accessor: (rq: ResourceQuota) => timeAgo(rq.age),
      width: '20%',
      sortable: true,
      sortKey: 'age',
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-text">Resource Quotas</h1>
        <p className="text-text-secondary mt-1">Manage Kubernetes Resource Quotas</p>
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
