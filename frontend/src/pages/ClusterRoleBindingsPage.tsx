import { useClusterRoleBindings } from '../hooks/useKubernetes';
import { DataTable } from '../components/DataTable';
import type { ClusterRoleBinding } from '../types';
import { timeAgo } from '../utils';

export const ClusterRoleBindingsPage = () => {
  const { data, isLoading, error } = useClusterRoleBindings();

  const columns = [
    {
      header: 'Name',
      accessor: 'name' as const,
      width: '30%',
    },
    {
      header: 'Role',
      accessor: 'role' as const,
      width: '35%',
    },
    {
      header: 'Subjects',
      accessor: 'subjects' as const,
      width: '15%',
    },
    {
      header: 'Age',
      accessor: (crb: ClusterRoleBinding) => timeAgo(crb.age),
      width: '20%',
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-text">Cluster Role Bindings</h1>
        <p className="text-text-secondary mt-1">
          Cluster-wide bindings connecting cluster roles to subjects.
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
