import { Box, Upload, Trash2 } from './Icons';
import type { HelmRelease } from '../types';
import { timeAgo } from '../utils';
import { ResourceDetailPanelLayout, PanelActionButton } from './ResourceDetailPanelLayout';
import { DrawerItem, DrawerTitle, DrawerLabelsAnnotations } from './drawer';

const getStatusClass = (status: string) => {
  const s = status.toLowerCase();
  if (s === 'deployed') return 'status-green';
  if (s === 'failed') return 'status-red';
  if (s.startsWith('pending') || s === 'uninstalling') return 'status-yellow';
  if (s === 'superseded' || s === 'uninstalled') return 'status-gray';
  return 'status-gray';
};

/** Helm release lifecycle descriptions (from helm list / release secret status). */
const getLifecycleDescription = (status: string): string => {
  const s = status.toLowerCase();
  switch (s) {
    case 'deployed':
      return 'Release is active and running.';
    case 'pending-install':
      return 'Install is in progress.';
    case 'pending-upgrade':
      return 'Upgrade is in progress.';
    case 'pending-rollback':
      return 'Rollback is in progress.';
    case 'uninstalling':
      return 'Uninstall is in progress (helm uninstall).';
    case 'uninstalled':
      return 'Release has been uninstalled.';
    case 'failed':
      return 'Release install, upgrade, or rollback failed.';
    case 'superseded':
      return 'Superseded by a newer revision.';
    default:
      return 'Release lifecycle state.';
  }
};

interface HelmReleaseDetailPanelProps {
  release: HelmRelease;
  onClose: () => void;
  onOpenYaml: (release: HelmRelease) => void;
  onDelete: (namespace: string, name: string) => void;
}

/** Helm release detail panel — layout and content order aligned with Freelens (Chart, Updated, Namespace, Version, Status, then Values/Notes/Resources). */
export const HelmReleaseDetailPanel = ({ release, onClose, onOpenYaml, onDelete }: HelmReleaseDetailPanelProps) => (
  <ResourceDetailPanelLayout
    kind="Release"
    kindIcon={Box}
    title={release.name}
    status={release.status}
    keyInfo={[
      { label: 'Namespace', value: release.namespace },
      { label: 'Chart', value: release.chart !== '-' ? release.chart : release.name },
      { label: 'Revision', value: String(release.revision ?? '-') },
    ]}
    actions={
      <>
        <PanelActionButton icon={Upload} label="Upgrade Release" onClick={() => onOpenYaml(release)} />
        <PanelActionButton icon={Trash2} label="Uninstall Release" danger onClick={() => onDelete(release.namespace, release.name)} />
      </>
    }
    onClose={onClose}
  >
    <DrawerTitle>Property</DrawerTitle>
    <DrawerTitle>Release lifecycle</DrawerTitle>
    <div className="space-y-1">
      <DrawerItem name="Status" className={getStatusClass(release.status)} labelsOnly>
        <span className={`inline-flex px-2.5 py-0.5 rounded-full font-medium ${getStatusClass(release.status)}`}>{release.status}</span>
      </DrawerItem>
      <p className="text-sm mt-1 px-0" style={{ color: 'var(--color-muted)' }}>
        {getLifecycleDescription(release.status)}
      </p>
    </div>
    <DrawerItem name="Chart">{release.chart !== '-' ? release.chart : release.name}</DrawerItem>
    <DrawerItem name="Updated">{release.updated ? `${timeAgo(release.updated)} (${release.updated})` : '—'}</DrawerItem>
    <DrawerItem name="Namespace">{release.namespace}</DrawerItem>
    <DrawerItem name="Version">{release.chart_version ?? '—'}</DrawerItem>
    <DrawerItem name="App Version">{release.app_version ?? '—'}</DrawerItem>
    <DrawerItem name="Revision">{release.revision ?? '—'}</DrawerItem>
    <DrawerLabelsAnnotations labels={release.labels} annotations={release.annotations} />
  </ResourceDetailPanelLayout>
);
