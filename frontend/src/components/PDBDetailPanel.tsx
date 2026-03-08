import { Pencil, Trash2 } from './Icons';
import type { PDB } from '../types';
import { timeAgo } from '../utils';
import { ResourceDetailPanelLayout, DetailSection, DetailRow, DetailLabelsSection, DetailAnnotationsSection, PanelActionButton } from './ResourceDetailPanelLayout';

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
    <DetailSection title="Pod Disruption Budget">
      <DetailRow label="Name" value={pdb.name} />
      <DetailRow label="Namespace" value={pdb.namespace} />
      <DetailRow label="Min Available" value={pdb.min_available ?? '-'} />
      <DetailRow label="Allowed Disruptions" value={pdb.allowed_disruptions ?? '-'} />
      <DetailRow label="Status" value={pdb.status ?? '-'} />
      <DetailRow label="Age" value={timeAgo(pdb.age)} />
    </DetailSection>
    <DetailLabelsSection labels={pdb.labels} />
    <DetailAnnotationsSection annotations={pdb.annotations} />
  </ResourceDetailPanelLayout>
);
