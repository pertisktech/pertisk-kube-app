import { useMemo, useState } from 'react';
import { useRealtimeEvents } from '../hooks/useRealtimeResources';
import { useNamespace } from '../context/NamespaceContext';
import { DataTable } from '../components/DataTable';
import type { KubernetesEvent } from '../types';
import { timeAgo } from '../utils';

type EventSortKey = 'name' | 'namespace' | 'involved_object' | 'reason' | 'message' | 'count' | 'last_timestamp' | 'type';

export const EventsPage = () => {
  const { data, isLoading, error } = useRealtimeEvents();
  const { selectedNamespaces } = useNamespace();
  const [sortState, setSortState] = useState<{ key: EventSortKey; direction: 'asc' | 'desc' }>({
    key: 'last_timestamp',
    direction: 'desc',
  });

  const getTypeColor = (type: string) => {
    if (type === 'Warning') return 'text-[var(--color-icon-warning)]';
    if (type === 'Error') return 'text-[var(--color-icon-danger)]';
    return 'text-text-secondary';
  };

  const columns = [
    {
      header: 'Namespace',
      accessor: 'namespace' as const,
      width: '12%',
      sortable: true,
      sortKey: 'namespace',
    },
    {
      header: 'Object',
      accessor: 'involved_object' as const,
      width: '18%',
      sortable: true,
      sortKey: 'involved_object',
    },
    {
      header: 'Type',
      accessor: (row: KubernetesEvent) => (
        <span className={`font-medium ${getTypeColor(row.type || 'Normal')}`}>
          {row.type || 'Normal'}
        </span>
      ),
      width: '8%',
      sortable: true,
      sortKey: 'type',
    },
    {
      header: 'Reason',
      accessor: 'reason' as const,
      width: '12%',
      sortable: true,
      sortKey: 'reason',
    },
    {
      header: 'Message',
      accessor: (row: KubernetesEvent) => (
        <span className="break-words whitespace-normal line-clamp-2" title={row.message}>
          {row.message}
        </span>
      ),
      width: '28%',
      sortable: true,
      sortKey: 'message',
    },
    {
      header: 'Count',
      accessor: 'count' as const,
      width: '7%',
      sortable: true,
      sortKey: 'count',
    },
    {
      header: 'Last Seen',
      accessor: (row: KubernetesEvent) => timeAgo(row.last_timestamp),
      width: '15%',
      sortable: true,
      sortKey: 'last_timestamp',
    },
  ];

  const sortedEvents = useMemo((): (KubernetesEvent & { id: string })[] => {
    let source = [...(data || [])];
    
    // Filter by selected namespaces (if any are selected)
    if (selectedNamespaces.length > 0) {
      source = source.filter((event) => selectedNamespaces.includes(event.namespace));
    }
    
    // Add unique id for row selection
    source = source.map((item) => ({
      ...item,
      id: `${item.namespace}/${item.name}`,
    })) as (KubernetesEvent & { id: string })[];
    
    const factor = sortState.direction === 'asc' ? 1 : -1;

    return source.sort((first, second) => {
      if (sortState.key === 'name') return first.name.localeCompare(second.name) * factor;
      if (sortState.key === 'namespace') return first.namespace.localeCompare(second.namespace) * factor;
      if (sortState.key === 'involved_object') return first.involved_object.localeCompare(second.involved_object) * factor;
      if (sortState.key === 'reason') return (first.reason || '').localeCompare(second.reason || '') * factor;
      if (sortState.key === 'message') return (first.message || '').localeCompare(second.message || '') * factor;
      if (sortState.key === 'type') return (first.type || '').localeCompare(second.type || '') * factor;
      if (sortState.key === 'count') return ((first.count ?? 0) - (second.count ?? 0)) * factor;

      const firstTime = Date.parse(first.last_timestamp || '');
      const secondTime = Date.parse(second.last_timestamp || '');
      return ((Number.isNaN(firstTime) ? 0 : firstTime) - (Number.isNaN(secondTime) ? 0 : secondTime)) * factor;
    }) as (KubernetesEvent & { id: string })[];
  }, [data, sortState, selectedNamespaces]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-text">Events <span className="text-base font-normal text-text-secondary">(View cluster events in real-time)</span></h1>
      </div>

      <DataTable
        columns={columns}
        data={sortedEvents}
        isLoading={isLoading}
        error={error}
        rowKey="id"
        sortState={sortState}
        onSortChange={(nextSort) => setSortState(nextSort as { key: EventSortKey; direction: 'asc' | 'desc' })}
      />
    </div>
  );
};
