import { useEffect, useMemo, useState } from 'react';
import YAML from 'yaml';
import { toast } from 'react-toastify';
import { Loader, RefreshCw, Trash2 } from '../components/Icons';
import { useRealtimeDaemonSets } from '../hooks/useRealtimeResources';
import { useNamespace } from '../context/NamespaceContext';
import { DaemonSetDetailPanel, DataTable, ConfirmDialog } from '../components';
import { StatusBadge } from '../components/StatusBadge';
import type { DaemonSet } from '../types';
import { getAuthToken } from '../utils/auth';
import { timeAgo, matchesResourceNameFilter } from '../utils';
import { deleteDaemonSet, restartDaemonSet, useDaemonSets } from '../hooks/useKubernetes';
import { openPanelTab } from '../components/BottomPanel';

type DaemonSetSortKey =
  | 'name'
  | 'namespace'
  | 'status'
  | 'desired'
  | 'current'
  | 'ready'
  | 'available'
  | 'node_selector'
  | 'age';

const sanitizeDaemonSetYamlForEdit = (yamlText: string) => {
  try {
    const parsed = YAML.parse(yamlText) as Record<string, unknown> | null;
    if (!parsed || typeof parsed !== 'object') {
      return yamlText;
    }

    const metadata = (parsed.metadata as Record<string, unknown> | undefined) ?? undefined;
    if (metadata && typeof metadata === 'object') {
      delete metadata.managedFields;
      delete metadata.resourceVersion;
      delete metadata.uid;
      delete metadata.generation;
      delete metadata.creationTimestamp;
      delete metadata.selfLink;

      const annotations = metadata.annotations as Record<string, unknown> | undefined;
      if (annotations && typeof annotations === 'object') {
        delete annotations['kubectl.kubernetes.io/last-applied-configuration'];
        if (Object.keys(annotations).length === 0) {
          delete metadata.annotations;
        }
      }
    }

    delete parsed.status;

    return YAML.stringify(parsed, { lineWidth: 0 });
  } catch {
    return yamlText;
  }
};

export const DaemonSetsPage = () => {
  const { data: realtimeDaemonSets, isLoading: realtimeLoading, error: realtimeError } = useRealtimeDaemonSets();
  const { data: apiDaemonSets } = useDaemonSets({ refetchInterval: 2_000 });
  const { selectedNamespaces, resourceNameFilter } = useNamespace();
  const [selectedDaemonSet, setSelectedDaemonSet] = useState<DaemonSet | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [selectedRows, setSelectedRows] = useState<string[]>([]);
  const [confirmDelete, setConfirmDelete] = useState<{ keys: string[]; label: string } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isRestartingSelected, setIsRestartingSelected] = useState(false);
  const [sortState, setSortState] = useState<{ key: DaemonSetSortKey; direction: 'asc' | 'desc' }>({
    key: 'age',
    direction: 'desc',
  });

  // Merge realtime + REST so replica counters stay fresh.
  // Realtime data is preferred since it's more up-to-date.
  const data = useMemo(() => {
    const realtime = realtimeDaemonSets ?? [];
    const api = apiDaemonSets ?? [];

    if (realtime.length === 0) return api;
    if (api.length === 0) return realtime;

    const apiByKey = new Map(api.map((item) => [`${item.namespace}/${item.name}`, item]));
    const merged = realtime.map((item) => {
      const key = `${item.namespace}/${item.name}`;
      const fromApi = apiByKey.get(key);
      if (!fromApi) return item;

      return {
        ...fromApi,
        ...item,
        status: item.status ?? fromApi.status,
        desired: item.desired ?? fromApi.desired,
        current: item.current ?? fromApi.current,
        ready: item.ready ?? fromApi.ready,
        available: item.available ?? fromApi.available,
        node_selector: item.node_selector ?? fromApi.node_selector,
      };
    });

    for (const item of api) {
      const key = `${item.namespace}/${item.name}`;
      if (!merged.some((existing) => `${existing.namespace}/${existing.name}` === key)) {
        merged.push(item);
      }
    }

    return merged;
  }, [realtimeDaemonSets, apiDaemonSets]);

  const isLoading = realtimeLoading && apiDaemonSets == null;
  const error = realtimeError && (!apiDaemonSets || apiDaemonSets.length === 0) ? realtimeError : null;

  useEffect(() => {
    if (!data || data.length === 0) {
      setSelectedDaemonSet(null);
      return;
    }

    if (!selectedDaemonSet) {
      setSelectedDaemonSet(data[0]);
      return;
    }

    const updatedSelected = data.find(
      (item) => item.name === selectedDaemonSet.name && item.namespace === selectedDaemonSet.namespace
    );
    setSelectedDaemonSet(updatedSelected ?? data[0]);
  }, [data]);


  const handleOpenYamlEditorFromPanel = async (daemonSet: DaemonSet) => {
    setPanelOpen(false);
    try {
      const token = getAuthToken();
      const res = await fetch(`/api/daemonsets/${encodeURIComponent(daemonSet.namespace)}/${encodeURIComponent(daemonSet.name)}/yaml`, {
        headers: token ? { Authorization: token } : {},
      });
      if (!res.ok) throw new Error(`Failed to load YAML: ${res.statusText}`);
      const yaml = await res.text();
      openPanelTab({ type: 'yaml-editor', yamlContent: sanitizeDaemonSetYamlForEdit(yaml), title: daemonSet.name });
    } catch {
      openPanelTab({ type: 'yaml-editor' });
    }
  };


  const handleDeleteSingle = async (namespace: string, name: string) => {
    setConfirmDelete({ keys: [`${namespace}/${name}`], label: name });
    setPanelOpen(false);
  };

  const handleDeleteSelected = () => {
    if (selectedRows.length === 0) return;
    setConfirmDelete({
      keys: selectedRows,
      label: selectedRows.length === 1 ? selectedRows[0].split('/')[1] : `${selectedRows.length} daemonsets`,
    });
  };

  const handleRestartSelected = async () => {
    if (selectedRows.length === 0 || isRestartingSelected) return;
    setIsRestartingSelected(true);
    const results = await Promise.allSettled(
      selectedRows.map((key) => {
        const [ns, name] = key.split('/');
        return restartDaemonSet(ns, name);
      })
    );
    const failed = results.filter((r) => r.status === 'rejected');
    if (failed.length === 0) {
      toast.success(`Restarted ${selectedRows.length} daemonset${selectedRows.length > 1 ? 's' : ''}.`);
    } else {
      toast.error(`${failed.length} restart${failed.length > 1 ? 's' : ''} failed.`);
    }
    setIsRestartingSelected(false);
  };

  const handleConfirmDelete = async () => {
    if (!confirmDelete) return;
    setIsDeleting(true);
    try {
      await Promise.all(
        confirmDelete.keys.map((key) => {
          const [ns, name] = key.split('/');
          return deleteDaemonSet(ns, name);
        })
      );
      setSelectedRows([]);
      setConfirmDelete(null);
    } finally {
      setIsDeleting(false);
    }
  };

  const columns = [
    {
      header: 'Name',
      accessor: (row: DaemonSet) => <span className="font-medium text-text">{row.name}</span>,
      width: '20%',
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
      accessor: (row: DaemonSet) => <StatusBadge status={row.status || 'Unknown'} />,
      width: '10%',
      sortable: true,
      sortKey: 'status',
    },
    {
      header: 'Desired',
      accessor: 'desired' as const,
      width: '10%',
      sortable: true,
      sortKey: 'desired',
    },
    {
      header: 'Current',
      accessor: 'current' as const,
      width: '10%',
      sortable: true,
      sortKey: 'current',
    },
    {
      header: 'Ready',
      accessor: 'ready' as const,
      width: '10%',
      sortable: true,
      sortKey: 'ready',
    },
    {
      header: 'Available',
      accessor: 'available' as const,
      width: '10%',
      sortable: true,
      sortKey: 'available',
    },
    {
      header: 'Node Selector',
      accessor: (row: DaemonSet) => {
        const entries = Object.entries(row.node_selector || {});
        if (entries.length === 0) return '-';
        return entries.map(([key, value]) => `${key}=${value}`).join(', ');
      },
      width: '15%',
      sortable: true,
      sortKey: 'node_selector',
    },
    {
      header: 'Age',
      accessor: (row: DaemonSet) => timeAgo(row.age),
      width: '10%',
      sortable: true,
      sortKey: 'age',
    },
  ];

  const sortedDaemonSets = useMemo((): (DaemonSet & { id: string })[] => {
    let source = [...(data || [])];
    
    // Filter by selected namespaces (if any are selected)
if (selectedNamespaces.length > 0) {
      source = source.filter((daemonSet) => selectedNamespaces.includes(daemonSet.namespace));
    }
    if (resourceNameFilter.trim()) {
      source = source.filter((d) => matchesResourceNameFilter(d.name, resourceNameFilter));
    }

    // Add unique id for row selection
    source = source.map((item) => ({
      ...item,
      id: `${item.namespace}/${item.name}`,
    })) as (DaemonSet & { id: string })[];
    
    const factor = sortState.direction === 'asc' ? 1 : -1;

    return source.sort((first, second) => {
      if (sortState.key === 'name') return first.name.localeCompare(second.name) * factor;
      if (sortState.key === 'namespace') return first.namespace.localeCompare(second.namespace) * factor;
      if (sortState.key === 'status') return (first.status || '').localeCompare(second.status || '') * factor;
      if (sortState.key === 'desired') return ((first.desired ?? 0) - (second.desired ?? 0)) * factor;
      if (sortState.key === 'current') return ((first.current ?? 0) - (second.current ?? 0)) * factor;
      if (sortState.key === 'ready') return ((first.ready ?? 0) - (second.ready ?? 0)) * factor;
      if (sortState.key === 'available') return ((first.available ?? 0) - (second.available ?? 0)) * factor;
      if (sortState.key === 'node_selector') {
        const firstSelector = Object.entries(first.node_selector || {})
          .map(([key, value]) => `${key}=${value}`)
          .join(',');
        const secondSelector = Object.entries(second.node_selector || {})
          .map(([key, value]) => `${key}=${value}`)
          .join(',');
        return firstSelector.localeCompare(secondSelector) * factor;
      }

      const firstAge = Date.parse(first.age || '');
      const secondAge = Date.parse(second.age || '');
      return ((Number.isNaN(firstAge) ? 0 : firstAge) - (Number.isNaN(secondAge) ? 0 : secondAge)) * factor;
    }) as (DaemonSet & { id: string })[];
  }, [data, sortState, selectedNamespaces, resourceNameFilter]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-text">DaemonSets <span className="text-base font-normal text-text-secondary">(Manage DaemonSet resources)</span></h1>
      </div>

      <div
        className="space-y-2"
      >
        <DataTable
        columns={columns}
        data={sortedDaemonSets}
        isLoading={isLoading}
        error={error}
        rowKey="id"
        onRowClick={(row) => {
          setSelectedDaemonSet(row);
          setPanelOpen(true);
        }}
        selectedRowKey={panelOpen && selectedDaemonSet ? `${selectedDaemonSet.namespace}/${selectedDaemonSet.name}` : undefined}
        sortState={sortState}
        onSortChange={(nextSort) => setSortState(nextSort as { key: DaemonSetSortKey; direction: 'asc' | 'desc' })}
        enableRowSelection={true}
        selectedRows={selectedRows}
        onRowSelectionChange={(rows) => setSelectedRows(rows)}
      />

        </div>

      {panelOpen && selectedDaemonSet && (
        <>
          <div
            className="fixed inset-0 z-[95] bg-black/20"
            onClick={() => setPanelOpen(false)}
          />
          <DaemonSetDetailPanel
            daemonSet={selectedDaemonSet}
            onClose={() => setPanelOpen(false)}
            onOpenYamlEditor={handleOpenYamlEditorFromPanel}
            onRestart={restartDaemonSet}
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
            onClick={() => void handleRestartSelected()}
            disabled={isRestartingSelected}
            className="inline-flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 font-medium transition-colors disabled:opacity-50"
          >
            {isRestartingSelected ? <Loader size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            {isRestartingSelected ? 'Restarting...' : 'Restart'}
          </button>
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
            : `Are you sure you want to delete ${confirmDelete?.keys.length} daemonsets? This action cannot be undone.`
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
