import { useMemo, useState } from 'react';
import { useClusterRoleBindings } from '../hooks/useKubernetes';
import { DataTable, type SortState } from '../components/DataTable';
import type { ClusterRoleBinding } from '../types';
import { timeAgo } from '../utils';

export const ClusterRoleBindingsPage = () => {
  const { data, isLoading, error } = useClusterRoleBindings();
  const [sortState, setSortState] = useState<SortState>({ key: 'name', direction: 'asc' });

  const sortedData = useMemo(() => {
    if (!data) return [];
    const source = [...data];
    const factor = sortState.direction === 'asc' ? 1 : -1;
    
    return source.sort((first, second) => {
      if (sortState.key === 'name') return first.name.localeCompare(second.name) * factor;
      if (sortState.key === 'age') {
        const firstAge = Date.parse(first.age || '');
        const secondAge = Date.parse(second.age || '');
        return ((Number.isNaN(firstAge) ? 0 : firstAge) - (Number.isNaN(secondAge) ? 0 : secondAge)) * factor;
      }
      return 0;
    });
  }, [data, sortState]);

  const columns = [
    {
      header: 'Name',
      accessor: 'name' as const,
      width: '30%',
      sortable: true,
      sortKey: 'name',
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
      sortable: true,
      sortKey: 'age',
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
        data={sortedData}
        columns={columns}
        isLoading={isLoading}
        error={error?.message}
        rowKey="name"
        sortState={sortState}
        onSortChange={(newSort) => setSortState(newSort)}
      />
    </div>
  );
};
