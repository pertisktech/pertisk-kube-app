import { Pencil, Trash2 } from 'lucide-react';
import type { Mwc } from '../types';
import { timeAgo } from '../utils';
import {
  ResourceDetailPanelLayout,
  DetailSection,
  DetailRow,
  DetailLabelsSection,
  DetailAnnotationsSection,
  PanelActionButton,
} from './ResourceDetailPanelLayout';

interface MwcDetailPanelProps {
  mwc: Mwc;
  onClose: () => void;
  onOpenYamlEditor?: (mwc: Mwc) => void;
  onDelete?: (name: string) => Promise<void>;
}

export const MwcDetailPanel = ({ mwc, onClose, onOpenYamlEditor, onDelete }: MwcDetailPanelProps) => (
  <ResourceDetailPanelLayout
    title={mwc.name}
    titleFullText
    keyInfo={[
      { label: 'Webhooks', value: String(mwc.webhooks_count ?? 0) },
      { label: 'Age', value: timeAgo(mwc.age) },
    ]}
    actions={
      <>
        <PanelActionButton icon={Pencil} label="Edit YAML" onClick={() => onOpenYamlEditor?.(mwc)} />
        <PanelActionButton icon={Trash2} label="Delete" danger onClick={() => onDelete?.(mwc.name)} />
      </>
    }
    onClose={onClose}
  >
    <DetailSection title="Mutating Webhook Configuration">
      <DetailRow label="Name" value={mwc.name} />
      <DetailRow label="Webhooks" value={String(mwc.webhooks_count ?? 0)} />
      <DetailRow label="Age" value={timeAgo(mwc.age)} />
    </DetailSection>
    <DetailLabelsSection labels={mwc.labels} />
    <DetailAnnotationsSection annotations={mwc.annotations} />
  </ResourceDetailPanelLayout>
);
