import { Upload, Trash2 } from './Icons';
import type { HelmRelease } from '../types';
import { timeAgo } from '../utils';
import { ResourceDetailPanelLayout, PanelActionButton } from './ResourceDetailPanelLayout';
import { DrawerItem, DrawerLabelsAnnotations } from './drawer';

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
    <DrawerItem name="Name">{release.name}</DrawerItem>
    <DrawerItem name="Namespace">{release.namespace}</DrawerItem>
    <DrawerItem name="Status"><span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusClass(release.status)}`}>{release.status}</span></DrawerItem>
    <DrawerItem name="Chart Name">{release.chart !== '-' ? release.chart : release.name}</DrawerItem>
    <DrawerItem name="Chart Version">{release.chart_version ?? '-'}</DrawerItem>
    <DrawerItem name="App Version">{release.app_version ?? '-'}</DrawerItem>
    <DrawerItem name="Revision">{release.revision ?? '-'}</DrawerItem>
    <DrawerItem name="Last Updated">{release.updated ? timeAgo(release.updated) : '-'}</DrawerItem>
    <DrawerLabelsAnnotations labels={release.labels} annotations={release.annotations} />
  </ResourceDetailPanelLayout>
);
