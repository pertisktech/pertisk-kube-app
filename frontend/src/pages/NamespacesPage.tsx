import { useEffect, useMemo, useState } from 'react';
import { Trash2 } from '../components/Icons';
import { useRealtimeNamespaces } from '../hooks/useRealtimeResources';
import { DataTable } from '../components/DataTable';
import { NamespaceDetailPanel } from '../components/NamespaceDetailPanel';
import { ConfirmDialog } from '../components/ConfirmDialog';
import type { Namespace } from '../types';
import { timeAgo } from '../utils';
import { deleteNamespace } from '../hooks/useKubernetes';

type NamespaceSortKey = 'name' | 'status' | 'age';

export const NamespacesPage = () => {
  const { data, isLoading, error } = useRealtimeNamespaces();
  const [selectedNamespace, setSelectedNamespace] = useState<Namespace | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [selectedRows, setSelectedRows] = useState<string[]>([]);
  const [confirmDelete, setConfirmDelete] = useState<{ keys: string[]; label: string } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [sortState, setSortState] = useState<{ key: NamespaceSortKey; direction: 'asc' | 'desc' }>({
    key: 'age',
    direction: 'desc',
  });

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

  const handleDeleteSingle = async (name: string) => {
    setConfirmDelete({ keys: [name], label: name });
    setPanelOpen(false);
  };

  const handleDeleteSelected = () => {
    if (selectedRows.length === 0) return;
    setConfirmDelete({
      keys: selectedRows,
      label: selectedRows.length === 1 ? selectedRows[0] : `${selectedRows.length} namespaces`,
    });
  };

  const handleConfirmDelete = async () => {
    if (!confirmDelete) return;
    setIsDeleting(true);
    try {
      await Promise.all(confirmDelete.keys.map((name) => deleteNamespace(name)));
      setSelectedRows([]);
      setConfirmDelete(null);
    } finally {
      setIsDeleting(false);
    }
  };

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
        <span className="font-medium text-text">{row.name}</span>
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
    const compareText = (left: unknown, right: unknown) =>
      String(left ?? '').localeCompare(String(right ?? ''), undefined, {
        numeric: true,
        sensitivity: 'base',
      });

    return source.sort((first, second) => {
      if (sortState.key === 'name') {
        return compareText(first.name, second.name) * directionFactor;
      }

      if (sortState.key === 'status') {
        const result = compareText(first.phase, second.phase);
        return (result !== 0 ? result : compareText(first.name, second.name)) * directionFactor;
      }

      const firstTime = Date.parse(first.age);
      const secondTime = Date.parse(second.age);
      const firstValue = Number.isNaN(firstTime) ? 0 : firstTime;
      const secondValue = Number.isNaN(secondTime) ? 0 : secondTime;
      const result = firstValue - secondValue;
      return (result !== 0 ? result : compareText(first.name, second.name)) * directionFactor;
    });
  }, [data, sortState]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-text">Namespaces <span className="text-base font-normal text-text-secondary">(Manage Kubernetes namespaces)</span></h1>
      </div>

      <DataTable
        columns={columns}
        data={sortedNamespaces}
        isLoading={isLoading}
        error={error}
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
            className="fixed inset-0 z-[95] bg-black/20"
            onClick={() => setPanelOpen(false)}
          />
          <NamespaceDetailPanel
            namespace={selectedNamespace}
            onClose={() => setPanelOpen(false)}
            getStatusClass={getStatusClass}
            onDelete={handleDeleteSingle}
          />
        </>
      )}

      {selectedRows.length > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[110] flex items-center gap-3 px-4 py-3 bg-surface border-2 border-orange-500 rounded-xl shadow-2xl animate-in fade-in slide-in-from-bottom-4 duration-200">
          <span className="text-sm text-text-secondary font-medium">
            {selectedRows.length} selected
          </span>
          <div className="w-px h-4 bg-border" />
          <button
            type="button"
            onClick={handleDeleteSelected}
            className="inline-flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg bg-[var(--color-icon-danger)]/10 text-[var(--color-icon-danger)] hover:bg-[var(--color-icon-danger)]/20 font-medium transition-colors"
          >
            <Trash2 size={14} />
            Delete
          </button>
          <button
            type="button"
            onClick={() => setSelectedRows([])}
            className="text-xs text-text-secondary hover:text-text transition-colors"
          >
            Clear
          </button>
        </div>
      )}

      <ConfirmDialog
        open={confirmDelete !== null}
        title={`Delete ${confirmDelete?.label ?? ''}`}
        description={
          confirmDelete && confirmDelete.keys.length === 1
            ? `Are you sure you want to delete namespace "${confirmDelete.label}"? This action cannot be undone.`
            : `Are you sure you want to delete ${confirmDelete?.keys.length} namespaces? This action cannot be undone.`
        }
        confirmLabel="Delete"
        destructive
        isLoading={isDeleting}
        onConfirm={handleConfirmDelete}
        onCancel={() => setConfirmDelete(null)}
      />
    </div>
  );
};
