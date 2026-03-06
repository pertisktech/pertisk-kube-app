import { useMemo, useState } from 'react';
import { useStorageClasses } from '../hooks/useKubernetes';
import { DataTable, type SortState } from '../components/DataTable';
import type { StorageClass } from '../types';
import { timeAgo } from '../utils';
import { StatusBadge } from '../components/StatusBadge';

export const StorageClassesPage = () => {
  const { data, isLoading, error } = useStorageClasses();
  const [sortState, setSortState] = useState<SortState>({ key: 'age', direction: 'desc' });

  const sortedData = useMemo(() => {
    if (!data) return [];
    const source = [...data];
    const factor = sortState.direction === 'asc' ? 1 : -1;
    
    return source.sort((first, second) => {
      if (sortState.key === 'name') return first.name.localeCompare(second.name) * factor;
      if (sortState.key === 'provisioner') return first.provisioner.localeCompare(second.provisioner) * factor;
      if (sortState.key === 'reclaim_policy') return first.reclaim_policy.localeCompare(second.reclaim_policy) * factor;
      if (sortState.key === 'volume_binding_mode') return first.volume_binding_mode.localeCompare(second.volume_binding_mode) * factor;
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
      width: '18%',
      sortable: true,
      sortKey: 'name',
    },
    {
      header: 'Provisioner',
      accessor: 'provisioner' as const,
      width: '20%',
      sortable: true,
      sortKey: 'provisioner',
    },
    {
      header: 'Reclaim Policy',
      accessor: 'reclaim_policy' as const,
      width: '12%',
      sortable: true,
      sortKey: 'reclaim_policy',
    },
    {
      header: 'Volume Binding Mode',
      accessor: 'volume_binding_mode' as const,
      width: '15%',
      sortable: true,
      sortKey: 'volume_binding_mode',
    },
    {
      header: 'Allow Volume Expansion',
      accessor: 'allow_volume_expansion' as const,
      width: '12%',
      render: (sc: StorageClass) => (
        <StatusBadge 
          status={sc.allow_volume_expansion ? 'Yes' : 'No'} 
        />
      ),
    },
    {
      header: 'Default',
      accessor: 'is_default' as const,
      width: '10%',
      render: (sc: StorageClass) => (
        sc.is_default ? <StatusBadge status="Default" /> : '-'
      ),
    },
    {
      header: 'Age',
      accessor: (sc: StorageClass) => timeAgo(sc.age),
      width: '10%',
      sortable: true,
      sortKey: 'age',
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-text">Storage Classes</h1>
        <p className="text-text-secondary mt-1">
          Manage cluster-wide StorageClass resources.
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
