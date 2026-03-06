import { useState, useMemo } from 'react';
import { usePDB } from '../hooks/useKubernetes';
import { useNamespace } from '../context/NamespaceContext';
import { DataTable, type SortState } from '../components/DataTable';
import type { PDB } from '../types';
import { timeAgo } from '../utils';

export const PDBPage = () => {
  const { data, isLoading, error } = usePDB();
  const { selectedNamespaces } = useNamespace();
  const [sortState, setSortState] = useState<SortState>({ key: 'name', direction: 'asc' });

  const sortedAndFilteredData = useMemo(() => {
    if (!data) return [];
    const filtered = data.filter((pdb) =>
      selectedNamespaces.length === 0 || selectedNamespaces.includes(pdb.namespace)
    );
    const sorted = [...filtered];
    const factor = sortState.direction === 'asc' ? 1 : -1;
    const compareText = (left: unknown, right: unknown) =>
      String(left ?? '').localeCompare(String(right ?? ''), undefined, {
        numeric: true,
        sensitivity: 'base',
      });

    sorted.sort((a, b) => {
      if (sortState.key === 'name') return compareText(a.name, b.name) * factor;
      if (sortState.key === 'namespace') {
        const result = compareText(a.namespace, b.namespace);
        return (result !== 0 ? result : compareText(a.name, b.name)) * factor;
      }
      if (sortState.key === 'allowed_disruptions') {
        const result = (a.allowed_disruptions || 0) - (b.allowed_disruptions || 0);
        return (result !== 0 ? result : compareText(a.name, b.name)) * factor;
      }
      if (sortState.key === 'status') {
        const result = compareText(a.status, b.status);
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
  }, [data, sortState, selectedNamespaces]);

  const columns = [
    {
      header: 'Name',
      accessor: (pdb: PDB) => <span className="font-medium text-primary">{pdb.name}</span>,
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
      header: 'Min Available',
      accessor: 'min_available' as const,
      width: '15%',
      sortable: false,
    },
    {
      header: 'Allowed Disruptions',
      accessor: 'allowed_disruptions' as const,
      width: '15%',
      sortable: true,
      sortKey: 'allowed_disruptions',
    },
    {
      header: 'Status',
      accessor: (pdb: PDB) => (
        <span
          className={`inline-block px-3 py-1 rounded-full text-sm ${
            pdb.status === 'Healthy'
              ? 'bg-green-100 text-green-800'
              : 'bg-red-100 text-red-800'
          }`}
        >
          {pdb.status}
        </span>
      ),
      width: '15%',
      sortable: true,
      sortKey: 'status',
    },
    {
      header: 'Age',
      accessor: (pdb: PDB) => timeAgo(pdb.age),
      width: '10%',
      sortable: true,
      sortKey: 'age',
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-text">Pod Disruption Budgets</h1>
        <p className="text-text-secondary mt-1">Manage Kubernetes Pod Disruption Budgets</p>
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
