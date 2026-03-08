import { Pencil, Trash2 } from 'lucide-react';
import type { Vwc } from '../types';
import { timeAgo } from '../utils';
import {
  ResourceDetailPanelLayout,
  DetailSection,
  DetailRow,
  DetailLabelsSection,
  DetailAnnotationsSection,
  PanelActionButton,
} from './ResourceDetailPanelLayout';

interface VwcDetailPanelProps {
  vwc: Vwc;
  onClose: () => void;
  onOpenYamlEditor?: (vwc: Vwc) => void;
  onDelete?: (name: string) => Promise<void>;
}

export const VwcDetailPanel = ({ vwc, onClose, onOpenYamlEditor, onDelete }: VwcDetailPanelProps) => (
  <ResourceDetailPanelLayout
    title={vwc.name}
    titleFullText
    keyInfo={[
      { label: 'Webhooks', value: String(vwc.webhooks_count ?? 0) },
      { label: 'Age', value: timeAgo(vwc.age) },
    ]}
    actions={
      <>
        <PanelActionButton icon={Pencil} label="Edit YAML" onClick={() => onOpenYamlEditor?.(vwc)} />
        <PanelActionButton icon={Trash2} label="Delete" danger onClick={() => onDelete?.(vwc.name)} />
      </>
    }
    onClose={onClose}
  >
    <DetailSection title="Validating Webhook Configuration">
      <DetailRow label="Name" value={vwc.name} />
      <DetailRow label="Webhooks" value={String(vwc.webhooks_count ?? 0)} />
      <DetailRow label="Age" value={timeAgo(vwc.age)} />
    </DetailSection>
    <DetailLabelsSection labels={vwc.labels} />
    <DetailAnnotationsSection annotations={vwc.annotations} />
  </ResourceDetailPanelLayout>
);
