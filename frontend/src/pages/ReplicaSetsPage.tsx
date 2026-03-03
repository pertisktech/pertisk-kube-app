import { useReplicaSets } from '../hooks/useKubernetes';
import { DataTable } from '../components/DataTable';
import type { ReplicaSet } from '../types';
import { timeAgo, truncateString } from '../utils';

export const ReplicaSetsPage = () => {
  const { data, isLoading, error } = useReplicaSets();

  const columns = [
    {
      header: 'Name',
      accessor: 'name' as const,
      width: '25%',
    },
    {
      header: 'Namespace',
      accessor: 'namespace' as const,
      width: '15%',
    },
    {
      header: 'Desired',
      accessor: 'desired' as const,
      width: '10%',
    },
    {
      header: 'Current',
      accessor: 'current' as const,
      width: '10%',
    },
    {
      header: 'Ready',
      accessor: 'ready' as const,
      width: '10%',
    },
    {
      header: 'Images',
      accessor: (row: ReplicaSet) =>
        truncateString(row.images?.join(', ') || '-', 25),
      width: '20%',
    },
    {
      header: 'Age',
      accessor: (row: ReplicaSet) => timeAgo(row.age),
      width: '10%',
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-text">ReplicaSets</h1>
        <p className="text-text-secondary mt-1">Manage ReplicaSet resources</p>
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
