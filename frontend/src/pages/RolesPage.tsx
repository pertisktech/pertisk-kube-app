import { useMemo } from 'react';
import { useRoles } from '../hooks/useKubernetes';
import { DataTable } from '../components/DataTable';
import type { Role } from '../types';
import { timeAgo } from '../utils';
import { useNamespace } from '../context/NamespaceContext';

export const RolesPage = () => {
  const { data, isLoading, error } = useRoles();
  const { selectedNamespaces } = useNamespace();

  const filteredData = useMemo(() => {
    if (!data) return [];
    if (selectedNamespaces.length === 0) return data;
    return data.filter((role) => selectedNamespaces.includes(role.namespace));
  }, [data, selectedNamespaces]);

  const columns = [
    {
      header: 'Name',
      accessor: 'name' as const,
      width: '30%',
    },
    {
      header: 'Namespace',
      accessor: 'namespace' as const,
      width: '25%',
    },
    {
      header: 'Rules',
      accessor: 'rules' as const,
      width: '20%',
    },
    {
      header: 'Age',
      accessor: (role: Role) => timeAgo(role.age),
      width: '25%',
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-text">Roles</h1>
        <p className="text-text-secondary mt-1">
          Namespace-scoped RBAC roles defining permissions.
        </p>
      </div>

      <DataTable
        data={filteredData}
        columns={columns}
        isLoading={isLoading}
        error={error?.message}
        rowKey="name"
      />
    </div>
  );
};
