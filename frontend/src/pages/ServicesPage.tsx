import { useState, useMemo } from 'react';
import { DataTable, type SortState } from '../components/DataTable';
import { useNamespace } from '../context/NamespaceContext';
import { useServices } from '../hooks/useKubernetes';
import type { Service } from '../types';
import { timeAgo } from '../utils';

export const ServicesPage = () => {
  const { data, isLoading, error } = useServices();
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
      if (sortState.key === 'service_type') {
        return String(a.service_type || '').localeCompare(String(b.service_type || '')) * factor;
      }
      if (sortState.key === 'cluster_ip') {
        return String(a.cluster_ip || '').localeCompare(String(b.cluster_ip || '')) * factor;
      }
      if (sortState.key === 'external_ip') {
        return String(a.external_ip || '').localeCompare(String(b.external_ip || '')) * factor;
      }
      if (sortState.key === 'ports') {
        return String(a.ports || '').localeCompare(String(b.ports || '')) * factor;
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
