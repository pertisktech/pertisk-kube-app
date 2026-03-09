import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
import { Box, Loader, RotateCw, Upload, Trash2 } from './Icons';
import type { HelmRelease } from '../types';
import { useHelmReleaseHistory, rollbackHelmRelease } from '../hooks/useKubernetes';
import { timeAgo } from '../utils';
import { ResourceDetailPanelLayout, PanelActionButton } from './ResourceDetailPanelLayout';
import { ConfirmDialog } from './ConfirmDialog';
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

/** Helm release detail panel — layout and content order aligned with Freelens; includes Revisions (history) and Rollback like helm-dashboard. */
export const HelmReleaseDetailPanel = ({ release, onClose, onOpenYaml, onDelete }: HelmReleaseDetailPanelProps) => {
  const queryClient = useQueryClient();
  const { data: history = [], isLoading: historyLoading } = useHelmReleaseHistory(release.namespace, release.name);
  const [rollingBackRev, setRollingBackRev] = useState<number | null>(null);
  const [rollbackConfirmRev, setRollbackConfirmRev] = useState<number | null>(null);

  const handleRollback = async (revision: number) => {
    if (revision === release.revision) return;
    setRollingBackRev(revision);
    try {
      await rollbackHelmRelease(release.namespace, release.name, revision);
      toast.success(`Rolled back to revision ${revision}`);
      void queryClient.invalidateQueries({ queryKey: ['helm-releases'] });
      void queryClient.invalidateQueries({ queryKey: ['helm-release-history', release.namespace, release.name] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Rollback failed');
    } finally {
      setRollingBackRev(null);
    }
  };

  const handleConfirmRollback = () => {
    const rev = rollbackConfirmRev;
    if (rev == null) return;
    setRollbackConfirmRev(null);
    void handleRollback(rev);
  };

  return (
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

    <DrawerTitle>Revisions</DrawerTitle>
    <div className="space-y-2">
      {historyLoading ? (
        <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
          <Loader size={14} className="animate-spin flex-shrink-0" />
          Loading history…
        </div>
      ) : history.length === 0 ? (
        <p className="text-sm" style={{ color: 'var(--color-muted)' }}>No revision history.</p>
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-elevated">
                <th className="text-left py-2 px-3 font-medium" style={{ color: 'var(--color-muted)' }}>Rev</th>
                <th className="text-left py-2 px-3 font-medium" style={{ color: 'var(--color-muted)' }}>Updated</th>
                <th className="text-left py-2 px-3 font-medium" style={{ color: 'var(--color-muted)' }}>Status</th>
                <th className="text-left py-2 px-3 font-medium" style={{ color: 'var(--color-muted)' }}>Chart</th>
                <th className="text-left py-2 px-3 font-medium" style={{ color: 'var(--color-muted)' }}>Description</th>
                <th className="text-right py-2 px-3 font-medium" style={{ color: 'var(--color-muted)' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {[...history].reverse().map((rev) => {
                const isCurrent = rev.revision === release.revision;
                const isRollingBack = rollingBackRev === rev.revision;
                return (
                  <tr
                    key={rev.revision}
                    className={`border-b border-border last:border-b-0 ${isCurrent ? 'bg-hover/50' : ''}`}
                  >
                    <td className="py-2 px-3 font-medium" style={{ color: 'var(--color-text)' }}>{rev.revision}</td>
                    <td className="py-2 px-3" style={{ color: 'var(--color-text-secondary)' }} title={rev.updated}>
                      {timeAgo(rev.updated)}
                    </td>
                    <td className="py-2 px-3">
                      <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${getStatusClass(rev.status)}`}>
                        {rev.status}
                      </span>
                    </td>
                    <td className="py-2 px-3 font-mono text-xs truncate max-w-[120px]" style={{ color: 'var(--color-text)' }} title={rev.chart}>
                      {rev.chart}
                    </td>
                    <td className="py-2 px-3 text-xs truncate max-w-[140px]" style={{ color: 'var(--color-text-secondary)' }} title={rev.description}>
                      {rev.description || '—'}
                    </td>
                    <td className="py-2 px-3 text-right">
                      {isCurrent ? (
                        <span className="text-xs" style={{ color: 'var(--color-muted)' }}>Current</span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setRollbackConfirmRev(rev.revision)}
                          disabled={isRollingBack}
                          className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline disabled:opacity-50"
                        >
                          {isRollingBack ? <Loader size={12} className="animate-spin" /> : <RotateCw size={12} />}
                          Rollback
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>

    <DrawerLabelsAnnotations labels={release.labels} annotations={release.annotations} />

    <ConfirmDialog
      open={rollbackConfirmRev !== null}
      title="Rollback release"
      description={
        rollbackConfirmRev != null
          ? `Roll back "${release.name}" to revision ${rollbackConfirmRev}? The current revision will be superseded.`
          : ''
      }
      confirmLabel="Rollback"
      destructive
      isLoading={rollingBackRev !== null}
      onConfirm={handleConfirmRollback}
      onCancel={() => setRollbackConfirmRev(null)}
    />
  </ResourceDetailPanelLayout>
  );
};
