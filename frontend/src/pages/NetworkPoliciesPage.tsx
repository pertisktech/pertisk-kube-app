import { useState } from 'react';
import { DataTable, type SortState } from '../components/DataTable';
import { useNamespace } from '../context/NamespaceContext';
import { useNetworkPolicies } from '../hooks/useKubernetes';
import type { NetworkPolicy } from '../types';
import { timeAgo } from '../utils';

export const NetworkPoliciesPage = () => {
  const { data, isLoading, error } = useNetworkPolicies();
  const { selectedNamespaces } = useNamespace();
  const [sortState, setSortState] = useState<SortState>({ key: 'name', direction: 'asc' });

  const filteredData = data?.filter((item) =>
    selectedNamespaces.length === 0 || selectedNamespaces.includes(item.namespace)
  ) ?? [];

  const columns = [
    {
      header: 'Name',
      accessor: (item: NetworkPolicy) => <span className="font-medium text-primary">{item.name}</span>,
      width: '20%',
      sortable: true,
      sortKey: 'name',
    },
    {
      header: 'Namespace',
      accessor: 'namespace' as const,
      width: '16%',
      sortable: true,
      sortKey: 'namespace',
    },
    {
      header: 'Pod Selector',
      accessor: 'pod_selector' as const,
      width: '22%',
      sortable: true,
      sortKey: 'pod_selector',
    },
    {
      header: 'Policy Types',
      accessor: (item: NetworkPolicy) => (
        <span className="text-text-secondary">{item.policy_types || '-'}</span>
      ),
      width: '16%',
      sortable: true,
      sortKey: 'policy_types',
    },
    {
      header: 'Ingress Rules',
      accessor: 'ingress_rules' as const,
      width: '10%',
      sortable: true,
      sortKey: 'ingress_rules',
    },
    {
      header: 'Egress Rules',
      accessor: 'egress_rules' as const,
      width: '10%',
      sortable: true,
      sortKey: 'egress_rules',
    },
    {
      header: 'Age',
      accessor: (item: NetworkPolicy) => timeAgo(item.age),
      width: '8%',
      sortable: true,
      sortKey: 'age',
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-text">Network Policies</h1>
        <p className="text-text-secondary mt-1">View ingress and egress policy rules</p>
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
