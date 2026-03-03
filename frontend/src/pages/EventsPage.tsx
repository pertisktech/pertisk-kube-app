import { useEvents } from '../hooks/useKubernetes';
import { DataTable } from '../components/DataTable';
import type { KubernetesEvent } from '../types';
import { timeAgo } from '../utils';

export const EventsPage = () => {
  const { data, isLoading, error } = useEvents();

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
      header: 'Object',
      accessor: 'involved_object' as const,
      width: '15%',
    },
    {
      header: 'Reason',
      accessor: 'reason' as const,
      width: '12%',
    },
    {
      header: 'Message',
      accessor: 'message' as const,
      width: '20%',
    },
    {
      header: 'Count',
      accessor: 'count' as const,
      width: '8%',
    },
    {
      header: 'Last Seen',
      accessor: (row: KubernetesEvent) => timeAgo(row.last_timestamp),
      width: '18%',
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-text">Events</h1>
        <p className="text-text-secondary mt-1">View cluster events</p>
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
