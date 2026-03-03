import { usePods } from '../hooks/useKubernetes';
import { DataTable } from '../components/DataTable';
import { StatusBadge } from '../components/StatusBadge';
import type { Pod } from '../types';
import { timeAgo } from '../utils';

export const PodsPage = () => {
  const { data, isLoading, error } = usePods();

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
      header: 'Status',
      accessor: (row: Pod) => <StatusBadge status={row.status || row.phase || 'Unknown'} />,
      width: '12%',
    },
    {
      header: 'Ready',
      accessor: 'ready' as const,
      width: '10%',
    },
    {
      header: 'Restarts',
      accessor: 'restarts' as const,
      width: '10%',
    },
    {
      header: 'Age',
      accessor: (row: Pod) => timeAgo(row.age),
      width: '14%',
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-text">Pods</h1>
        <p className="text-text-secondary mt-1">View all pods in the cluster</p>
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
