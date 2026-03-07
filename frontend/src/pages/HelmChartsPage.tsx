import { useMemo, useState } from 'react';
import { ExternalLink, Star } from 'lucide-react';
import { useHelmCharts } from '../hooks/useKubernetes';
import { DataTable } from '../components/DataTable';
import type { HelmChart } from '../types';

type ChartSortKey = 'name' | 'version' | 'app_version' | 'repository' | 'stars';

export const HelmChartsPage = () => {
  const { data, isLoading, error } = useHelmCharts();
  const [sortState, setSortState] = useState<{ key: ChartSortKey; direction: 'asc' | 'desc' }>({
    key: 'stars',
    direction: 'desc',
  });

  const columns = [
    {
      header: 'Name',
      accessor: (row: HelmChart) => (
        <span className="font-medium text-text">{row.name}</span>
      ),
      width: '16%',
      sortable: true,
      sortKey: 'name',
    },
    {
      header: 'Description',
      accessor: (row: HelmChart) => (
        <span className="text-text-secondary text-xs leading-relaxed line-clamp-2">
          {row.description || '-'}
        </span>
      ),
      width: '32%',
    },
    {
      header: 'Version',
      accessor: (row: HelmChart) => (
        <span className="font-mono text-xs text-text-secondary">{row.version}</span>
      ),
      width: '10%',
      sortable: true,
      sortKey: 'version',
    },
    {
      header: 'App Version',
      accessor: (row: HelmChart) => (
        <span className="font-mono text-xs text-text-secondary">{row.app_version || '-'}</span>
      ),
      width: '10%',
      sortable: true,
      sortKey: 'app_version',
    },
    {
      header: 'Repository',
      accessor: (row: HelmChart) => (
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-xs text-text-secondary truncate">{row.repository}</span>
          {row.repository_url && (
            <a
              href={row.repository_url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="flex-shrink-0 text-[var(--color-primary)] hover:text-[var(--color-primary-hover)] transition-colors"
              title={row.repository_url}
            >
              <ExternalLink size={12} />
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
          <span className="text-xs text-text-secondary">
            {row.stars >= 1000 ? `${(row.stars / 1000).toFixed(1)}k` : String(row.stars)}
          </span>
        </div>
      ),
      width: '10%',
      sortable: true,
      sortKey: 'stars',
    },
  ];

  const sortedCharts = useMemo(() => {
    const source = [...(data || [])];
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
        default:
          return compareText(a.name, b.name) * factor;
      }
    });
  }, [data, sortState]);

  return (
    <div className="space-y-4">
      <div>
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
      </div>

      <DataTable
        columns={columns}
        data={sortedCharts}
        isLoading={isLoading}
        error={error?.message ?? null}
        rowKey="name"
        sortState={sortState}
        onSortChange={(next) =>
          setSortState(next as { key: ChartSortKey; direction: 'asc' | 'desc' })
        }
      />
    </div>
  );
};
