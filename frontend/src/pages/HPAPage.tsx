import { useState } from 'react';
import { useHPA } from '../hooks/useKubernetes';
import { useNamespace } from '../context/NamespaceContext';
import { DataTable, type SortState } from '../components/DataTable';
import type { HPA } from '../types';
import { timeAgo } from '../utils';

export const HPAPage = () => {
  const { data, isLoading, error } = useHPA();
  const { selectedNamespaces } = useNamespace();
  const [sortState, setSortState] = useState<SortState>({ key: 'name', direction: 'asc' });

  const filteredData = data?.filter((hpa) =>
    selectedNamespaces.length === 0 || selectedNamespaces.includes(hpa.namespace)
  ) ?? [];

  const columns = [
    {
      header: 'Name',
      accessor: (hpa: HPA) => <span className="font-medium text-primary">{hpa.name}</span>,
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
      header: 'Reference',
      accessor: (hpa: HPA) => (
        <span className="text-text-secondary text-sm">{hpa.reference || '-'}</span>
      ),
      width: '15%',
      sortable: true,
      sortKey: 'reference',
    },
    {
      header: 'Current / Min-Max',
      accessor: (hpa: HPA) => (
        <span className="text-text-secondary">
          {hpa.current_replicas} / {hpa.min_replicas}-{hpa.max_replicas}
        </span>
      ),
      width: '20%',
      sortable: true,
      sortKey: 'current_replicas',
    },
    {
      header: 'Targets',
      accessor: 'targets' as const,
      width: '15%',
      sortable: true,
      sortKey: 'targets',
    },
    {
      header: 'Age',
      accessor: (hpa: HPA) => timeAgo(hpa.age),
      width: '15%',
      sortable: true,
      sortKey: 'age',
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-text">HPA</h1>
        <p className="text-text-secondary mt-1">Manage Horizontal Pod Autoscalers</p>
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
