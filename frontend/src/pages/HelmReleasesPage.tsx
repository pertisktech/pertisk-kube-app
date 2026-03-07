import { useMemo, useState } from 'react';
import { useHelmReleases } from '../hooks/useKubernetes';
import { DataTable } from '../components/DataTable';
import { timeAgo } from '../utils';
import type { HelmRelease } from '../types';

type ReleaseSortKey = 'name' | 'namespace' | 'chart' | 'revision' | 'status' | 'updated';

const getStatusClass = (status: string) => {
  const s = status.toLowerCase();
  if (s === 'deployed') return 'status-green';
  if (s === 'failed') return 'status-red';
  if (s.startsWith('pending') || s === 'uninstalling') return 'status-yellow';
  if (s === 'superseded') return 'status-gray';
  return 'status-gray';
};

export const HelmReleasesPage = () => {
  const { data, isLoading, error } = useHelmReleases();
  const [sortState, setSortState] = useState<{ key: ReleaseSortKey; direction: 'asc' | 'desc' }>({
    key: 'name',
    direction: 'asc',
  });

  const columns = [
    {
      header: 'Name',
      accessor: (row: HelmRelease) => (
        <span className="font-medium text-text">{row.name}</span>
      ),
      width: '16%',
      sortable: true,
      sortKey: 'name',
    },
    {
      header: 'Namespace',
      accessor: (row: HelmRelease) => (
        <span className="text-xs font-mono text-text-secondary">{row.namespace}</span>
      ),
      width: '12%',
      sortable: true,
      sortKey: 'namespace',
    },
    {
      header: 'Chart',
      accessor: (row: HelmRelease) => (
        <span className="text-xs text-text">{row.chart !== '-' ? row.chart : row.name}</span>
      ),
      width: '14%',
      sortable: true,
      sortKey: 'chart',
    },
    {
      header: 'Revision',
      accessor: (row: HelmRelease) => (
        <span className="text-xs text-text-secondary">{row.revision}</span>
      ),
      width: '8%',
      sortable: true,
      sortKey: 'revision',
    },
    {
      header: 'Version',
      accessor: (row: HelmRelease) => (
        <span className="font-mono text-xs text-text-secondary">{row.chart_version}</span>
      ),
      width: '10%',
    },
    {
      header: 'App Version',
      accessor: (row: HelmRelease) => (
        <span className="font-mono text-xs text-text-secondary">{row.app_version}</span>
      ),
      width: '10%',
    },
    {
      header: 'Status',
      accessor: (row: HelmRelease) => (
        <span
          className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusClass(row.status)}`}
        >
          {row.status}
        </span>
      ),
      width: '12%',
      sortable: true,
      sortKey: 'status',
    },
    {
      header: 'Updated',
      accessor: (row: HelmRelease) => (
        <span className="text-xs text-text-secondary">
          {row.updated ? timeAgo(row.updated) : '-'}
        </span>
      ),
      width: '18%',
      sortable: true,
      sortKey: 'updated',
    },
  ];

  const sortedReleases = useMemo(() => {
    const source = [...(data || [])];
    const factor = sortState.direction === 'asc' ? 1 : -1;
    const compareText = (a: unknown, b: unknown) =>
      String(a ?? '').localeCompare(String(b ?? ''), undefined, {
        numeric: true,
        sensitivity: 'base',
      });

    return source.sort((a, b) => {
      switch (sortState.key) {
        case 'revision':
          return ((a.revision ?? 0) - (b.revision ?? 0)) * factor;
        case 'updated': {
          const ta = a.updated ? Date.parse(a.updated) : 0;
          const tb = b.updated ? Date.parse(b.updated) : 0;
          const diff = (Number.isNaN(ta) ? 0 : ta) - (Number.isNaN(tb) ? 0 : tb);
          return (diff !== 0 ? diff : compareText(a.name, b.name)) * factor;
        }
        case 'status':
          return (
            (compareText(a.status, b.status) || compareText(a.name, b.name)) * factor
          );
        case 'namespace':
          return (
            (compareText(a.namespace, b.namespace) || compareText(a.name, b.name)) * factor
          );
        case 'chart':
          return (
            (compareText(a.chart, b.chart) || compareText(a.name, b.name)) * factor
          );
        default:
          return compareText(a.name, b.name) * factor;
      }
    });
  }, [data, sortState]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-text">
          Releases{' '}
          <span className="text-base font-normal text-text-secondary">
            (Installed Helm releases)
          </span>
        </h1>
      </div>

      <DataTable
        columns={columns}
        data={sortedReleases}
        isLoading={isLoading}
        error={error?.message ?? null}
        rowKey={(row) => `${row.namespace}/${row.name}`}
        sortState={sortState}
        onSortChange={(next) =>
          setSortState(next as { key: ReleaseSortKey; direction: 'asc' | 'desc' })
        }
      />
    </div>
  );
};
