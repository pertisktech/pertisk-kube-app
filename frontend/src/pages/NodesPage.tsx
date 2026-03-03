import { useNodes } from '../hooks/useKubernetes';
import { DataTable } from '../components/DataTable';
import { StatusBadge } from '../components/StatusBadge';
import type { K8sNode } from '../types';

export const NodesPage = () => {
  const { data, isLoading, error } = useNodes();

  const columns = [
    {
      header: 'Name',
      accessor: 'name' as const,
      width: '25%',
    },
    {
      header: 'Status',
      accessor: (row: K8sNode) => (
        <StatusBadge status={row.ready ? 'Ready' : 'NotReady'} />
      ),
      width: '15%',
    },
    {
      header: 'Roles',
      accessor: (row: K8sNode) => row.roles.join(', ') || '-',
      width: '20%',
    },
    {
      header: 'Kubelet Version',
      accessor: 'kubelet_version' as const,
      width: '20%',
    },
    {
      header: 'OS Image',
      accessor: 'os_image' as const,
      width: '20%',
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-text">Nodes</h1>
        <p className="text-text-secondary mt-1">View cluster nodes</p>
      </div>

      <DataTable
        columns={columns}
        data={data || []}
        isLoading={isLoading}
        error={error?.message}
        rowKey="name"
      />
    </div>
  );
};
