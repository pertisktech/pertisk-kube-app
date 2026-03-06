import { useEffect, useMemo, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { useRealtimeCronJobs } from '../hooks/useRealtimeResources';
import { useNamespace } from '../context/NamespaceContext';
import { CronJobDetailPanel, DataTable, ConfirmDialog } from '../components';
import type { CronJob } from '../types';
import { timeAgo } from '../utils';
import { deleteCronJob } from '../hooks/useKubernetes';

type CronJobSortKey =
  | 'name'
  | 'namespace'
  | 'schedule'
  | 'suspend'
  | 'active'
  | 'last_schedule'
  | 'next_execution'
  | 'time_zone'
  | 'age';

export const CronJobsPage = () => {
  const { data, isLoading, error } = useRealtimeCronJobs();
  const { selectedNamespaces } = useNamespace();
  const [selectedCronJob, setSelectedCronJob] = useState<CronJob | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [selectedRows, setSelectedRows] = useState<string[]>([]);
  const [confirmDelete, setConfirmDelete] = useState<{ keys: string[]; label: string } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [sortState, setSortState] = useState<{ key: CronJobSortKey; direction: 'asc' | 'desc' }>({
    key: 'name',
    direction: 'asc',
  });

  useEffect(() => {
    if (!data || data.length === 0) {
      setSelectedCronJob(null);
      return;
    }

    if (!selectedCronJob) {
      setSelectedCronJob(data[0]);
      return;
    }

    const updatedSelected = data.find(
      (item) => item.name === selectedCronJob.name && item.namespace === selectedCronJob.namespace
    );
    setSelectedCronJob(updatedSelected ?? data[0]);
  }, [data]);

  const handleDeleteSingle = async (namespace: string, name: string) => {
    setConfirmDelete({ keys: [`${namespace}/${name}`], label: name });
    setPanelOpen(false);
  };

  const handleDeleteSelected = () => {
    if (selectedRows.length === 0) return;
    setConfirmDelete({
      keys: selectedRows,
      label: selectedRows.length === 1 ? selectedRows[0].split('/')[1] : `${selectedRows.length} cronjobs`,
    });
  };

  const handleConfirmDelete = async () => {
    if (!confirmDelete) return;
    setIsDeleting(true);
    try {
      await Promise.all(
        confirmDelete.keys.map((key) => {
          const [ns, name] = key.split('/');
          return deleteCronJob(ns, name);
        })
      );
      setSelectedRows([]);
      setConfirmDelete(null);
    } finally {
      setIsDeleting(false);
    }
  };

  const sortedCronJobs = useMemo((): (CronJob & { id: string })[] => {
    let source = [...(data || [])];
    
    // Filter by selected namespaces (if any are selected)
    if (selectedNamespaces.length > 0) {
      source = source.filter((cronJob) => selectedNamespaces.includes(cronJob.namespace));
    }
    
    // Add unique id for row selection
    source = source.map((item) => ({
      ...item,
      id: `${item.namespace}/${item.name}`,
    })) as (CronJob & { id: string })[];
    
    const factor = sortState.direction === 'asc' ? 1 : -1;

    return source.sort((first, second) => {
      if (sortState.key === 'name') return first.name.localeCompare(second.name) * factor;
      if (sortState.key === 'namespace') return first.namespace.localeCompare(second.namespace) * factor;
      if (sortState.key === 'schedule') return first.schedule.localeCompare(second.schedule) * factor;
      if (sortState.key === 'suspend') return (Number(first.suspend) - Number(second.suspend)) * factor;
      if (sortState.key === 'active') return ((first.active ?? 0) - (second.active ?? 0)) * factor;
      if (sortState.key === 'last_schedule') {
        const firstLast = Date.parse(first.last_schedule || '');
        const secondLast = Date.parse(second.last_schedule || '');
        return ((Number.isNaN(firstLast) ? 0 : firstLast) - (Number.isNaN(secondLast) ? 0 : secondLast)) * factor;
      }
      if (sortState.key === 'next_execution') {
        const firstNext = Date.parse(first.next_execution || '');
        const secondNext = Date.parse(second.next_execution || '');
        return ((Number.isNaN(firstNext) ? 0 : firstNext) - (Number.isNaN(secondNext) ? 0 : secondNext)) * factor;
      }
      if (sortState.key === 'time_zone') {
        return (first.time_zone || '').localeCompare(second.time_zone || '') * factor;
      }

      const firstAge = Date.parse(first.age || '');
      const secondAge = Date.parse(second.age || '');
      return ((Number.isNaN(firstAge) ? 0 : firstAge) - (Number.isNaN(secondAge) ? 0 : secondAge)) * factor;
    }) as (CronJob & { id: string })[];
  }, [data, sortState, selectedNamespaces]);

  const columns = [
    {
      header: 'Name',
      accessor: (row: CronJob) => (
        <span className="font-medium text-text">{row.name}</span>
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
      header: 'Schedule',
      accessor: 'schedule' as const,
      width: '10%',
      sortable: true,
      sortKey: 'schedule',
    },
    {
      header: 'Suspend',
      accessor: (row: CronJob) => (
        <span className={row.suspend ? 'text-[var(--color-icon-warning)] font-medium' : 'text-[var(--color-icon-success)] font-medium'}>
          {row.suspend ? 'Yes' : 'No'}
        </span>
      ),
      width: '9%',
      sortable: true,
      sortKey: 'suspend',
    },
    {
      header: 'Active',
      accessor: (row: CronJob) => (
        <span className={row.active > 0 ? 'text-[var(--color-icon-info)] font-medium' : 'text-text-secondary'}>
          {row.active ?? 0}
        </span>
      ),
      width: '8%',
      sortable: true,
      sortKey: 'active',
    },
    {
      header: 'Last Schedule',
      accessor: (row: CronJob) => (row.last_schedule ? timeAgo(row.last_schedule) : '-'),
      width: '12%',
      sortable: true,
      sortKey: 'last_schedule',
    },
    {
      header: 'Next Execution',
      accessor: (row: CronJob) => (row.next_execution ? timeAgo(row.next_execution) : '-'),
      width: '12%',
      sortable: true,
      sortKey: 'next_execution',
    },
    {
      header: 'Time Zone',
      accessor: (row: CronJob) => row.time_zone || '-',
      width: '10%',
      sortable: true,
      sortKey: 'time_zone',
    },
    {
      header: 'Age',
      accessor: (row: CronJob) => timeAgo(row.age),
      width: '8%',
      sortable: true,
      sortKey: 'age',
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-text">CronJobs</h1>
        <p className="text-text-secondary mt-1">Manage CronJob resources</p>
      </div>

      <DataTable
        columns={columns}
        data={sortedCronJobs}
        isLoading={isLoading}
        error={error}
        rowKey="id"
        onRowClick={(row) => {
          setSelectedCronJob(row);
          setPanelOpen(true);
        }}
        selectedRowKey={panelOpen && selectedCronJob ? `${selectedCronJob.namespace}/${selectedCronJob.name}` : undefined}
        sortState={sortState}
        onSortChange={(nextSort) => setSortState(nextSort as { key: CronJobSortKey; direction: 'asc' | 'desc' })}
        enableRowSelection={true}
        selectedRows={selectedRows}
        onRowSelectionChange={(rows) => setSelectedRows(rows)}
      />

      {panelOpen && selectedCronJob && (
        <>
          <div
            className="fixed inset-0 z-[95] bg-black/20"
            onClick={() => setPanelOpen(false)}
          />
          <CronJobDetailPanel
            cronJob={selectedCronJob}
            onClose={() => setPanelOpen(false)}
            onDelete={handleDeleteSingle}
          />
        </>
      )}

      {selectedRows.length > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[110] flex items-center gap-3 px-4 py-3 bg-surface border border-border rounded-xl shadow-2xl animate-in fade-in slide-in-from-bottom-4 duration-200">
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
            ? `Are you sure you want to delete "${confirmDelete.label}"? This action cannot be undone.`
            : `Are you sure you want to delete ${confirmDelete?.keys.length} cronjobs? This action cannot be undone.`
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
