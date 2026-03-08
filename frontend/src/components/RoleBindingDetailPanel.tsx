import { Pencil, Trash2 } from './Icons';
import type { RoleBinding } from '../types';
import { timeAgo } from '../utils';
import { ResourceDetailPanelLayout, DetailSection, DetailRow, DetailLabelsSection, DetailAnnotationsSection, PanelActionButton } from './ResourceDetailPanelLayout';

interface RoleBindingDetailPanelProps {
  roleBinding: RoleBinding;
  onClose: () => void;
  onOpenYamlEditor?: (rb: RoleBinding) => void;
  onDelete?: (namespace: string, name: string) => Promise<void>;
}

export const RoleBindingDetailPanel = ({ roleBinding: rb, onClose, onOpenYamlEditor, onDelete }: RoleBindingDetailPanelProps) => (
  <ResourceDetailPanelLayout
    title={rb.name}
    keyInfo={[
      { label: 'Namespace', value: rb.namespace },
      { label: 'Role', value: rb.role ?? '-' },
      { label: 'Age', value: timeAgo(rb.age) },
    ]}
    actions={
      <>
        <PanelActionButton icon={Pencil} label="Edit YAML" onClick={() => onOpenYamlEditor?.(rb)} />
        <PanelActionButton icon={Trash2} label="Delete" danger onClick={() => onDelete?.(rb.namespace, rb.name)} />
      </>
    }
    onClose={onClose}
  >
    <DetailSection title="Role Binding">
      <DetailRow label="Name" value={rb.name} />
      <DetailRow label="Namespace" value={rb.namespace} />
      <DetailRow label="Role" value={rb.role ?? '-'} />
      <DetailRow label="Subjects" value={rb.subjects ?? '-'} />
      <DetailRow label="Age" value={timeAgo(rb.age)} />
    </DetailSection>
    <DetailLabelsSection labels={rb.labels} />
    <DetailAnnotationsSection annotations={rb.annotations} />
  </ResourceDetailPanelLayout>
);
