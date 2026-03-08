import { useEffect, useState } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import type { ConfigMap } from '../types';
import { timeAgo } from '../utils';
import { getAuthToken } from '../utils/auth';
import { ResourceDetailPanelLayout, DetailSection, DetailRow, DetailLabelsSection, DetailAnnotationsSection, PanelActionButton } from './ResourceDetailPanelLayout';

interface ConfigMapDetailPanelProps {
  configMap: ConfigMap;
  onClose: () => void;
  onOpenYamlEditor?: (configMap: ConfigMap) => void;
  onDelete?: (namespace: string, name: string) => Promise<void>;
}

export const ConfigMapDetailPanel = ({ configMap, onClose, onOpenYamlEditor, onDelete }: ConfigMapDetailPanelProps) => {
  const [dataKeys, setDataKeys] = useState<Record<string, string> | null>(null);
  const [dataLoading, setDataLoading] = useState(true);
  const [dataError, setDataError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setDataLoading(true);
    setDataError(null);
    const token = getAuthToken();
    fetch(
      `/api/configmaps/${encodeURIComponent(configMap.namespace)}/${encodeURIComponent(configMap.name)}/data`,
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
  }, [configMap.namespace, configMap.name]);

  const actions = (
    <>
      <PanelActionButton icon={Pencil} label="Edit YAML" onClick={() => onOpenYamlEditor?.(configMap)} />
      <PanelActionButton icon={Trash2} label="Delete" danger onClick={() => onDelete?.(configMap.namespace, configMap.name)} />
    </>
  );

  return (
    <ResourceDetailPanelLayout
      title={configMap.name}
      keyInfo={[
        { label: 'Namespace', value: configMap.namespace },
        { label: 'Data keys', value: configMap.data_keys ?? '-' },
        { label: 'Age', value: timeAgo(configMap.age) },
      ]}
      actions={actions}
      onClose={onClose}
    >
      <DetailSection title="ConfigMap">
        <DetailRow label="Name" value={configMap.name} />
        <DetailRow label="Namespace" value={configMap.namespace} />
        <DetailRow label="Data keys" value={configMap.data_keys ?? '-'} />
        <DetailRow label="Age" value={timeAgo(configMap.age)} />
      </DetailSection>
      <DetailSection title="Data">
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
                <pre className="text-xs font-mono whitespace-pre-wrap break-words m-0" style={{ color: 'var(--color-text)' }}>{value}</pre>
              </div>
            ))}
          </div>
        )}
      </DetailSection>
      <DetailLabelsSection labels={configMap.labels} />
      <DetailAnnotationsSection annotations={configMap.annotations} />
    </ResourceDetailPanelLayout>
  );
};
