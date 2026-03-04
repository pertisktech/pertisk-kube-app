import { useEffect, useMemo, useState } from 'react';
import { useDeployments } from '../hooks/useKubernetes';
import { useNamespace } from '../context/NamespaceContext';
import { DataTable } from '../components/DataTable';
import { DeploymentDetailPanel } from '../components/DeploymentDetailPanel';
import type { Deployment } from '../types';
import { getStatusColor, timeAgo } from '../utils';

type DeploymentSortKey = 'name' | 'namespace' | 'status' | 'ready' | 'updated' | 'available' | 'images' | 'age';

export const DeploymentsPage = () => {
  const { data, isLoading, error } = useDeployments();
  const { selectedNamespaces, setNamespaces } = useNamespace();
  const [selectedDeployment, setSelectedDeployment] = useState<Deployment | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [sortState, setSortState] = useState<{ key: DeploymentSortKey; direction: 'asc' | 'desc' }>({
    key: 'name',
    direction: 'asc',
  });

  useEffect(() => {
    if (data && data.length > 0) {
      const uniqueNamespaces = Array.from(new Set(data.map((deployment) => deployment.namespace)));
      setNamespaces(uniqueNamespaces);
    }
  }, [data, setNamespaces]);

  useEffect(() => {
    if (!data || data.length === 0) {
      setSelectedDeployment(null);
      return;
    }

    if (!selectedDeployment) {
      setSelectedDeployment(data[0]);
      return;
    }

    const updatedSelected = data.find(
      (item) => item.name === selectedDeployment.name && item.namespace === selectedDeployment.namespace
    );
    setSelectedDeployment(updatedSelected ?? data[0]);
  }, [data]);

  const getStatusTextClass = (status: string) => {
    const color = getStatusColor(status);
    if (color === 'green') return 'text-[var(--color-icon-success)]';
    if (color === 'yellow') return 'text-[var(--color-icon-warning)]';
    if (color === 'red') return 'text-[var(--color-icon-danger)]';
    return 'text-text-secondary';
  };

  const columns = [
    {
      header: 'Name',
      accessor: (row: Deployment) => (
        <span className="font-medium text-primary">{row.name}</span>
      ),
      width: '25%',
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
      header: 'Status',
      accessor: (row: Deployment) => (
        <span className={`font-medium ${getStatusTextClass(row.status || 'Unknown')}`}>
          {row.status || 'Unknown'}
        </span>
      ),
      width: '10%',
      sortable: true,
      sortKey: 'status',
    },
    {
      header: 'Ready',
      accessor: 'ready' as const,
      width: '10%',
      sortable: true,
      sortKey: 'ready',
    },
    {
      header: 'Updated',
      accessor: 'updated' as const,
      width: '10%',
      sortable: true,
      sortKey: 'updated',
    },
    {
      header: 'Available',
      accessor: 'available' as const,
      width: '10%',
      sortable: true,
      sortKey: 'available',
    },
    {
      header: 'Images',
      accessor: (row: Deployment) => (
        <span className="break-all whitespace-normal">{row.images?.join(', ') || '-'}</span>
      ),
      width: '18%',
      sortable: true,
      sortKey: 'images',
    },
    {
      header: 'Age',
      accessor: (row: Deployment) => timeAgo(row.age),
      width: '10%',
      sortable: true,
      sortKey: 'age',
    },
  ];

  const sortedDeployments = useMemo(() => {
    let source = [...(data || [])];
    
    // Filter by selected namespaces (if any are selected)
    if (selectedNamespaces.length > 0) {
      source = source.filter((deployment) => selectedNamespaces.includes(deployment.namespace));
    }
    
    const factor = sortState.direction === 'asc' ? 1 : -1;

    return source.sort((first, second) => {
      if (sortState.key === 'name') return first.name.localeCompare(second.name) * factor;
      if (sortState.key === 'namespace') return first.namespace.localeCompare(second.namespace) * factor;
      if (sortState.key === 'status') return (first.status || '').localeCompare(second.status || '') * factor;
      if (sortState.key === 'ready') return (first.ready || '').localeCompare(second.ready || '') * factor;
      if (sortState.key === 'updated') return ((first.updated ?? 0) - (second.updated ?? 0)) * factor;
      if (sortState.key === 'available') return ((first.available ?? 0) - (second.available ?? 0)) * factor;
      if (sortState.key === 'images') {
        return (first.images?.join(',') || '').localeCompare(second.images?.join(',') || '') * factor;
      }

      const firstAge = Date.parse(first.age || '');
      const secondAge = Date.parse(second.age || '');
      return ((Number.isNaN(firstAge) ? 0 : firstAge) - (Number.isNaN(secondAge) ? 0 : secondAge)) * factor;
    });
  }, [data, sortState, selectedNamespaces]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-text">Deployments</h1>
        <p className="text-text-secondary mt-1">Manage Kubernetes deployments</p>
      </div>

      <DataTable
        columns={columns}
        data={sortedDeployments}
        isLoading={isLoading}
        error={error?.message}
        rowKey="name"
        onRowClick={(row) => {
          setSelectedDeployment(row);
          setPanelOpen(true);
        }}
        selectedRowKey={panelOpen ? selectedDeployment?.name : undefined}
        sortState={sortState}
        onSortChange={(nextSort) => setSortState(nextSort as { key: DeploymentSortKey; direction: 'asc' | 'desc' })}
      />

      {panelOpen && selectedDeployment && (
        <>
          <div
            className="fixed inset-0 z-40 bg-transparent"
            onClick={() => setPanelOpen(false)}
          />
          <DeploymentDetailPanel
            deployment={selectedDeployment}
            onClose={() => setPanelOpen(false)}
          />
        </>
      )}
    </div>
  );
};
