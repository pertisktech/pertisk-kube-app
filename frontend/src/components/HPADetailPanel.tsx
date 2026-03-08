import { Pencil, Trash2 } from 'lucide-react';
import type { HPA } from '../types';
import { timeAgo } from '../utils';
import { ResourceDetailPanelLayout, DetailSection, DetailRow, DetailLabelsSection, DetailAnnotationsSection, PanelActionButton } from './ResourceDetailPanelLayout';

interface HPADetailPanelProps {
  hpa: HPA;
  onClose: () => void;
  onOpenYamlEditor?: (hpa: HPA) => void;
  onDelete?: (namespace: string, name: string) => Promise<void>;
}

export const HPADetailPanel = ({ hpa, onClose, onOpenYamlEditor, onDelete }: HPADetailPanelProps) => (
  <ResourceDetailPanelLayout
    title={hpa.name}
    keyInfo={[
      { label: 'Namespace', value: hpa.namespace },
      { label: 'Replicas', value: `${hpa.current_replicas} / ${hpa.desired_replicas}` },
      { label: 'Age', value: timeAgo(hpa.age) },
    ]}
    actions={
      <>
        <PanelActionButton icon={Pencil} label="Edit YAML" onClick={() => onOpenYamlEditor?.(hpa)} />
        <PanelActionButton icon={Trash2} label="Delete" danger onClick={() => onDelete?.(hpa.namespace, hpa.name)} />
      </>
    }
    onClose={onClose}
  >
    <DetailSection title="HPA">
      <DetailRow label="Name" value={hpa.name} />
      <DetailRow label="Namespace" value={hpa.namespace} />
      <DetailRow label="Reference" value={hpa.reference ?? '-'} />
      <DetailRow label="Replicas" value={`Current: ${hpa.current_replicas} / Desired: ${hpa.desired_replicas}`} />
      <DetailRow label="Min/Max Replicas" value={`${hpa.min_replicas} / ${hpa.max_replicas}`} />
      <DetailRow label="Targets" value={hpa.targets ?? '-'} />
      <DetailRow label="Age" value={timeAgo(hpa.age)} />
    </DetailSection>
    <DetailLabelsSection labels={hpa.labels} />
    <DetailAnnotationsSection annotations={hpa.annotations} />
  </ResourceDetailPanelLayout>
);
