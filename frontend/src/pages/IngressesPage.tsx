import { useState, useMemo } from 'react';
import { DataTable, type SortState } from '../components/DataTable';
import { useNamespace } from '../context/NamespaceContext';
import { useIngresses } from '../hooks/useKubernetes';
import type { Ingress } from '../types';
import { timeAgo } from '../utils';

export const IngressesPage = () => {
  const { data, isLoading, error } = useIngresses();
  const { selectedNamespaces } = useNamespace();
  const [sortState, setSortState] = useState<SortState>({ key: 'name', direction: 'asc' });

  const sortedAndFilteredData = useMemo(() => {
    if (!data) return [];
    const filtered = data.filter((item) =>
      selectedNamespaces.length === 0 || selectedNamespaces.includes(item.namespace)
    );
    const sorted = [...filtered];
    const factor = sortState.direction === 'asc' ? 1 : -1;
    sorted.sort((a, b) => {
      if (sortState.key === 'name') return String(a.name || '').localeCompare(String(b.name || '')) * factor;
      if (sortState.key === 'namespace') return String(a.namespace || '').localeCompare(String(b.namespace || '')) * factor;
      if (sortState.key === 'ingress_class') {
        return String(a.ingress_class || '').localeCompare(String(b.ingress_class || '')) * factor;
      }
      if (sortState.key === 'hosts') {
        return String(a.hosts || '').localeCompare(String(b.hosts || '')) * factor;
      }
      if (sortState.key === 'address') {
        return String(a.address || '').localeCompare(String(b.address || '')) * factor;
      }
      if (sortState.key === 'rules') {
        return ((a.rules || 0) - (b.rules || 0)) * factor;
      }
      if (sortState.key === 'age') {
        const aTime = Date.parse(a.age || '');
        const bTime = Date.parse(b.age || '');
        return ((Number.isNaN(aTime) ? 0 : aTime) - (Number.isNaN(bTime) ? 0 : bTime)) * factor;
      }
      return 0;
    });
    return sorted;
  }, [data, sortState, selectedNamespaces]);

  const columns = [
    {
      header: 'Name',
      accessor: (item: Ingress) => <span className="font-medium text-primary">{item.name}</span>,
      width: '20%',
      sortable: true,
      sortKey: 'name',
    },
    {
      header: 'Namespace',
      accessor: 'namespace' as const,
      width: '16%',
      sortable: true,
      sortKey: 'namespace',
    },
    {
      header: 'Class',
      accessor: 'ingress_class' as const,
      width: '14%',
      sortable: true,
      sortKey: 'ingress_class',
    },
    {
      header: 'Hosts',
      accessor: 'hosts' as const,
      width: '20%',
      sortable: true,
      sortKey: 'hosts',
    },
    {
      header: 'Address',
      accessor: 'address' as const,
      width: '16%',
      sortable: true,
      sortKey: 'address',
    },
    {
      header: 'Rules',
      accessor: 'rules' as const,
      width: '6%',
      sortable: true,
      sortKey: 'rules',
    },
    {
      header: 'Age',
      accessor: (item: Ingress) => timeAgo(item.age),
      width: '8%',
      sortable: true,
      sortKey: 'age',
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-text">Ingresses</h1>
        <p className="text-text-secondary mt-1">View ingress hosts, addresses, and rules</p>
      </div>

      <DataTable
        columns={columns}
        data={sortedAndFilteredData}
        rowKey={(row) => `${row.namespace}/${row.name}`}
        isLoading={isLoading}
        error={error?.message || null}
        sortState={sortState}
        onSortChange={(newSort) => setSortState(newSort)}
      />
    </div>
  );
};
