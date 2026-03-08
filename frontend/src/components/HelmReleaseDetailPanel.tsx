import { Upload, Trash2 } from 'lucide-react';
import type { HelmRelease } from '../types';
import { timeAgo } from '../utils';
import { ResourceDetailPanelLayout, DetailSection, DetailRow, PanelActionButton } from './ResourceDetailPanelLayout';

const getStatusClass = (status: string) => {
  const s = status.toLowerCase();
  if (s === 'deployed') return 'status-green';
  if (s === 'failed') return 'status-red';
  if (s.startsWith('pending') || s === 'uninstalling') return 'status-yellow';
  return 'status-gray';
};

interface HelmReleaseDetailPanelProps {
  release: HelmRelease;
  onClose: () => void;
  onOpenYaml: (release: HelmRelease) => void;
  onDelete: (namespace: string, name: string) => void;
}

export const HelmReleaseDetailPanel = ({ release, onClose, onOpenYaml, onDelete }: HelmReleaseDetailPanelProps) => (
  <ResourceDetailPanelLayout
    title={release.name}
    status={release.status}
    keyInfo={[
      { label: 'Namespace', value: release.namespace },
      { label: 'Chart', value: release.chart !== '-' ? release.chart : release.name },
      { label: 'Revision', value: release.revision ?? '-' },
    ]}
    actions={
      <>
        <PanelActionButton icon={Upload} label="Upgrade Release" onClick={() => onOpenYaml(release)} />
        <PanelActionButton icon={Trash2} label="Uninstall Release" danger onClick={() => onDelete(release.namespace, release.name)} />
      </>
    }
    onClose={onClose}
  >
    <DetailSection title="Release">
      <DetailRow label="Name" value={release.name} />
      <DetailRow label="Namespace" value={release.namespace} />
      <DetailRow label="Status" value={<span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusClass(release.status)}`}>{release.status}</span>} />
    </DetailSection>
    <DetailSection title="Chart">
      <DetailRow label="Chart Name" value={release.chart !== '-' ? release.chart : release.name} />
      <DetailRow label="Chart Version" value={release.chart_version ?? '-'} mono />
      <DetailRow label="App Version" value={release.app_version ?? '-'} mono />
    </DetailSection>
    <DetailSection title="Deploy">
      <DetailRow label="Revision" value={release.revision ?? '-'} />
      <DetailRow label="Last Updated" value={release.updated ? timeAgo(release.updated) : '-'} />
    </DetailSection>
  </ResourceDetailPanelLayout>
);
