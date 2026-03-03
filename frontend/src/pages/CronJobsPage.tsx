import { useCronJobs } from '../hooks/useKubernetes';
import { DataTable } from '../components/DataTable';
import type { CronJob } from '../types';
import { timeAgo } from '../utils';

export const CronJobsPage = () => {
  const { data, isLoading, error } = useCronJobs();

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
      header: 'Schedule',
      accessor: 'schedule' as const,
      width: '20%',
    },
    {
      header: 'Suspend',
      accessor: (row: CronJob) => (row.suspend ? 'Yes' : 'No'),
      width: '10%',
    },
    {
      header: 'Active',
      accessor: 'active' as const,
      width: '10%',
    },
    {
      header: 'Last Schedule',
      accessor: 'last_schedule' as const,
      width: '10%',
    },
    {
      header: 'Age',
      accessor: (row: CronJob) => timeAgo(row.age),
      width: '10%',
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-text">CronJobs</h1>
        <p className="text-text-secondary mt-1">Manage CronJob resources</p>
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
