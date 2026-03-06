import { useMemo, useState } from 'react';
import { useLeases } from '../hooks/useKubernetes';
import { useNamespace } from '../context/NamespaceContext';
import { DataTable, type SortState } from '../components/DataTable';
import type { Lease } from '../types';
import { timeAgo } from '../utils';

export const LeasesPage = () => {
  const { data, isLoading, error } = useLeases();
  const { selectedNamespaces } = useNamespace();
  const [sortState, setSortState] = useState<SortState>({ key: 'age', direction: 'desc' });

  const sortedAndFilteredData = useMemo(() => {
    if (!data) return [];
    const filtered = data.filter((lease) =>
      selectedNamespaces.length === 0 || selectedNamespaces.includes(lease.namespace)
    );
    const sorted = [...filtered];
    const factor = sortState.direction === 'asc' ? 1 : -1;
    const compareText = (left: unknown, right: unknown) =>
      String(left ?? '').localeCompare(String(right ?? ''), undefined, {
        numeric: true,
        sensitivity: 'base',
      });

    sorted.sort((a, b) => {
      if (sortState.key === 'name') return compareText(a.name, b.name) * factor;
      if (sortState.key === 'namespace') {
        const result = compareText(a.namespace, b.namespace);
        return (result !== 0 ? result : compareText(a.name, b.name)) * factor;
      }
      if (sortState.key === 'holder_identity') {
        const result = compareText(a.holder_identity, b.holder_identity);
        return (result !== 0 ? result : compareText(a.name, b.name)) * factor;
      }
      if (sortState.key === 'lease_duration_seconds') {
        const result = (a.lease_duration_seconds || 0) - (b.lease_duration_seconds || 0);
        return (result !== 0 ? result : compareText(a.name, b.name)) * factor;
      }
      if (sortState.key === 'age') {
        const aTime = Date.parse(a.age || '');
        const bTime = Date.parse(b.age || '');
        const aValue = Number.isNaN(aTime) ? 0 : aTime;
        const bValue = Number.isNaN(bTime) ? 0 : bTime;
        const result = aValue - bValue;
        return (result !== 0 ? result : compareText(a.name, b.name)) * factor;
      }
      return 0;
    });

    return sorted;
  }, [data, sortState, selectedNamespaces]);

  const columns = [
    {
      header: 'Name',
      accessor: (lease: Lease) => <span className="font-medium text-primary">{lease.name}</span>,
      width: '20%',
      sortable: true,
      sortKey: 'name',
    },
    {
      header: 'Namespace',
      accessor: 'namespace' as const,
      width: '15%',
      sortable: true,
      sortKey: 'namespace',
    },
    {
      header: 'Holder Identity',
      accessor: (lease: Lease) => (
        <span className="text-text-secondary text-sm font-mono">
          {lease.holder_identity || '-'}
        </span>
      ),
      width: '30%',
      sortable: true,
      sortKey: 'holder_identity',
    },
    {
      header: 'Duration (s)',
      accessor: 'lease_duration_seconds' as const,
      width: '15%',
      sortable: true,
      sortKey: 'lease_duration_seconds',
    },
    {
      header: 'Age',
      accessor: (lease: Lease) => timeAgo(lease.age),
      width: '15%',
      sortable: true,
      sortKey: 'age',
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-text">Leases</h1>
        <p className="text-text-secondary mt-1">Manage Kubernetes Leases</p>
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
