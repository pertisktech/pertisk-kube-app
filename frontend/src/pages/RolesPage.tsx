import { useEffect, useMemo, useRef, useState } from 'react';
import AceEditor from 'react-ace';
import YAML from 'yaml';
import 'ace-builds/src-noconflict/mode-yaml';
import 'ace-builds/src-noconflict/theme-github';
import 'ace-builds/src-noconflict/theme-tomorrow_night';
import { Trash2 } from 'lucide-react';
import { useRoles, deleteRole } from '../hooks/useKubernetes';
import { useTheme } from '../context/ThemeContext';
import { useNamespace } from '../context/NamespaceContext';
import { DataTable, RoleDetailPanel, ConfirmDialog } from '../components';
import type { Role } from '../types';
import { getAuthToken } from '../utils/auth';
import { timeAgo } from '../utils';

type RolesSortKey = 'name' | 'namespace' | 'age';

const sanitizeYamlForEdit = (yamlText: string) => {
  try {
    const parsed = YAML.parse(yamlText) as Record<string, unknown> | null;
    if (!parsed || typeof parsed !== 'object') return yamlText;
    const metadata = parsed.metadata as Record<string, unknown> | undefined;
    if (metadata) {
      delete metadata.managedFields; delete metadata.resourceVersion; delete metadata.uid;
      delete metadata.generation; delete metadata.creationTimestamp; delete metadata.selfLink;
      const annotations = metadata.annotations as Record<string, unknown> | undefined;
      if (annotations) { delete annotations['kubectl.kubernetes.io/last-applied-configuration']; if (Object.keys(annotations).length === 0) delete metadata.annotations; }
    }
    delete parsed.status;
    return YAML.stringify(parsed, { lineWidth: 0 });
  } catch { return yamlText; }
};

export const RolesPage = () => {
  const { data, isLoading, error } = useRoles();
  const theme = useTheme();
  const { selectedNamespaces } = useNamespace();
  const [selectedItem, setSelectedItem] = useState<Role | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [yamlTabs, setYamlTabs] = useState<Role[]>([]);
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
  const [sortState, setSortState] = useState<{ key: RolesSortKey; direction: 'asc' | 'desc' }>({ key: 'age', direction: 'desc' });

  const activeYamlItem = useMemo(() => activeYamlTabKey ? yamlTabs.find((t) => `${t.namespace}/${t.name}` === activeYamlTabKey) ?? null : null, [yamlTabs, activeYamlTabKey]);

  useEffect(() => {
    if (!activeYamlItem || !activeYamlTabKey) return;
    if (yamlContentsByTab[activeYamlTabKey] !== undefined) return;
    const controller = new AbortController();
    const token = getAuthToken();
    setYamlLoadingTabKey(activeYamlTabKey);
    setYamlErrorByTab((p) => ({ ...p, [activeYamlTabKey]: null }));
    setYamlSuccessByTab((p) => ({ ...p, [activeYamlTabKey]: null }));
    const load = async () => {
      try {
        const res = await fetch(`/api/roles/${encodeURIComponent(activeYamlItem.namespace)}/${encodeURIComponent(activeYamlItem.name)}/yaml`, { method: 'GET', headers: token ? { Authorization: token } : undefined, signal: controller.signal });
        if (!res.ok) throw new Error(`Failed to load YAML (${res.status})`);
        const text = await res.text();
        setYamlContentsByTab((p) => ({ ...p, [activeYamlTabKey]: sanitizeYamlForEdit(text) }));
      } catch (e) {
        if ((e as Error).name !== 'AbortError') setYamlErrorByTab((p) => ({ ...p, [activeYamlTabKey]: (e as Error).message }));
      } finally { setYamlLoadingTabKey((c) => (c === activeYamlTabKey ? null : c)); }
    };
    load();
    return () => controller.abort();
  }, [activeYamlItem?.namespace, activeYamlItem?.name, activeYamlTabKey, yamlContentsByTab]);

  const handleCloseYamlEditor = () => { setYamlTabs([]); setActiveYamlTabKey(null); setYamlDrawerVisible(true); setYamlContentsByTab({}); setYamlErrorByTab({}); setYamlSuccessByTab({}); setYamlLoadingTabKey(null); setYamlSavingTabKey(null); };

  const handleOpenYamlEditorFromPanel = (item: Role) => {
    const key = `${item.namespace}/${item.name}`;
    setYamlTabs((p) => p.some((t) => `${t.namespace}/${t.name}` === key) ? p : [...p, item]);
    setActiveYamlTabKey(key); setYamlDrawerVisible(true); setPanelOpen(false);
  };

  const handleCloseYamlTab = (tabKey: string) => {
    setYamlTabs((p) => { const next = p.filter((t) => `${t.namespace}/${t.name}` !== tabKey); if (activeYamlTabKey === tabKey) setActiveYamlTabKey(next.length > 0 ? `${next[next.length - 1].namespace}/${next[next.length - 1].name}` : null); return next; });
    setYamlContentsByTab((p) => { const n = { ...p }; delete n[tabKey]; return n; });
    setYamlErrorByTab((p) => { const n = { ...p }; delete n[tabKey]; return n; });
    setYamlSuccessByTab((p) => { const n = { ...p }; delete n[tabKey]; return n; });
    setYamlLoadingTabKey((c) => (c === tabKey ? null : c)); setYamlSavingTabKey((c) => (c === tabKey ? null : c));
  };

  const handleSaveYaml = async () => {
    if (!activeYamlItem || !activeYamlTabKey) return;
    const token = getAuthToken();
    setYamlSavingTabKey(activeYamlTabKey);
    setYamlErrorByTab((p) => ({ ...p, [activeYamlTabKey]: null }));
    setYamlSuccessByTab((p) => ({ ...p, [activeYamlTabKey]: null }));
    try {
      const res = await fetch(`/api/roles/${encodeURIComponent(activeYamlItem.namespace)}/${encodeURIComponent(activeYamlItem.name)}/yaml`, { method: 'PUT', headers: { 'Content-Type': 'application/yaml', ...(token ? { Authorization: token } : {}) }, body: yamlContentsByTab[activeYamlTabKey] || '' });
      if (!res.ok) { const msg = await res.text(); throw new Error(msg || `Failed to save (${res.status})`); }
      setYamlSuccessByTab((p) => ({ ...p, [activeYamlTabKey]: 'Saved successfully' }));
    } catch (e) { setYamlErrorByTab((p) => ({ ...p, [activeYamlTabKey]: (e as Error).message })); }
    finally { setYamlSavingTabKey((c) => (c === activeYamlTabKey ? null : c)); }
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
    const h = yamlDrawerHeightPx ?? Math.floor(window.innerHeight * 0.45);
    resizeStartYRef.current = clientY; resizeStartHeightRef.current = h; setYamlDrawerHeightPx(h); setIsResizingYamlDrawer(true);
  };

  useEffect(() => {
    if (!isResizingYamlDrawer) return;
    const onMove = (e: MouseEvent) => setYamlDrawerHeightPx(Math.max(220, Math.min(Math.floor(window.innerHeight * 0.85), resizeStartHeightRef.current + resizeStartYRef.current - e.clientY)));
    const onUp = () => setIsResizingYamlDrawer(false);
    window.addEventListener('mousemove', onMove); window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, [isResizingYamlDrawer]);

  const handleDeleteSingle = async (namespace: string, name: string) => {
    setConfirmDelete({ keys: [`${namespace}/${name}`], label: name }); setPanelOpen(false);
  };
  const handleDeleteSelected = () => { if (!selectedRows.length) return; setConfirmDelete({ keys: selectedRows, label: selectedRows.length === 1 ? selectedRows[0].split('/')[1] : `${selectedRows.length} items` }); };
  const handleConfirmDelete = async () => {
    if (!confirmDelete) return;
    setIsDeleting(true);
    try {
      await Promise.all(confirmDelete.keys.map((key) => { const [ns, ...rest] = key.split('/'); return deleteRole(ns, rest.join('/')); }));
      setSelectedRows([]); setConfirmDelete(null);
    } finally { setIsDeleting(false); }
  };

  const columns = [
    { header: 'Name', accessor: 'name' as const, width: '35%', sortable: true, sortKey: 'name' },
    { header: 'Namespace', accessor: 'namespace' as const, width: '30%', sortable: true, sortKey: 'namespace' },
    { header: 'Rules', accessor: 'rules' as const, width: '15%' },
    { header: 'Age', accessor: (r: Role) => timeAgo(r.age), width: '20%', sortable: true, sortKey: 'age' },
  ];

  const sortedData = useMemo(() => {
    let source = data || [];
    if (selectedNamespaces.length > 0) source = source.filter((r) => selectedNamespaces.includes((r as any).namespace));
    const withId = source.map((r) => ({ ...r, id: `${(r as any).namespace}/${r.name}` }));
    const f = sortState.direction === 'asc' ? 1 : -1;
    return withId.sort((a, b) => {
      if (sortState.key === 'name') return a.name.localeCompare(b.name) * f;
      if (sortState.key === 'namespace') return ((a as any).namespace || '').localeCompare((b as any).namespace || '') * f;
      const at = Date.parse((a as any).age || ''); const bt = Date.parse((b as any).age || '');
      return ((Number.isNaN(at) ? 0 : at) - (Number.isNaN(bt) ? 0 : bt)) * f;
    });
  }, [data, sortState, selectedNamespaces]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-text">Roles</h1>
        <p className="text-text-secondary mt-1">Namespace-scoped RBAC roles defining permissions.</p>
      </div>

      <div className="space-y-2" style={{ paddingBottom: yamlTabs.length > 0 ? (yamlDrawerVisible ? yamlDrawerHeightPx ?? 420 : 84) : 0 }}>
        <DataTable
          columns={columns} data={sortedData} isLoading={isLoading} error={error?.message || null} rowKey="id"
          onRowClick={(row) => { setSelectedItem(row); setPanelOpen(true); }}
          selectedRowKey={panelOpen && selectedItem ? `${(selectedItem as any).namespace}/${selectedItem.name}` : undefined}
          sortState={sortState} onSortChange={(s) => setSortState(s as { key: RolesSortKey; direction: 'asc' | 'desc' })}
          enableRowSelection={true} selectedRows={selectedRows} onRowSelectionChange={setSelectedRows}
        />

        {yamlTabs.length > 0 && !yamlDrawerVisible && (
          <section className="fixed bottom-0 left-0 md:left-[var(--layout-sidebar-width,16rem)] right-0 z-[96]">
            <div className="px-6"><div className="bg-surface border border-border rounded-t-lg shadow-2xl p-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-text-secondary">YAML tabs hidden ({yamlTabs.length})</span>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => setYamlDrawerVisible(true)} className="px-3 py-1 text-xs rounded-md bg-[var(--color-primary)] text-bg">Show</button>
                  <button type="button" onClick={handleCloseYamlEditor} className="px-3 py-1 text-xs rounded-md border border-border text-text-secondary hover:text-text">Close</button>
                </div>
              </div>
            </div></div>
          </section>
        )}

        {yamlTabs.length > 0 && yamlDrawerVisible && activeYamlItem && activeYamlTabKey && (
          <section className="fixed bottom-0 left-0 md:left-[var(--layout-sidebar-width,16rem)] right-0 z-[96]">
            <div className="px-6">
              <div className="bg-surface border border-border rounded-t-lg shadow-2xl p-3 pt-5 space-y-2 overflow-auto relative" style={{ height: yamlDrawerHeightPx ? `${yamlDrawerHeightPx}px` : 'clamp(220px, 45vh, 620px)' }}>
                <div className="absolute top-0 left-0 right-0 h-5 cursor-ns-resize flex items-start justify-center" onMouseDown={(e) => { e.preventDefault(); handleStartYamlDrawerResize(e.clientY); }}><div className="mt-1.5 h-1.5 w-14 rounded-full bg-border" /></div>
                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-2 min-w-0">
                  <div className="flex items-center gap-2 overflow-x-auto pb-1 min-w-0">
                    {yamlTabs.map((tab) => { const key = `${tab.namespace}/${tab.name}`; const isActive = key === activeYamlTabKey; return (
                      <div key={key} className={`inline-flex items-center rounded-md border text-xs ${isActive ? 'border-[var(--color-primary)] bg-hover text-[var(--color-primary)]' : 'border-border bg-surface-elevated text-text-secondary'}`}>
                        <button type="button" onClick={() => setActiveYamlTabKey(key)} className="px-3 py-1.5 whitespace-nowrap max-w-[220px] truncate" title={key}>{tab.name}</button>
                        <button type="button" onClick={() => handleCloseYamlTab(key)} className="px-2 py-1.5 border-l border-border">×</button>
                      </div>
                    ); })}
                  </div>
                  <div className="flex items-center gap-2 shrink-0 flex-wrap lg:flex-nowrap">
                    <span className="px-2 py-1 text-xs rounded bg-hover text-[var(--color-primary)] font-semibold">Edit YAML</span>
                    <button type="button" onClick={handleVerifyYaml} className="px-3 py-1.5 text-sm rounded-md border border-border text-text-secondary hover:text-text" disabled={yamlLoadingTabKey === activeYamlTabKey || !(yamlContentsByTab[activeYamlTabKey] || '').trim()}>Verify</button>
                    <button type="button" onClick={() => setYamlDrawerVisible(false)} className="px-3 py-1.5 text-sm rounded-md border border-border text-text-secondary hover:text-text" disabled={yamlSavingTabKey === activeYamlTabKey}>Hide</button>
                    <button type="button" onClick={handleSaveYaml} className="px-3 py-1.5 text-sm rounded-md bg-[var(--color-primary)] text-bg disabled:opacity-60" disabled={yamlSavingTabKey === activeYamlTabKey || yamlLoadingTabKey === activeYamlTabKey || !(yamlContentsByTab[activeYamlTabKey] || '').trim()}>{yamlSavingTabKey === activeYamlTabKey ? 'Saving...' : 'Save'}</button>
                    <button type="button" onClick={handleCloseYamlEditor} className="px-3 py-1.5 text-sm rounded-md border border-border text-text-secondary hover:text-text" disabled={yamlSavingTabKey === activeYamlTabKey}>Close</button>
                  </div>
                </div>
                <>
                  {yamlErrorByTab[activeYamlTabKey] && <div className="px-3 py-2 text-sm text-[var(--color-icon-danger)] border border-border rounded-md bg-surface-elevated">{yamlErrorByTab[activeYamlTabKey]}</div>}
                  {yamlSuccessByTab[activeYamlTabKey] && <div className="px-3 py-2 text-sm text-[var(--color-icon-success)] border border-border rounded-md bg-surface-elevated">{yamlSuccessByTab[activeYamlTabKey]}</div>}
                  <div className="w-full h-[calc(100%-90px)] min-h-[180px] rounded-md border border-border bg-surface-elevated overflow-hidden">
                    <AceEditor mode="yaml" theme={theme?.isDark ? 'tomorrow_night' : 'github'} name={`rbac-yaml-${activeYamlTabKey}`} value={yamlContentsByTab[activeYamlTabKey] || ''} onChange={(v) => setYamlContentsByTab((p) => ({ ...p, [activeYamlTabKey]: v }))} readOnly={yamlLoadingTabKey === activeYamlTabKey || yamlSavingTabKey === activeYamlTabKey} width="100%" height="100%" fontSize={12} showPrintMargin={false} setOptions={{ useWorker: false, wrap: true, tabSize: 2, showLineNumbers: true }} editorProps={{ $blockScrolling: true }} />
                  </div>
                </>
              </div>
            </div>
          </section>
        )}
      </div>

      {panelOpen && selectedItem && (
        <>
          <div className="fixed inset-0 z-[95] bg-black/20" onClick={() => setPanelOpen(false)} />
          <RoleDetailPanel role={selectedItem} onClose={() => setPanelOpen(false)} onOpenYamlEditor={handleOpenYamlEditorFromPanel} onDelete={handleDeleteSingle} />
        </>
      )}

      {selectedRows.length > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[110] flex items-center gap-3 px-4 py-3 bg-surface border-2 border-orange-500 rounded-xl shadow-2xl animate-in fade-in slide-in-from-bottom-4 duration-200">
          <span className="text-sm text-text-secondary font-medium">{selectedRows.length} selected</span>
          <div className="w-px h-4 bg-border" />
          <button type="button" onClick={handleDeleteSelected} className="inline-flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg bg-[var(--color-icon-danger)]/10 text-[var(--color-icon-danger)] hover:bg-[var(--color-icon-danger)]/20 font-medium transition-colors"><Trash2 size={14} />Delete</button>
          <button type="button" onClick={() => setSelectedRows([])} className="text-xs text-text-secondary hover:text-text transition-colors">Clear</button>
        </div>
      )}

      <ConfirmDialog
        open={confirmDelete !== null}
        title={`Delete ${confirmDelete?.label ?? ''}`}
        description={confirmDelete?.keys.length === 1 ? `Are you sure you want to delete "${confirmDelete?.label}"? This action cannot be undone.` : `Are you sure you want to delete ${confirmDelete?.keys.length} items? This action cannot be undone.`}
        confirmLabel="Delete" destructive isLoading={isDeleting} onConfirm={handleConfirmDelete} onCancel={() => setConfirmDelete(null)}
      />
    </div>
  );
};
