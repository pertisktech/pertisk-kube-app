import { useNamespaces } from '../hooks/useKubernetes';
import { DataTable } from '../components/DataTable';
import type { Namespace } from '../types';
import { timeAgo } from '../utils';

export const NamespacesPage = () => {
  const { data, isLoading, error } = useNamespaces();

  const columns = [
    {
      header: 'Name',
      accessor: 'name' as const,
      width: '40%',
    },
    {
      header: 'Status',
      accessor: 'phase' as const,
      width: '30%',
    },
    {
      header: 'Age',
      accessor: (row: Namespace) => timeAgo(row.age),
      width: '30%',
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-text">Namespaces</h1>
        <p className="text-text-secondary mt-1">Manage Kubernetes namespaces</p>
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
