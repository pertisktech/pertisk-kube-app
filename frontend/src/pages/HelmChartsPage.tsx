import { useEffect, useMemo, useState } from 'react';
import { ExternalLink, Star } from '../components/Icons';
import { useHelmCharts } from '../hooks/useKubernetes';
import { useRealtimeHelmReleases } from '../hooks/useRealtimeResources';
import { useFeatureSettings } from '../context/FeatureSettingsContext';
import { DataTable } from '../components/DataTable';
import { HelmChartDetailPanel } from '../components/HelmChartDetailPanel';
import { openPanelTab } from '../components/BottomPanel';
import { openExternalUrl } from '../utils/openExternalUrl';
import type { HelmChart } from '../types';

type ChartSortKey = 'name' | 'version' | 'app_version' | 'repository' | 'stars' | 'installed';

function chartRowKey(chart: HelmChart): string {
  return `${chart.repository}/${chart.name}`;
}

function normalizeRepositoryUrl(url: string): string {
  return url.trim().replace(/\/+$/, '').toLowerCase();
}

export const HelmChartsPage = () => {
  const { settings } = useFeatureSettings();
  const enabledRepos = useMemo(
    () => settings.helmRepositories.filter((repo) => repo.enabled),
    [settings.helmRepositories],
  );
  const enabledRepoUrls = useMemo(() => enabledRepos.map((repo) => repo.url), [enabledRepos]);
  const repoNameByUrl = useMemo(
    () => new Map(enabledRepos.map((repo) => [normalizeRepositoryUrl(repo.url), repo.name])),
    [enabledRepos],
  );
  const { data: chartResponse, isLoading, error } = useHelmCharts(enabledRepoUrls);
  const data = chartResponse?.charts ?? [];
  const chartWarnings = chartResponse?.warnings ?? [];
  const chartsRefreshing = chartResponse?.refreshing === true;
  const { data: releases } = useRealtimeHelmReleases();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRepository, setSelectedRepository] = useState<string>('all');
  const [sortState, setSortState] = useState<{ key: ChartSortKey; direction: 'asc' | 'desc' }>({
    key: 'stars',
    direction: 'desc',
  });
  const [selectedChart, setSelectedChart] = useState<HelmChart | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);

  /** Chart names that have at least one release installed (release.chart === chart name). Keys are lowercase for case-insensitive matching. */
  const installedChartNames = useMemo(() => {
    const set = new Set<string>();
    releases?.forEach((r) => {
      if (r.chart && r.chart !== '-') set.add(r.chart.toLowerCase());
    });
    return set;
  }, [releases]);

  /** For each chart name, count how many releases use it (e.g. same chart in multiple namespaces). Keys are lowercase for case-insensitive matching. */
  const installedChartCount = useMemo(() => {
    const map = new Map<string, number>();
    releases?.forEach((r) => {
      if (r.chart && r.chart !== '-') {
        const key = r.chart.toLowerCase();
        map.set(key, (map.get(key) ?? 0) + 1);
      }
    });
    return map;
  }, [releases]);

  /** Map chart name (lowercase) to its first installed release (for upgrade flow). */
  const installedChartRelease = useMemo(() => {
    const map = new Map<string, { namespace: string; releaseName: string }>();
    releases?.forEach((r) => {
      if (r.chart && r.chart !== '-') {
        // Store both original and lowercase for flexible matching
        const key = r.chart.toLowerCase();
        if (!map.has(key)) {
          map.set(key, { namespace: r.namespace, releaseName: r.name });
        }
      }
    });
    return map;
  }, [releases]);

  /** Find installed release for a chart name (case-insensitive). */
  const findInstalledRelease = (chartName: string) => {
    return installedChartRelease.get(chartName.toLowerCase());
  };

  const columns = [
    {
      header: 'Name',
      accessor: (row: HelmChart) => {
        const hubUrl = row.artifact_hub_url || `https://artifacthub.io/packages/search?ts_query_web=${encodeURIComponent(row.name)}&kind=0`;
        return (
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="font-medium text-text truncate">{row.name}</span>
            <button
              type="button"
              className="flex-shrink-0 text-[var(--color-primary)] hover:text-[var(--color-primary-hover)] transition-colors cursor-pointer"
              title={row.artifact_hub_url ? 'View on Artifact Hub' : 'Search on Artifact Hub'}
              onClick={(e) => {
                e.stopPropagation();
                void openExternalUrl(hubUrl);
              }}
            >
              <ExternalLink size={12} />
            </button>
          </div>
        );
      },
      width: '14%',
      sortable: true,
      sortKey: 'name',
    },
    {
      header: 'Status',
      accessor: (row: HelmChart) => {
        const installed = installedChartNames.has(row.name.toLowerCase());
        const count = installedChartCount.get(row.name.toLowerCase()) ?? 0;
        if (!installed) return <span className="text-text-muted">—</span>;
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
        <span className="text-text-muted leading-relaxed line-clamp-2">
          {row.description || '-'}
        </span>
      ),
      width: '26%',
    },
    {
      header: 'Version',
      accessor: (row: HelmChart) => (
        <span className="font-mono text-text-muted">{row.version}</span>
      ),
      width: '10%',
      sortable: true,
      sortKey: 'version',
    },
    {
      header: 'App Version',
      accessor: (row: HelmChart) => (
        <span className="font-mono text-text-muted">{row.app_version || '-'}</span>
      ),
      width: '10%',
      sortable: true,
      sortKey: 'app_version',
    },
    {
      header: 'Repository',
      accessor: (row: HelmChart) => (
        <span className="text-text-muted truncate" title={row.repository_url}>
          {row.repository}
        </span>
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
          <span className="text-text-muted">
            {row.stars >= 1000 ? `${(row.stars / 1000).toFixed(1)}k` : String(row.stars)}
          </span>
        </div>
      ),
      width: '10%',
      sortable: true,
      sortKey: 'stars',
    },
  ];

  const displayCharts = useMemo(
    () => (data || []).map((chart) => ({
      ...chart,
      repository: repoNameByUrl.get(normalizeRepositoryUrl(chart.repository_url)) ?? chart.repository,
    })),
    [data, repoNameByUrl],
  );

  /** Repository names shown in filter dropdown (prefer configured enabled repos, include chart-derived fallbacks). */
  const filterRepositories = useMemo(() => {
    const repos = new Set<string>();

    enabledRepos.forEach((repo) => {
      const label = repo.name?.trim();
      if (label) repos.add(label);
    });

    displayCharts.forEach((c) => {
      if (c.repository) repos.add(c.repository);
    });

    return Array.from(repos).sort((a, b) => a.localeCompare(b));
  }, [enabledRepos, displayCharts]);

  useEffect(() => {
    if (selectedRepository !== 'all' && !filterRepositories.includes(selectedRepository)) {
      setSelectedRepository('all');
    }
  }, [filterRepositories, selectedRepository]);

  const filteredAndSortedCharts = useMemo(() => {
    let source = [...displayCharts];

    // Filter by repository
    if (selectedRepository !== 'all') {
      source = source.filter((c) => c.repository === selectedRepository);
    }

    // Filter by search query
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
          const aInstalled = installedChartNames.has(a.name.toLowerCase()) ? 1 : 0;
          const bInstalled = installedChartNames.has(b.name.toLowerCase()) ? 1 : 0;
          const diff = aInstalled - bInstalled;
          return (diff !== 0 ? diff : compareText(a.name, b.name)) * factor;
        }
        default:
          return compareText(a.name, b.name) * factor;
      }
    });
  }, [displayCharts, sortState, installedChartNames, searchQuery, selectedRepository]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-text">
          Charts{' '}
          <span className="text-base font-normal text-text-secondary">
            — {enabledRepos.length > 0 ? 'loaded from Helm Settings repositories' : 'popular Helm charts from Artifact Hub'}
            {enabledRepos.length === 0 && (
              <>
                {' '}(
                <a
                  href="https://artifacthub.io"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[var(--color-primary)] hover:underline"
                >
                  Artifact Hub
                </a>
                )
              </>
            )}
          </span>
        </h1>
        <div className="flex items-center gap-2">
          {filterRepositories.length > 1 && (
            <select
              value={selectedRepository}
              onChange={(e) => setSelectedRepository(e.target.value)}
              className="px-3 py-1.5 rounded-lg border border-border bg-surface text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
              aria-label="Filter by repository"
            >
              <option value="all">All Repositories</option>
              {filterRepositories.map((repo) => (
                <option key={repo} value={repo}>
                  {repo}
                </option>
              ))}
            </select>
          )}
          <input
            type="text"
            placeholder="Search charts..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-56 px-3 py-1.5 rounded-lg border border-border bg-surface text-sm text-text placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
            aria-label="Search charts by name, description, repository, version"
          />
        </div>
      </div>

      {chartsRefreshing && (
        <p className="text-xs text-text-secondary">Refreshing repository indexes...</p>
      )}
      {!chartsRefreshing && chartWarnings.length > 0 && (
        <p className="text-xs text-amber-600">{chartWarnings[0]}</p>
      )}

      <DataTable
        columns={columns}
        data={filteredAndSortedCharts}
        isLoading={isLoading || (chartsRefreshing && filteredAndSortedCharts.length === 0)}
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
            installedRelease={findInstalledRelease(selectedChart.name)}
            onInstall={(c) => {
              const existingRelease = findInstalledRelease(c.name);
              openPanelTab({
                type: 'install-chart',
                installChart: {
                  name: c.name,
                  repository: c.repository,
                  version: c.version,
                  repository_url: c.repository_url,
                  existingRelease,
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
