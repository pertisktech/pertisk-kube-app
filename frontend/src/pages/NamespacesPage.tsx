import { useEffect, useMemo, useState } from 'react';
import { useNamespaces } from '../hooks/useKubernetes';
import { useNamespace } from '../context/NamespaceContext';
import { DataTable } from '../components/DataTable';
import { NamespaceDetailPanel } from '../components/NamespaceDetailPanel';
import type { Namespace } from '../types';
import { timeAgo } from '../utils';

type NamespaceSortKey = 'name' | 'status' | 'age';

export const NamespacesPage = () => {
  const { data, isLoading, error } = useNamespaces();
  const { setNamespaces } = useNamespace();
  const [selectedNamespace, setSelectedNamespace] = useState<Namespace | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [selectedRows, setSelectedRows] = useState<string[]>([]);
  const [sortState, setSortState] = useState<{ key: NamespaceSortKey; direction: 'asc' | 'desc' }>({
    key: 'name',
    direction: 'asc',
  });

  useEffect(() => {
    if (data && data.length > 0) {
      const namespaceNames = data.map((ns) => ns.name);
      setNamespaces(namespaceNames);
    }
  }, [data, setNamespaces]);

  useEffect(() => {
    if (!data || data.length === 0) {
      setSelectedNamespace(null);
      return;
    }

    if (!selectedNamespace) {
      setSelectedNamespace(data[0]);
      return;
    }

    const updatedSelected = data.find((item) => item.name === selectedNamespace.name);
    setSelectedNamespace(updatedSelected ?? data[0]);
  }, [data]);

  const getStatusClass = (phase: string) => {
    const normalized = phase.toLowerCase();
    if (normalized === 'active') return 'status-green';
    if (normalized === 'terminating') return 'status-yellow';
    if (normalized === 'failed') return 'status-red';
    return 'status-gray';
  };

  const columns = [
    {
      header: 'Name',
      accessor: (row: Namespace) => (
        <span className="font-medium text-primary">{row.name}</span>
      ),
      width: '25%',
      sortable: true,
      sortKey: 'name',
    },
    {
      header: 'Status',
      accessor: (row: Namespace) => (
        <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${getStatusClass(row.phase)}`}>
          {row.phase}
        </span>
      ),
      width: '20%',
      sortable: true,
      sortKey: 'status',
    },
    {
      header: 'Labels',
      accessor: 'labels' as const,
      width: '35%',
    },
    {
      header: 'Age',
      accessor: (row: Namespace) => timeAgo(row.age),
      width: '20%',
      sortable: true,
      sortKey: 'age',
    },
  ];

  const sortedNamespaces = useMemo(() => {
    const source = [...(data || [])];
    const directionFactor = sortState.direction === 'asc' ? 1 : -1;

    return source.sort((first, second) => {
      if (sortState.key === 'name') {
        return first.name.localeCompare(second.name) * directionFactor;
      }

      if (sortState.key === 'status') {
        return first.phase.localeCompare(second.phase) * directionFactor;
      }

      const firstTime = Date.parse(first.age);
      const secondTime = Date.parse(second.age);
      return (firstTime - secondTime) * directionFactor;
    });
  }, [data, sortState]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-text">Namespaces</h1>
        <p className="text-text-secondary mt-1">Manage Kubernetes namespaces</p>
      </div>

      <DataTable
        columns={columns}
        data={sortedNamespaces}
        isLoading={isLoading}
        error={error?.message}
        rowKey="name"
        onRowClick={(row) => {
          setSelectedNamespace(row);
          setPanelOpen(true);
        }}
        selectedRowKey={panelOpen ? selectedNamespace?.name : undefined}
        sortState={sortState}
        onSortChange={(nextSort) => setSortState(nextSort as { key: NamespaceSortKey; direction: 'asc' | 'desc' })}
        enableRowSelection={true}
        selectedRows={selectedRows}
        onRowSelectionChange={(rows) => setSelectedRows(rows)}
      />

      {panelOpen && selectedNamespace && (
        <>
          <div
            className="fixed inset-0 z-40 bg-transparent"
            onClick={() => setPanelOpen(false)}
          />
          <NamespaceDetailPanel
            namespace={selectedNamespace}
            onClose={() => setPanelOpen(false)}
            getStatusClass={getStatusClass}
          />
        </>
      )}
    </div>
  );
};
