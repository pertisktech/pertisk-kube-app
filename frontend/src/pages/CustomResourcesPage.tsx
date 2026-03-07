import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import YAML from 'yaml';
import { ChevronDown, Layers, Pencil, Trash2, X } from 'lucide-react';
import { useCrds, useCustomResources, deleteCustomResource } from '../hooks/useKubernetes';
import { DataTable } from '../components';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { useNamespace } from '../context/NamespaceContext';
import { openPanelTab } from '../components/BottomPanel';
import { timeAgo } from '../utils';
import { getAuthToken } from '../utils/auth';
import type { CustomResource } from '../types';

const sanitizeCrdYamlForEdit = (yamlText: string): string => {
  try {
    const parsed = YAML.parse(yamlText) as Record<string, unknown> | null;
    if (!parsed || typeof parsed !== 'object') return yamlText;

    const metadata = parsed.metadata as Record<string, unknown> | undefined;
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

const JsonTree = ({ value, depth = 0 }: { value: unknown; depth?: number }) => {
  const [expanded, setExpanded] = useState(depth < 2);

  if (value === null || value === undefined) {
    return <span className="text-text-secondary">null</span>;
  }
  if (typeof value === 'boolean') {
    return <span className={value ? 'text-green-400' : 'text-red-400'}>{String(value)}</span>;
  }
  if (typeof value === 'number') {
    return <span className="text-blue-400">{value}</span>;
  }
  if (typeof value === 'string') {
    return <span className="text-yellow-300">"{value}"</span>;
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return <span className="text-text-secondary">[]</span>;
    return (
      <span>
        <button
          type="button"
          onClick={() => setExpanded((p) => !p)}
          className="inline-flex items-center gap-0.5 text-text-secondary hover:text-text"
        >
          <ChevronDown size={12} className={expanded ? '' : '-rotate-90'} />
          [{value.length}]
        </button>
        {expanded && (
          <div className="ml-4 border-l border-border pl-2">
            {value.map((item, i) => (
              <div key={i} className="py-0.5">
                <span className="text-text-secondary">{i}: </span>
                <JsonTree value={item} depth={depth + 1} />
              </div>
            ))}
          </div>
        )}
      </span>
    );
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) return <span className="text-text-secondary">{'{}'}</span>;
    return (
      <span>
        <button
          type="button"
          onClick={() => setExpanded((p) => !p)}
          className="inline-flex items-center gap-0.5 text-text-secondary hover:text-text"
        >
          <ChevronDown size={12} className={expanded ? '' : '-rotate-90'} />
          {'{'}...{'}'}
        </button>
        {expanded && (
          <div className="ml-4 border-l border-border pl-2">
            {entries.map(([k, v]) => (
              <div key={k} className="py-0.5">
                <span className="text-primary">{k}</span>
                <span className="text-text-secondary">: </span>
                <JsonTree value={v} depth={depth + 1} />
              </div>
            ))}
          </div>
        )}
      </span>
    );
  }
  return <span>{String(value)}</span>;
};

const DetailPanel = ({
  item,
  onClose,
  onEditYaml,
  onDelete,
}: {
  item: CustomResource;
  onClose: () => void;
  onEditYaml: (item: CustomResource) => void;
  onDelete: (item: CustomResource) => void;
}) => (
  <>
    {/* Backdrop — click anywhere outside to dismiss, covers all screen sizes */}
    <div
      className="fixed inset-0 z-[110] bg-black/20"
      onClick={onClose}
      aria-hidden="true"
    />
    <div className="fixed inset-y-0 right-0 z-[120] w-[480px] max-w-[100vw] bg-surface border-l border-border shadow-xl flex flex-col overflow-hidden">
    <div className="flex items-center justify-between px-4 py-3 border-b border-border flex-shrink-0">
      <div className="flex items-center gap-2 min-w-0">
        <Layers size={16} className="text-primary flex-shrink-0" />
        <span className="font-semibold text-text truncate">{item.name}</span>
      </div>
      <button
        type="button"
        onClick={onClose}
        className="p-1.5 rounded-md hover:bg-hover text-text-secondary ml-2 flex-shrink-0"
        aria-label="Close panel"
      >
        <X size={16} />
      </button>
    </div>
    {/* Action bar */}
    <div className="px-4 py-2 border-b border-border flex-shrink-0">
      <div className="bg-surface border border-border rounded-lg p-1.5 flex items-center gap-2">
        <button
          type="button"
          onClick={() => onEditYaml(item)}
          className="inline-flex items-center justify-center h-7 w-7 rounded-md border border-[var(--color-primary)] text-[var(--color-primary)] hover:bg-hover"
          aria-label="Edit YAML"
          data-tooltip="Edit YAML"
        >
          <Pencil size={13} />
        </button>
        <button
          type="button"
          onClick={() => onDelete(item)}
          className="inline-flex items-center justify-center h-7 w-7 rounded-md border border-[var(--color-icon-danger)] text-[var(--color-icon-danger)] hover:bg-hover"
          aria-label="Delete"
          data-tooltip="Delete"
        >
          <Trash2 size={13} />
        </button>
      </div>
    </div>
    <div className="flex-1 overflow-y-auto p-4 space-y-4 font-mono text-xs">
      {item.namespace && (
        <div>
          <p className="text-text-secondary mb-1 font-sans uppercase tracking-wide text-[10px]">Namespace</p>
          <p className="text-text">{item.namespace}</p>
        </div>
      )}
      {item.created_at && (
        <div>
          <p className="text-text-secondary mb-1 font-sans uppercase tracking-wide text-[10px]">Created</p>
          <p className="text-text">{timeAgo(item.created_at)}</p>
        </div>
      )}
      <div>
        <p className="text-text-secondary mb-2 font-sans uppercase tracking-wide text-[10px]">Spec</p>
        <div className="bg-bg rounded p-3">
          <JsonTree value={item.spec} />
        </div>
      </div>
      {item.status && Object.keys(item.status).length > 0 && (
        <div>
          <p className="text-text-secondary mb-2 font-sans uppercase tracking-wide text-[10px]">Status</p>
          <div className="bg-bg rounded p-3">
            <JsonTree value={item.status} />
          </div>
        </div>
      )}
    </div>
  </div>
  </>
);

type SortKey = 'name' | 'namespace' | 'age';

export const CustomResourcesPage = () => {
  const { crdName } = useParams<{ crdName: string }>();
  const decodedCrdName = crdName ? decodeURIComponent(crdName) : '';

  const { data: crds } = useCrds();
  const { selectedNamespaces } = useNamespace();

  const crd = crds?.find((c) => c.name === decodedCrdName);
  const isNamespaced = crd?.scope === 'Namespaced';

  // For namespaced CRDs pass the first selected namespace (or none = all)
  const namespace =
    isNamespaced && selectedNamespaces.length === 1 ? selectedNamespaces[0] : undefined;

  const { data, isLoading, error } = useCustomResources(decodedCrdName, namespace);

  const [selectedItem, setSelectedItem] = useState<CustomResource | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<CustomResource | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Close panel when navigating to a different CRD
  useEffect(() => {
    setPanelOpen(false);
    setSelectedItem(null);
  }, [decodedCrdName]);

  const handleEditYaml = async (item: CustomResource) => {
    setPanelOpen(false);
    try {
      const token = getAuthToken();
      const params = item.namespace ? `?namespace=${encodeURIComponent(item.namespace)}` : '';
      const res = await fetch(
        `/api/crds/${encodeURIComponent(decodedCrdName)}/resources/${encodeURIComponent(item.name)}/yaml${params}`,
        { headers: token ? { Authorization: token } : {} }
      );
      if (!res.ok) throw new Error(`Failed to load YAML: ${res.statusText}`);
      const yaml = await res.text();
      openPanelTab({ type: 'yaml-editor', yamlContent: sanitizeCrdYamlForEdit(yaml), title: item.name });
    } catch {
      openPanelTab({ type: 'yaml-editor' });
    }
  };

  const handleDeleteConfirm = async () => {
    if (!confirmDelete) return;
    setIsDeleting(true);
    try {
      await deleteCustomResource(decodedCrdName, confirmDelete.name, confirmDelete.namespace ?? undefined);
      setConfirmDelete(null);
      setPanelOpen(false);
      setSelectedItem(null);
    } finally {
      setIsDeleting(false);
    }
  };

  const [sortState, setSortState] = useState<{ key: SortKey; direction: 'asc' | 'desc' }>({
    key: 'age',
    direction: 'desc',
  });

  const columns = [
    { header: 'Name', accessor: 'name' as const, width: '35%', sortable: true, sortKey: 'name' },
    ...(isNamespaced
      ? [{ header: 'Namespace', accessor: 'namespace' as const, width: '25%', sortable: true, sortKey: 'namespace' }]
      : []),
    {
      header: 'Age',
      accessor: (r: CustomResource) => (r.created_at ? timeAgo(r.created_at) : '-'),
      width: isNamespaced ? '20%' : '30%',
      sortable: true,
      sortKey: 'age',
    },
    {
      header: 'Spec keys',
      accessor: (r: CustomResource) =>
        r.spec && typeof r.spec === 'object' ? Object.keys(r.spec).join(', ') || '-' : '-',
      width: isNamespaced ? '20%' : '35%',
    },
  ];

  // Apply namespace filter client-side when multiple are selected
  const filtered = useMemo(() => {
    if (!data) return [];
    if (!isNamespaced || selectedNamespaces.length === 0) return data;
    return data.filter((r) => !r.namespace || selectedNamespaces.includes(r.namespace));
  }, [data, isNamespaced, selectedNamespaces]);

  const sortedData = useMemo(() => {
    const f = sortState.direction === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => {
      if (sortState.key === 'name') return a.name.localeCompare(b.name) * f;
      if (sortState.key === 'namespace')
        return (a.namespace ?? '').localeCompare(b.namespace ?? '') * f;
      const at = Date.parse(a.created_at ?? '');
      const bt = Date.parse(b.created_at ?? '');
      return ((Number.isNaN(at) ? 0 : at) - (Number.isNaN(bt) ? 0 : bt)) * f;
    });
  }, [filtered, sortState]);

  const withId = sortedData.map((r) => ({ ...r, id: `${r.name}/${r.namespace ?? ''}` }));

  const title = crd ? `${crd.kind} (${crd.group})` : decodedCrdName;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Layers size={18} className="text-primary" />
          <h2 className="text-lg font-semibold text-text">{title}</h2>
          {crd && (
            <span className="text-xs px-2 py-0.5 rounded bg-hover text-text-secondary">
              {crd.scope}
            </span>
          )}
        </div>
      </div>
      <DataTable
        columns={columns}
        data={withId}
        isLoading={isLoading}
        error={error ? String(error) : null}
        rowKey="id"
        selectedRowKey={
          selectedItem ? `${selectedItem.name}/${selectedItem.namespace ?? ''}` : undefined
        }
        onRowClick={(row) => {
          setSelectedItem(row);
          setPanelOpen(true);
        }}
        sortState={sortState}
        onSortChange={(s) => setSortState(s as { key: SortKey; direction: 'asc' | 'desc' })}
      />
      {panelOpen && selectedItem && (
        <DetailPanel
          item={selectedItem}
          onClose={() => setPanelOpen(false)}
          onEditYaml={handleEditYaml}
          onDelete={(item) => setConfirmDelete(item)}
        />
      )}
      <ConfirmDialog
        open={confirmDelete !== null}
        title="Delete resource"
        description={`Are you sure you want to delete "${confirmDelete?.name}"? This action cannot be undone.`}
        confirmLabel="Delete"
        destructive
        isLoading={isDeleting}
        onConfirm={() => void handleDeleteConfirm()}
        onCancel={() => setConfirmDelete(null)}
      />
    </div>
  );
};
