import { useJobs } from '../hooks/useKubernetes';
import { DataTable } from '../components/DataTable';
import type { Job } from '../types';
import { timeAgo } from '../utils';

export const JobsPage = () => {
  const { data, isLoading, error } = useJobs();

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
      header: 'Completions',
      accessor: 'completions' as const,
      width: '20%',
    },
    {
      header: 'Duration',
      accessor: 'duration' as const,
      width: '15%',
    },
    {
      header: 'Age',
      accessor: (row: Job) => timeAgo(row.age),
      width: '15%',
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-text">Jobs</h1>
        <p className="text-text-secondary mt-1">Manage Kubernetes jobs</p>
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
