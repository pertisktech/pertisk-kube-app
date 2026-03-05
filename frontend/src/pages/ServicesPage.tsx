import { useState } from 'react';
import { DataTable, type SortState } from '../components/DataTable';
import { useNamespace } from '../context/NamespaceContext';
import { useServices } from '../hooks/useKubernetes';
import type { Service } from '../types';
import { timeAgo } from '../utils';

export const ServicesPage = () => {
  const { data, isLoading, error } = useServices();
  const { selectedNamespaces } = useNamespace();
  const [sortState, setSortState] = useState<SortState>({ key: 'name', direction: 'asc' });

  const filteredData = data?.filter((item) =>
    selectedNamespaces.length === 0 || selectedNamespaces.includes(item.namespace)
  ) ?? [];

  const columns = [
    {
      header: 'Name',
      accessor: (item: Service) => <span className="font-medium text-primary">{item.name}</span>,
      width: '18%',
      sortable: true,
      sortKey: 'name',
    },
    {
      header: 'Namespace',
      accessor: 'namespace' as const,
      width: '14%',
      sortable: true,
      sortKey: 'namespace',
    },
    {
      header: 'Type',
      accessor: 'service_type' as const,
      width: '12%',
      sortable: true,
      sortKey: 'service_type',
    },
    {
      header: 'Cluster IP',
      accessor: 'cluster_ip' as const,
      width: '14%',
      sortable: true,
      sortKey: 'cluster_ip',
    },
    {
      header: 'External IP',
      accessor: 'external_ip' as const,
      width: '18%',
      sortable: true,
      sortKey: 'external_ip',
    },
    {
      header: 'Ports',
      accessor: 'ports' as const,
      width: '14%',
      sortable: true,
      sortKey: 'ports',
    },
    {
      header: 'Age',
      accessor: (item: Service) => timeAgo(item.age),
      width: '10%',
      sortable: true,
      sortKey: 'age',
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-text">Services</h1>
        <p className="text-text-secondary mt-1">Manage Kubernetes services</p>
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
