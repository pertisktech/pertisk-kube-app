import { useState, useMemo } from 'react';
import { useHPA } from '../hooks/useKubernetes';
import { useNamespace } from '../context/NamespaceContext';
import { DataTable, type SortState } from '../components/DataTable';
import type { HPA } from '../types';
import { timeAgo } from '../utils';

export const HPAPage = () => {
  const { data, isLoading, error } = useHPA();
  const { selectedNamespaces } = useNamespace();
  const [sortState, setSortState] = useState<SortState>({ key: 'age', direction: 'desc' });

  const sortedAndFilteredData = useMemo(() => {
    if (!data) return [];
    const filtered = data.filter((hpa) =>
      selectedNamespaces.length === 0 || selectedNamespaces.includes(hpa.namespace)
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
      if (sortState.key === 'reference') {
        const result = compareText(a.reference, b.reference);
        return (result !== 0 ? result : compareText(a.name, b.name)) * factor;
      }
      if (sortState.key === 'current_replicas') {
        const result = (a.current_replicas || 0) - (b.current_replicas || 0);
        return (result !== 0 ? result : compareText(a.name, b.name)) * factor;
      }
      if (sortState.key === 'targets') {
        const result = (a.targets || 0) - (b.targets || 0);
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
      accessor: (hpa: HPA) => <span className="font-medium text-primary">{hpa.name}</span>,
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
      header: 'Reference',
      accessor: (hpa: HPA) => (
        <span className="text-text-secondary text-sm">{hpa.reference || '-'}</span>
      ),
      width: '15%',
      sortable: true,
      sortKey: 'reference',
    },
    {
      header: 'Current / Min-Max',
      accessor: (hpa: HPA) => (
        <span className="text-text-secondary">
          {hpa.current_replicas} / {hpa.min_replicas}-{hpa.max_replicas}
        </span>
      ),
      width: '20%',
      sortable: true,
      sortKey: 'current_replicas',
    },
    {
      header: 'Targets',
      accessor: 'targets' as const,
      width: '15%',
      sortable: true,
      sortKey: 'targets',
    },
    {
      header: 'Age',
      accessor: (hpa: HPA) => timeAgo(hpa.age),
      width: '15%',
      sortable: true,
      sortKey: 'age',
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-text">HPA</h1>
        <p className="text-text-secondary mt-1">Manage Horizontal Pod Autoscalers</p>
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
