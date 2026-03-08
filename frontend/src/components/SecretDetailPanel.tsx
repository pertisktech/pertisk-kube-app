import { useEffect, useState } from 'react';
import { Pencil, Trash2, Eye, EyeOff } from 'lucide-react';
import type { Secret } from '../types';
import { timeAgo } from '../utils';
import { getAuthToken } from '../utils/auth';
import { ResourceDetailPanelLayout, DetailSection, DetailRow, DetailLabelsSection, DetailAnnotationsSection } from './ResourceDetailPanelLayout';

interface SecretDetailPanelProps {
  secret: Secret;
  onClose: () => void;
  onOpenYamlEditor?: (secret: Secret) => void;
  onDelete?: (namespace: string, name: string) => Promise<void>;
}

const MASK = '••••••••';

export const SecretDetailPanel = ({ secret, onClose, onOpenYamlEditor, onDelete }: SecretDetailPanelProps) => {
  const [dataKeys, setDataKeys] = useState<Record<string, string> | null>(null);
  const [dataLoading, setDataLoading] = useState(true);
  const [dataError, setDataError] = useState<string | null>(null);
  const [revealValues, setRevealValues] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setDataLoading(true);
    setDataError(null);
    setRevealValues(false);
    const token = getAuthToken();
    fetch(
      `/api/secrets/${encodeURIComponent(secret.namespace)}/${encodeURIComponent(secret.name)}/data`,
      { headers: token ? { Authorization: token } : {} }
    )
      .then((res) => {
        if (!res.ok) throw new Error(res.statusText);
        return res.json();
      })
      .then((body: { data?: Record<string, string> }) => {
        if (!cancelled) setDataKeys(body.data ?? {});
      })
      .catch((err) => {
        if (!cancelled) setDataError(err instanceof Error ? err.message : 'Failed to load data');
      })
      .finally(() => {
        if (!cancelled) setDataLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [secret.namespace, secret.name]);

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
      <DetailSection title="Data">
        <div className="flex items-center justify-between gap-2 mb-2">
          <span className="text-xs font-medium" style={{ color: 'var(--color-muted)' }}>Decoded values</span>
          <button
            type="button"
            onClick={() => setRevealValues((v) => !v)}
            className="flex items-center gap-1.5 px-2 py-1 rounded text-xs border transition-colors"
            style={{
              borderColor: 'var(--color-border)',
              color: revealValues ? 'var(--color-primary)' : 'var(--color-muted)',
              backgroundColor: 'var(--color-bg)',
            }}
            aria-pressed={revealValues}
            aria-label={revealValues ? 'Hide secret values' : 'Show secret values'}
          >
            {revealValues ? <EyeOff size={12} /> : <Eye size={12} />}
            {revealValues ? 'Hide' : 'Show'}
          </button>
        </div>
        {dataLoading && <p className="text-xs" style={{ color: 'var(--color-muted)' }}>Loading…</p>}
        {dataError && <p className="text-xs" style={{ color: 'var(--color-icon-danger)' }}>{dataError}</p>}
        {!dataLoading && !dataError && dataKeys && Object.keys(dataKeys).length === 0 && (
          <p className="text-xs" style={{ color: 'var(--color-muted)' }}>No data</p>
        )}
        {!dataLoading && !dataError && dataKeys && Object.keys(dataKeys).length > 0 && (
          <div className="space-y-3">
            {Object.entries(dataKeys).map(([key, value]) => (
              <div key={key} className="rounded border p-2" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)' }}>
                <div className="text-xs font-mono font-medium mb-1" style={{ color: 'var(--color-primary)' }}>{key}</div>
                <pre className="text-xs font-mono whitespace-pre-wrap break-words m-0" style={{ color: 'var(--color-text)' }}>
                  {revealValues ? value : MASK}
                </pre>
              </div>
            ))}
          </div>
        )}
      </DetailSection>
      <DetailLabelsSection labels={secret.labels} />
      <DetailAnnotationsSection annotations={secret.annotations} />
    </ResourceDetailPanelLayout>
  );
};
