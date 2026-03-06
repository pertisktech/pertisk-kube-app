import { useMemo } from 'react';
import { usePersistentVolumeClaims } from '../hooks/useKubernetes';
import { DataTable } from '../components/DataTable';
import type { PersistentVolumeClaim } from '../types';
import { timeAgo } from '../utils';
import { StatusBadge } from '../components/StatusBadge';
import { useNamespace } from '../context/NamespaceContext';

export const PersistentVolumeClaimsPage = () => {
  const { data, isLoading, error } = usePersistentVolumeClaims();
  const { selectedNamespaces } = useNamespace();

  const filteredData = useMemo(() => {
    if (!data) return [];
    if (selectedNamespaces.length === 0) return data;
    return data.filter((pvc) => selectedNamespaces.includes(pvc.namespace));
  }, [data, selectedNamespaces]);

  const columns = [
    {
      header: 'Name',
      accessor: 'name' as const,
      width: '15%',
    },
    {
      header: 'Namespace',
      accessor: 'namespace' as const,
      width: '12%',
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
    },
    {
      header: 'Capacity',
      accessor: 'capacity' as const,
      width: '10%',
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
        data={filteredData}
        columns={columns}
        isLoading={isLoading}
        error={error?.message}
        rowKey="name"
      />
    </div>
  );
};
