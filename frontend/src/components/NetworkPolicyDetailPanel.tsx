import { Pencil, Trash2 } from 'lucide-react';
import type { NetworkPolicy } from '../types';
import { timeAgo } from '../utils';
import { ResourceDetailPanelLayout, DetailSection, DetailRow, PanelActionButton } from './ResourceDetailPanelLayout';

interface NetworkPolicyDetailPanelProps {
  networkPolicy: NetworkPolicy;
  onClose: () => void;
  onOpenYamlEditor?: (networkPolicy: NetworkPolicy) => void;
  onDelete?: (namespace: string, name: string) => Promise<void>;
}

export const NetworkPolicyDetailPanel = ({ networkPolicy, onClose, onOpenYamlEditor, onDelete }: NetworkPolicyDetailPanelProps) => (
  <ResourceDetailPanelLayout
    title={networkPolicy.name}
    keyInfo={[
      { label: 'Namespace', value: networkPolicy.namespace },
      { label: 'Policy Types', value: networkPolicy.policy_types ?? '-' },
      { label: 'Age', value: timeAgo(networkPolicy.age) },
    ]}
    actions={
      <>
        <PanelActionButton icon={Pencil} label="Edit YAML" onClick={() => onOpenYamlEditor?.(networkPolicy)} />
        <PanelActionButton icon={Trash2} label="Delete" danger onClick={() => onDelete?.(networkPolicy.namespace, networkPolicy.name)} />
      </>
    }
    onClose={onClose}
  >
    <DetailSection title="Network Policy">
      <DetailRow label="Name" value={networkPolicy.name} />
      <DetailRow label="Namespace" value={networkPolicy.namespace} />
      <DetailRow label="Pod Selector" value={networkPolicy.pod_selector ?? '-'} />
      <DetailRow label="Policy Types" value={networkPolicy.policy_types ?? '-'} />
      <DetailRow label="Ingress Rules" value={networkPolicy.ingress_rules ?? 0} />
      <DetailRow label="Egress Rules" value={networkPolicy.egress_rules ?? 0} />
      <DetailRow label="Age" value={timeAgo(networkPolicy.age)} />
    </DetailSection>
  </ResourceDetailPanelLayout>
);
