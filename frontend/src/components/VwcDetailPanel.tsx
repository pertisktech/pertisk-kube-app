import { Pencil, Trash2 } from './Icons';
import type { Vwc } from '../types';
import { timeAgo } from '../utils';
import { ResourceDetailPanelLayout, PanelActionButton } from './ResourceDetailPanelLayout';
import { DrawerItem, DrawerTitle, DrawerCollapsibleSection, DrawerLabelsAnnotations } from './drawer';

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
    <DrawerTitle>Property</DrawerTitle>
    <DrawerItem name="Name">{vwc.name}</DrawerItem>
    <DrawerItem name="Webhooks">{String(vwc.webhooks_count ?? 0)}</DrawerItem>
    <DrawerItem name="Age">{timeAgo(vwc.age)}</DrawerItem>
    <DrawerCollapsibleSection title="Metadata">
      <DrawerLabelsAnnotations labels={vwc.labels} annotations={vwc.annotations} />
    </DrawerCollapsibleSection>
  </ResourceDetailPanelLayout>
);
