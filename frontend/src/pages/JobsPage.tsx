import { useEffect, useMemo, useState } from 'react';
import { useRealtimeJobs } from '../hooks/useRealtimeResources';
import { useNamespace } from '../context/NamespaceContext';
import { DataTable, JobDetailPanel } from '../components';
import type { Job } from '../types';
import { getStatusColor, timeAgo } from '../utils';

type JobSortKey = 'name' | 'namespace' | 'status' | 'completions' | 'duration' | 'age';

export const JobsPage = () => {
  const { data, isLoading, error } = useRealtimeJobs();
  const { selectedNamespaces } = useNamespace();
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [selectedRows, setSelectedRows] = useState<string[]>([]);
  const [sortState, setSortState] = useState<{ key: JobSortKey; direction: 'asc' | 'desc' }>({
    key: 'name',
    direction: 'asc',
  });

  useEffect(() => {
    if (!data || data.length === 0) {
      setSelectedJob(null);
      return;
    }

    if (!selectedJob) {
      setSelectedJob(data[0]);
      return;
    }

    const updatedSelected = data.find(
      (item) => item.name === selectedJob.name && item.namespace === selectedJob.namespace
    );
    setSelectedJob(updatedSelected ?? data[0]);
  }, [data]);

  const getStatusTextClass = (status: string) => {
    const color = getStatusColor(status);
    if (color === 'green') return 'text-[var(--color-icon-success)]';
    if (color === 'yellow') return 'text-[var(--color-icon-warning)]';
    if (color === 'red') return 'text-[var(--color-icon-danger)]';
    return 'text-text-secondary';
  };

  const getCompletionTextClass = (completions: string) => {
    const [done, total] = completions.split('/').map((value) => Number(value));
    if (Number.isFinite(done) && Number.isFinite(total) && total > 0 && done >= total) {
      return 'text-[var(--color-icon-success)]';
    }
    return 'text-text-secondary';
  };

  const parseDurationToSeconds = (duration: string): number => {
    const trimmed = (duration || '').trim();
    if (!trimmed || trimmed === '-') return -1;
    const match = trimmed.match(/^(\d+)\s*([smhdw])$/i);
    if (!match) return -1;
    const value = Number(match[1]);
    const unit = match[2].toLowerCase();
    if (unit === 's') return value;
    if (unit === 'm') return value * 60;
    if (unit === 'h') return value * 3600;
    if (unit === 'd') return value * 86400;
    return value * 604800;
  };

  const columns = [
    {
      header: 'Name',
      accessor: (row: Job) => (
        <span className="font-medium text-text">{row.name}</span>
      ),
      width: '28%',
      sortable: true,
      sortKey: 'name',
    },
    {
      header: 'Namespace',
      accessor: 'namespace' as const,
      width: '18%',
      sortable: true,
      sortKey: 'namespace',
    },
    {
      header: 'Status',
      accessor: (row: Job) => (
        <span className={`font-medium ${getStatusTextClass(row.status || 'Pending')}`}>
          {row.status || 'Pending'}
        </span>
      ),
      width: '15%',
      sortable: true,
      sortKey: 'status',
    },
    {
      header: 'Completions',
      accessor: (row: Job) => (
        <span className={`font-medium ${getCompletionTextClass(row.completions || '-')}`}>
          {row.completions || '-'}
        </span>
      ),
      width: '15%',
      sortable: true,
      sortKey: 'completions',
    },
    {
      header: 'Duration',
      accessor: 'duration' as const,
      width: '12%',
      sortable: true,
      sortKey: 'duration',
    },
    {
      header: 'Age',
      accessor: (row: Job) => timeAgo(row.age),
      width: '12%',
      sortable: true,
      sortKey: 'age',
    },
  ];

  const sortedJobs = useMemo((): (Job & { id: string })[] => {
    let source = [...(data || [])];
    
    // Filter by selected namespaces (if any are selected)
    if (selectedNamespaces.length > 0) {
      source = source.filter((job) => selectedNamespaces.includes(job.namespace));
    }
    
    // Add unique id for row selection
    source = source.map((job) => ({
      ...job,
      id: `${job.namespace}/${job.name}`,
    })) as (Job & { id: string })[];
    
    const factor = sortState.direction === 'asc' ? 1 : -1;

    return source.sort((first, second) => {
      if (sortState.key === 'name') return first.name.localeCompare(second.name) * factor;
      if (sortState.key === 'namespace') return first.namespace.localeCompare(second.namespace) * factor;
      if (sortState.key === 'status') return (first.status || '').localeCompare(second.status || '') * factor;
      if (sortState.key === 'completions') {
        const parse = (value: string) => {
          const [done, total] = (value || '').split('/').map((v) => Number(v));
          if (!Number.isFinite(done) || !Number.isFinite(total) || total <= 0) return -1;
          return done / total;
        };
        return (parse(first.completions) - parse(second.completions)) * factor;
      }
      if (sortState.key === 'duration') {
        return (parseDurationToSeconds(first.duration) - parseDurationToSeconds(second.duration)) * factor;
      }

      const firstAge = Date.parse(first.age || '');
      const secondAge = Date.parse(second.age || '');
      return ((Number.isNaN(firstAge) ? 0 : firstAge) - (Number.isNaN(secondAge) ? 0 : secondAge)) * factor;
    }) as (Job & { id: string })[];
  }, [data, sortState, selectedNamespaces]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-text">Jobs</h1>
        <p className="text-text-secondary mt-1">Manage Kubernetes jobs</p>
      </div>

      <DataTable
        columns={columns}
        data={sortedJobs}
        isLoading={isLoading}
        error={error}
        rowKey="id"
        onRowClick={(row) => {
          setSelectedJob(row);
          setPanelOpen(true);
        }}
        selectedRowKey={panelOpen && selectedJob ? `${selectedJob.namespace}/${selectedJob.name}` : undefined}
        sortState={sortState}
        onSortChange={(nextSort) => setSortState(nextSort as { key: JobSortKey; direction: 'asc' | 'desc' })}
        enableRowSelection={true}
        selectedRows={selectedRows}
        onRowSelectionChange={(rows) => setSelectedRows(rows)}
      />

      {panelOpen && selectedJob && (
        <>
          <div
            className="fixed inset-0 z-40 bg-transparent"
            onClick={() => setPanelOpen(false)}
          />
          <JobDetailPanel
            job={selectedJob}
            onClose={() => setPanelOpen(false)}
          />
        </>
      )}
    </div>
  );
};
