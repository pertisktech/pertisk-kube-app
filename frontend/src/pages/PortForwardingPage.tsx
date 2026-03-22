import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Cable,
  Plus,
  Trash2,
  Square,
  ExternalLink,
  X,
  RefreshCw,
} from '../components/Icons';
import {
  usePortForwards,
  createPortForward,
  stopPortForward,
  deletePortForward,
  useNamespaces,
  usePods,
  useServices,
  type PortForward,
  type CreatePortForwardRequest,
} from '../hooks/useKubernetes';
import { Card } from '../components/Card';
import { ConfirmDialog } from '../components/ConfirmDialog';

const parseServicePorts = (portsStr: string | undefined): number[] => {
  if (!portsStr || typeof portsStr !== 'string') return [];
  return portsStr
    .split(',')
    .map((p) => parseInt(p.trim().split('/')[0], 10))
    .filter((port) => Number.isInteger(port) && port > 0);
};

const parsePodPorts = (containerPorts: string[] | undefined): number[] => {
  if (!Array.isArray(containerPorts)) return [];
  return containerPorts
    .map((p) => parseInt(String(p).trim().split('/')[0], 10))
    .filter((port) => Number.isInteger(port) && port > 0);
};

const pickDefaultLocalPort = (remotePort: number): number => {
  if (remotePort === 80) return 8080;
  if (remotePort === 443) return 8443;
  return remotePort;
};

const getPortForwardUrl = (localPort: number): string => {
  const browserHost = window.location.hostname;
  const host =
    browserHost && browserHost !== 'localhost' && browserHost !== '127.0.0.1'
      ? browserHost
      : '127.0.0.1';
  return `http://${host}:${localPort}`;
};

export const PortForwardingPage = () => {
  const queryClient = useQueryClient();
  const { data: portForwards = [], isLoading, error, refetch } = usePortForwards();
  const { data: namespacesData } = useNamespaces();
  const { data: pods = [] } = usePods();
  const { data: services = [] } = useServices();
  const namespaces = namespacesData?.map((n) => n.name) ?? [];

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [form, setForm] = useState<CreatePortForwardRequest>({
    namespace: 'default',
    resource_type: 'pod',
    resource_name: '',
    local_port: 8080,
    remote_port: 80,
  });
  const [createError, setCreateError] = useState<string | null>(null);

  const openPortForward = (localPort: number) => {
    const url = getPortForwardUrl(localPort);
    const opened = window.open(url, '_blank', 'noopener,noreferrer');
    if (!opened) {
      window.location.assign(url);
    }
  };

  const copyPortForwardUrl = async (localPort: number) => {
    const url = getPortForwardUrl(localPort);
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // Ignore clipboard errors to avoid breaking row actions.
    }
  };

  const createMutation = useMutation({
    mutationFn: createPortForward,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['port-forwards'] });
      setShowCreateModal(false);
      setCreateError(null);
      setForm({
        namespace: form.namespace,
        resource_type: form.resource_type,
        resource_name: '',
        local_port: 8080,
        remote_port: 80,
      });
    },
    onError: (err: Error) => {
      setCreateError(err.message);
    },
  });

  const stopMutation = useMutation({
    mutationFn: stopPortForward,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['port-forwards'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deletePortForward,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['port-forwards'] });
      setDeleteId(null);
    },
  });

  const resourceList = form.resource_type === 'pod' ? pods : services;
  const resourceOptions = resourceList
    .filter((r) => r.namespace === form.namespace)
    .map((r) => ({ value: r.name, label: r.name }));

  const resourceListWithPorts = resourceList
    .filter((r) => r.namespace === form.namespace)
    .map((r) => {
      const ports =
        form.resource_type === 'service'
          ? parseServicePorts((r as typeof services[number]).ports)
          : Array.from(
              new Set(
                ((r as typeof pods[number]).containers || []).flatMap((container) =>
                  parsePodPorts(container.ports)
                )
              )
            );
      return {
        name: r.name,
        ports,
      };
    });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-text">
          Port Forwarding
          <span className="ml-2 text-base font-normal text-text-secondary">
            (Forward local ports to pods and services.)
          </span>
        </h1>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => refetch()}
            className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border text-text-secondary hover:bg-hover transition-colors"
          >
            <RefreshCw size={16} />
            Refresh
          </button>
          <button
            type="button"
            onClick={() => {
              setCreateError(null);
              setShowCreateModal(true);
            }}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--color-primary)] text-white hover:opacity-90 transition-opacity"
          >
            <Plus size={18} />
            New Port Forward
          </button>
        </div>
      </div>

      <Card title="Active port forwards">
        {isLoading ? (
          <p className="text-text-secondary text-sm py-4">Loading...</p>
        ) : error ? (
          <p className="text-red-400 text-sm py-4">Failed to load port forwards.</p>
        ) : portForwards.length === 0 ? (
          <p className="text-text-secondary text-sm py-4">
            No port forwards. Click &quot;New Port Forward&quot; to create one. Ports are forwarded on the
            server (backend); use SSH or a tunnel to access them from your machine if needed.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-text-secondary">
                  <th className="py-2 pr-4 font-medium">Resource</th>
                  <th className="py-2 pr-4 font-medium">Namespace</th>
                  <th className="py-2 pr-4 font-medium">Port mapping</th>
                  <th className="py-2 pr-4 font-medium">Status</th>
                  <th className="py-2 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {portForwards.map((pf: PortForward) => (
                  <tr key={pf.id} className="border-b border-border last:border-0">
                    <td className="py-3 pr-4">
                      <span className="font-medium text-text">
                        {pf.resource_type}/{pf.resource_name}
                      </span>
                    </td>
                    <td className="py-3 pr-4 text-text-secondary">{pf.namespace}</td>
                    <td className="py-3 pr-4 font-mono text-text">
                      localhost:{pf.local_port} → {pf.resource_name}:{pf.remote_port}
                    </td>
                    <td className="py-3 pr-4">
                      <span
                        className={`px-2 py-0.5 rounded text-xs font-medium ${
                          pf.status === 'running'
                            ? 'bg-green-500/20 text-green-400'
                            : pf.status === 'stopped'
                              ? 'bg-gray-500/20 text-gray-400'
                              : 'bg-red-500/20 text-red-400'
                        }`}
                      >
                        {pf.status}
                      </span>
                    </td>
                    <td className="py-3 flex items-center gap-2">
                      {pf.status === 'running' && (
                        <>
                          <button
                            type="button"
                            onClick={() => openPortForward(pf.local_port)}
                            className="p-1.5 rounded border border-[var(--color-icon-info)] text-[var(--color-icon-info)] hover:bg-[var(--color-icon-info)]/10 transition-colors"
                            title="Open in browser"
                          >
                            <ExternalLink size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() => copyPortForwardUrl(pf.local_port)}
                            className="px-2 py-1 rounded border border-border text-xs text-text-secondary hover:bg-hover transition-colors"
                            title="Copy URL"
                          >
                            Copy URL
                          </button>
                          <button
                            type="button"
                            onClick={() => stopMutation.mutate(pf.id)}
                            disabled={stopMutation.isPending}
                            className="p-1.5 rounded border border-amber-500/50 text-amber-400 hover:bg-amber-500/10 disabled:opacity-50"
                            title="Stop"
                          >
                            <Square size={14} />
                          </button>
                        </>
                      )}
                      <button
                        type="button"
                        onClick={() => setDeleteId(pf.id)}
                        className="p-1.5 rounded border border-red-500/50 text-red-400 hover:bg-red-500/10"
                        title="Delete"
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {showCreateModal && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
          onClick={() => setShowCreateModal(false)}
          role="presentation"
        >
          <div
            className="rounded-lg p-6 w-full max-w-md shadow-2xl border border-border"
            style={{ backgroundColor: 'var(--color-surface)' }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-pf-title"
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Cable size={20} className="text-[var(--color-primary)]" />
                <h2 id="create-pf-title" className="text-lg font-semibold" style={{ color: 'var(--color-text)' }}>
                  New Port Forward
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="p-1.5 rounded hover:bg-hover transition-colors text-text-secondary"
              >
                <X size={20} />
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!form.resource_name.trim()) return;
                createMutation.mutate(form);
              }}
              className="space-y-4"
            >
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--color-text)' }}>
                  Namespace
                </label>
                <select
                  value={form.namespace}
                  onChange={(e) => setForm({ ...form, namespace: e.target.value, resource_name: '' })}
                  className="w-full px-3 py-2 rounded-lg border text-sm"
                  style={{
                    backgroundColor: 'var(--color-bg)',
                    borderColor: 'var(--color-border)',
                    color: 'var(--color-text)',
                  }}
                >
                  {namespaces.map((ns) => (
                    <option key={ns} value={ns}>
                      {ns}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--color-text)' }}>
                  Resource type
                </label>
                <select
                  value={form.resource_type}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      resource_type: e.target.value as 'pod' | 'service',
                      resource_name: '',
                    })
                  }
                  className="w-full px-3 py-2 rounded-lg border text-sm"
                  style={{
                    backgroundColor: 'var(--color-bg)',
                    borderColor: 'var(--color-border)',
                    color: 'var(--color-text)',
                  }}
                >
                  <option value="pod">Pod</option>
                  <option value="service">Service</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--color-text)' }}>
                  Resource name
                </label>
                <select
                  value={form.resource_name}
                  onChange={(e) => setForm({ ...form, resource_name: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border text-sm"
                  style={{
                    backgroundColor: 'var(--color-bg)',
                    borderColor: 'var(--color-border)',
                    color: 'var(--color-text)',
                  }}
                  required
                >
                  <option value="">Select {form.resource_type}</option>
                  {resourceOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <p className="block text-sm font-medium mb-2" style={{ color: 'var(--color-text)' }}>
                  {form.resource_type === 'service' ? 'Service list' : 'Pod list'}
                </p>
                <div
                  className="max-h-40 overflow-y-auto rounded-lg border"
                  style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)' }}
                >
                  {resourceListWithPorts.length === 0 ? (
                    <p className="px-3 py-2 text-xs text-text-secondary">
                      No {form.resource_type}s found in namespace {form.namespace}.
                    </p>
                  ) : (
                    <div className="divide-y divide-border">
                      {resourceListWithPorts.map((resource) => {
                        const isSelected = form.resource_name === resource.name;
                        return (
                          <button
                            key={resource.name}
                            type="button"
                            onClick={() => {
                              const nextRemotePort = resource.ports[0] ?? form.remote_port;
                              setForm((prev) => ({
                                ...prev,
                                resource_name: resource.name,
                                remote_port: nextRemotePort,
                                local_port: pickDefaultLocalPort(nextRemotePort),
                              }));
                            }}
                            className={`w-full text-left px-3 py-2 transition-colors ${
                              isSelected ? 'bg-[var(--color-primary)]/10' : 'hover:bg-hover'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-medium text-sm text-text">{resource.name}</span>
                              <span className="text-xs text-text-secondary">
                                {resource.ports.length > 0
                                  ? `ports: ${resource.ports.join(', ')}`
                                  : 'ports: n/a'}
                              </span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm mb-1" style={{ color: 'var(--color-muted)' }}>
                    Local port
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={65535}
                    value={form.local_port}
                    onChange={(e) => setForm({ ...form, local_port: parseInt(e.target.value, 10) || 8080 })}
                    className="w-full px-3 py-2 rounded-lg border text-sm"
                    style={{
                      backgroundColor: 'var(--color-bg)',
                      borderColor: 'var(--color-border)',
                      color: 'var(--color-text)',
                    }}
                  />
                </div>
                <div>
                  <label className="block text-sm mb-1" style={{ color: 'var(--color-muted)' }}>
                    Remote port
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={65535}
                    value={form.remote_port}
                    onChange={(e) => setForm({ ...form, remote_port: parseInt(e.target.value, 10) || 80 })}
                    className="w-full px-3 py-2 rounded-lg border text-sm"
                    style={{
                      backgroundColor: 'var(--color-bg)',
                      borderColor: 'var(--color-border)',
                      color: 'var(--color-text)',
                    }}
                  />
                </div>
              </div>

              {createError && (
                <div
                  className="p-3 rounded-lg text-sm"
                  style={{
                    backgroundColor: 'rgba(239, 68, 68, 0.1)',
                    border: '1px solid rgba(239, 68, 68, 0.3)',
                    color: '#ef4444',
                  }}
                >
                  {createError}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 rounded-lg border border-border text-text hover:bg-hover transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createMutation.isPending || !form.resource_name.trim()}
                  className="px-4 py-2 rounded-lg bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                >
                  {createMutation.isPending ? 'Starting...' : 'Start port forward'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {deleteId !== null && (
        <ConfirmDialog
          open={true}
          title="Delete port forward"
          description="Remove this port forward? The process will be stopped."
          confirmLabel="Delete"
          cancelLabel="Cancel"
          destructive
          onConfirm={() => deleteMutation.mutate(deleteId)}
          onCancel={() => setDeleteId(null)}
        />
      )}
    </div>
  );
};
