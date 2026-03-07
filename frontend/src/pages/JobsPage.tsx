import { useEffect, useMemo, useRef, useState } from 'react';
import AceEditor from 'react-ace';
import YAML from 'yaml';
import 'ace-builds/src-noconflict/mode-yaml';
import 'ace-builds/src-noconflict/theme-github';
import 'ace-builds/src-noconflict/theme-tomorrow_night';
import { Trash2 } from 'lucide-react';
import { useRealtimeJobs } from '../hooks/useRealtimeResources';
import { useNamespace } from '../context/NamespaceContext';
import { useTheme } from '../context/ThemeContext';
import { DataTable, JobDetailPanel, ConfirmDialog } from '../components';
import type { Job } from '../types';
import { getAuthToken } from '../utils/auth';
import { getStatusColor, timeAgo } from '../utils';
import { deleteJob } from '../hooks/useKubernetes';

type JobSortKey = 'name' | 'namespace' | 'status' | 'completions' | 'duration' | 'age';

const sanitizeJobYamlForEdit = (yamlText: string) => {
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

export const JobsPage = () => {
  const { data, isLoading, error } = useRealtimeJobs();
  const { selectedNamespaces } = useNamespace();
  const theme = useTheme();
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [yamlTabs, setYamlTabs] = useState<Job[]>([]);
  const [activeYamlTabKey, setActiveYamlTabKey] = useState<string | null>(null);
  const [yamlDrawerVisible, setYamlDrawerVisible] = useState(true);
  const [yamlDrawerHeightPx, setYamlDrawerHeightPx] = useState<number | null>(null);
  const [isResizingYamlDrawer, setIsResizingYamlDrawer] = useState(false);
  const resizeStartYRef = useRef(0);
  const resizeStartHeightRef = useRef(0);
  const [yamlContentsByTab, setYamlContentsByTab] = useState<Record<string, string>>({});
  const [yamlLoadingTabKey, setYamlLoadingTabKey] = useState<string | null>(null);
  const [yamlSavingTabKey, setYamlSavingTabKey] = useState<string | null>(null);
  const [yamlErrorByTab, setYamlErrorByTab] = useState<Record<string, string | null>>({});
  const [yamlSuccessByTab, setYamlSuccessByTab] = useState<Record<string, string | null>>({});
  const [selectedRows, setSelectedRows] = useState<string[]>([]);
  const [confirmDelete, setConfirmDelete] = useState<{ keys: string[]; label: string } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [sortState, setSortState] = useState<{ key: JobSortKey; direction: 'asc' | 'desc' }>({
    key: 'age',
    direction: 'desc',
  });

  const getJobKey = (job: Job) => `${job.namespace}/${job.name}`;

  const activeYamlJob = useMemo(() => {
    if (!activeYamlTabKey) {
      return null;
    }
    return yamlTabs.find((job) => getJobKey(job) === activeYamlTabKey) ?? null;
  }, [yamlTabs, activeYamlTabKey]);

  useEffect(() => {
    if (!data || data.length === 0) {
      setSelectedJob(null);
      return;
    }

    if (!selectedJob) {
      setSelectedJob(data[0]);
      return;
    }

    const updatedSelected = data.find(
      (item) => item.name === selectedJob.name && item.namespace === selectedJob.namespace
    );
    setSelectedJob(updatedSelected ?? data[0]);
  }, [data]);

  useEffect(() => {
    if (yamlTabs.length === 0) {
      return;
    }

    setYamlTabs((previousTabs) =>
      previousTabs.map(
        (tab) => data?.find((item) => item.name === tab.name && item.namespace === tab.namespace) ?? tab
      )
    );
  }, [data, yamlTabs.length]);

  useEffect(() => {
    if (!activeYamlJob || !activeYamlTabKey) {
      return;
    }

    if (yamlContentsByTab[activeYamlTabKey] !== undefined) {
      return;
    }

    const controller = new AbortController();
    const token = getAuthToken();

    const loadYaml = async () => {
      setYamlLoadingTabKey(activeYamlTabKey);
      setYamlErrorByTab((previous) => ({ ...previous, [activeYamlTabKey]: null }));
      setYamlSuccessByTab((previous) => ({ ...previous, [activeYamlTabKey]: null }));

      try {
        const response = await fetch(
          `/api/jobs/${encodeURIComponent(activeYamlJob.namespace)}/${encodeURIComponent(activeYamlJob.name)}/yaml`,
          {
            method: 'GET',
            headers: token ? { Authorization: token } : undefined,
            signal: controller.signal,
          }
        );

        if (!response.ok) {
          throw new Error(`Failed to load job YAML (${response.status})`);
        }

        const yaml = await response.text();
        const sanitizedYaml = sanitizeJobYamlForEdit(yaml);
        setYamlContentsByTab((previous) => ({ ...previous, [activeYamlTabKey]: sanitizedYaml }));
      } catch (error) {
        if ((error as Error).name !== 'AbortError') {
          setYamlErrorByTab((previous) => ({
            ...previous,
            [activeYamlTabKey]: (error as Error).message || 'Failed to load job YAML',
          }));
        }
      } finally {
        setYamlLoadingTabKey((current) => (current === activeYamlTabKey ? null : current));
      }
    };

    loadYaml();

    return () => controller.abort();
  }, [activeYamlJob?.namespace, activeYamlJob?.name, activeYamlTabKey, yamlContentsByTab]);

  const handleCloseYamlEditor = () => {
    setYamlTabs([]);
    setActiveYamlTabKey(null);
    setYamlDrawerVisible(true);
    setYamlContentsByTab({});
    setYamlErrorByTab({});
    setYamlSuccessByTab({});
    setYamlLoadingTabKey(null);
    setYamlSavingTabKey(null);
  };

  const handleOpenYamlEditorFromPanel = (job: Job) => {
    const key = getJobKey(job);

    setYamlTabs((previousTabs) => {
      if (previousTabs.some((tab) => getJobKey(tab) === key)) {
        return previousTabs;
      }
      return [...previousTabs, job];
    });

    setActiveYamlTabKey(key);
    setYamlDrawerVisible(true);
    setPanelOpen(false);
  };

  const handleCloseYamlTab = (tabKey: string) => {
    setYamlTabs((previousTabs) => {
      const nextTabs = previousTabs.filter((tab) => getJobKey(tab) !== tabKey);

      if (activeYamlTabKey === tabKey) {
        const fallbackTab = nextTabs[nextTabs.length - 1];
        setActiveYamlTabKey(fallbackTab ? getJobKey(fallbackTab) : null);
      }

      return nextTabs;
    });

    setYamlContentsByTab((previous) => {
      const next = { ...previous };
      delete next[tabKey];
      return next;
    });
    setYamlErrorByTab((previous) => {
      const next = { ...previous };
      delete next[tabKey];
      return next;
    });
    setYamlSuccessByTab((previous) => {
      const next = { ...previous };
      delete next[tabKey];
      return next;
    });
    setYamlLoadingTabKey((current) => (current === tabKey ? null : current));
    setYamlSavingTabKey((current) => (current === tabKey ? null : current));
  };

  const handleSaveYaml = async () => {
    if (!activeYamlJob || !activeYamlTabKey) {
      return;
    }

    const token = getAuthToken();
    setYamlSavingTabKey(activeYamlTabKey);
    setYamlErrorByTab((previous) => ({ ...previous, [activeYamlTabKey]: null }));
    setYamlSuccessByTab((previous) => ({ ...previous, [activeYamlTabKey]: null }));

    try {
      const response = await fetch(
        `/api/jobs/${encodeURIComponent(activeYamlJob.namespace)}/${encodeURIComponent(activeYamlJob.name)}/yaml`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/yaml',
            ...(token ? { Authorization: token } : {}),
          },
          body: yamlContentsByTab[activeYamlTabKey] || '',
        }
      );

      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || `Failed to save job YAML (${response.status})`);
      }

      setYamlSuccessByTab((previous) => ({
        ...previous,
        [activeYamlTabKey]: 'Job YAML saved successfully',
      }));
    } catch (error) {
      setYamlErrorByTab((previous) => ({
        ...previous,
        [activeYamlTabKey]: (error as Error).message || 'Failed to save job YAML',
      }));
    } finally {
      setYamlSavingTabKey((current) => (current === activeYamlTabKey ? null : current));
    }
  };


  const handleVerifyYaml = () => {
    if (!activeYamlTabKey) return;
    const content = yamlContentsByTab[activeYamlTabKey] || '';
    try {
      YAML.parse(content);
      setYamlSuccessByTab((p) => ({ ...p, [activeYamlTabKey]: 'YAML syntax is valid ✓' }));
      setYamlErrorByTab((p) => ({ ...p, [activeYamlTabKey]: null }));
    } catch (err) {
      setYamlErrorByTab((p) => ({ ...p, [activeYamlTabKey]: `Invalid YAML: ${(err as Error).message}` }));
      setYamlSuccessByTab((p) => ({ ...p, [activeYamlTabKey]: null }));
    }
  };

  const handleStartYamlDrawerResize = (clientY: number) => {
    const initialHeight = yamlDrawerHeightPx ?? Math.floor(window.innerHeight * 0.45);
    resizeStartYRef.current = clientY;
    resizeStartHeightRef.current = initialHeight;
    setYamlDrawerHeightPx(initialHeight);
    setIsResizingYamlDrawer(true);
  };

  useEffect(() => {
    if (!isResizingYamlDrawer) {
      return;
    }

    const handleMouseMove = (event: MouseEvent) => {
      const delta = resizeStartYRef.current - event.clientY;
      const minHeight = 220;
      const maxHeight = Math.floor(window.innerHeight * 0.85);
      const nextHeight = Math.max(minHeight, Math.min(maxHeight, resizeStartHeightRef.current + delta));
      setYamlDrawerHeightPx(nextHeight);
    };

    const handleMouseUp = () => {
      setIsResizingYamlDrawer(false);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizingYamlDrawer]);

  const handleDeleteSingle = async (namespace: string, name: string) => {
    setConfirmDelete({ keys: [`${namespace}/${name}`], label: name });
    setPanelOpen(false);
  };

  const handleDeleteSelected = () => {
    if (selectedRows.length === 0) return;
    setConfirmDelete({
      keys: selectedRows,
      label: selectedRows.length === 1 ? selectedRows[0].split('/')[1] : `${selectedRows.length} jobs`,
    });
  };

  const handleConfirmDelete = async () => {
    if (!confirmDelete) return;
    setIsDeleting(true);
    try {
      await Promise.all(
        confirmDelete.keys.map((key) => {
          const [ns, name] = key.split('/');
          return deleteJob(ns, name);
        })
      );
      setSelectedRows([]);
      setConfirmDelete(null);
    } finally {
      setIsDeleting(false);
    }
  };

  const getStatusTextClass = (status: string) => {
    const color = getStatusColor(status);
    if (color === 'green') return 'text-[var(--color-icon-success)]';
    if (color === 'yellow') return 'text-[var(--color-icon-warning)]';
    if (color === 'red') return 'text-[var(--color-icon-danger)]';
    return 'text-text-secondary';
  };

  const getCompletionTextClass = (completions: string) => {
    const [done, total] = completions.split('/').map((value) => Number(value));
    if (Number.isFinite(done) && Number.isFinite(total) && total > 0 && done >= total) {
      return 'text-[var(--color-icon-success)]';
    }
    return 'text-text-secondary';
  };

  const parseDurationToSeconds = (duration: string): number => {
    const trimmed = (duration || '').trim();
    if (!trimmed || trimmed === '-') return -1;
    const match = trimmed.match(/^(\d+)\s*([smhdw])$/i);
    if (!match) return -1;
    const value = Number(match[1]);
    const unit = match[2].toLowerCase();
    if (unit === 's') return value;
    if (unit === 'm') return value * 60;
    if (unit === 'h') return value * 3600;
    if (unit === 'd') return value * 86400;
    return value * 604800;
  };

  const columns = [
    {
      header: 'Name',
      accessor: (row: Job) => (
        <span className="font-medium text-text">{row.name}</span>
      ),
      width: '28%',
      sortable: true,
      sortKey: 'name',
    },
    {
      header: 'Namespace',
      accessor: 'namespace' as const,
      width: '18%',
      sortable: true,
      sortKey: 'namespace',
    },
    {
      header: 'Status',
      accessor: (row: Job) => (
        <span className={`font-medium ${getStatusTextClass(row.status || 'Pending')}`}>
          {row.status || 'Pending'}
        </span>
      ),
      width: '15%',
      sortable: true,
      sortKey: 'status',
    },
    {
      header: 'Completions',
      accessor: (row: Job) => (
        <span className={`font-medium ${getCompletionTextClass(row.completions || '-')}`}>
          {row.completions || '-'}
        </span>
      ),
      width: '15%',
      sortable: true,
      sortKey: 'completions',
    },
    {
      header: 'Duration',
      accessor: 'duration' as const,
      width: '12%',
      sortable: true,
      sortKey: 'duration',
    },
    {
      header: 'Age',
      accessor: (row: Job) => timeAgo(row.age),
      width: '12%',
      sortable: true,
      sortKey: 'age',
    },
  ];

  const sortedJobs = useMemo((): (Job & { id: string })[] => {
    let source = [...(data || [])];
    
    // Filter by selected namespaces (if any are selected)
    if (selectedNamespaces.length > 0) {
      source = source.filter((job) => selectedNamespaces.includes(job.namespace));
    }
    
    // Add unique id for row selection
    source = source.map((job) => ({
      ...job,
      id: `${job.namespace}/${job.name}`,
    })) as (Job & { id: string })[];
    
    const factor = sortState.direction === 'asc' ? 1 : -1;

    return source.sort((first, second) => {
      if (sortState.key === 'name') return first.name.localeCompare(second.name) * factor;
      if (sortState.key === 'namespace') return first.namespace.localeCompare(second.namespace) * factor;
      if (sortState.key === 'status') return (first.status || '').localeCompare(second.status || '') * factor;
      if (sortState.key === 'completions') {
        const parse = (value: string) => {
          const [done, total] = (value || '').split('/').map((v) => Number(v));
          if (!Number.isFinite(done) || !Number.isFinite(total) || total <= 0) return -1;
          return done / total;
        };
        return (parse(first.completions) - parse(second.completions)) * factor;
      }
      if (sortState.key === 'duration') {
        return (parseDurationToSeconds(first.duration) - parseDurationToSeconds(second.duration)) * factor;
      }

      const firstAge = Date.parse(first.age || '');
      const secondAge = Date.parse(second.age || '');
      return ((Number.isNaN(firstAge) ? 0 : firstAge) - (Number.isNaN(secondAge) ? 0 : secondAge)) * factor;
    }) as (Job & { id: string })[];
  }, [data, sortState, selectedNamespaces]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-text">Jobs</h1>
        <p className="text-text-secondary mt-1">Manage Kubernetes jobs</p>
      </div>

      <div
        className="space-y-2"
        style={{
          paddingBottom:
            yamlTabs.length > 0 ? (yamlDrawerVisible ? yamlDrawerHeightPx ?? 420 : 84) : 0,
        }}
      >
        <DataTable
        columns={columns}
        data={sortedJobs}
        isLoading={isLoading}
        error={error}
        rowKey="id"
        onRowClick={(row) => {
          setSelectedJob(row);
          setPanelOpen(true);
        }}
        selectedRowKey={panelOpen && selectedJob ? `${selectedJob.namespace}/${selectedJob.name}` : undefined}
        sortState={sortState}
        onSortChange={(nextSort) => setSortState(nextSort as { key: JobSortKey; direction: 'asc' | 'desc' })}
        enableRowSelection={true}
        selectedRows={selectedRows}
        onRowSelectionChange={(rows) => setSelectedRows(rows)}
      />

        {yamlTabs.length > 0 && !yamlDrawerVisible && (
          <section className="fixed bottom-0 left-0 md:left-[var(--layout-sidebar-width,16rem)] right-0 z-[96]">
            <div className="px-6">
              <div className="bg-surface border border-border rounded-t-lg shadow-2xl p-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-text-secondary">YAML tabs hidden ({yamlTabs.length})</span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setYamlDrawerVisible(true)}
                      className="px-3 py-1 text-xs rounded-md bg-[var(--color-primary)] text-bg"
                    >
                      Show
                    </button>
                    <button
                      type="button"
                      onClick={handleCloseYamlEditor}
                      className="px-3 py-1 text-xs rounded-md border border-border text-text-secondary hover:text-text"
                    >
                      Close
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </section>
        )}

        {yamlTabs.length > 0 && yamlDrawerVisible && activeYamlJob && activeYamlTabKey && (
          <section className="fixed bottom-0 left-0 md:left-[var(--layout-sidebar-width,16rem)] right-0 z-[96]">
            <div className="px-6">
              <div
                className="bg-surface border border-border rounded-t-lg shadow-2xl p-3 pt-5 space-y-2 overflow-auto relative"
                style={{
                  height: yamlDrawerHeightPx ? `${yamlDrawerHeightPx}px` : 'clamp(220px, 45vh, 620px)',
                }}
              >
                <div
                  className="absolute top-0 left-0 right-0 h-5 cursor-ns-resize flex items-start justify-center"
                  onMouseDown={(event) => {
                    event.preventDefault();
                    handleStartYamlDrawerResize(event.clientY);
                  }}
                  aria-label="Resize YAML drawer"
                  title="Drag to resize"
                >
                  <div className="mt-1.5 h-1.5 w-14 rounded-full bg-border" />
                </div>

                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-2 min-w-0">
                  <div className="flex items-center gap-2 overflow-x-auto pb-1 min-w-0">
                    {yamlTabs.map((tab) => {
                      const tabKey = getJobKey(tab);
                      const isActive = tabKey === activeYamlTabKey;

                      return (
                        <div
                          key={tabKey}
                          className={`inline-flex items-center rounded-md border text-xs ${
                            isActive
                              ? 'border-[var(--color-primary)] bg-hover text-[var(--color-primary)]'
                              : 'border-border bg-surface-elevated text-text-secondary'
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => setActiveYamlTabKey(tabKey)}
                            className="px-3 py-1.5 whitespace-nowrap max-w-[220px] truncate"
                            title={tabKey}
                          >
                            {tab.name}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleCloseYamlTab(tabKey)}
                            className="px-2 py-1.5 border-l border-border"
                            aria-label={`Close ${tabKey} tab`}
                          >
                            ×
                          </button>
                        </div>
                      );
                    })}
                  </div>

                  <div className="flex items-center gap-2 shrink-0 flex-wrap lg:flex-nowrap">
                    <span className="px-2 py-1 text-xs rounded bg-hover text-[var(--color-primary)] font-semibold">
                      Edit YAML
                    </span>
                    <button
                      type="button"
                      onClick={handleVerifyYaml}
                      className="px-3 py-1.5 text-sm rounded-md border border-border text-text-secondary hover:text-text"
                      disabled={yamlLoadingTabKey === activeYamlTabKey || !(yamlContentsByTab[activeYamlTabKey] || '').trim()}
                    >
                      Verify
                    </button>
                    <button
                      type="button"
                      onClick={() => setYamlDrawerVisible(false)}
                      className="px-3 py-1.5 text-sm rounded-md border border-border text-text-secondary hover:text-text"
                      disabled={yamlSavingTabKey === activeYamlTabKey}
                    >
                      Hide
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveYaml}
                      className="px-3 py-1.5 text-sm rounded-md bg-[var(--color-primary)] text-bg disabled:opacity-60"
                      disabled={
                        yamlSavingTabKey === activeYamlTabKey ||
                        yamlLoadingTabKey === activeYamlTabKey ||
                        !(yamlContentsByTab[activeYamlTabKey] || '').trim()
                      }
                    >
                      {yamlSavingTabKey === activeYamlTabKey ? 'Saving...' : 'Save'}
                    </button>
                    <button
                      type="button"
                      onClick={handleCloseYamlEditor}
                      className="px-3 py-1.5 text-sm rounded-md border border-border text-text-secondary hover:text-text"
                      disabled={yamlSavingTabKey === activeYamlTabKey}
                    >
                      Close
                    </button>
                  </div>
                </div>

                <>
                  {yamlErrorByTab[activeYamlTabKey] && (
                    <div className="px-3 py-2 text-sm text-[var(--color-icon-danger)] border border-border rounded-md bg-surface-elevated">
                      {yamlErrorByTab[activeYamlTabKey]}
                    </div>
                  )}

                  {yamlSuccessByTab[activeYamlTabKey] && (
                    <div className="px-3 py-2 text-sm text-[var(--color-icon-success)] border border-border rounded-md bg-surface-elevated">
                      {yamlSuccessByTab[activeYamlTabKey]}
                    </div>
                  )}

                  <div className="w-full h-[calc(100%-90px)] min-h-[180px] rounded-md border border-border bg-surface-elevated overflow-hidden">
                    <AceEditor
                      mode="yaml"
                      theme={theme?.isDark ? 'tomorrow_night' : 'github'}
                      name={`job-yaml-editor-${activeYamlTabKey}`}
                      value={yamlContentsByTab[activeYamlTabKey] || ''}
                      onChange={(value) =>
                        setYamlContentsByTab((previous) => ({
                          ...previous,
                          [activeYamlTabKey]: value,
                        }))
                      }
                      readOnly={
                        yamlLoadingTabKey === activeYamlTabKey || yamlSavingTabKey === activeYamlTabKey
                      }
                      width="100%"
                      height="100%"
                      fontSize={12}
                      showPrintMargin={false}
                      setOptions={{
                        useWorker: false,
                        wrap: true,
                        tabSize: 2,
                        showLineNumbers: true,
                      }}
                      editorProps={{
                        $blockScrolling: true,
                      }}
                    />
                  </div>
                </>
              </div>
            </div>
          </section>
        )}
      </div>

      {panelOpen && selectedJob && (
        <>
          <div
            className="fixed inset-0 z-[95] bg-black/20"
            onClick={() => setPanelOpen(false)}
          />
          <JobDetailPanel
            job={selectedJob}
            onClose={() => setPanelOpen(false)}
            onOpenYamlEditor={handleOpenYamlEditorFromPanel}
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
            ? `Are you sure you want to delete "${confirmDelete.label}"? This action cannot be undone.`
            : `Are you sure you want to delete ${confirmDelete?.keys.length} jobs? This action cannot be undone.`
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
