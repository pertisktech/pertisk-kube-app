import { useStatefulSets } from '../hooks/useKubernetes';
import { DataTable } from '../components/DataTable';
import type { StatefulSet } from '../types';
import { timeAgo } from '../utils';

export const StatefulSetsPage = () => {
  const { data, isLoading, error } = useStatefulSets();

  const columns = [
    {
      header: 'Name',
      accessor: 'name' as const,
      width: '30%',
    },
    {
      header: 'Namespace',
      accessor: 'namespace' as const,
      width: '20%',
    },
    {
      header: 'Ready',
      accessor: 'ready' as const,
      width: '20%',
    },
    {
      header: 'Age',
      accessor: (row: StatefulSet) => timeAgo(row.age),
      width: '30%',
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-text">StatefulSets</h1>
        <p className="text-text-secondary mt-1">Manage StatefulSet resources</p>
      </div>

      <DataTable
        columns={columns}
        data={data || []}
        isLoading={isLoading}
        error={error?.message}
        rowKey="name"
      />
    </div>
  );
};
