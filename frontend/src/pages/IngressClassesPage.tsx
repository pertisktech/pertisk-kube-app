import { useState } from 'react';
import { DataTable, type SortState } from '../components/DataTable';
import { useIngressClasses } from '../hooks/useKubernetes';
import type { IngressClass } from '../types';
import { timeAgo } from '../utils';

export const IngressClassesPage = () => {
  const { data, isLoading, error } = useIngressClasses();
  const [sortState, setSortState] = useState<SortState>({ key: 'name', direction: 'asc' });

  const columns = [
    {
      header: 'Name',
      accessor: (item: IngressClass) => (
        <div className="flex items-center gap-2">
          <span className="font-medium text-primary">{item.name}</span>
          {item.is_default && (
            <span className="inline-block px-2 py-0.5 rounded text-xs bg-green-100 text-green-800">
              Default
            </span>
          )}
        </div>
      ),
      width: '22%',
      sortable: true,
      sortKey: 'name',
    },
    {
      header: 'Controller',
      accessor: 'controller' as const,
      width: '33%',
      sortable: true,
      sortKey: 'controller',
    },
    {
      header: 'Parameters',
      accessor: 'parameters' as const,
      width: '30%',
      sortable: true,
      sortKey: 'parameters',
    },
    {
      header: 'Age',
      accessor: (item: IngressClass) => timeAgo(item.age),
      width: '15%',
      sortable: true,
      sortKey: 'age',
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-text">Ingress Classes</h1>
        <p className="text-text-secondary mt-1">Manage cluster ingress class definitions</p>
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
