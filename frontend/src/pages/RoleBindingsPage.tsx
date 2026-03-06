import { useMemo, useState } from 'react';
import { useRoleBindings } from '../hooks/useKubernetes';
import { DataTable, type SortState } from '../components/DataTable';
import type { RoleBinding } from '../types';
import { timeAgo } from '../utils';
import { useNamespace } from '../context/NamespaceContext';

export const RoleBindingsPage = () => {
  const { data, isLoading, error } = useRoleBindings();
  const { selectedNamespaces } = useNamespace();
  const [sortState, setSortState] = useState<SortState>({ key: 'age', direction: 'desc' });

  const filteredAndSortedData = useMemo(() => {
    if (!data) return [];
    let source = data;
    if (selectedNamespaces.length > 0) {
      source = data.filter((rb) => selectedNamespaces.includes(rb.namespace));
    }
    const factor = sortState.direction === 'asc' ? 1 : -1;
    
    return [...source].sort((first, second) => {
      if (sortState.key === 'name') return first.name.localeCompare(second.name) * factor;
      if (sortState.key === 'namespace') return first.namespace.localeCompare(second.namespace) * factor;
      if (sortState.key === 'age') {
        const firstAge = Date.parse(first.age || '');
        const secondAge = Date.parse(second.age || '');
        return ((Number.isNaN(firstAge) ? 0 : firstAge) - (Number.isNaN(secondAge) ? 0 : secondAge)) * factor;
      }
      return 0;
    });
  }, [data, sortState, selectedNamespaces]);

  const columns = [
    {
      header: 'Name',
      accessor: 'name' as const,
      width: '25%',
      sortable: true,
      sortKey: 'name',
    },
    {
      header: 'Namespace',
      accessor: 'namespace' as const,
      width: '20%',
      sortable: true,
      sortKey: 'namespace',
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
      sortable: true,
      sortKey: 'age',
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
        data={filteredAndSortedData}
        columns={columns}
        isLoading={isLoading}
        error={error?.message}
        rowKey={(row) => `${row.namespace}/${row.name}`}
        sortState={sortState}
        onSortChange={(newSort) => setSortState(newSort)}
      />
    </div>
  );
};
