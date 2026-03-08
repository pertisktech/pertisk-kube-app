import { useState } from 'react';
import { Pencil, Trash2, Cable, X } from './Icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Service } from '../types';
import { timeAgo } from '../utils';
import { ResourceDetailPanelLayout, PanelActionButton } from './ResourceDetailPanelLayout';
import { DrawerItem, DrawerTitle, DrawerLabelsAnnotations } from './drawer';
import { createPortForward, usePortForwards } from '../hooks/useKubernetes';

// Parse "80/TCP, 443/TCP" -> [80, 443]
function parsePortsString(portsStr: string | undefined): number[] {
  if (!portsStr || typeof portsStr !== 'string') return [];
  return portsStr
    .split(',')
    .map((p) => parseInt(p.trim().split('/')[0], 10))
    .filter((n) => !Number.isNaN(n) && n > 0);
}

interface ServiceDetailPanelProps {
  service: Service;
  onClose: () => void;
  onOpenYamlEditor?: (service: Service) => void;
  onDelete?: (namespace: string, name: string) => Promise<void>;
}

export const ServiceDetailPanel = ({ service, onClose, onOpenYamlEditor, onDelete }: ServiceDetailPanelProps) => {
  const queryClient = useQueryClient();
  const { data: portForwards = [] } = usePortForwards();
  const [portForwardModal, setPortForwardModal] = useState<{ remotePort: number; localPort: number } | null>(null);

  const createPfMutation = useMutation({
    mutationFn: createPortForward,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['port-forwards'] });
      setPortForwardModal(null);
    },
  });

  const servicePorts = parsePortsString(service.ports);
  const activeForwards = portForwards.filter(
    (pf) =>
      pf.resource_type === 'service' &&
      pf.resource_name === service.name &&
      pf.namespace === service.namespace &&
      pf.status === 'running'
  );

  const actions = (
    <>
      <PanelActionButton icon={Pencil} label="Edit YAML" onClick={() => onOpenYamlEditor?.(service)} />
      {onDelete && <PanelActionButton icon={Trash2} label="Delete" danger onClick={() => onDelete(service.namespace, service.name)} />}
    </>
  );

  return (
    <ResourceDetailPanelLayout
      title={service.name}
      keyInfo={[
        { label: 'Namespace', value: service.namespace },
        { label: 'Type', value: service.service_type ?? '-' },
        { label: 'Age', value: timeAgo(service.age) },
      ]}
      actions={actions}
      onClose={onClose}
    >
      <DrawerTitle>Property</DrawerTitle>
      <DrawerItem name="Name">{service.name}</DrawerItem>
      <DrawerItem name="Namespace">{service.namespace}</DrawerItem>
      <DrawerItem name="Type">{service.service_type ?? '-'}</DrawerItem>
      <DrawerItem name="Cluster IP">{service.cluster_ip ?? '-'}</DrawerItem>
      <DrawerItem name="External IP">{service.external_ip ?? '-'}</DrawerItem>
      <DrawerItem name="Ports">{service.ports ?? '-'}</DrawerItem>
      <DrawerItem name="Age">{timeAgo(service.age)}</DrawerItem>

      <DrawerLabelsAnnotations labels={service.labels} annotations={service.annotations} />

      {servicePorts.length > 0 && (
        <>
          <DrawerTitle>Port forward</DrawerTitle>
          <div className="space-y-0">
            {servicePorts.map((port) => {
              const isForwarding = activeForwards.some((pf) => pf.remote_port === port);
              return (
                <div
                  key={port}
                  className="py-2 flex items-center justify-between border-b border-border last:border-b-0"
                  style={{ color: 'var(--color-text)' }}
                >
                  <span className="text-xs font-mono">Port {port}</span>
                  <button
                    type="button"
                    onClick={() => setPortForwardModal({ remotePort: port, localPort: port === 80 ? 8080 : port })}
                    disabled={createPfMutation.isPending || isForwarding}
                    className="flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium border border-[var(--color-primary)] text-[var(--color-primary)] hover:bg-[var(--color-primary)]/10 disabled:opacity-50"
                    title="Port forward to this port"
                  >
                    <Cable size={12} />
                    {isForwarding ? 'Forwarding' : 'Port forward'}
                  </button>
                </div>
              );
            })}
          </div>
        </>
      )}

      {portForwardModal && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60]"
          onClick={() => setPortForwardModal(null)}
          role="presentation"
        >
          <div
            className="rounded-lg p-4 w-full max-w-sm shadow-xl border border-border"
            style={{ backgroundColor: 'var(--color-surface)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-semibold" style={{ color: 'var(--color-text)' }}>
                Port forward svc/{service.name}
              </h3>
              <button type="button" onClick={() => setPortForwardModal(null)} className="p-1 rounded hover:bg-hover text-text-secondary">
                <X size={16} />
              </button>
            </div>
            <p className="text-xs mb-3" style={{ color: 'var(--color-muted)' }}>
              Local port → remote port {portForwardModal.remotePort}
            </p>
            <div className="flex items-center gap-2 mb-3">
              <input
                type="number"
                min={1}
                max={65535}
                value={portForwardModal.localPort}
                onChange={(e) =>
                  setPortForwardModal((prev) =>
                    prev ? { ...prev, localPort: parseInt(e.target.value, 10) || 8080 } : null
                  )
                }
                className="flex-1 px-2 py-1.5 rounded border text-xs font-mono"
                style={{
                  backgroundColor: 'var(--color-bg)',
                  borderColor: 'var(--color-border)',
                  color: 'var(--color-text)',
                }}
              />
              <span className="text-text-secondary">→</span>
              <span className="font-mono text-xs text-text">{portForwardModal.remotePort}</span>
            </div>
            {createPfMutation.isError && (
              <p className="text-xs text-red-400 mb-2">{(createPfMutation.error as Error).message}</p>
            )}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPortForwardModal(null)}
                className="px-3 py-1.5 rounded border border-border text-text-secondary text-xs hover:bg-hover"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  createPfMutation.mutate({
                    namespace: service.namespace,
                    resource_type: 'service',
                    resource_name: service.name,
                    local_port: portForwardModal.localPort,
                    remote_port: portForwardModal.remotePort,
                  });
                }}
                disabled={createPfMutation.isPending}
                className="px-3 py-1.5 rounded bg-green-600 text-white text-xs hover:bg-green-700 disabled:opacity-50"
              >
                {createPfMutation.isPending ? 'Starting...' : 'Start'}
              </button>
            </div>
          </div>
        </div>
      )}
    </ResourceDetailPanelLayout>
  );
};
