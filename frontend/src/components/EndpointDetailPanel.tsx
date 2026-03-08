import { Pencil, Trash2 } from 'lucide-react';
import type { Endpoint } from '../types';
import { timeAgo } from '../utils';
import { ResourceDetailPanelLayout, DetailSection, DetailRow, PanelActionButton } from './ResourceDetailPanelLayout';

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
    <DetailSection title="Endpoint">
      <DetailRow label="Name" value={endpoint.name} />
      <DetailRow label="Namespace" value={endpoint.namespace} />
      <DetailRow label="Ready Addresses" value={endpoint.addresses ?? 0} />
      <DetailRow label="Not Ready Addresses" value={endpoint.not_ready ?? 0} />
      <DetailRow label="Ports" value={endpoint.ports ?? '-'} mono />
      <DetailRow label="Age" value={timeAgo(endpoint.age)} />
    </DetailSection>
  </ResourceDetailPanelLayout>
);
