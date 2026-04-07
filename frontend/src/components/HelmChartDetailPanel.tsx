import { ExternalLink, Layers, Upload } from './Icons';
import type { HelmChart } from '../types';
import { ResourceDetailPanelLayout, PanelActionButton } from './ResourceDetailPanelLayout';
import { DrawerItem, DrawerTitle } from './drawer';
import { openExternalUrl } from '../utils/openExternalUrl';

interface HelmChartDetailPanelProps {
  chart: HelmChart;
  onClose: () => void;
  /** When set, Install opens a bottom tab (Freelens-style) and typically closes the panel */
  onInstall?: (chart: HelmChart) => void;
  /** When set, chart is already installed - changes button to 'Upgrade' */
  installedRelease?: { namespace: string; releaseName: string };
}

/** Helm chart detail panel — layout aligned with Freelens: header = Install icon + Open link icon; content = description, fields, Install button at bottom. */
export const HelmChartDetailPanel = ({ chart, onClose, onInstall, installedRelease }: HelmChartDetailPanelProps) => {
  const isInstalled = !!installedRelease;
  const buttonLabel = isInstalled ? 'Upgrade' : 'Install';
  
  return (
    <ResourceDetailPanelLayout
      kind="Chart"
      kindIcon={Layers}
      title={chart.name}
      keyInfo={[
        { label: 'Version', value: chart.version },
        { label: 'App Version', value: chart.app_version || '—' },
        { label: 'Repository', value: chart.repository },
      ]}
      actions={
        onInstall ? (
          <PanelActionButton icon={Upload} label={buttonLabel} onClick={() => onInstall(chart)} />
        ) : undefined
      }
      onClose={onClose}
    >
      <div className="mb-3">
        <p className="leading-relaxed" style={{ color: 'var(--color-text)' }}>
          {chart.description || '—'}
        </p>
      </div>
      <DrawerTitle>Property</DrawerTitle>
      <DrawerItem name="Version">{chart.version}</DrawerItem>
      <DrawerItem name="App Version">{chart.app_version ?? '—'}</DrawerItem>
      <DrawerItem name="Repository">
        <span title={chart.repository_url || undefined}>{chart.repository}</span>
      </DrawerItem>
      {installedRelease && (
        <>
          <DrawerItem name="Installed Namespace">{installedRelease.namespace}</DrawerItem>
          <DrawerItem name="Release Name">{installedRelease.releaseName}</DrawerItem>
        </>
      )}
      <DrawerItem name="Artifact Hub">
      <button
        type="button"
        className="inline-flex items-center gap-1 cursor-pointer underline hover:no-underline text-right"
        style={{ color: 'var(--color-primary)' }}
        onClick={(e) => {
          e.stopPropagation();
          void openExternalUrl(
            chart.artifact_hub_url || `https://artifacthub.io/packages/search?ts_query_web=${encodeURIComponent(chart.name)}&kind=0`
          );
        }}
      >
        {chart.artifact_hub_url ? 'View on Artifact Hub' : 'Search on Artifact Hub'}
        <ExternalLink size={12} className="flex-shrink-0" />
      </button>
    </DrawerItem>
    <DrawerItem name="Stars">
      {chart.stars >= 1000 ? `${(chart.stars / 1000).toFixed(1)}k` : String(chart.stars)}
    </DrawerItem>
    {onInstall && (
      <div className="mt-4 pt-3 border-t border-border">
        <button
          type="button"
          onClick={() => onInstall(chart)}
          className="w-full py-2 rounded-lg font-medium bg-[var(--color-primary)] text-white hover:opacity-90 transition-opacity"
        >
          {buttonLabel}
        </button>
      </div>
    )}
  </ResourceDetailPanelLayout>
  );
};
