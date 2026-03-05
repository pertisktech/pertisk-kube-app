import { useState } from 'react';
import { usePriorityClasses } from '../hooks/useKubernetes';
import { DataTable, type SortState } from '../components/DataTable';
import type { PriorityClass } from '../types';
import { timeAgo } from '../utils';

export const PriorityClassesPage = () => {
  const { data, isLoading, error } = usePriorityClasses();
  const [sortState, setSortState] = useState<SortState>({ key: 'name', direction: 'asc' });

  const columns = [
    {
      header: 'Name',
      accessor: (pc: PriorityClass) => <span className="font-medium text-primary">{pc.name}</span>,
      width: '30%',
      sortable: true,
      sortKey: 'name',
    },
    {
      header: 'Value',
      accessor: 'value' as const,
      width: '20%',
      sortable: true,
      sortKey: 'value',
    },
    {
      header: 'Global Default',
      accessor: (pc: PriorityClass) => (
        <span
          className={`inline-block px-3 py-1 rounded-full text-sm ${
            pc.global_default
              ? 'bg-blue-100 text-blue-800'
              : 'bg-gray-100 text-gray-800'
          }`}
        >
          {pc.global_default ? 'Yes' : 'No'}
        </span>
      ),
      width: '25%',
      sortable: true,
      sortKey: 'global_default',
    },
    {
      header: 'Age',
      accessor: (pc: PriorityClass) => timeAgo(pc.age),
      width: '20%',
      sortable: true,
      sortKey: 'age',
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-text">Priority Classes</h1>
        <p className="text-text-secondary mt-1">Manage Kubernetes Priority Classes</p>
      </div>

      <DataTable
        columns={columns}
        data={data || []}
        rowKey="name"
        isLoading={isLoading}
        error={error?.message || null}
        sortState={sortState}
        onSortChange={(newSort) => setSortState(newSort)}
      />
    </div>
  );
};
