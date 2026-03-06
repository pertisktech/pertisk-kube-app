import { useMemo, useState } from 'react';
import { useRuntimeClasses } from '../hooks/useKubernetes';
import { DataTable, type SortState } from '../components/DataTable';
import type { RuntimeClass } from '../types';
import { timeAgo } from '../utils';

export const RuntimeClassesPage = () => {
  const { data, isLoading, error } = useRuntimeClasses();
  const [sortState, setSortState] = useState<SortState>({ key: 'age', direction: 'desc' });

  const sortedData = useMemo(() => {
    if (!data) return [];
    const sorted = [...data];
    const factor = sortState.direction === 'asc' ? 1 : -1;
    const compareText = (left: unknown, right: unknown) =>
      String(left ?? '').localeCompare(String(right ?? ''), undefined, {
        numeric: true,
        sensitivity: 'base',
      });

    sorted.sort((a, b) => {
      if (sortState.key === 'name') return compareText(a.name, b.name) * factor;
      if (sortState.key === 'handler') {
        const result = compareText(a.handler, b.handler);
        return (result !== 0 ? result : compareText(a.name, b.name)) * factor;
      }
      if (sortState.key === 'scheduling') {
        const result = compareText(a.scheduling, b.scheduling);
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
  }, [data, sortState]);

  const columns = [
    {
      header: 'Name',
      accessor: (rc: RuntimeClass) => <span className="font-medium text-primary">{rc.name}</span>,
      width: '25%',
      sortable: true,
      sortKey: 'name',
    },
    {
      header: 'Handler',
      accessor: (rc: RuntimeClass) => (
        <span className="text-text-secondary font-mono text-sm">{rc.handler}</span>
      ),
      width: '35%',
      sortable: true,
      sortKey: 'handler',
    },
    {
      header: 'Scheduling',
      accessor: (rc: RuntimeClass) => (
        <span
          className={`inline-block px-3 py-1 rounded-full text-sm ${
            rc.scheduling === 'Configured'
              ? 'bg-green-100 text-green-800'
              : 'bg-gray-100 text-gray-800'
          }`}
        >
          {rc.scheduling || '-'}
        </span>
      ),
      width: '20%',
      sortable: true,
      sortKey: 'scheduling',
    },
    {
      header: 'Age',
      accessor: (rc: RuntimeClass) => timeAgo(rc.age),
      width: '15%',
      sortable: true,
      sortKey: 'age',
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-text">Runtime Classes</h1>
        <p className="text-text-secondary mt-1">Manage Kubernetes Runtime Classes</p>
      </div>

      <DataTable
        columns={columns}
        data={sortedData}
        rowKey="name"
        isLoading={isLoading}
        error={error?.message || null}
        sortState={sortState}
        onSortChange={(newSort) => setSortState(newSort)}
      />
    </div>
  );
};
