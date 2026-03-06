import { useMemo, useState } from 'react';
import { usePersistentVolumeClaims } from '../hooks/useKubernetes';
import { DataTable, type SortState } from '../components/DataTable';
import type { PersistentVolumeClaim } from '../types';
import { timeAgo } from '../utils';
import { StatusBadge } from '../components/StatusBadge';
import { useNamespace } from '../context/NamespaceContext';

export const PersistentVolumeClaimsPage = () => {
  const { data, isLoading, error } = usePersistentVolumeClaims();
  const { selectedNamespaces } = useNamespace();
  const [sortState, setSortState] = useState<SortState>({ key: 'name', direction: 'asc' });

  const filteredAndSortedData = useMemo(() => {
    if (!data) return [];
    let source = data;
    if (selectedNamespaces.length > 0) {
      source = data.filter((pvc) => selectedNamespaces.includes(pvc.namespace));
    }
    const factor = sortState.direction === 'asc' ? 1 : -1;
    
    return [...source].sort((first, second) => {
      if (sortState.key === 'name') return first.name.localeCompare(second.name) * factor;
      if (sortState.key === 'namespace') return first.namespace.localeCompare(second.namespace) * factor;
      if (sortState.key === 'volume') return first.volume.localeCompare(second.volume) * factor;
      if (sortState.key === 'capacity') return first.capacity.localeCompare(second.capacity) * factor;
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
      width: '15%',
      sortable: true,
      sortKey: 'name',
    },
    {
      header: 'Namespace',
      accessor: 'namespace' as const,
      width: '12%',
      sortable: true,
      sortKey: 'namespace',
    },
    {
      header: 'Status',
      accessor: 'status' as const,
      width: '10%',
      render: (pvc: PersistentVolumeClaim) => {
        const status = pvc.status;
        return <StatusBadge status={status} />;
      },
    },
    {
      header: 'Volume',
      accessor: 'volume' as const,
      width: '15%',
      sortable: true,
      sortKey: 'volume',
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
      header: 'Storage Class',
      accessor: 'storage_class' as const,
      width: '12%',
    },
    {
      header: 'Age',
      accessor: (pvc: PersistentVolumeClaim) => timeAgo(pvc.age),
      width: '10%',
      sortable: true,
      sortKey: 'age',
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-text">Persistent Volume Claims</h1>
        <p className="text-text-secondary mt-1">
          Manage PersistentVolumeClaim resources in your namespaces.
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
