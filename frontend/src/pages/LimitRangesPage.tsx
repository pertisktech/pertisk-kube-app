import { useState, useMemo } from 'react';
import { useLimitRanges } from '../hooks/useKubernetes';
import { useNamespace } from '../context/NamespaceContext';
import { DataTable, type SortState } from '../components/DataTable';
import type { LimitRange } from '../types';
import { timeAgo } from '../utils';

export const LimitRangesPage = () => {
  const { data, isLoading, error } = useLimitRanges();
  const { selectedNamespaces } = useNamespace();
  const [sortState, setSortState] = useState<SortState>({ key: 'name', direction: 'asc' });

  const sortedAndFilteredData = useMemo(() => {
    if (!data) return [];
    const filtered = data.filter((lr) =>
      selectedNamespaces.length === 0 || selectedNamespaces.includes(lr.namespace)
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
      if (sortState.key === 'limits') {
        const result = (a.limits || 0) - (b.limits || 0);
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
      accessor: (lr: LimitRange) => <span className="font-medium text-primary">{lr.name}</span>,
      width: '30%',
      sortable: true,
      sortKey: 'name',
    },
    {
      header: 'Namespace',
      accessor: 'namespace' as const,
      width: '25%',
      sortable: true,
      sortKey: 'namespace',
    },
    {
      header: 'Limits',
      accessor: 'limits' as const,
      width: '20%',
      sortable: true,
      sortKey: 'limits',
    },
    {
      header: 'Age',
      accessor: (lr: LimitRange) => timeAgo(lr.age),
      width: '20%',
      sortable: true,
      sortKey: 'age',
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-text">Limit Ranges</h1>
        <p className="text-text-secondary mt-1">Manage Kubernetes Limit Ranges</p>
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
