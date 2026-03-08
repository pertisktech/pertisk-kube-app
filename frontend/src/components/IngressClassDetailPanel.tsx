import { Pencil, Trash2 } from 'lucide-react';
import type { IngressClass } from '../types';
import { timeAgo } from '../utils';
import { ResourceDetailPanelLayout, DetailSection, DetailRow, PanelActionButton } from './ResourceDetailPanelLayout';

interface IngressClassDetailPanelProps {
  ingressClass: IngressClass;
  onClose: () => void;
  onOpenYamlEditor?: (ingressClass: IngressClass) => void;
  onDelete?: (name: string) => Promise<void>;
}

export const IngressClassDetailPanel = ({ ingressClass, onClose, onOpenYamlEditor, onDelete }: IngressClassDetailPanelProps) => (
  <ResourceDetailPanelLayout
    title={ingressClass.name}
    keyInfo={[
      { label: 'Controller', value: ingressClass.controller ?? '-' },
      { label: 'Default', value: ingressClass.is_default ? 'Yes' : 'No' },
      { label: 'Age', value: timeAgo(ingressClass.age) },
    ]}
    actions={
      <>
        <PanelActionButton icon={Pencil} label="Edit YAML" onClick={() => onOpenYamlEditor?.(ingressClass)} />
        <PanelActionButton icon={Trash2} label="Delete" danger onClick={() => onDelete?.(ingressClass.name)} />
      </>
    }
    onClose={onClose}
  >
    <DetailSection title="Ingress Class">
      <DetailRow label="Name" value={ingressClass.name} />
      <DetailRow label="Controller" value={ingressClass.controller ?? '-'} />
      <DetailRow label="Default" value={ingressClass.is_default ? 'Yes' : 'No'} />
      <DetailRow label="Parameters" value={ingressClass.parameters ?? '-'} />
      <DetailRow label="Age" value={timeAgo(ingressClass.age)} />
    </DetailSection>
  </ResourceDetailPanelLayout>
);
