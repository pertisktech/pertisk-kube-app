import { useEffect, useState } from 'react';
import { Pencil, Trash2, Eye, EyeOff } from './Icons';
import type { Secret } from '../types';
import { timeAgo } from '../utils';
import { getAuthToken } from '../utils/auth';
import { ResourceDetailPanelLayout, PanelActionButton } from './ResourceDetailPanelLayout';
import { DrawerItem, DrawerTitle, DrawerLabelsAnnotations } from './drawer';

interface SecretDetailPanelProps {
  secret: Secret;
  onClose: () => void;
  onOpenYamlEditor?: (secret: Secret) => void;
  onDelete?: (namespace: string, name: string) => Promise<void>;
}

const MASK = '••••••••';

interface SecretDataResponse {
  data?: Record<string, string>;
  cert_info?: { issued: string; expires: string };
}

export const SecretDetailPanel = ({ secret, onClose, onOpenYamlEditor, onDelete }: SecretDetailPanelProps) => {
  const [dataKeys, setDataKeys] = useState<Record<string, string> | null>(null);
  const [certInfo, setCertInfo] = useState<{ issued: string; expires: string } | null>(null);
  const [dataLoading, setDataLoading] = useState(true);
  const [dataError, setDataError] = useState<string | null>(null);
  const [revealValues, setRevealValues] = useState(false);

  const isTls = secret.secret_type === 'kubernetes.io/tls';

  useEffect(() => {
    let cancelled = false;
    setDataLoading(true);
    setDataError(null);
    setRevealValues(false);
    setCertInfo(null);
    const token = getAuthToken();
    fetch(
      `/api/secrets/${encodeURIComponent(secret.namespace)}/${encodeURIComponent(secret.name)}/data`,
      { headers: token ? { Authorization: token } : {} }
    )
      .then((res) => {
        if (!res.ok) throw new Error(res.statusText);
        return res.json();
      })
      .then((body: SecretDataResponse) => {
        if (!cancelled) {
          setDataKeys(body.data ?? {});
          if (body.cert_info) setCertInfo(body.cert_info);
        }
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
      <PanelActionButton icon={Pencil} label="Edit YAML" onClick={() => onOpenYamlEditor?.(secret)} />
      <PanelActionButton icon={Trash2} label="Delete" danger onClick={() => onDelete?.(secret.namespace, secret.name)} />
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
      <DrawerItem name="Name">{secret.name}</DrawerItem>
      <DrawerItem name="Namespace">{secret.namespace}</DrawerItem>
      <DrawerItem name="Type">{secret.secret_type ?? '-'}</DrawerItem>
      <DrawerItem name="Data keys">{secret.data_keys ?? '-'}</DrawerItem>
      <DrawerItem name="Age">{timeAgo(secret.age)}</DrawerItem>

      <DrawerLabelsAnnotations labels={secret.labels} annotations={secret.annotations} />

      {isTls && certInfo && (
        <>
          <DrawerTitle className="-mx-5">TLS Certificate</DrawerTitle>
          <DrawerItem name="Issued">{certInfo.issued}</DrawerItem>
          <DrawerItem name="Expires">{certInfo.expires}</DrawerItem>
        </>
      )}

      <DrawerTitle className="-mx-5">Data</DrawerTitle>
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
      {dataLoading && <p className="text-xs py-2" style={{ color: 'var(--color-muted)' }}>Loading…</p>}
      {dataError && <p className="text-xs py-2" style={{ color: 'var(--color-icon-danger)' }}>{dataError}</p>}
      {!dataLoading && !dataError && dataKeys && Object.keys(dataKeys).length === 0 && (
        <p className="text-xs py-2" style={{ color: 'var(--color-muted)' }}>No data</p>
      )}
      {!dataLoading && !dataError && dataKeys && Object.keys(dataKeys).length > 0 && (
        <div className="space-y-3 mt-2">
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
    </ResourceDetailPanelLayout>
  );
};
