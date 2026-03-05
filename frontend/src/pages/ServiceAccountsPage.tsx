import { useMemo } from 'react';
import { useServiceAccounts } from '../hooks/useKubernetes';
import { DataTable } from '../components/DataTable';
import type { ServiceAccount } from '../types';
import { timeAgo } from '../utils';
import { useNamespace } from '../context/NamespaceContext';

export const ServiceAccountsPage = () => {
  const { data, isLoading, error } = useServiceAccounts();
  const { selectedNamespaces } = useNamespace();

  const filteredData = useMemo(() => {
    if (!data) return [];
    if (selectedNamespaces.length === 0) return data;
    return data.filter((sa) => selectedNamespaces.includes(sa.namespace));
  }, [data, selectedNamespaces]);

  const columns = [
    {
      header: 'Name',
      accessor: 'name' as const,
      width: '30%',
    },
    {
      header: 'Namespace',
      accessor: 'namespace' as const,
      width: '25%',
    },
    {
      header: 'Secrets',
      accessor: 'secrets' as const,
      width: '20%',
    },
    {
      header: 'Age',
      accessor: 'age' as const,
      width: '25%',
      render: (sa: ServiceAccount) => timeAgo(sa.age),
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-text">Service Accounts</h1>
        <p className="text-text-secondary mt-1">
          Manage ServiceAccount resources for authentication and authorization.
        </p>
      </div>

      <DataTable
        data={filteredData}
        columns={columns}
        isLoading={isLoading}
        error={error?.message}
        rowKey="name"
      />
    </div>
  );
};
