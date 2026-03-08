import { Pencil, Trash2 } from 'lucide-react';
import type { LimitRange } from '../types';
import { timeAgo } from '../utils';
import { ResourceDetailPanelLayout, DetailSection, DetailRow, DetailLabelsSection, DetailAnnotationsSection, PanelActionButton } from './ResourceDetailPanelLayout';

interface LimitRangeDetailPanelProps {
  limitRange: LimitRange;
  onClose: () => void;
  onOpenYamlEditor?: (limitRange: LimitRange) => void;
  onDelete?: (namespace: string, name: string) => Promise<void>;
}

export const LimitRangeDetailPanel = ({ limitRange, onClose, onOpenYamlEditor, onDelete }: LimitRangeDetailPanelProps) => (
  <ResourceDetailPanelLayout
    title={limitRange.name}
    keyInfo={[
      { label: 'Namespace', value: limitRange.namespace },
      { label: 'Limits', value: limitRange.limits ?? '-' },
      { label: 'Age', value: timeAgo(limitRange.age) },
    ]}
    actions={
      <>
        <PanelActionButton icon={Pencil} label="Edit YAML" onClick={() => onOpenYamlEditor?.(limitRange)} />
        <PanelActionButton icon={Trash2} label="Delete" danger onClick={() => onDelete?.(limitRange.namespace, limitRange.name)} />
      </>
    }
    onClose={onClose}
  >
    <DetailSection title="LimitRange">
      <DetailRow label="Name" value={limitRange.name} />
      <DetailRow label="Namespace" value={limitRange.namespace} />
      <DetailRow label="Limits" value={limitRange.limits ?? '-'} />
      <DetailRow label="Age" value={timeAgo(limitRange.age)} />
    </DetailSection>
    <DetailLabelsSection labels={limitRange.labels} />
    <DetailAnnotationsSection annotations={limitRange.annotations} />
  </ResourceDetailPanelLayout>
);
