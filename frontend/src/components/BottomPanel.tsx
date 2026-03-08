import { useCallback, useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import AceEditor from 'react-ace';
import 'ace-builds/src-noconflict/mode-yaml';
import 'ace-builds/src-noconflict/theme-github';
import 'ace-builds/src-noconflict/theme-tomorrow_night';
import {
  Circle,
  ChevronDown,
  ChevronUp,
  Dot,
  FileText,
  Maximize2,
  Minimize2,
  Plus,
  RotateCw,
  ScrollText,
  Server,
  Terminal,
  X,
} from './Icons';
import { toast } from 'sonner';
import { Terminal as TerminalComponent } from './Terminal';
import { useNamespaces, useNodes, usePods } from '../hooks/useKubernetes';
import { getAuthToken } from '../utils/auth';
import { cn } from '../utils';

// ── Types ────────────────────────────────────────────────────────────────────

export type PanelTabType = 'pod-exec' | 'node-exec' | 'logs' | 'yaml-editor' | 'host-shell';

export interface OpenPanelTabOptions {
  type: PanelTabType;
  podName?: string;
  namespace?: string;
  containerName?: string;
  yamlContent?: string;
  title?: string;
  yamlActionLabel?: 'Apply' | 'Upgrade';
  helmReleaseName?: string;
  helmReleaseNamespace?: string;
}

/** Open a tab in the bottom panel from anywhere in the app */
export const openPanelTab = (opts: OpenPanelTabOptions) => {
  window.dispatchEvent(new CustomEvent('panel:open', { detail: opts }));
};

interface TabTarget {
  namespace: string;
  podName: string;
  containerName?: string;
}

interface PanelTab {
  id: string;
  type: PanelTabType;
  label: string;
  target?: TabTarget;
  yamlContent?: string;
  yamlSavedContent?: string;
  yamlDirty?: boolean;
  title?: string;
  yamlActionLabel?: 'Apply' | 'Upgrade';
  helmReleaseName?: string;
  helmReleaseNamespace?: string;
}

const DEFAULT_YAML = `apiVersion: apps/v1
kind: Deployment
metadata:
  name: my-app
  namespace: default
spec:
  replicas: 1
  selector:
    matchLabels:
      app: my-app
  template:
    metadata:
      labels:
        app: my-app
    spec:
      containers:
        - name: app
          image: nginx:latest
`;

const LABEL_MAP: Record<PanelTabType, string> = {
  'host-shell': 'Terminal',
  'pod-exec': 'Pod Shell',
  'node-exec': 'Node Shell',
  logs: 'Logs',
  'yaml-editor': 'YAML',
};

const ADD_OPTIONS: {
  type: PanelTabType;
  label: string;
  icon: React.ElementType;
  description: string;
}[] = [
  { type: 'host-shell',  label: 'Terminal',   icon: Terminal,   description: 'Open a host shell' },
  { type: 'yaml-editor', label: 'New YAML',   icon: FileText,   description: 'Edit & apply a YAML manifest' },
  { type: 'pod-exec',    label: 'Pod Shell',  icon: Terminal,   description: 'Exec into a running pod' },
  { type: 'node-exec',   label: 'Node Shell', icon: Server,     description: 'Shell on a Kubernetes node' },
  { type: 'logs',        label: 'Logs',       icon: ScrollText, description: 'Stream logs from a pod' },
];

// ── PodSelector ──────────────────────────────────────────────────────────────

const PodSelector = ({
  title,
  onSelect,
}: {
  title: string;
  onSelect: (namespace: string, podName: string, containerName?: string) => void;
}) => {
  const { data: namespaces } = useNamespaces();
  const { data: pods } = usePods();
  const [selectedNs, setSelectedNs] = useState('');
  const [selectedPod, setSelectedPod] = useState('');

  const nsList = namespaces?.map((ns) => ns.name) ?? [];
  const podList = pods?.filter((p) => !selectedNs || p.namespace === selectedNs) ?? [];

  return (
    <div className="flex flex-col items-center justify-center h-full gap-4 p-6">
      <p className="text-sm text-text-secondary">{title}</p>
      <div className="flex flex-wrap gap-3 items-end">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-text-secondary">Namespace</label>
          <select
            value={selectedNs}
            onChange={(e) => {
              setSelectedNs(e.target.value);
              setSelectedPod('');
            }}
            className="border border-border rounded-lg px-2.5 py-1.5 text-sm bg-bg text-text focus:outline-none focus:border-primary"
          >
            <option value="">All</option>
            {nsList.map((ns) => (
              <option key={ns} value={ns}>
                {ns}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-text-secondary">Pod</label>
          <select
            value={selectedPod}
            onChange={(e) => setSelectedPod(e.target.value)}
            className="border border-border rounded-lg px-2.5 py-1.5 text-sm bg-bg text-text focus:outline-none focus:border-primary"
          >
            <option value="">— select pod —</option>
            {podList.map((p) => (
              <option key={`${p.namespace}/${p.name}`} value={p.name}>
                {p.namespace}/{p.name}
              </option>
            ))}
          </select>
        </div>
        <button
          type="button"
          onClick={() => {
            if (!selectedPod) return;
            const pod = podList.find((p) => p.name === selectedPod);
            onSelect(pod?.namespace ?? selectedNs, selectedPod, undefined);
          }}
          disabled={!selectedPod}
          className="px-4 py-1.5 rounded-lg bg-primary text-bg text-sm font-medium disabled:opacity-40 hover:opacity-90 transition-opacity"
        >
          Connect
        </button>
      </div>
    </div>
  );
};

// ── NodeSelector ─────────────────────────────────────────────────────────────

const NodeSelector = ({ onSelect }: { onSelect: (nodeName: string) => void }) => {
  const { data: nodes } = useNodes();
  const [selected, setSelected] = useState('');
  const nodeList = nodes ?? [];

  return (
    <div className="flex flex-col items-center justify-center h-full gap-4 p-6">
      <p className="text-sm text-text-secondary">Select a node to open a shell</p>
      <div className="flex flex-wrap gap-3 items-end">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-text-secondary">Node</label>
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            className="border border-border rounded-lg px-2.5 py-1.5 text-sm bg-bg text-text focus:outline-none focus:border-primary"
          >
            <option value="">— select node —</option>
            {nodeList.map((n) => (
              <option key={n.name} value={n.name}>
                {n.name}
              </option>
            ))}
          </select>
        </div>
        <button
          type="button"
          onClick={() => {
            if (selected) onSelect(selected);
          }}
          disabled={!selected}
          className="px-4 py-1.5 rounded-lg bg-primary text-bg text-sm font-medium disabled:opacity-40 hover:opacity-90 transition-opacity"
        >
          Connect
        </button>
      </div>
    </div>
  );
};

// ── LogViewer ────────────────────────────────────────────────────────────────

const LogViewer = ({ namespace, podName }: { namespace: string; podName: string }) => {
  const [logs, setLogs] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = getAuthToken();
      const res = await fetch(
        `/api/pods/${encodeURIComponent(namespace)}/${encodeURIComponent(podName)}/logs`,
        { headers: token ? { Authorization: token } : undefined }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      setLogs(text);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch logs');
    } finally {
      setLoading(false);
    }
  }, [namespace, podName]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView();
  }, [logs]);

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center gap-2 px-3 py-1 border-b border-border flex-shrink-0 bg-surface">
        <span className="text-xs font-mono text-text-secondary">
          {namespace}/{podName}
        </span>
        <button
          type="button"
          onClick={fetchLogs}
          disabled={loading}
          title="Reload logs"
          className="ml-auto p-1 hover:bg-hover rounded text-text-secondary disabled:opacity-40"
        >
          <RotateCw size={13} className={cn(loading && 'animate-spin')} />
        </button>
      </div>
      {error ? (
        <p className="p-4 text-sm text-red-500">{error}</p>
      ) : (
        <pre className="flex-1 overflow-auto text-[11px] p-3 font-mono text-text-secondary whitespace-pre-wrap leading-relaxed">
          {loading && !logs ? 'Loading…' : logs || 'No logs available'}
          <div ref={logsEndRef} />
        </pre>
      )}
    </div>
  );
};

// ── YamlEditorTab ────────────────────────────────────────────────────────────

const YamlEditorTab = ({
  initialContent,
  title,
  onContentChange,
}: {
  initialContent: string;
  title?: string;
  onContentChange: (content: string) => void;
}) => {
  const [yaml, setYaml] = useState(initialContent);

  const handleChange = (value: string) => {
    setYaml(value);
    onContentChange(value);
  };

  return (
    <div className="yaml-editor-pane h-full flex flex-col bg-surface-elevated">
      <div className="flex items-center gap-2 px-3 py-1 border-b border-white/10 flex-shrink-0 bg-surface-elevated">
        <span className="text-xs text-white/50">{title ?? 'New Resource'}</span>
      </div>
      <div className="flex-1 overflow-hidden">
        <AceEditor
          mode="yaml"
          theme="tomorrow_night"
          value={yaml}
          onChange={handleChange}
          width="100%"
          height="100%"
          setOptions={{ useWorker: false, tabSize: 2 }}
          editorProps={{ $blockScrolling: true }}
          style={{ fontSize: 12 }}
        />
      </div>
    </div>
  );
};

// ── TabIcon ───────────────────────────────────────────────────────────────────

const TabIcon = ({ type, size = 13 }: { type: PanelTabType; size?: number }) => {
  switch (type) {
    case 'host-shell':
    case 'pod-exec':
      return <Terminal size={size} />;
    case 'node-exec':
      return <Server size={size} />;
    case 'logs':
      return <ScrollText size={size} />;
    case 'yaml-editor':
      return <FileText size={size} />;
  }
};

// ── AddMenu — rendered inline inside the panel, no portal needed ──────────────

const AddMenu = ({ onSelect }: { onSelect: (type: PanelTabType) => void }) => (
  <div
    className="absolute right-0 top-8 w-56 bg-surface border border-border rounded-bl-xl shadow-2xl z-50 py-1"
    onClick={(e) => e.stopPropagation()}
  >
    {ADD_OPTIONS.map(({ type, label, icon: Icon, description }) => (
      <button
        key={type}
        type="button"
        onClick={() => onSelect(type)}
        className="w-full flex items-start gap-3 px-3 py-2.5 hover:bg-hover text-left transition-colors"
      >
        <Icon size={15} className="text-primary mt-0.5 flex-shrink-0" />
        <div>
          <div className="text-sm font-medium text-text leading-tight">{label}</div>
          <div className="text-xs text-text-secondary mt-0.5">{description}</div>
        </div>
      </button>
    ))}
  </div>
);

// ── TabContent ────────────────────────────────────────────────────────────────

const TabContent = ({
  tab,
  onConnect,
  onYamlChange,
}: {
  tab: PanelTab;
  onConnect: (target: TabTarget) => void;
  onYamlChange: (content: string) => void;
}) => {
  switch (tab.type) {
    case 'pod-exec':
      if (!tab.target) {
        return (
          <PodSelector
            title="Select a pod to exec into"
            onSelect={(ns, pod, container) => onConnect({ namespace: ns, podName: pod, containerName: container })}
          />
        );
      }
      return (
        <TerminalComponent
          podName={tab.target.podName}
          namespace={tab.target.namespace}
          containerName={tab.target.containerName}
        />
      );

    case 'node-exec':
      if (!tab.target) {
        return (
          <NodeSelector
            onSelect={(nodeName) => onConnect({ namespace: 'node', podName: nodeName })}
          />
        );
      }
      return <TerminalComponent podName={tab.target.podName} namespace="node" />;

    case 'logs':
      if (!tab.target) {
        return (
          <PodSelector
            title="Select a pod to view logs"
            onSelect={(ns, pod) => onConnect({ namespace: ns, podName: pod })}
          />
        );
      }
      return <LogViewer namespace={tab.target.namespace} podName={tab.target.podName} />;

    case 'host-shell':
      return <TerminalComponent podName="host" namespace="host" />;

    case 'yaml-editor':
      return (
        <YamlEditorTab
          initialContent={tab.yamlContent ?? DEFAULT_YAML}
          title={tab.title}
          onContentChange={onYamlChange}
        />
      );
  }
};

// ── BottomPanel (main export) ─────────────────────────────────────────────────

const MENU_ITEM_HEIGHT = 48;
const MIN_PANEL_HEIGHT = 280;
const DEFAULT_PANEL_HEIGHT = () => Math.round(window.innerHeight * 0.5);

export const BottomPanel = () => {
  const [tabs, setTabs] = useState<PanelTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [panelHeight, setPanelHeight] = useState(MIN_PANEL_HEIGHT);
  const [fullScreen, setFullScreen] = useState(false);
  const savedBeforeFullScreen = useRef<{ height: number; collapsed: boolean } | null>(null);
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [yamlActionLoading, setYamlActionLoading] = useState(false);
  const [yamlActionResult, setYamlActionResult] = useState<{ ok: boolean; tabId: string } | null>(null);

  const activeTab = tabs.find((t) => t.id === activeTabId) ?? null;
  const isActiveYamlTab = !!activeTab && activeTab.type === 'yaml-editor';
  const activeYamlActionLabel = isActiveYamlTab ? (activeTab.yamlActionLabel ?? 'Apply') : 'Apply';
  const activeYamlDirty = !!(isActiveYamlTab && activeTab?.yamlDirty);

  // ── External open events (e.g. sidebar Terminal button) ───────────────────
  const doAddTab = useCallback((type: PanelTabType, opts?: Partial<OpenPanelTabOptions>) => {
    const id = `${type}-${Date.now()}`;
    setTabs((prev) => [
      ...prev,
      {
        id,
        type,
        label:
          type === 'yaml-editor'
            ? (opts?.title?.trim() || LABEL_MAP[type])
            : (opts?.podName ?? LABEL_MAP[type]),
        ...(type === 'yaml-editor'
          ? {
              yamlContent: opts?.yamlContent ?? DEFAULT_YAML,
              yamlSavedContent: opts?.yamlContent ?? DEFAULT_YAML,
              yamlDirty: false,
              title: opts?.title,
              yamlActionLabel: opts?.yamlActionLabel ?? 'Apply',
              helmReleaseName: opts?.helmReleaseName,
              helmReleaseNamespace: opts?.helmReleaseNamespace,
            }
          : {}),
        ...(opts?.podName
          ? { target: { namespace: opts.namespace ?? 'default', podName: opts.podName, containerName: opts.containerName } }
          : {}),
      },
    ]);
    setActiveTabId(id);
    setCollapsed(false);
    setPanelHeight((h) => (h <= MIN_PANEL_HEIGHT ? DEFAULT_PANEL_HEIGHT() : h));
    setShowAddMenu(false);
  }, []);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<OpenPanelTabOptions>).detail;
      doAddTab(detail.type, detail);
    };
    window.addEventListener('panel:open', handler);
    return () => window.removeEventListener('panel:open', handler);
  }, [doAddTab]);

  // ── Close add menu on outside click ───────────────────────────────────────
  useEffect(() => {
    if (!showAddMenu) return;
    const t = window.setTimeout(() => {
      document.addEventListener('click', () => setShowAddMenu(false), { once: true });
    }, 0);
    return () => window.clearTimeout(t);
  }, [showAddMenu]);

  // ── Exit full screen on Escape ───────────────────────────────────────────
  useEffect(() => {
    if (!fullScreen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFullScreen(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [fullScreen]);

  const handleAddClick = () => {
    if (!showAddMenu) {
      // Ensure panel is tall enough to show all menu items
      setCollapsed(false);
      setPanelHeight((h) => Math.max(h, ADD_OPTIONS.length * MENU_ITEM_HEIGHT + 40));
    }
    setShowAddMenu((p) => !p);
  };

  const closeTab = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setTabs((prev) => {
      const next = prev.filter((t) => t.id !== id);
      if (activeTabId === id) setActiveTabId(next.length > 0 ? next[next.length - 1].id : null);
      return next;
    });
  };

  const connectTab = (id: string, target: TabTarget) => {
    setTabs((prev) => prev.map((t) => (t.id === id ? { ...t, target, label: target.podName } : t)));
  };

  const updateYaml = (id: string, content: string) => {
    setTabs((prev) =>
      prev.map((t) => {
        if (t.id !== id || t.type !== 'yaml-editor') return t;
        const yamlSavedContent = t.yamlSavedContent ?? '';
        return {
          ...t,
          yamlContent: content,
          yamlDirty: content !== yamlSavedContent,
        };
      })
    );
    if (yamlActionResult?.tabId === id) {
      setYamlActionResult(null);
    }
  };

  const handleYamlPrimaryAction = async () => {
    if (!activeTab || activeTab.type !== 'yaml-editor') return;
    const rawYaml = activeTab.yamlContent ?? '';
    const yaml = rawYaml.trim();
    if (!yaml) return;

    setYamlActionLoading(true);
    setYamlActionResult(null);
    try {
      const token = getAuthToken();
      const isHelmUpgrade =
        activeTab.yamlActionLabel === 'Upgrade' &&
        !!activeTab.helmReleaseName &&
        !!activeTab.helmReleaseNamespace;

      const endpoint = isHelmUpgrade
        ? `/api/helm/releases/${encodeURIComponent(activeTab.helmReleaseNamespace as string)}/${encodeURIComponent(activeTab.helmReleaseName as string)}/upgrade`
        : '/api/apply';

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/yaml',
          ...(token ? { Authorization: token } : {}),
        },
        body: yaml,
      });

      const text = await res.text().catch(() => '');
      let message: string;
      try {
        const json = JSON.parse(text);
        message = json.message ?? (res.ok ? 'Applied successfully' : `Error ${res.status}`);
      } catch {
        message = text || (res.ok ? 'Applied successfully' : `Error ${res.status}`);
      }

      if (res.ok) {
        toast.success(message);
      } else {
        toast.error(message);
      }

      if (res.ok) {
        setTabs((prev) =>
          prev.map((t) =>
            t.id === activeTab.id && t.type === 'yaml-editor'
              ? { ...t, yamlSavedContent: rawYaml, yamlDirty: false }
              : t
          )
        );
      }

      setYamlActionResult({ ok: res.ok, tabId: activeTab.id });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Network error';
      toast.error(message);
      setYamlActionResult({ ok: false, tabId: activeTab.id });
    } finally {
      setYamlActionLoading(false);
    }
  };

  const handleDragStart = (e: React.MouseEvent) => {
    e.preventDefault();
    const startY = e.clientY;
    const startH = panelHeight;
    const onMove = (ev: MouseEvent) => setPanelHeight(Math.max(120, Math.min(window.innerHeight - 80, startH + startY - ev.clientY)));
    const onUp = () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  // Panel needs explicit height when showing content or the dropdown menu
  const needsHeight = (!collapsed && tabs.length > 0) || showAddMenu;

  const toggleFullScreen = () => {
    setFullScreen((prev) => {
      if (!prev) {
        savedBeforeFullScreen.current = { height: panelHeight, collapsed };
        setCollapsed(false);
        setPanelHeight(window.innerHeight - 32);
      } else {
        const saved = savedBeforeFullScreen.current;
        if (saved) {
          setPanelHeight(saved.height);
          setCollapsed(saved.collapsed);
          savedBeforeFullScreen.current = null;
        } else {
          setPanelHeight(DEFAULT_PANEL_HEIGHT());
        }
      }
      return !prev;
    });
  };

  const effectiveHeight = fullScreen
    ? '100vh'
    : needsHeight
      ? (!collapsed && tabs.length > 0) ? panelHeight : Math.max(panelHeight, ADD_OPTIONS.length * MENU_ITEM_HEIGHT + 40)
      : undefined;

  return (
    <div
      className={cn(
        'flex flex-col rounded-xl overflow-hidden bg-sidebar',
        fullScreen ? 'fixed inset-0 z-[100] rounded-none' : 'relative flex-shrink-0 mx-2 mb-2'
      )}
      style={{
        boxShadow: fullScreen ? '0 0 0 1px var(--color-border)' : '0 0 0 1px color-mix(in srgb, var(--color-primary) 40%, transparent), 0 -4px 24px rgba(0,0,0,0.25)',
        ...(effectiveHeight !== undefined ? { height: effectiveHeight } : {}),
      } as CSSProperties}
    >
      {/* Accent top strip */}
      <div className="h-0.5 flex-shrink-0 bg-gradient-to-r from-primary/40 via-primary to-primary/40" />

      {/* Drag handle */}
      {!collapsed && tabs.length > 0 && (
        <div onMouseDown={handleDragStart} className="h-1 flex-shrink-0 cursor-ns-resize hover:bg-primary/20 transition-colors" />
      )}

      {/* Tab bar */}
      <div className="flex items-center h-8 flex-shrink-0 border-b border-border bg-sidebar">
        {/* Scrollable tabs */}
        <div className="flex-1 flex items-center overflow-x-auto gap-0.5 px-1 min-w-0">
          {tabs.map((tab) => {
            const isActive = tab.id === activeTabId && !collapsed;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => { setActiveTabId(tab.id); setCollapsed(false); }}
                className={cn(
                  'group flex items-center gap-1.5 px-2.5 h-7 rounded-t text-xs font-medium flex-shrink-0 border-b-2 transition-colors',
                  isActive ? 'bg-bg border-primary text-text' : 'border-transparent text-text-secondary hover:bg-hover'
                )}
              >
                <TabIcon type={tab.type} size={12} />
                <span className="max-w-[7rem] truncate">{tab.label}</span>
                {tab.type === 'yaml-editor' && tab.yamlDirty && (
                  <span title="Unsaved changes" className="-ml-1">
                    <Dot
                      size={16}
                      className="text-amber-400"
                    />
                  </span>
                )}
                <span
                  role="button" tabIndex={0}
                  onClick={(e) => closeTab(tab.id, e)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') closeTab(tab.id, e as unknown as React.MouseEvent); }}
                  className="ml-0.5 p-0.5 hover:bg-hover rounded opacity-0 group-hover:opacity-60 hover:!opacity-100 cursor-pointer"
                  title="Close"
                >
                  <X size={10} />
                </span>
              </button>
            );
          })}
        </div>

        {/* Fixed right controls */}
        <div className="flex-shrink-0 flex items-center gap-1 px-2 border-l border-border">
          {isActiveYamlTab && (
            <>
              {yamlActionResult?.tabId === activeTab.id && (
                <span
                  className={cn(
                    'text-[11px] px-2 py-0.5 rounded border',
                    yamlActionResult.ok
                      ? 'text-green-300 border-green-500/40 bg-green-500/10'
                      : 'text-red-300 border-red-500/40 bg-red-500/10'
                  )}
                >
                  {yamlActionResult.ok
                    ? (activeYamlActionLabel === 'Upgrade' ? 'Upgraded ✓' : 'Applied ✓')
                    : 'Failed ✗'}
                </span>
              )}
              <button
                type="button"
                onClick={handleYamlPrimaryAction}
                disabled={yamlActionLoading || !activeYamlDirty}
                className={cn(
                  'flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors border disabled:opacity-40',
                  activeYamlDirty
                    ? 'bg-primary/20 hover:bg-primary/30 text-primary border-primary/40'
                    : 'bg-hover text-text-secondary border-border'
                )}
                title={activeYamlActionLabel}
              >
                <Circle
                  size={10}
                  className={cn(activeYamlDirty ? 'text-amber-400 fill-current' : 'text-text-secondary')}
                />
                {yamlActionLoading
                  ? (activeYamlActionLabel === 'Upgrade' ? 'Upgrading…' : 'Applying…')
                  : (activeYamlDirty ? activeYamlActionLabel : 'Saved')}
              </button>
            </>
          )}
          <button
            type="button"
            onClick={handleAddClick}
            className={cn(
              'flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors',
              'bg-accent/15 hover:bg-accent/30 text-accent border border-accent/30 hover:border-accent/60',
              showAddMenu && 'bg-accent/30 border-accent/60'
            )}
            title="Add tab"
          >
            <Plus size={13} strokeWidth={2.5} />
            <span>New Tab</span>
          </button>
          {tabs.length > 0 && (
            <>
              <button
                type="button"
                onClick={toggleFullScreen}
                className="p-1 hover:bg-hover rounded text-text-secondary transition-colors"
                title={fullScreen ? 'Exit full screen' : 'Full screen'}
              >
                {fullScreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
              </button>
              <button
                type="button"
                onClick={() => setCollapsed((p) => !p)}
                className="p-1 hover:bg-hover rounded text-text-secondary transition-colors"
                title={collapsed ? 'Expand' : 'Collapse'}
              >
                {collapsed ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Inline add menu — absolutely positioned inside panel, overlays content */}
      {showAddMenu && <AddMenu onSelect={(type) => doAddTab(type)} />}

      {/* Content area — all tabs stay mounted; only active one is visible */}
      {tabs.length > 0 && !collapsed && (
        <div className="flex-1 min-h-0 overflow-hidden bg-sidebar">
          {tabs.map((tab) => (
            <div key={tab.id} className="h-full" style={{ display: tab.id === activeTabId ? 'block' : 'none' }}>
              <TabContent
                tab={tab}
                onConnect={(target) => connectTab(tab.id, target)}
                onYamlChange={(content) => updateYaml(tab.id, content)}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
