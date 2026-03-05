import { useState } from 'react';
import { useLimitRanges } from '../hooks/useKubernetes';
import { useNamespace } from '../context/NamespaceContext';
import { DataTable, type SortState } from '../components/DataTable';
import type { LimitRange } from '../types';
import { timeAgo } from '../utils';

export const LimitRangesPage = () => {
  const { data, isLoading, error } = useLimitRanges();
  const { selectedNamespaces } = useNamespace();
  const [sortState, setSortState] = useState<SortState>({ key: 'name', direction: 'asc' });

  const filteredData = data?.filter((lr) =>
    selectedNamespaces.length === 0 || selectedNamespaces.includes(lr.namespace)
  ) ?? [];

  const columns = [
    {
      header: 'Name',
      accessor: (lr: LimitRange) => <span className="font-medium text-primary">{lr.name}</span>,
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
      header: 'Limits',
      accessor: 'limits' as const,
      width: '20%',
      sortable: true,
      sortKey: 'limits',
    },
    {
      header: 'Age',
      accessor: (lr: LimitRange) => timeAgo(lr.age),
      width: '20%',
      sortable: true,
      sortKey: 'age',
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-text">Limit Ranges</h1>
        <p className="text-text-secondary mt-1">Manage Kubernetes Limit Ranges</p>
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
