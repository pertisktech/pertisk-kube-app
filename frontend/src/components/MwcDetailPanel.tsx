import { Pencil, Trash2 } from './Icons';
import type { Mwc } from '../types';
import { timeAgo } from '../utils';
import { ResourceDetailPanelLayout, PanelActionButton } from './ResourceDetailPanelLayout';
import { DrawerItem, DrawerTitle, DrawerLabelsAnnotations } from './drawer';

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
    <DrawerTitle>Property</DrawerTitle>
    <DrawerItem name="Name">{mwc.name}</DrawerItem>
    <DrawerItem name="Webhooks">{String(mwc.webhooks_count ?? 0)}</DrawerItem>
    <DrawerItem name="Age">{timeAgo(mwc.age)}</DrawerItem>
    <DrawerLabelsAnnotations labels={mwc.labels} annotations={mwc.annotations} />
  </ResourceDetailPanelLayout>
);
