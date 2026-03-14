import { useMemo, useState } from 'react';
import { Cable, Star } from '../components/Icons';
import { useHelmCharts, useHelmReleases } from '../hooks/useKubernetes';
import { DataTable } from '../components/DataTable';
import { HelmChartDetailPanel } from '../components/HelmChartDetailPanel';
import { openPanelTab } from '../components/BottomPanel';
import type { HelmChart } from '../types';

type ChartSortKey = 'name' | 'version' | 'app_version' | 'repository' | 'stars' | 'installed';

function chartRowKey(chart: HelmChart): string {
  return `${chart.repository}/${chart.name}`;
}

export const HelmChartsPage = () => {
  const { data, isLoading, error } = useHelmCharts();
  const { data: releases } = useHelmReleases();
  const [searchQuery, setSearchQuery] = useState('');
  const [sortState, setSortState] = useState<{ key: ChartSortKey; direction: 'asc' | 'desc' }>({
    key: 'stars',
    direction: 'desc',
  });
  const [selectedChart, setSelectedChart] = useState<HelmChart | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);

  /** Chart names that have at least one release installed (release.chart === chart name). */
  const installedChartNames = useMemo(() => {
    const set = new Set<string>();
    releases?.forEach((r) => {
      if (r.chart && r.chart !== '-') set.add(r.chart);
    });
    return set;
  }, [releases]);

  /** For each chart name, count how many releases use it (e.g. same chart in multiple namespaces). */
  const installedChartCount = useMemo(() => {
    const map = new Map<string, number>();
    releases?.forEach((r) => {
      if (r.chart && r.chart !== '-') map.set(r.chart, (map.get(r.chart) ?? 0) + 1);
    });
    return map;
  }, [releases]);

  const columns = [
    {
      header: 'Name',
      accessor: (row: HelmChart) => (
        <span className="font-medium text-text">{row.name}</span>
      ),
      width: '14%',
      sortable: true,
      sortKey: 'name',
    },
    {
      header: 'Status',
      accessor: (row: HelmChart) => {
        const installed = installedChartNames.has(row.name);
        const count = installedChartCount.get(row.name) ?? 0;
        if (!installed) return <span className="text-text-secondary">—</span>;
        return (
          <span
            className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium status-green"
            title={count > 1 ? `Installed in ${count} release(s)` : 'Installed'}
          >
            Installed{count > 1 ? ` (${count})` : ''}
          </span>
        );
      },
      width: '12%',
      sortable: true,
      sortKey: 'installed',
    },
    {
      header: 'Description',
      accessor: (row: HelmChart) => (
        <span className="text-text-secondary leading-relaxed line-clamp-2">
          {row.description || '-'}
        </span>
      ),
      width: '26%',
    },
    {
      header: 'Version',
      accessor: (row: HelmChart) => (
        <span className="font-mono text-text-secondary">{row.version}</span>
      ),
      width: '10%',
      sortable: true,
      sortKey: 'version',
    },
    {
      header: 'App Version',
      accessor: (row: HelmChart) => (
        <span className="font-mono text-text-secondary">{row.app_version || '-'}</span>
      ),
      width: '10%',
      sortable: true,
      sortKey: 'app_version',
    },
    {
      header: 'Repository',
      accessor: (row: HelmChart) => (
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-text-secondary truncate">{row.repository}</span>
          {row.repository_url && (
            <a
              href={row.repository_url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="flex-shrink-0 text-[var(--color-primary)] hover:text-[var(--color-primary-hover)] transition-colors"
              title={row.repository_url}
            >
              <Cable size={12} />
            </a>
          )}
        </div>
      ),
      width: '22%',
      sortable: true,
      sortKey: 'repository',
    },
    {
      header: 'Stars',
      accessor: (row: HelmChart) => (
        <div className="flex items-center gap-1">
          <Star size={11} className="text-yellow-y1 fill-yellow-y1" />
          <span className="text-text-secondary">
            {row.stars >= 1000 ? `${(row.stars / 1000).toFixed(1)}k` : String(row.stars)}
          </span>
        </div>
      ),
      width: '10%',
      sortable: true,
      sortKey: 'stars',
    },
  ];

  const filteredAndSortedCharts = useMemo(() => {
    let source = [...(data || [])];
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      source = source.filter(
        (c) =>
          (c.name && c.name.toLowerCase().includes(q)) ||
          (c.description && c.description.toLowerCase().includes(q)) ||
          (c.repository && c.repository.toLowerCase().includes(q)) ||
          (c.version && c.version.toLowerCase().includes(q)) ||
          (c.app_version && c.app_version.toLowerCase().includes(q)),
      );
    }
    const factor = sortState.direction === 'asc' ? 1 : -1;
    const compareText = (a: unknown, b: unknown) =>
      String(a ?? '').localeCompare(String(b ?? ''), undefined, { sensitivity: 'base' });

    return source.sort((a, b) => {
      switch (sortState.key) {
        case 'stars':
          return ((a.stars ?? 0) - (b.stars ?? 0)) * factor;
        case 'version':
          return compareText(a.version, b.version) * factor;
        case 'app_version':
          return compareText(a.app_version, b.app_version) * factor;
        case 'repository':
          return compareText(a.repository, b.repository) * factor;
        case 'installed': {
          const aInstalled = installedChartNames.has(a.name) ? 1 : 0;
          const bInstalled = installedChartNames.has(b.name) ? 1 : 0;
          const diff = aInstalled - bInstalled;
          return (diff !== 0 ? diff : compareText(a.name, b.name)) * factor;
        }
        default:
          return compareText(a.name, b.name) * factor;
      }
    });
  }, [data, sortState, installedChartNames, searchQuery]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-text">
          Charts{' '}
          <span className="text-base font-normal text-text-secondary">
            — popular Helm charts from{' '}
            <a
              href="https://artifacthub.io"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[var(--color-primary)] hover:underline"
            >
              Artifact Hub
            </a>
          </span>
        </h1>
        <input
          type="text"
          placeholder="Search charts..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-56 px-3 py-1.5 rounded-lg border border-border bg-surface text-sm text-text placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
          aria-label="Search charts by name, description, repository, version"
        />
      </div>

      <DataTable
        columns={columns}
        data={filteredAndSortedCharts}
        isLoading={isLoading}
        error={error?.message ?? null}
        autoFitContent={false}
        rowKey={chartRowKey}
        onRowClick={(row) => {
          setSelectedChart(row);
          setPanelOpen(true);
        }}
        selectedRowKey={panelOpen && selectedChart ? chartRowKey(selectedChart) : undefined}
        sortState={sortState}
        onSortChange={(next) =>
          setSortState(next as { key: ChartSortKey; direction: 'asc' | 'desc' })
        }
      />

      {panelOpen && selectedChart && (
        <>
          <div
            className="fixed inset-0 z-[95] bg-black/20"
            onClick={() => setPanelOpen(false)}
          />
          <HelmChartDetailPanel
            chart={selectedChart}
            onClose={() => setPanelOpen(false)}
            onInstall={(c) => {
              openPanelTab({
                type: 'install-chart',
                installChart: {
                  name: c.name,
                  repository: c.repository,
                  version: c.version,
                  repository_url: c.repository_url,
                },
              });
              setPanelOpen(false);
            }}
          />
        </>
      )}
    </div>
  );
};
