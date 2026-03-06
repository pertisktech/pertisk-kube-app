import { useMemo } from 'react';
import { useRoleBindings } from '../hooks/useKubernetes';
import { DataTable } from '../components/DataTable';
import type { RoleBinding } from '../types';
import { timeAgo } from '../utils';
import { useNamespace } from '../context/NamespaceContext';

export const RoleBindingsPage = () => {
  const { data, isLoading, error } = useRoleBindings();
  const { selectedNamespaces } = useNamespace();

  const filteredData = useMemo(() => {
    if (!data) return [];
    if (selectedNamespaces.length === 0) return data;
    return data.filter((rb) => selectedNamespaces.includes(rb.namespace));
  }, [data, selectedNamespaces]);

  const columns = [
    {
      header: 'Name',
      accessor: 'name' as const,
      width: '25%',
    },
    {
      header: 'Namespace',
      accessor: 'namespace' as const,
      width: '20%',
    },
    {
      header: 'Role',
      accessor: 'role' as const,
      width: '25%',
    },
    {
      header: 'Subjects',
      accessor: 'subjects' as const,
      width: '15%',
    },
    {
      header: 'Age',
      accessor: (rb: RoleBinding) => timeAgo(rb.age),
      width: '15%',
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-text">Role Bindings</h1>
        <p className="text-text-secondary mt-1">
          Namespace-scoped bindings connecting roles to subjects.
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
