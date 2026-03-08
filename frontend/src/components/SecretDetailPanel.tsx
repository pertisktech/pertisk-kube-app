import { Pencil, Trash2 } from 'lucide-react';
import type { Secret } from '../types';
import { timeAgo } from '../utils';
import { ResourceDetailPanelLayout, DetailSection, DetailRow } from './ResourceDetailPanelLayout';

interface SecretDetailPanelProps {
  secret: Secret;
  onClose: () => void;
  onOpenYamlEditor?: (secret: Secret) => void;
  onDelete?: (namespace: string, name: string) => Promise<void>;
}

export const SecretDetailPanel = ({ secret, onClose, onOpenYamlEditor, onDelete }: SecretDetailPanelProps) => {
  const actions = (
    <>
      <div className="group relative">
        <button
          type="button"
          onClick={() => onOpenYamlEditor?.(secret)}
          className="p-2 rounded-md border border-[var(--color-primary)] text-[var(--color-primary)] hover:bg-[var(--color-primary)]/10 transition-colors"
          aria-label="Edit secret YAML"
        >
          <Pencil size={12} />
        </button>
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-surface-elevated text-text text-xs rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 border border-border">Edit YAML</div>
      </div>
      <div className="group relative">
        <button
          type="button"
          onClick={() => onDelete?.(secret.namespace, secret.name)}
          className="p-2 rounded-md border border-[var(--color-icon-danger)] text-[var(--color-icon-danger)] hover:bg-[var(--color-icon-danger)]/10 transition-colors"
          aria-label="Delete secret"
        >
          <Trash2 size={12} />
        </button>
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-surface-elevated text-text text-xs rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 border border-border">Delete</div>
      </div>
    </>
  );

  return (
    <ResourceDetailPanelLayout
      title={secret.name}
      keyInfo={[
        { label: 'Namespace', value: secret.namespace },
        { label: 'Type', value: secret.secret_type ?? '-' },
        { label: 'Age', value: timeAgo(secret.age) },
      ]}
      actions={actions}
      onClose={onClose}
    >
      <DetailSection title="Secret">
        <DetailRow label="Name" value={secret.name} />
        <DetailRow label="Namespace" value={secret.namespace} />
        <DetailRow label="Type" value={secret.secret_type ?? '-'} />
        <DetailRow label="Data keys" value={secret.data_keys ?? '-'} />
        <DetailRow label="Age" value={timeAgo(secret.age)} />
      </DetailSection>
    </ResourceDetailPanelLayout>
  );
};
