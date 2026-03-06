import { useClusterRoles } from '../hooks/useKubernetes';
import { DataTable } from '../components/DataTable';
import type { ClusterRole } from '../types';
import { timeAgo } from '../utils';

export const ClusterRolesPage = () => {
  const { data, isLoading, error } = useClusterRoles();

  const columns = [
    {
      header: 'Name',
      accessor: 'name' as const,
      width: '40%',
    },
    {
      header: 'Rules',
      accessor: 'rules' as const,
      width: '30%',
    },
    {
      header: 'Age',
      accessor: (cr: ClusterRole) => timeAgo(cr.age),
      width: '30%',
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-text">Cluster Roles</h1>
        <p className="text-text-secondary mt-1">
          Cluster-wide RBAC roles defining permissions across all namespaces.
        </p>
      </div>

      <DataTable
        data={data || []}
        columns={columns}
        isLoading={isLoading}
        error={error?.message}
        rowKey="name"
      />
    </div>
  );
};
