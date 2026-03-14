import { useMemo } from 'react';
import { DataTable } from '../components';
import { useBackupOverview } from '../hooks/useKubernetes';
import type { RestoreRecord } from '../types';
import { timeAgo } from '../utils';

export const RestoreListPage = () => {
  const { data, isLoading, error } = useBackupOverview();
  const restores = useMemo(() => data?.restores ?? [], [data]);

  const columns = [
    {
      header: 'Name',
      accessor: (row: RestoreRecord) => <span className="font-medium text-white">{row.name}</span>,
      width: '30%',
    },
    { header: 'Backup', accessor: (row: RestoreRecord) => row.backup_name, width: '28%' },
    { header: 'Phase', accessor: (row: RestoreRecord) => row.phase, width: '16%' },
    { header: 'Created', accessor: (row: RestoreRecord) => timeAgo(row.created_at), width: '20%' },
  ];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-text">Restore List</h1>
        <p className="text-sm text-text-secondary">Recent restore resources and phases.</p>
      </div>

      <DataTable
        columns={columns}
        data={restores}
        rowKey="name"
        isLoading={isLoading}
        error={error ? String(error) : null}
        autoFitContent={false}
      />
    </div>
  );
};
