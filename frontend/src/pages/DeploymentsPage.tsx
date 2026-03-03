import { useDeployments } from '../hooks/useKubernetes';
import { DataTable } from '../components/DataTable';
import type { Deployment } from '../types';
import { timeAgo, truncateString } from '../utils';

export const DeploymentsPage = () => {
  const { data, isLoading, error } = useDeployments();

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
      header: 'Ready',
      accessor: 'ready' as const,
      width: '12%',
    },
    {
      header: 'Updated',
      accessor: 'updated' as const,
      width: '10%',
    },
    {
      header: 'Available',
      accessor: 'available' as const,
      width: '10%',
    },
    {
      header: 'Images',
      accessor: (row: Deployment) =>
        truncateString(row.images?.join(', ') || '-', 30),
      width: '18%',
    },
    {
      header: 'Age',
      accessor: (row: Deployment) => timeAgo(row.age),
      width: '10%',
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-text">Deployments</h1>
        <p className="text-text-secondary mt-1">Manage Kubernetes deployments</p>
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
