import { Pencil, Trash2 } from './Icons';
import type { Endpoint } from '../types';
import { timeAgo } from '../utils';
import { ResourceDetailPanelLayout, PanelActionButton } from './ResourceDetailPanelLayout';
import { DrawerItem, DrawerTitle, DrawerCollapsibleSection, DrawerLabelsAnnotations } from './drawer';

interface EndpointDetailPanelProps {
  endpoint: Endpoint;
  onClose: () => void;
  onOpenYamlEditor?: (endpoint: Endpoint) => void;
  onDelete?: (namespace: string, name: string) => Promise<void>;
}

export const EndpointDetailPanel = ({ endpoint, onClose, onOpenYamlEditor, onDelete }: EndpointDetailPanelProps) => (
  <ResourceDetailPanelLayout
    title={endpoint.name}
    keyInfo={[
      { label: 'Namespace', value: endpoint.namespace },
      { label: 'Addresses', value: `${endpoint.addresses ?? 0} ready` },
      { label: 'Age', value: timeAgo(endpoint.age) },
    ]}
    actions={
      <>
        <PanelActionButton icon={Pencil} label="Edit YAML" onClick={() => onOpenYamlEditor?.(endpoint)} />
        <PanelActionButton icon={Trash2} label="Delete" danger onClick={() => onDelete?.(endpoint.namespace, endpoint.name)} />
      </>
    }
    onClose={onClose}
  >
    <DrawerTitle>Property</DrawerTitle>
    <DrawerItem name="Name">{endpoint.name}</DrawerItem>
    <DrawerItem name="Namespace">{endpoint.namespace}</DrawerItem>
    <DrawerItem name="Ready Addresses">{endpoint.addresses ?? 0}</DrawerItem>
    <DrawerItem name="Not Ready Addresses">{endpoint.not_ready ?? 0}</DrawerItem>
    <DrawerItem name="Ports">{endpoint.ports ?? '-'}</DrawerItem>
    <DrawerItem name="Age">{timeAgo(endpoint.age)}</DrawerItem>
    <DrawerCollapsibleSection title="Metadata">
      <DrawerLabelsAnnotations labels={endpoint.labels} annotations={endpoint.annotations} />
    </DrawerCollapsibleSection>
  </ResourceDetailPanelLayout>
);
