import { useEffect, useMemo, useRef, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { useRealtimePods } from '../hooks/useRealtimePods';
import { useNamespace } from '../context/NamespaceContext';
import { useTheme } from '../context/ThemeContext';
import { DataTable } from '../components/DataTable';
import { PodDetailPanel } from '../components/PodDetailPanel';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { StatusBadge } from '../components/StatusBadge';
import { Terminal } from '../components/Terminal';
import type { Pod } from '../types';
import { timeAgo } from '../utils';
import { getAuthToken } from '../utils/auth';
import { deletePod } from '../hooks/useKubernetes';
import { GripHorizontal, X, Eye, EyeOff, Save, RefreshCw } from 'lucide-react';
import AceEditor from 'react-ace';
import YAML from 'yaml';
import 'ace-builds/src-noconflict/mode-yaml';
import 'ace-builds/src-noconflict/theme-github';
import 'ace-builds/src-noconflict/theme-tomorrow_night';

type PodSortKey =
  | 'name'
  | 'namespace'
  | 'status'
  | 'ready'
  | 'restarts'
  | 'cpu'
  | 'memory'
  | 'controlled_by'
  | 'qos'
  | 'age';

const sanitizePodYamlForEdit = (yamlText: string) => {
  try {
    const parsed = YAML.parse(yamlText) as Record<string, unknown> | null;
    if (!parsed || typeof parsed !== 'object') return yamlText;

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
        if (Object.keys(annotations).length === 0) delete metadata.annotations;
      }
    }

    delete parsed.status;

    return YAML.stringify(parsed, { lineWidth: 0 });
  } catch {
    return yamlText;
  }
};

const getPodKey = (pod: Pod) => `${pod.namespace}/${pod.name}`;

// Combined editor tab type
type EditorTab = {
  podKey: string;
  pod: Pod;
  type: 'yaml' | 'shell' | 'logs';
};

const getTabKey = (tab: EditorTab) => `${tab.podKey}:${tab.type}`;

export const PodsPage = () => {
  const [, forceUpdate] = useState({});
  
  // WebSocket realtime data (always enabled)
  const { data, isConnected, error } = useRealtimePods<Pod>({
    enabled: true,
  });
  
  const isLoading = !isConnected && data.length === 0;
  
  const theme = useTheme();
  const { selectedNamespaces } = useNamespace();
  const [selectedPod, setSelectedPod] = useState<Pod | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [selectedRows, setSelectedRows] = useState<string[]>([]);
  const [confirmDelete, setConfirmDelete] = useState<{ keys: string[]; label: string } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [sortState, setSortState] = useState<{ key: PodSortKey; direction: 'asc' | 'desc' }>({
    key: 'age',
    direction: 'desc',
  });

  // Combined editor drawer with mixed YAML and Shell tabs
  const [editorTabs, setEditorTabs] = useState<EditorTab[]>([]);
  const [activeTabKey, setActiveTabKey] = useState<string | null>(null);
  const [editorDrawerVisible, setEditorDrawerVisible] = useState(false);
  const [editorDrawerHeightPx, setEditorDrawerHeightPx] = useState<number | null>(null);

  // YAML content and state
  const [yamlContentsByTab, setYamlContentsByTab] = useState<Record<string, string>>({});
  const [yamlErrorByTab, setYamlErrorByTab] = useState<Record<string, string | null>>({});
  const [yamlSuccessByTab, setYamlSuccessByTab] = useState<Record<string, string | null>>({});
  const [yamlLoadingTabKey, setYamlLoadingTabKey] = useState<string | null>(null);
  const [yamlSavingTabKey, setYamlSavingTabKey] = useState<string | null>(null);

  // Logs content and state
  const [logsContentsByTab, setLogsContentsByTab] = useState<Record<string, string>>({});
  const [logsLoadingTabKey, setLogsLoadingTabKey] = useState<string | null>(null);
  const [logsErrorByTab, setLogsErrorByTab] = useState<Record<string, string | null>>({});

  const resizeStartYRef = useRef<number | null>(null);
  const resizeStartHeightRef = useRef<number | null>(null);

  const activeTab = useMemo(
    () => editorTabs.find((tab) => getTabKey(tab) === activeTabKey) ?? null,
    [editorTabs, activeTabKey]
  );

  // Load YAML when active tab changes
  useEffect(() => {
    if (!activeTab || activeTab.type !== 'yaml') return;
    const tabKey = getTabKey(activeTab);
    if (yamlContentsByTab[tabKey]) return;

    const controller = new AbortController();
    setYamlLoadingTabKey(tabKey);
    setYamlErrorByTab((previous) => ({ ...previous, [tabKey]: null }));
    setYamlSuccessByTab((previous) => ({ ...previous, [tabKey]: null }));

    const fetchYaml = async () => {
      try {
        const token = getAuthToken();
        const response = await fetch(
          `/api/pods/${activeTab.pod.namespace}/${activeTab.pod.name}/yaml`,
          {
            signal: controller.signal,
            headers: token ? { Authorization: token } : {},
          }
        );

        if (!response.ok) {
          throw new Error(`Failed to load YAML: ${response.statusText}`);
        }

        const yaml = await response.text();
        const sanitizedYaml = sanitizePodYamlForEdit(yaml);
        setYamlContentsByTab((previous) => ({ ...previous, [tabKey]: sanitizedYaml }));
      } catch (err: unknown) {
        if (err && typeof err === 'object' && 'name' in err && err.name !== 'AbortError') {
          const message = err && typeof err === 'object' && 'message' in err ? String(err.message) : 'Unknown error';
          setYamlErrorByTab((previous) => ({ ...previous, [tabKey]: message }));
        }
      } finally {
        setYamlLoadingTabKey(null);
      }
    };

    void fetchYaml();

    return () => controller.abort();
  }, [activeTab?.pod.namespace, activeTab?.pod.name, activeTab?.type, activeTabKey, yamlContentsByTab]);

  // Load logs when active tab changes
  useEffect(() => {
    if (!activeTab || activeTab.type !== 'logs') return;
    const tabKey = getTabKey(activeTab);
    if (logsContentsByTab[tabKey]) return;

    const controller = new AbortController();
    setLogsLoadingTabKey(tabKey);
    setLogsErrorByTab((previous) => ({ ...previous, [tabKey]: null }));

    const fetchLogs = async () => {
      try {
        const token = getAuthToken();
        const response = await fetch(
          `/api/pods/${activeTab.pod.namespace}/${activeTab.pod.name}/logs`,
          {
            signal: controller.signal,
            headers: token ? { Authorization: token } : {},
          }
        );

        if (!response.ok) {
          throw new Error(`Failed to load logs: ${response.statusText}`);
        }

        const logs = await response.text();
        setLogsContentsByTab((previous) => ({ ...previous, [tabKey]: logs }));
      } catch (err: unknown) {
        if (err && typeof err === 'object' && 'name' in err && err.name !== 'AbortError') {
          const message = err && typeof err === 'object' && 'message' in err ? String(err.message) : 'Unknown error';
          setLogsErrorByTab((previous) => ({ ...previous, [tabKey]: message }));
        }
      } finally {
        setLogsLoadingTabKey(null);
      }
    };

    void fetchLogs();

    return () => controller.abort();
  }, [activeTab?.pod.namespace, activeTab?.pod.name, activeTab?.type, activeTabKey, logsContentsByTab]);

  const handleOpenYamlTab = (pod: Pod) => {
    const newTab: EditorTab = {
      podKey: getPodKey(pod),
      pod,
      type: 'yaml',
    };

    setEditorTabs((previous) => {
      if (previous.some((tab) => getTabKey(tab) === getTabKey(newTab))) {
        return previous;
      }
      return [...previous, newTab];
    });

    setActiveTabKey(getTabKey(newTab));
    setEditorDrawerVisible(true);
    setPanelOpen(false);
  };

  const handleOpenShellTab = (pod: Pod) => {
    const newTab: EditorTab = {
      podKey: getPodKey(pod),
      pod,
      type: 'shell',
    };

    setEditorTabs((previous) => {
      if (previous.some((tab) => getTabKey(tab) === getTabKey(newTab))) {
        return previous;
      }
      return [...previous, newTab];
    });

    setActiveTabKey(getTabKey(newTab));
    setEditorDrawerVisible(true);
    setPanelOpen(false);
  };

  const handleOpenLogsTab = (pod: Pod) => {
    const newTab: EditorTab = {
      podKey: getPodKey(pod),
      pod,
      type: 'logs',
    };

    setEditorTabs((previous) => {
      if (previous.some((tab) => getTabKey(tab) === getTabKey(newTab))) {
        return previous;
      }
      return [...previous, newTab];
    });

    setActiveTabKey(getTabKey(newTab));
    setEditorDrawerVisible(true);
    setPanelOpen(false);
  };

  const handleRefreshLogs = async () => {
    if (!activeTab || activeTab.type !== 'logs') return;
    const tabKey = getTabKey(activeTab);

    setLogsLoadingTabKey(tabKey);
    setLogsErrorByTab((previous) => ({ ...previous, [tabKey]: null }));

    try {
      const token = getAuthToken();
      const response = await fetch(
        `/api/pods/${activeTab.pod.namespace}/${activeTab.pod.name}/logs`,
        {
          headers: token ? { Authorization: token } : {},
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to load logs: ${response.statusText}`);
      }

      const logs = await response.text();
      setLogsContentsByTab((previous) => ({ ...previous, [tabKey]: logs }));
    } catch (err: unknown) {
      const message = err && typeof err === 'object' && 'message' in err ? String(err.message) : 'Unknown error';
      setLogsErrorByTab((previous) => ({ ...previous, [tabKey]: message }));
    } finally {
      setLogsLoadingTabKey(null);
    }
  };

  const handleCloseTab = (tabKey: string) => {
    setEditorTabs((previous) => {
      const nextTabs = previous.filter((tab) => getTabKey(tab) !== tabKey);

      if (activeTabKey === tabKey) {
        const fallbackTab = nextTabs[nextTabs.length - 1];
        setActiveTabKey(fallbackTab ? getTabKey(fallbackTab) : null);
      }

      return nextTabs;
    });

    // Clean up YAML content if it was a YAML tab
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

    // Clean up logs content if it was a logs tab
    setLogsContentsByTab((previous) => {
      const next = { ...previous };
      delete next[tabKey];
      return next;
    });

    setLogsErrorByTab((previous) => {
      const next = { ...previous };
      delete next[tabKey];
      return next;
    });
  };

  const handleSaveYaml = async () => {
    if (!activeTab || activeTab.type !== 'yaml') return;
    const tabKey = getTabKey(activeTab);
    const yamlContent = yamlContentsByTab[tabKey];
    if (!yamlContent) return;

    setYamlSavingTabKey(tabKey);
    setYamlErrorByTab((previous) => ({ ...previous, [tabKey]: null }));
    setYamlSuccessByTab((previous) => ({ ...previous, [tabKey]: null }));

    try {
      const token = getAuthToken();
      const response = await fetch(
        `/api/pods/${activeTab.pod.namespace}/${activeTab.pod.name}/yaml`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/yaml',
            ...(token ? { Authorization: token } : {}),
          },
          body: yamlContent,
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || `Failed to update pod: ${response.statusText}`);
      }

      setYamlSuccessByTab((previous) => ({
        ...previous,
        [tabKey]: 'Pod updated successfully',
      }));

      setTimeout(() => {
        setYamlSuccessByTab((previous) => ({ ...previous, [tabKey]: null }));
      }, 3000);
    } catch (err: unknown) {
      const message = err && typeof err === 'object' && 'message' in err ? String(err.message) : 'Unknown error';
      setYamlErrorByTab((previous) => ({ ...previous, [tabKey]: message }));
    } finally {
      setYamlSavingTabKey(null);
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
      label: selectedRows.length === 1 ? selectedRows[0].split('/')[1] : `${selectedRows.length} pods`,
    });
  };

  const handleConfirmDelete = async () => {
    if (!confirmDelete) return;
    setIsDeleting(true);
    try {
      await Promise.all(
        confirmDelete.keys.map((key) => {
          const [ns, name] = key.split('/');
          return deletePod(ns, name);
        })
      );
      setSelectedRows([]);
      setConfirmDelete(null);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleStartEditorDrawerResize = (clientY: number) => {
    resizeStartYRef.current = clientY;
    resizeStartHeightRef.current = editorDrawerHeightPx ?? 420;

    const handleMouseMove = (event: MouseEvent) => {
      if (resizeStartYRef.current === null || resizeStartHeightRef.current === null) return;

      const deltaY = resizeStartYRef.current - event.clientY;
      const newHeight = resizeStartHeightRef.current + deltaY;
      const minHeight = 220;
      const maxHeight = window.innerHeight * 0.85;

      setEditorDrawerHeightPx(Math.max(minHeight, Math.min(newHeight, maxHeight)));
    };

    const handleMouseUp = () => {
      resizeStartYRef.current = null;
      resizeStartHeightRef.current = null;
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  // Force re-render every 10 seconds to update ages
  useEffect(() => {
    const interval = setInterval(() => {
      forceUpdate({});
    }, 10000); // Update every 10 seconds

    return () => clearInterval(interval);
  }, []);

  // Clean up selected rows when pods are removed from data
  useEffect(() => {
    if (!data || data.length === 0) {
      setSelectedRows([]);
      return;
    }

    const currentKeys = new Set(data.map(pod => `${pod.namespace}/${pod.name}`));
    setSelectedRows(prev => prev.filter(key => currentKeys.has(key)));
  }, [data]);

  useEffect(() => {
    if (!data || data.length === 0) {
      setSelectedPod(null);
      return;
    }

    if (!selectedPod) {
      return; // Don't auto-select first pod
    }

    const updatedSelected = data.find((item) => item.name === selectedPod.name && item.namespace === selectedPod.namespace);
    if (!updatedSelected) {
      setSelectedPod(null); // Clear selection if pod was deleted
    } else {
      setSelectedPod(updatedSelected); // Update with fresh data
    }
  }, [data, selectedPod]);

  const columns = [
    {
      header: 'Name',
      accessor: (row: Pod) => (
        <span className="font-medium text-text">{row.name}</span>
      ),
      width: '24%',
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
      accessor: (row: Pod) => (
        <span className="whitespace-nowrap">
          <StatusBadge status={row.status || row.phase || 'Unknown'} />
        </span>
      ),
      width: '8%',
      sortable: true,
      sortKey: 'status',
    },
    {
      header: 'Ready',
      accessor: (row: Pod) => <span className="whitespace-nowrap">{row.ready || '-'}</span>,
      width: '7%',
      sortable: true,
      sortKey: 'ready',
    },
    {
      header: 'Restarts',
      accessor: (row: Pod) => <span className="whitespace-nowrap">{row.restarts ?? 0}</span>,
      width: '7%',
      sortable: true,
      sortKey: 'restarts',
    },
    {
      header: 'CPU(cores)',
      accessor: (row: Pod) => row.cpu || '-',
      width: '11%',
      sortable: true,
      sortKey: 'cpu',
    },
    {
      header: 'MEMORY(bytes)',
      accessor: (row: Pod) => row.memory || '-',
      width: '11%',
      sortable: true,
      sortKey: 'memory',
    },
    {
      header: 'Controlled By',
      accessor: (row: Pod) => (
        <span className="whitespace-nowrap">{row.controlled_by || '-'}</span>
      ),
      width: '18%',
      sortable: true,
      sortKey: 'controlled_by',
    },
    {
      header: 'QoS',
      accessor: (row: Pod) => row.qos || '-',
      width: '14%',
      sortable: true,
      sortKey: 'qos',
    },
    {
      header: 'Age',
      accessor: (row: Pod) => timeAgo(row.age),
      width: '15%',
      sortable: true,
      sortKey: 'age',
    },
  ];

  const sortedPods = useMemo((): (Pod & { id: string })[] => {
    let source = [...(data || [])];
    
    // Filter by selected namespaces (if any are selected)
    if (selectedNamespaces.length > 0) {
      source = source.filter((pod) => selectedNamespaces.includes(pod.namespace));
    }
    
    // Add unique id for row selection
    source = source.map((pod) => ({
      ...pod,
      id: `${pod.namespace}/${pod.name}`,
    })) as (Pod & { id: string })[];
    
    const factor = sortState.direction === 'asc' ? 1 : -1;

    return source.sort((first, second) => {
      const firstStatus = first.status || first.phase || '';
      const secondStatus = second.status || second.phase || '';

      if (sortState.key === 'name') return first.name.localeCompare(second.name) * factor;
      if (sortState.key === 'namespace') return first.namespace.localeCompare(second.namespace) * factor;
      if (sortState.key === 'status') return firstStatus.localeCompare(secondStatus) * factor;
      if (sortState.key === 'ready') return (first.ready || '').localeCompare(second.ready || '') * factor;
      if (sortState.key === 'restarts') return ((first.restarts ?? 0) - (second.restarts ?? 0)) * factor;
      if (sortState.key === 'cpu') {
        return (first.cpu || '').localeCompare(second.cpu || '', undefined, { numeric: true, sensitivity: 'base' }) * factor;
      }
      if (sortState.key === 'memory') {
        return (first.memory || '').localeCompare(second.memory || '', undefined, { numeric: true, sensitivity: 'base' }) * factor;
      }
      if (sortState.key === 'controlled_by') return (first.controlled_by || '').localeCompare(second.controlled_by || '') * factor;
      if (sortState.key === 'qos') return (first.qos || '').localeCompare(second.qos || '') * factor;
      
      if (sortState.key === 'age') {
        const firstAge = Date.parse(first.age || '');
        const secondAge = Date.parse(second.age || '');
        return ((Number.isNaN(firstAge) ? 0 : firstAge) - (Number.isNaN(secondAge) ? 0 : secondAge)) * factor;
      }

      return 0;
    }) as (Pod & { id: string })[];
  }, [data, sortState, selectedNamespaces]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-text">Pods</h1>
        <p className="text-text-secondary mt-1">Real-time pod monitoring</p>
      </div>

      <div
        className="space-y-2"
        style={{
          paddingBottom: editorDrawerVisible && editorTabs.length > 0 ? editorDrawerHeightPx ?? 420 : 0,
        }}
      >
        <DataTable
          columns={columns}
          data={sortedPods}
          isLoading={isLoading}
          error={error || undefined}
          rowKey="id"
          onRowClick={(row) => {
            setSelectedPod(row);
            setPanelOpen(true);
          }}
          selectedRowKey={panelOpen && selectedPod ? `${selectedPod.namespace}/${selectedPod.name}` : undefined}
          sortState={sortState}
          onSortChange={(nextSort) => setSortState(nextSort as { key: PodSortKey; direction: 'asc' | 'desc' })}
          enableRowSelection={true}
          selectedRows={selectedRows}
          onRowSelectionChange={(rows) => setSelectedRows(rows)}
        />

        {/* Hidden editor bar (collapsed state) */}
        {editorTabs.length > 0 && !editorDrawerVisible && (
          <section className="fixed bottom-0 left-0 md:left-[var(--layout-sidebar-width,16rem)] right-0 z-[96]">
            <div className="px-6">
              <div className="bg-surface border border-border rounded-t-lg shadow-2xl p-3 flex items-center justify-between">
                <span className="text-text-secondary text-sm font-medium">
                  Editor ({editorTabs.length} {editorTabs.length === 1 ? 'tab' : 'tabs'})
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setEditorDrawerVisible(true)}
                    className="p-2 rounded-md hover:bg-hover text-text-secondary"
                    aria-label="Show editor"
                  >
                    <Eye size={16} />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditorTabs([]);
                      setActiveTabKey(null);
                    }}
                    className="p-2 rounded-md hover:bg-hover text-text-secondary"
                    aria-label="Close all tabs"
                  >
                    <X size={16} />
                  </button>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Visible editor drawer (expanded state) with mixed YAML + Shell tabs */}
        {editorTabs.length > 0 && editorDrawerVisible && (
          <section className="fixed bottom-0 left-0 md:left-[var(--layout-sidebar-width,16rem)] right-0 z-[96]">
            <div className="px-6">
              <div
                className="bg-surface border border-border rounded-t-lg shadow-2xl p-3 pt-5 space-y-2 overflow-auto relative"
                style={{ height: editorDrawerHeightPx ? `${editorDrawerHeightPx}px` : 'clamp(220px, 45vh, 620px)' }}
              >
                {/* Resize handle */}
                <div
                  className="absolute top-0 left-0 right-0 h-2 cursor-ns-resize hover:bg-primary/10 transition-colors flex items-center justify-center group"
                  onMouseDown={(event) => handleStartEditorDrawerResize(event.clientY)}
                  role="separator"
                  aria-label="Resize editor"
                >
                  <GripHorizontal size={20} className="text-text-secondary opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>

                {/* Tab bar with mixed YAML and Shell tabs */}
                <div className="flex items-center gap-2 border-b border-border pb-2 flex-wrap">
                  {/* Tab buttons */}
                  <div className="flex items-center gap-1 flex-wrap flex-1 min-w-0">
                    {editorTabs.map((tab) => {
                      const tabKey = getTabKey(tab);
                      const isActive = tabKey === activeTabKey;
                      const typeLabel = tab.type === 'yaml' ? 'YAML' : tab.type === 'shell' ? 'Shell' : 'Logs';
                      return (
                        <button
                          key={tabKey}
                          type="button"
                          onClick={() => setActiveTabKey(tabKey)}
                          className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors flex items-center gap-2 min-w-0 max-w-[200px] ${
                            isActive
                              ? 'bg-primary text-white'
                              : 'bg-surface-elevated text-text-secondary hover:bg-hover'
                          }`}
                        >
                          <span className="truncate">{tab.pod.name}</span>
                          <span className="text-[10px] opacity-75">({typeLabel})</span>
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              handleCloseTab(tabKey);
                            }}
                            className="hover:bg-black/10 rounded-sm p-0.5"
                            aria-label={`Close ${tab.pod.name}`}
                          >
                            <X size={12} />
                          </button>
                        </button>
                      );
                    })}
                  </div>

                  {/* Right controls */}
                  <div className="flex items-center gap-2 ml-auto">
                    {activeTab && activeTab.type === 'yaml' && (
                      <button
                        type="button"
                        onClick={handleSaveYaml}
                        disabled={yamlSavingTabKey === activeTabKey || yamlLoadingTabKey === activeTabKey}
                        className="p-2 rounded-md hover:bg-hover text-text-secondary disabled:opacity-50 disabled:cursor-not-allowed"
                        aria-label="Save YAML"
                      >
                        <Save size={16} />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setEditorDrawerVisible(false)}
                      className="p-2 rounded-md hover:bg-hover text-text-secondary"
                      aria-label="Hide editor"
                    >
                      <EyeOff size={16} />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEditorTabs([]);
                        setActiveTabKey(null);
                      }}
                      className="p-2 rounded-md hover:bg-hover text-text-secondary"
                      aria-label="Close all tabs"
                    >
                      <X size={16} />
                    </button>
                  </div>
                </div>

                {/* Content area - shows either YAML editor or Shell terminal */}
                <div className="w-full h-[calc(100%-90px)] min-h-[180px] rounded-md border border-border bg-surface-elevated overflow-hidden">
                  {activeTab && activeTab.type === 'yaml' ? (
                    // YAML Editor
                    <>
                      {/* Error/Success messages */}
                      {activeTabKey && yamlErrorByTab[activeTabKey] && (
                        <div className="absolute top-0 left-0 right-0 bg-red-50 dark:bg-red-900/20 border-b border-red-200 dark:border-red-800 text-red-800 dark:text-red-200 px-3 py-2 m-2 rounded-md text-sm">
                          {yamlErrorByTab[activeTabKey]}
                        </div>
                      )}

                      {activeTabKey && yamlSuccessByTab[activeTabKey] && (
                        <div className="absolute top-0 left-0 right-0 bg-green-50 dark:bg-green-900/20 border-b border-green-200 dark:border-green-800 text-green-800 dark:text-green-200 px-3 py-2 m-2 rounded-md text-sm">
                          {yamlSuccessByTab[activeTabKey]}
                        </div>
                      )}

                      {activeTabKey && (
                        yamlLoadingTabKey === activeTabKey ? (
                          <div className="flex items-center justify-center h-full">
                            <div className="text-text-secondary">Loading YAML...</div>
                          </div>
                        ) : (
                          <AceEditor
                            mode="yaml"
                            theme={theme?.isDark ? 'tomorrow_night' : 'github'}
                            name={`pod-yaml-editor-${activeTabKey}`}
                            value={yamlContentsByTab[activeTabKey] || ''}
                            onChange={(value) =>
                              setYamlContentsByTab((previous) => ({
                                ...previous,
                                [activeTabKey]: value,
                              }))
                            }
                            readOnly={yamlLoadingTabKey === activeTabKey || yamlSavingTabKey === activeTabKey}
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
                        )
                      )}
                    </>
                  ) : activeTab && activeTab.type === 'shell' ? (
                    // Shell Terminal
                    <Terminal
                      podName={activeTab.pod.name}
                      namespace={activeTab.pod.namespace}
                    />
                  ) : activeTab && activeTab.type === 'logs' ? (
                    // Pod Logs
                    <div className="h-full flex flex-col bg-surface-elevated">
                      {/* Logs toolbar */}
                      <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-surface">
                        <div className="text-xs text-text-secondary">Pod Logs (last 1000 lines)</div>
                        <button
                          type="button"
                          onClick={handleRefreshLogs}
                          disabled={logsLoadingTabKey === activeTabKey}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs rounded border border-border text-text hover:bg-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                          title="Refresh logs"
                        >
                          <RefreshCw size={12} className={logsLoadingTabKey === activeTabKey ? 'animate-spin' : ''} />
                          Refresh
                        </button>
                      </div>
                      {/* Logs content */}
                      <div className="flex-1 overflow-auto p-4 font-mono text-xs leading-relaxed">
                        {logsLoadingTabKey === activeTabKey ? (
                          <div className="flex items-center justify-center h-full">
                            <div className="text-text-secondary">Loading logs...</div>
                          </div>
                        ) : activeTabKey && logsErrorByTab[activeTabKey] ? (
                          <div className="flex items-center justify-center h-full">
                            <div className="text-red-500">{logsErrorByTab[activeTabKey]}</div>
                          </div>
                        ) : (
                          <pre className="text-text whitespace-pre-wrap break-words">
                            {activeTabKey ? logsContentsByTab[activeTabKey] || 'No logs available' : 'No logs available'}
                          </pre>
                        )}
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          </section>
        )}
      </div>

      {panelOpen && selectedPod && (
        <>
          <div
            className="fixed inset-0 z-[95] bg-black/20"
            onClick={() => setPanelOpen(false)}
          />
          <PodDetailPanel
            pod={selectedPod}
            onClose={() => setPanelOpen(false)}
            onOpenYamlEditor={handleOpenYamlTab}
            onOpenShell={handleOpenShellTab}
            onOpenLogs={handleOpenLogsTab}
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
            : `Are you sure you want to delete ${confirmDelete?.keys.length} pods? This action cannot be undone.`
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
