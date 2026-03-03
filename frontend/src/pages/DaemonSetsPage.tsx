import { useDaemonSets } from '../hooks/useKubernetes';
import { DataTable } from '../components/DataTable';
import type { DaemonSet } from '../types';
import { timeAgo, truncateString } from '../utils';

export const DaemonSetsPage = () => {
  const { data, isLoading, error } = useDaemonSets();

  const columns = [
    {
      header: 'Name',
      accessor: 'name' as const,
      width: '20%',
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
      header: 'Available',
      accessor: 'available' as const,
      width: '10%',
    },
    {
      header: 'Images',
      accessor: (row: DaemonSet) =>
        truncateString(row.images?.join(', ') || '-', 20),
      width: '15%',
    },
    {
      header: 'Age',
      accessor: (row: DaemonSet) => timeAgo(row.age),
      width: '10%',
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-text">DaemonSets</h1>
        <p className="text-text-secondary mt-1">Manage DaemonSet resources</p>
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
