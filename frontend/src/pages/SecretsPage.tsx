import { useState } from 'react';
import { useSecrets } from '../hooks/useKubernetes';
import { useNamespace } from '../context/NamespaceContext';
import { DataTable, type SortState } from '../components/DataTable';
import type { Secret } from '../types';
import { timeAgo } from '../utils';

export const SecretsPage = () => {
  const { data, isLoading, error } = useSecrets();
  const { selectedNamespaces } = useNamespace();
  const [sortState, setSortState] = useState<SortState>({ key: 'name', direction: 'asc' });

  const filteredData = data?.filter((secret) =>
    selectedNamespaces.length === 0 || selectedNamespaces.includes(secret.namespace)
  ) ?? [];

  const columns = [
    {
      header: 'Name',
      accessor: (secret: Secret) => <span className="font-medium text-primary">{secret.name}</span>,
      width: '25%',
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
      header: 'Type',
      accessor: (secret: Secret) => (
        <span className="text-text-secondary text-sm">{secret.secret_type}</span>
      ),
      width: '20%',
      sortable: true,
      sortKey: 'secret_type',
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
      accessor: (secret: Secret) => timeAgo(secret.age),
      width: '15%',
      sortable: true,
      sortKey: 'age',
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-text">Secrets</h1>
        <p className="text-text-secondary mt-1">Manage Kubernetes Secrets</p>
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
