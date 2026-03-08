import { Pencil, Trash2 } from 'lucide-react';
import type { ConfigMap } from '../types';
import { timeAgo } from '../utils';
import { ResourceDetailPanelLayout, DetailSection, DetailRow, DetailLabelsSection, DetailAnnotationsSection } from './ResourceDetailPanelLayout';

interface ConfigMapDetailPanelProps {
  configMap: ConfigMap;
  onClose: () => void;
  onOpenYamlEditor?: (configMap: ConfigMap) => void;
  onDelete?: (namespace: string, name: string) => Promise<void>;
}

export const ConfigMapDetailPanel = ({ configMap, onClose, onOpenYamlEditor, onDelete }: ConfigMapDetailPanelProps) => {
  const actions = (
    <>
      <div className="group relative">
        <button
          type="button"
          onClick={() => onOpenYamlEditor?.(configMap)}
          className="p-2 rounded-md border border-[var(--color-primary)] text-[var(--color-primary)] hover:bg-[var(--color-primary)]/10 transition-colors"
          aria-label="Edit configmap YAML"
        >
          <Pencil size={12} />
        </button>
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-surface-elevated text-text text-xs rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 border border-border">Edit YAML</div>
      </div>
      <div className="group relative">
        <button
          type="button"
          onClick={() => onDelete?.(configMap.namespace, configMap.name)}
          className="p-2 rounded-md border border-[var(--color-icon-danger)] text-[var(--color-icon-danger)] hover:bg-[var(--color-icon-danger)]/10 transition-colors"
          aria-label="Delete configmap"
        >
          <Trash2 size={12} />
        </button>
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-surface-elevated text-text text-xs rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 border border-border">Delete</div>
      </div>
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
      <DetailLabelsSection labels={configMap.labels} />
      <DetailAnnotationsSection annotations={configMap.annotations} />
    </ResourceDetailPanelLayout>
  );
};
