import { Cable, Layers, Upload } from './Icons';
import type { HelmChart } from '../types';
import { ResourceDetailPanelLayout, PanelActionButton } from './ResourceDetailPanelLayout';
import { DrawerItem, DrawerTitle } from './drawer';

interface HelmChartDetailPanelProps {
  chart: HelmChart;
  onClose: () => void;
  /** When set, Install opens a bottom tab (Freelens-style) and typically closes the panel */
  onInstall?: (chart: HelmChart) => void;
}

/** Helm chart detail panel — layout aligned with Freelens: header = Install icon + Open link icon; content = description, fields, Install button at bottom. */
export const HelmChartDetailPanel = ({ chart, onClose, onInstall }: HelmChartDetailPanelProps) => (
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
        <PanelActionButton icon={Upload} label="Install" onClick={() => onInstall(chart)} />
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
      {chart.repository_url ? (
        <a
          href={chart.repository_url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 break-all"
          style={{ color: 'var(--color-primary)' }}
          onClick={(e) => e.stopPropagation()}
        >
          {chart.repository}
          <Cable size={12} className="flex-shrink-0" />
        </a>
      ) : (
        chart.repository
      )}
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
          Install
        </button>
      </div>
    )}
  </ResourceDetailPanelLayout>
);
