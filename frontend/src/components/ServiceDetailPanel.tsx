import { useState } from 'react';
import { Pencil, Trash2, Cable, X } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Service } from '../types';
import { timeAgo } from '../utils';
import { ResourceDetailPanelLayout, DetailSection, DetailRow, DetailLabelsSection, DetailAnnotationsSection } from './ResourceDetailPanelLayout';
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
      <div className="group relative">
        <button
          type="button"
          onClick={() => onOpenYamlEditor?.(service)}
          className="p-2 rounded-md border border-[var(--color-primary)] text-[var(--color-primary)] hover:bg-[var(--color-primary)]/10 transition-colors"
          aria-label="Edit service YAML"
        >
          <Pencil size={12} />
        </button>
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-surface-elevated text-text text-xs rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 border border-border">Edit YAML</div>
      </div>
      <div className="group relative">
        <button
          type="button"
          onClick={() => onDelete?.(service.namespace, service.name)}
          className="p-2 rounded-md border border-[var(--color-icon-danger)] text-[var(--color-icon-danger)] hover:bg-[var(--color-icon-danger)]/10 transition-colors"
          aria-label="Delete service"
        >
          <Trash2 size={12} />
        </button>
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-surface-elevated text-text text-xs rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 border border-border">Delete</div>
      </div>
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
      <DetailSection title="Service">
        <DetailRow label="Name" value={service.name} />
        <DetailRow label="Namespace" value={service.namespace} />
        <DetailRow label="Type" value={service.service_type ?? '-'} />
        <DetailRow label="Cluster IP" value={service.cluster_ip ?? '-'} mono />
        <DetailRow label="External IP" value={service.external_ip ?? '-'} mono />
        <DetailRow label="Ports" value={service.ports ?? '-'} mono />
        <DetailRow label="Age" value={timeAgo(service.age)} />
      </DetailSection>

      {servicePorts.length > 0 && (
        <DetailSection title="Port forward">
          <div className="divide-y" style={{ borderColor: 'var(--color-border)' }}>
            {servicePorts.map((port) => {
              const isForwarding = activeForwards.some((pf) => pf.remote_port === port);
              return (
                <div
                  key={port}
                  className="px-4 py-3 flex items-center justify-between"
                  style={{ borderColor: 'var(--color-border)' }}
                >
                  <span className="text-sm font-mono" style={{ color: 'var(--color-text)' }}>
                    Port {port}
                  </span>
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
        </DetailSection>
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
              <h3 className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>
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
                className="flex-1 px-2 py-1.5 rounded border text-sm font-mono"
                style={{
                  backgroundColor: 'var(--color-bg)',
                  borderColor: 'var(--color-border)',
                  color: 'var(--color-text)',
                }}
              />
              <span className="text-text-secondary">→</span>
              <span className="font-mono text-sm text-text">{portForwardModal.remotePort}</span>
            </div>
            {createPfMutation.isError && (
              <p className="text-xs text-red-400 mb-2">{(createPfMutation.error as Error).message}</p>
            )}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPortForwardModal(null)}
                className="px-3 py-1.5 rounded border border-border text-text-secondary text-sm hover:bg-hover"
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
                className="px-3 py-1.5 rounded bg-green-600 text-white text-sm hover:bg-green-700 disabled:opacity-50"
              >
                {createPfMutation.isPending ? 'Starting...' : 'Start'}
              </button>
            </div>
          </div>
        </div>
      )}

      <DetailLabelsSection labels={service.labels} />
      <DetailAnnotationsSection annotations={service.annotations} />
    </ResourceDetailPanelLayout>
  );
};
