import { X } from 'lucide-react';
import { StatusBadge } from './StatusBadge';
import type { K8sNode } from '../types';

interface NodeDetailPanelProps {
  node: K8sNode;
  onClose: () => void;
}

export const NodeDetailPanel = ({ node, onClose }: NodeDetailPanelProps) => {
  const status = String(node.ready).toLowerCase() === 'true' ? 'Ready' : 'NotReady';
  const taints = node.taints?.length ? node.taints : [];

  return (
    <aside className="fixed top-0 right-0 z-[100] h-screen w-[420px] max-w-[94vw] bg-surface-elevated border-l border-border shadow-2xl">
      <div className="h-full flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-lg font-semibold text-text">Node Info</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-md hover:bg-hover text-text-secondary"
            aria-label="Close node panel"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-auto overflow-x-hidden p-5 space-y-5 text-sm">
          <section className="min-w-0 bg-surface border border-border rounded-lg p-4">
            <p className="text-xs uppercase tracking-wide text-text-secondary mb-3">Item</p>
            <div className="space-y-3">
              <div>
                <p className="text-text-secondary">Name</p>
                <p className="text-primary font-medium break-all">{node.name}</p>
              </div>
              <div>
                <p className="text-text-secondary">Status</p>
                <div className="mt-1">
                  <StatusBadge status={status} />
                </div>
              </div>
              <div>
                <p className="text-text-secondary">Roles</p>
                <p className="text-text break-words">{node.roles.join(', ') || '-'}</p>
              </div>
            </div>
          </section>

          <section className="min-w-0 bg-surface border border-border rounded-lg p-4">
            <p className="text-xs uppercase tracking-wide text-text-secondary mb-3">Detail</p>
            <div className="space-y-3">
              <div>
                <p className="text-text-secondary">IP</p>
                <p className="text-text break-all">{node.ip || '-'}</p>
              </div>
              <div>
                <p className="text-text-secondary">IPv4</p>
                <p className="text-text break-all">{node.ipv4 || '-'}</p>
              </div>
              <div>
                <p className="text-text-secondary">IPv6</p>
                <p className="text-text break-all">{node.ipv6 || '-'}</p>
              </div>
              <div>
                <p className="text-text-secondary">Internal IP</p>
                <p className="text-text break-all">{node.internal_ip || '-'}</p>
              </div>
              <div>
                <p className="text-text-secondary">External IP</p>
                <p className="text-text break-all">{node.external_ip || '-'}</p>
              </div>
              <div>
                <p className="text-text-secondary">Runtime</p>
                <p className="text-text break-all">{node.runtime || '-'}</p>
              </div>
              <div>
                <p className="text-text-secondary mb-1">Taints</p>
                {taints.length > 0 ? (
                  <div className="min-w-0 flex flex-wrap gap-1.5">
                    {taints.map((taint) => (
                      <span
                        key={taint}
                        className="inline-flex max-w-full px-2 py-1 rounded-md bg-hover text-text text-xs break-all"
                      >
                        {taint}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-text">-</p>
                )}
              </div>
              <div>
                <p className="text-text-secondary">Kubelet Version</p>
                <p className="text-text break-all">{node.kubelet_version || '-'}</p>
              </div>
              <div>
                <p className="text-text-secondary">OS Image</p>
                <p className="text-text break-words">{node.os_image || '-'}</p>
              </div>
            </div>
          </section>
        </div>
      </div>
    </aside>
  );
};
