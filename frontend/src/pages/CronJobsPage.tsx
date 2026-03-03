import { useEffect, useMemo, useState } from 'react';
import { useCronJobs } from '../hooks/useKubernetes';
import { CronJobDetailPanel, DataTable } from '../components';
import type { CronJob } from '../types';
import { timeAgo } from '../utils';

type CronJobSortKey =
  | 'name'
  | 'namespace'
  | 'schedule'
  | 'suspend'
  | 'active'
  | 'last_schedule'
  | 'next_execution'
  | 'time_zone'
  | 'age';

export const CronJobsPage = () => {
  const { data, isLoading, error } = useCronJobs();
  const [selectedCronJob, setSelectedCronJob] = useState<CronJob | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [sortState, setSortState] = useState<{ key: CronJobSortKey; direction: 'asc' | 'desc' }>({
    key: 'name',
    direction: 'asc',
  });

  useEffect(() => {
    if (!data || data.length === 0) {
      setSelectedCronJob(null);
      return;
    }

    if (!selectedCronJob) {
      setSelectedCronJob(data[0]);
      return;
    }

    const updatedSelected = data.find(
      (item) => item.name === selectedCronJob.name && item.namespace === selectedCronJob.namespace
    );
    setSelectedCronJob(updatedSelected ?? data[0]);
  }, [data]);

  const sortedCronJobs = useMemo(() => {
    const source = [...(data || [])];
    const factor = sortState.direction === 'asc' ? 1 : -1;

    return source.sort((first, second) => {
      if (sortState.key === 'name') return first.name.localeCompare(second.name) * factor;
      if (sortState.key === 'namespace') return first.namespace.localeCompare(second.namespace) * factor;
      if (sortState.key === 'schedule') return first.schedule.localeCompare(second.schedule) * factor;
      if (sortState.key === 'suspend') return (Number(first.suspend) - Number(second.suspend)) * factor;
      if (sortState.key === 'active') return ((first.active ?? 0) - (second.active ?? 0)) * factor;
      if (sortState.key === 'last_schedule') {
        const firstLast = Date.parse(first.last_schedule || '');
        const secondLast = Date.parse(second.last_schedule || '');
        return ((Number.isNaN(firstLast) ? 0 : firstLast) - (Number.isNaN(secondLast) ? 0 : secondLast)) * factor;
      }
      if (sortState.key === 'next_execution') {
        const firstNext = Date.parse(first.next_execution || '');
        const secondNext = Date.parse(second.next_execution || '');
        return ((Number.isNaN(firstNext) ? 0 : firstNext) - (Number.isNaN(secondNext) ? 0 : secondNext)) * factor;
      }
      if (sortState.key === 'time_zone') {
        return (first.time_zone || '').localeCompare(second.time_zone || '') * factor;
      }

      const firstAge = Date.parse(first.age || '');
      const secondAge = Date.parse(second.age || '');
      return ((Number.isNaN(firstAge) ? 0 : firstAge) - (Number.isNaN(secondAge) ? 0 : secondAge)) * factor;
    });
  }, [data, sortState]);

  const columns = [
    {
      header: 'Name',
      accessor: 'name' as const,
      width: '25%',
      sortable: true,
      sortKey: 'name',
    },
    {
      header: 'Namespace',
      accessor: 'namespace' as const,
      width: '15%',
      sortable: true,
      sortKey: 'namespace',
    },
    {
      header: 'Schedule',
      accessor: 'schedule' as const,
      width: '10%',
      sortable: true,
      sortKey: 'schedule',
    },
    {
      header: 'Suspend',
      accessor: (row: CronJob) => (
        <span className={row.suspend ? 'text-[var(--color-icon-warning)] font-medium' : 'text-[var(--color-icon-success)] font-medium'}>
          {row.suspend ? 'Yes' : 'No'}
        </span>
      ),
      width: '9%',
      sortable: true,
      sortKey: 'suspend',
    },
    {
      header: 'Active',
      accessor: (row: CronJob) => (
        <span className={row.active > 0 ? 'text-[var(--color-icon-info)] font-medium' : 'text-text-secondary'}>
          {row.active ?? 0}
        </span>
      ),
      width: '8%',
      sortable: true,
      sortKey: 'active',
    },
    {
      header: 'Last Schedule',
      accessor: (row: CronJob) => (row.last_schedule ? timeAgo(row.last_schedule) : '-'),
      width: '12%',
      sortable: true,
      sortKey: 'last_schedule',
    },
    {
      header: 'Next Execution',
      accessor: (row: CronJob) => (row.next_execution ? timeAgo(row.next_execution) : '-'),
      width: '12%',
      sortable: true,
      sortKey: 'next_execution',
    },
    {
      header: 'Time Zone',
      accessor: (row: CronJob) => row.time_zone || '-',
      width: '10%',
      sortable: true,
      sortKey: 'time_zone',
    },
    {
      header: 'Age',
      accessor: (row: CronJob) => timeAgo(row.age),
      width: '8%',
      sortable: true,
      sortKey: 'age',
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-text">CronJobs</h1>
        <p className="text-text-secondary mt-1">Manage CronJob resources</p>
      </div>

      <DataTable
        columns={columns}
        data={sortedCronJobs}
        isLoading={isLoading}
        error={error?.message}
        rowKey="name"
        onRowClick={(row) => {
          setSelectedCronJob(row);
          setPanelOpen(true);
        }}
        selectedRowKey={panelOpen ? selectedCronJob?.name : undefined}
        sortState={sortState}
        onSortChange={(nextSort) => setSortState(nextSort as { key: CronJobSortKey; direction: 'asc' | 'desc' })}
      />

      {panelOpen && selectedCronJob && (
        <>
          <div
            className="fixed inset-0 z-40 bg-transparent"
            onClick={() => setPanelOpen(false)}
          />
          <CronJobDetailPanel
            cronJob={selectedCronJob}
            onClose={() => setPanelOpen(false)}
          />
        </>
      )}
    </div>
  );
};
