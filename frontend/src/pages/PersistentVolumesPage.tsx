import { useMemo, useState } from 'react';
import { usePersistentVolumes } from '../hooks/useKubernetes';
import { DataTable, type SortState } from '../components/DataTable';
import type { PersistentVolume } from '../types';
import { timeAgo } from '../utils';
import { StatusBadge } from '../components/StatusBadge';

export const PersistentVolumesPage = () => {
  const { data, isLoading, error } = usePersistentVolumes();
  const [sortState, setSortState] = useState<SortState>({ key: 'name', direction: 'asc' });
  
  // Note: PersistentVolumes are cluster-wide resources (not namespaced),
  // so they are not filtered by namespace selection

  const sortedData = useMemo(() => {
    if (!data) return [];
    const source = [...data];
    const factor = sortState.direction === 'asc' ? 1 : -1;
    
    return source.sort((first, second) => {
      if (sortState.key === 'name') return first.name.localeCompare(second.name) * factor;
      if (sortState.key === 'capacity') return first.capacity.localeCompare(second.capacity) * factor;
      if (sortState.key === 'reclaim_policy') return first.reclaim_policy.localeCompare(second.reclaim_policy) * factor;
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
      width: '15%',
      sortable: true,
      sortKey: 'name',
    },
    {
      header: 'Capacity',
      accessor: 'capacity' as const,
      width: '10%',
      sortable: true,
      sortKey: 'capacity',
    },
    {
      header: 'Access Modes',
      accessor: 'access_modes' as const,
      width: '12%',
    },
    {
      header: 'Reclaim Policy',
      accessor: 'reclaim_policy' as const,
      width: '12%',
      sortable: true,
      sortKey: 'reclaim_policy',
    },
    {
      header: 'Status',
      accessor: 'status' as const,
      width: '10%',
      render: (pv: PersistentVolume) => {
        const status = pv.status;
        return <StatusBadge status={status} />;
      },
    },
    {
      header: 'Claim',
      accessor: 'claim' as const,
      width: '15%',
    },
    {
      header: 'Storage Class',
      accessor: 'storage_class' as const,
      width: '12%',
    },
    {
      header: 'Age',
      accessor: (pv: PersistentVolume) => timeAgo(pv.age),
      width: '10%',
      sortable: true,
      sortKey: 'age',
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-text">Persistent Volumes</h1>
        <p className="text-text-secondary mt-1">
          Manage cluster-wide PersistentVolume resources.
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
