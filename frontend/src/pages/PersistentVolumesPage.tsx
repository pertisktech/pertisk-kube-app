import { usePersistentVolumes } from '../hooks/useKubernetes';
import { DataTable } from '../components/DataTable';
import type { PersistentVolume } from '../types';
import { timeAgo } from '../utils';
import { StatusBadge } from '../components/StatusBadge';

export const PersistentVolumesPage = () => {
  const { data, isLoading, error } = usePersistentVolumes();
  
  // Note: PersistentVolumes are cluster-wide resources (not namespaced),
  // so they are not filtered by namespace selection

  const columns = [
    {
      header: 'Name',
      accessor: 'name' as const,
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
      header: 'Reclaim Policy',
      accessor: 'reclaim_policy' as const,
      width: '12%',
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
        data={data || []}
        columns={columns}
        isLoading={isLoading}
        error={error?.message}
        rowKey="name"
      />
    </div>
  );
};
