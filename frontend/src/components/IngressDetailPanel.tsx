import { Pencil, Trash2, ExternalLink } from './Icons';
import type { Ingress } from '../types';
import { timeAgo } from '../utils';
import { ResourceDetailPanelLayout, PanelActionButton } from './ResourceDetailPanelLayout';
import { DrawerItem, DrawerTitle, DrawerLabelsAnnotations } from './drawer';

interface IngressDetailPanelProps {
  ingress: Ingress;
  onClose: () => void;
  onOpenYamlEditor?: (ingress: Ingress) => void;
  onDelete?: (namespace: string, name: string) => Promise<void>;
}

const normalizeIngressHosts = (hosts: string): string[] =>
  hosts
    .split(',')
    .map((h) => h.trim())
    .filter(Boolean);

const toExternalIngressUrl = (host: string): string | null => {
  const sanitized = host.replace(/^\*\./, '').trim();
  if (!sanitized) return null;
  if (/^https?:\/\//i.test(sanitized)) return sanitized;
  return `https://${sanitized}`;
};

export const IngressDetailPanel = ({ ingress, onClose, onOpenYamlEditor, onDelete }: IngressDetailPanelProps) => (
  <ResourceDetailPanelLayout
    title={ingress.name}
    keyInfo={[
      { label: 'Namespace', value: ingress.namespace },
      { label: 'Class', value: ingress.ingress_class ?? '-' },
      { label: 'Age', value: timeAgo(ingress.age) },
    ]}
    actions={
      <>
        <PanelActionButton icon={Pencil} label="Edit YAML" onClick={() => onOpenYamlEditor?.(ingress)} />
        {onDelete && <PanelActionButton icon={Trash2} label="Delete" danger onClick={() => onDelete(ingress.namespace, ingress.name)} />}
      </>
    }
    onClose={onClose}
  >
    <DrawerTitle>Property</DrawerTitle>
    <DrawerItem name="Name">{ingress.name}</DrawerItem>
    <DrawerItem name="Namespace">{ingress.namespace}</DrawerItem>
    <DrawerItem name="Class">{ingress.ingress_class ?? '-'}</DrawerItem>
    <DrawerItem name="Hosts">
      {ingress.hosts ? (
        <div className="flex flex-wrap items-center justify-end gap-2">
          {normalizeIngressHosts(ingress.hosts).map((host) => {
            const targetUrl = toExternalIngressUrl(host);
            return (
              <span key={host} className="inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-0.5 text-xs text-text-secondary">
                <span className="max-w-[180px] truncate" title={host}>{host}</span>
                {targetUrl && (
                  <a
                    href={targetUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[var(--color-icon-info)] hover:opacity-80"
                    title={`Open ${host} in new tab`}
                    aria-label={`Open ${host} in new tab`}
                  >
                    <ExternalLink size={12} />
                  </a>
                )}
              </span>
            );
          })}
        </div>
      ) : '-'}
    </DrawerItem>
    <DrawerItem name="Address">{ingress.address ?? '-'}</DrawerItem>
    <DrawerItem name="Rules">{ingress.rules ?? 0}</DrawerItem>
    <DrawerItem name="Age">{timeAgo(ingress.age)}</DrawerItem>
    <DrawerLabelsAnnotations labels={ingress.labels} annotations={ingress.annotations} />
  </ResourceDetailPanelLayout>
);
