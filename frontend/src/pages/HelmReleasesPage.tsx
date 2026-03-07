import { useEffect, useMemo, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { useHelmReleases, deleteHelmRelease, getHelmReleaseYaml } from '../hooks/useKubernetes';
import { DataTable } from '../components/DataTable';
import { HelmReleaseDetailPanel } from '../components/HelmReleaseDetailPanel';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { openPanelTab } from '../components/BottomPanel';
import { timeAgo } from '../utils';
import type { HelmRelease } from '../types';

type ReleaseSortKey = 'name' | 'namespace' | 'chart' | 'revision' | 'status' | 'updated';

const getStatusClass = (status: string) => {
  const s = status.toLowerCase();
  if (s === 'deployed') return 'status-green';
  if (s === 'failed') return 'status-red';
  if (s.startsWith('pending') || s === 'uninstalling') return 'status-yellow';
  if (s === 'superseded') return 'status-gray';
  return 'status-gray';
};

export const HelmReleasesPage = () => {
  const { data, isLoading, error } = useHelmReleases();
  const [selectedRelease, setSelectedRelease] = useState<HelmRelease | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [selectedRows, setSelectedRows] = useState<string[]>([]);
  const [confirmDelete, setConfirmDelete] = useState<{ keys: string[]; label: string } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [sortState, setSortState] = useState<{ key: ReleaseSortKey; direction: 'asc' | 'desc' }>({
    key: 'name',
    direction: 'asc',
  });

  useEffect(() => {
    if (!data || data.length === 0) {
      setSelectedRelease(null);
      return;
    }
    if (!selectedRelease) {
      setSelectedRelease(data[0]);
      return;
    }
    const updated = data.find(
      (r) => r.name === selectedRelease.name && r.namespace === selectedRelease.namespace,
    );
    setSelectedRelease(updated ?? data[0]);
  }, [data]);

  const handleOpenYaml = async (release: HelmRelease) => {
    setPanelOpen(false);
    try {
      const yaml = await getHelmReleaseYaml(release.namespace, release.name);
      openPanelTab({ type: 'yaml-editor', yamlContent: yaml, title: release.name });
    } catch {
      openPanelTab({ type: 'yaml-editor' });
    }
  };

  const handleDeleteSingle = (namespace: string, name: string) => {
    setConfirmDelete({ keys: [`${namespace}/${name}`], label: name });
    setPanelOpen(false);
  };

  const handleDeleteSelected = () => {
    if (selectedRows.length === 0) return;
    setConfirmDelete({
      keys: selectedRows,
      label:
        selectedRows.length === 1
          ? selectedRows[0].split('/')[1]
          : `${selectedRows.length} releases`,
    });
  };

  const handleConfirmDelete = async () => {
    if (!confirmDelete) return;
    setIsDeleting(true);
    try {
      await Promise.all(
        confirmDelete.keys.map((key) => {
          const [ns, name] = key.split('/');
          return deleteHelmRelease(ns, name);
        }),
      );
      setSelectedRows([]);
      setConfirmDelete(null);
      setPanelOpen(false);
      setSelectedRelease(null);
    } finally {
      setIsDeleting(false);
    }
  };

  const columns = [
    {
      header: 'Name',
      accessor: (row: HelmRelease) => (
        <span className="font-medium text-text">{row.name}</span>
      ),
      width: '16%',
      sortable: true,
      sortKey: 'name',
    },
    {
      header: 'Namespace',
      accessor: (row: HelmRelease) => (
        <span className="text-xs font-mono text-text-secondary">{row.namespace}</span>
      ),
      width: '12%',
      sortable: true,
      sortKey: 'namespace',
    },
    {
      header: 'Chart',
      accessor: (row: HelmRelease) => (
        <span className="text-xs text-text">{row.chart !== '-' ? row.chart : row.name}</span>
      ),
      width: '14%',
      sortable: true,
      sortKey: 'chart',
    },
    {
      header: 'Revision',
      accessor: (row: HelmRelease) => (
        <span className="text-xs text-text-secondary">{row.revision}</span>
      ),
      width: '8%',
      sortable: true,
      sortKey: 'revision',
    },
    {
      header: 'Version',
      accessor: (row: HelmRelease) => (
        <span className="font-mono text-xs text-text-secondary">{row.chart_version}</span>
      ),
      width: '10%',
    },
    {
      header: 'App Version',
      accessor: (row: HelmRelease) => (
        <span className="font-mono text-xs text-text-secondary">{row.app_version}</span>
      ),
      width: '10%',
    },
    {
      header: 'Status',
      accessor: (row: HelmRelease) => (
        <span
          className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusClass(row.status)}`}
        >
          {row.status}
        </span>
      ),
      width: '12%',
      sortable: true,
      sortKey: 'status',
    },
    {
      header: 'Updated',
      accessor: (row: HelmRelease) => (
        <span className="text-xs text-text-secondary">
          {row.updated ? timeAgo(row.updated) : '-'}
        </span>
      ),
      width: '18%',
      sortable: true,
      sortKey: 'updated',
    },
  ];

  const sortedReleases = useMemo(() => {
    const source = [...(data || [])];
    const factor = sortState.direction === 'asc' ? 1 : -1;
    const compareText = (a: unknown, b: unknown) =>
      String(a ?? '').localeCompare(String(b ?? ''), undefined, {
        numeric: true,
        sensitivity: 'base',
      });

    return source.sort((a, b) => {
      switch (sortState.key) {
        case 'revision':
          return ((a.revision ?? 0) - (b.revision ?? 0)) * factor;
        case 'updated': {
          const ta = a.updated ? Date.parse(a.updated) : 0;
          const tb = b.updated ? Date.parse(b.updated) : 0;
          const diff = (Number.isNaN(ta) ? 0 : ta) - (Number.isNaN(tb) ? 0 : tb);
          return (diff !== 0 ? diff : compareText(a.name, b.name)) * factor;
        }
        case 'status':
          return (compareText(a.status, b.status) || compareText(a.name, b.name)) * factor;
        case 'namespace':
          return (compareText(a.namespace, b.namespace) || compareText(a.name, b.name)) * factor;
        case 'chart':
          return (compareText(a.chart, b.chart) || compareText(a.name, b.name)) * factor;
        default:
          return compareText(a.name, b.name) * factor;
      }
    });
  }, [data, sortState]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-text">
          Releases{' '}
          <span className="text-base font-normal text-text-secondary">
            (Installed Helm releases)
          </span>
        </h1>
      </div>

      <DataTable
        columns={columns}
        data={sortedReleases}
        isLoading={isLoading}
        error={error?.message ?? null}
        rowKey={(row) => `${row.namespace}/${row.name}`}
        onRowClick={(row) => {
          setSelectedRelease(row);
          setPanelOpen(true);
        }}
        selectedRowKey={panelOpen ? `${selectedRelease?.namespace}/${selectedRelease?.name}` : undefined}
        sortState={sortState}
        onSortChange={(next) =>
          setSortState(next as { key: ReleaseSortKey; direction: 'asc' | 'desc' })
        }
        enableRowSelection
        selectedRows={selectedRows}
        onRowSelectionChange={(rows) => setSelectedRows(rows)}
      />

      {/* Right detail panel */}
      {panelOpen && selectedRelease && (
        <>
          <div
            className="fixed inset-0 z-[95] bg-black/20"
            onClick={() => setPanelOpen(false)}
          />
          <HelmReleaseDetailPanel
            release={selectedRelease}
            onClose={() => setPanelOpen(false)}
            onOpenYaml={handleOpenYaml}
            onDelete={handleDeleteSingle}
          />
        </>
      )}

      {/* Bulk action bar */}
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
            Uninstall
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
        title="Uninstall Helm Release"
        description={`Uninstall "${confirmDelete?.label}"? This will remove all Kubernetes resources managed by this release.`}
        confirmLabel="Uninstall"
        destructive
        isLoading={isDeleting}
        onConfirm={handleConfirmDelete}
        onCancel={() => setConfirmDelete(null)}
      />
    </div>
  );
};
