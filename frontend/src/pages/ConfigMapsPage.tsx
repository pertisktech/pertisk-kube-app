import { useState } from 'react';
import { useConfigMaps } from '../hooks/useKubernetes';
import { useNamespace } from '../context/NamespaceContext';
import { DataTable, type SortState } from '../components/DataTable';
import type { ConfigMap } from '../types';
import { timeAgo } from '../utils';

export const ConfigMapsPage = () => {
  const { data, isLoading, error } = useConfigMaps();
  const { selectedNamespaces } = useNamespace();
  const [sortState, setSortState] = useState<SortState>({ key: 'name', direction: 'asc' });

  const filteredData = data?.filter((cm) =>
    selectedNamespaces.length === 0 || selectedNamespaces.includes(cm.namespace)
  ) ?? [];

  const columns = [
    {
      header: 'Name',
      accessor: (cm: ConfigMap) => <span className="font-medium text-primary">{cm.name}</span>,
      width: '30%',
      sortable: true,
      sortKey: 'name',
    },
    {
      header: 'Namespace',
      accessor: 'namespace' as const,
      width: '20%',
      sortable: true,
      sortKey: 'namespace',
    },
    {
      header: 'Data Keys',
      accessor: 'data_keys' as const,
      width: '15%',
      sortable: true,
      sortKey: 'data_keys',
    },
    {
      header: 'Age',
      accessor: (cm: ConfigMap) => timeAgo(cm.age),
      width: '15%',
      sortable: true,
      sortKey: 'age',
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-text">ConfigMaps</h1>
        <p className="text-text-secondary mt-1">Manage Kubernetes ConfigMaps</p>
      </div>

      <DataTable
        columns={columns}
        data={filteredData}
        rowKey="name"
        isLoading={isLoading}
        error={error?.message || null}
        sortState={sortState}
        onSortChange={(newSort) => setSortState(newSort)}
      />
    </div>
  );
};
