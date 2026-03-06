import { useStorageClasses } from '../hooks/useKubernetes';
import { DataTable } from '../components/DataTable';
import type { StorageClass } from '../types';
import { timeAgo } from '../utils';
import { StatusBadge } from '../components/StatusBadge';

export const StorageClassesPage = () => {
  const { data, isLoading, error } = useStorageClasses();

  const columns = [
    {
      header: 'Name',
      accessor: 'name' as const,
      width: '18%',
    },
    {
      header: 'Provisioner',
      accessor: 'provisioner' as const,
      width: '20%',
    },
    {
      header: 'Reclaim Policy',
      accessor: 'reclaim_policy' as const,
      width: '12%',
    },
    {
      header: 'Volume Binding Mode',
      accessor: 'volume_binding_mode' as const,
      width: '15%',
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
        data={data || []}
        columns={columns}
        isLoading={isLoading}
        error={error?.message}
        rowKey="name"
      />
    </div>
  );
};
