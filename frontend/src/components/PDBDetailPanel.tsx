import { Pencil, Trash2 } from './Icons';
import type { PDB } from '../types';
import { timeAgo } from '../utils';
import { ResourceDetailPanelLayout, PanelActionButton } from './ResourceDetailPanelLayout';
import { DrawerItem, DrawerTitle, DrawerCollapsibleSection, DrawerLabelsAnnotations } from './drawer';

interface PDBDetailPanelProps {
  pdb: PDB;
  onClose: () => void;
  onOpenYamlEditor?: (pdb: PDB) => void;
  onDelete?: (namespace: string, name: string) => Promise<void>;
}

export const PDBDetailPanel = ({ pdb, onClose, onOpenYamlEditor, onDelete }: PDBDetailPanelProps) => (
  <ResourceDetailPanelLayout
    title={pdb.name}
    keyInfo={[
      { label: 'Namespace', value: pdb.namespace },
      { label: 'Min Available', value: pdb.min_available ?? '-' },
      { label: 'Age', value: timeAgo(pdb.age) },
    ]}
    actions={
      <>
        <PanelActionButton icon={Pencil} label="Edit YAML" onClick={() => onOpenYamlEditor?.(pdb)} />
        <PanelActionButton icon={Trash2} label="Delete" danger onClick={() => onDelete?.(pdb.namespace, pdb.name)} />
      </>
    }
    onClose={onClose}
  >
    <DrawerTitle>Property</DrawerTitle>
    <DrawerItem name="Name">{pdb.name}</DrawerItem>
    <DrawerItem name="Namespace">{pdb.namespace}</DrawerItem>
    <DrawerItem name="Min Available">{pdb.min_available ?? '-'}</DrawerItem>
    <DrawerItem name="Allowed Disruptions">{pdb.allowed_disruptions ?? '-'}</DrawerItem>
    <DrawerItem name="Status">{pdb.status ?? '-'}</DrawerItem>
    <DrawerItem name="Age">{timeAgo(pdb.age)}</DrawerItem>
    <DrawerCollapsibleSection title="Metadata">
      <DrawerLabelsAnnotations labels={pdb.labels} annotations={pdb.annotations} />
    </DrawerCollapsibleSection>
  </ResourceDetailPanelLayout>
);
