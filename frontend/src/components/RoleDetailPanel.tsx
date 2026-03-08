import { Pencil, Trash2 } from 'lucide-react';
import type { Role } from '../types';
import { timeAgo } from '../utils';
import { ResourceDetailPanelLayout, DetailSection, DetailRow, PanelActionButton } from './ResourceDetailPanelLayout';

interface RoleDetailPanelProps {
  role: Role;
  onClose: () => void;
  onOpenYamlEditor?: (role: Role) => void;
  onDelete?: (namespace: string, name: string) => Promise<void>;
}

export const RoleDetailPanel = ({ role, onClose, onOpenYamlEditor, onDelete }: RoleDetailPanelProps) => (
  <ResourceDetailPanelLayout
    title={role.name}
    keyInfo={[
      { label: 'Namespace', value: role.namespace },
      { label: 'Rules', value: role.rules ?? '-' },
      { label: 'Age', value: timeAgo(role.age) },
    ]}
    actions={
      <>
        <PanelActionButton icon={Pencil} label="Edit YAML" onClick={() => onOpenYamlEditor?.(role)} />
        <PanelActionButton icon={Trash2} label="Delete" danger onClick={() => onDelete?.(role.namespace, role.name)} />
      </>
    }
    onClose={onClose}
  >
    <DetailSection title="Role">
      <DetailRow label="Name" value={role.name} />
      <DetailRow label="Namespace" value={role.namespace} />
      <DetailRow label="Rules" value={role.rules ?? '-'} />
      <DetailRow label="Age" value={timeAgo(role.age)} />
    </DetailSection>
  </ResourceDetailPanelLayout>
);
