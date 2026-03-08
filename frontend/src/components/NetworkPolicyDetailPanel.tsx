import { Pencil, Trash2 } from './Icons';
import type { NetworkPolicy } from '../types';
import { timeAgo } from '../utils';
import { ResourceDetailPanelLayout, PanelActionButton } from './ResourceDetailPanelLayout';
import { DrawerItem, DrawerLabelsAnnotations } from './drawer';

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
    <DrawerItem name="Name">{networkPolicy.name}</DrawerItem>
    <DrawerItem name="Namespace">{networkPolicy.namespace}</DrawerItem>
    <DrawerItem name="Pod Selector">{networkPolicy.pod_selector ?? '-'}</DrawerItem>
    <DrawerItem name="Policy Types">{networkPolicy.policy_types ?? '-'}</DrawerItem>
    <DrawerItem name="Ingress Rules">{networkPolicy.ingress_rules ?? 0}</DrawerItem>
    <DrawerItem name="Egress Rules">{networkPolicy.egress_rules ?? 0}</DrawerItem>
    <DrawerItem name="Age">{timeAgo(networkPolicy.age)}</DrawerItem>
    <DrawerLabelsAnnotations labels={networkPolicy.labels} annotations={networkPolicy.annotations} />
  </ResourceDetailPanelLayout>
);
