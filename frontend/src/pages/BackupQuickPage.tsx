import { useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  createBackupSchedule,
  deleteBackupSchedule,
  runBackupScheduleNow,
  useNamespaces,
  useBackupOverview,
} from '../hooks/useKubernetes';
import { Checkbox, DataTable } from '../components';
import { ChevronDown } from '../components/Icons';
import type { ScheduleRecord } from '../types';
import { timeAgo } from '../utils';

const ALL_INCLUDE_OPTION = '__ALL__';

type ScheduleFormState = {
  name: string;
  cron: string;
  timezone: string;
  includeNamespaces: string[];
  excludeNamespaces: string[];
  paused: boolean;
};

const DEFAULT_SCHEDULE_FORM: ScheduleFormState = {
  name: '',
  cron: '0 2 * * *',
  timezone: 'Asia/Bangkok',
  includeNamespaces: [ALL_INCLUDE_OPTION],
  excludeNamespaces: [],
  paused: false,
};

export const BackupQuickPage = () => {
  const queryClient = useQueryClient();
  const { data: overview } = useBackupOverview();
  const { data: namespaces } = useNamespaces();
  const isLoading = false;

  const [panelOpen, setPanelOpen] = useState(false);
  const [editingName, setEditingName] = useState<string | null>(null);
  const [scheduleForm, setScheduleForm] = useState<ScheduleFormState>(DEFAULT_SCHEDULE_FORM);
  const [showIncludeMenu, setShowIncludeMenu] = useState(false);
  const [showExcludeMenu, setShowExcludeMenu] = useState(false);
  const [includeSearch, setIncludeSearch] = useState('');
  const [excludeSearch, setExcludeSearch] = useState('');
  const includeMenuRef = useRef<HTMLDivElement | null>(null);
  const excludeMenuRef = useRef<HTMLDivElement | null>(null);

  const [isCreatingSchedule, setIsCreatingSchedule] = useState(false);
  const [deletingScheduleName, setDeletingScheduleName] = useState<string | null>(null);
  const [runningScheduleName, setRunningScheduleName] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const schedules = useMemo(() => overview?.schedules ?? [], [overview]);
  const namespaceNames = useMemo(
    () => (namespaces ?? []).map((namespace) => namespace.name).sort((a, b) => a.localeCompare(b)),
    [namespaces],
  );
  const filteredIncludeNamespaces = useMemo(
    () => namespaceNames.filter((name) => name.toLowerCase().includes(includeSearch.toLowerCase())),
    [namespaceNames, includeSearch],
  );
  const filteredExcludeNamespaces = useMemo(
    () => namespaceNames.filter((name) => name.toLowerCase().includes(excludeSearch.toLowerCase())),
    [namespaceNames, excludeSearch],
  );

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (includeMenuRef.current && !includeMenuRef.current.contains(target)) {
        setShowIncludeMenu(false);
      }
      if (excludeMenuRef.current && !excludeMenuRef.current.contains(target)) {
        setShowExcludeMenu(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const resetScheduleForm = () => {
    setScheduleForm(DEFAULT_SCHEDULE_FORM);
    setEditingName(null);
  };

  const openAddPanel = () => {
    resetScheduleForm();
    setPanelOpen(true);
  };

  const openEditPanel = (schedule: ScheduleRecord) => {
    const includeNamespaces = schedule.include_namespaces.length > 0
      ? schedule.include_namespaces
      : [ALL_INCLUDE_OPTION];

    setScheduleForm({
      name: schedule.name,
      cron: schedule.cron,
      timezone: schedule.timezone || 'Asia/Bangkok',
      includeNamespaces,
      excludeNamespaces: schedule.exclude_namespaces,
      paused: schedule.paused,
    });
    setEditingName(schedule.name);
    setPanelOpen(true);
  };

  const closePanel = () => {
    setPanelOpen(false);
    setShowIncludeMenu(false);
    setShowExcludeMenu(false);
    setIncludeSearch('');
    setExcludeSearch('');
    resetScheduleForm();
  };

  const toggleIncludeNamespace = (namespaceName: string) => {
    setScheduleForm((previous) => {
      const current = previous.includeNamespaces.includes(ALL_INCLUDE_OPTION)
        ? []
        : previous.includeNamespaces;
      const exists = current.includes(namespaceName);
      const nextValues = exists
        ? current.filter((name) => name !== namespaceName)
        : [...current, namespaceName];

      return {
        ...previous,
        includeNamespaces: nextValues.length > 0 ? nextValues : [ALL_INCLUDE_OPTION],
      };
    });
  };

  const toggleExcludeNamespace = (namespaceName: string) => {
    setScheduleForm((previous) => {
      const exists = previous.excludeNamespaces.includes(namespaceName);
      return {
        ...previous,
        excludeNamespaces: exists
          ? previous.excludeNamespaces.filter((name) => name !== namespaceName)
          : [...previous.excludeNamespaces, namespaceName],
      };
    });
  };

  const handleSaveSchedule = async () => {
    if (!scheduleForm.name.trim()) {
      setErrorMessage('Schedule name is required.');
      return;
    }
    if (!scheduleForm.cron.trim()) {
      setErrorMessage('Schedule cron is required.');
      return;
    }
    setMessage(null);
    setErrorMessage(null);
    setIsCreatingSchedule(true);
    try {
      const includeNamespaces = scheduleForm.includeNamespaces.includes(ALL_INCLUDE_OPTION)
        ? []
        : scheduleForm.includeNamespaces;

      const createdName = await createBackupSchedule({
        name: scheduleForm.name.trim(),
        cron: scheduleForm.cron.trim(),
        timezone: scheduleForm.timezone.trim() || 'Asia/Bangkok',
        include_namespaces: includeNamespaces,
        exclude_namespaces: scheduleForm.excludeNamespaces,
        paused: scheduleForm.paused,
      });
      await queryClient.invalidateQueries({ queryKey: ['backup-overview'] });
      setMessage(editingName ? `Backup schedule updated: ${createdName}` : `Backup schedule created: ${createdName}`);
      closePanel();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to create schedule.');
    } finally {
      setIsCreatingSchedule(false);
    }
  };

  const handleDeleteSchedule = async (name: string) => {
    setMessage(null);
    setErrorMessage(null);
    setDeletingScheduleName(name);
    try {
      await deleteBackupSchedule(name);
      await queryClient.invalidateQueries({ queryKey: ['backup-overview'] });
      setMessage(`Backup schedule deleted: ${name}`);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to delete schedule.');
    } finally {
      setDeletingScheduleName(null);
    }
  };

  const handleRunScheduleNow = async (name: string) => {
    setMessage(null);
    setErrorMessage(null);
    setRunningScheduleName(name);
    try {
      const scheduleName = await runBackupScheduleNow(name);
      await queryClient.invalidateQueries({ queryKey: ['backup-overview'] });
      setMessage(`Manual run triggered: ${scheduleName}`);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to trigger manual run.');
    } finally {
      setRunningScheduleName(null);
    }
  };

  const scheduleColumns = [
    {
      header: 'Name',
      accessor: (row: ScheduleRecord) => <span className="font-medium text-text">{row.name}</span>,
      width: '28%',
    },
    { header: 'Cron', accessor: (row: ScheduleRecord) => row.cron, width: '20%' },
    { header: 'Timezone', accessor: (row: ScheduleRecord) => row.timezone || 'Asia/Bangkok', width: '16%' },
    { header: 'Last Backup', accessor: (row: ScheduleRecord) => timeAgo(row.last_backup), width: '14%' },
    {
      header: 'Paused',
      accessor: (row: ScheduleRecord) => (row.paused ? 'Yes' : 'No'),
      width: '10%',
    },
    {
      header: 'Actions',
      accessor: () => '-',
      render: (row: ScheduleRecord) => (
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleRunScheduleNow(row.name);
            }}
            disabled={runningScheduleName === row.name}
            className="px-2 py-1 rounded-md border border-border text-xs text-text-secondary hover:text-text disabled:opacity-50"
          >
            {runningScheduleName === row.name ? 'Running...' : 'Run Now'}
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              openEditPanel(row);
            }}
            className="px-2 py-1 rounded-md border border-border text-xs text-text-secondary hover:text-text"
          >
            Edit
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleDeleteSchedule(row.name);
            }}
            disabled={deletingScheduleName === row.name}
            className="px-2 py-1 rounded-md border border-border text-xs text-text-secondary hover:text-text disabled:opacity-50"
          >
            {deletingScheduleName === row.name ? 'Deleting...' : 'Delete'}
          </button>
        </div>
      ),
      width: '18%',
    },
  ];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-text">Backup Scheduler</h1>
        <p className="text-sm text-text-secondary">Create multiple backup schedules and trigger manual run per schedule.</p>
      </div>

      {message && <div className="text-sm text-green-600">{message}</div>}
      {errorMessage && <div className="text-sm text-red-600">{errorMessage}</div>}

      <div className="bg-surface border border-border rounded-lg p-4 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-text">Backup Scheduler List</h2>
          <button
            type="button"
            onClick={openAddPanel}
            disabled={isCreatingSchedule || isLoading}
            className="px-4 py-2 rounded-lg border border-border bg-surface-elevated text-sm font-medium disabled:opacity-50"
          >
            Add Scheduler
          </button>
        </div>

        <DataTable
          columns={scheduleColumns}
          data={schedules}
          rowKey="name"
          isLoading={false}
          onRowClick={openEditPanel}
          selectedRowKey={panelOpen && editingName ? editingName : undefined}
          autoFitContent={false}
        />
      </div>

      {panelOpen && (
        <>
          <div className="fixed inset-0 z-[95] bg-black/20" onClick={closePanel} />
          <div className="fixed top-0 right-0 z-[100] h-full w-full max-w-lg border-l border-border bg-surface shadow-xl overflow-y-auto">
            <div className="sticky top-0 border-b border-border bg-surface px-4 py-3 flex items-center justify-between">
              <h3 className="text-base font-semibold text-text">{editingName ? `Edit Scheduler: ${editingName}` : 'Add Scheduler'}</h3>
              <button type="button" onClick={closePanel} className="text-sm text-text-secondary hover:text-text">Close</button>
            </div>

            <div className="p-4 space-y-4">
              <div className="grid grid-cols-1 gap-3">
                <label className="space-y-1">
                  <span className="text-sm text-text-secondary">Schedule Name</span>
                  <input
                    value={scheduleForm.name}
                    onChange={(e) => setScheduleForm((previous) => ({ ...previous, name: e.target.value }))}
                    placeholder="daily-app-backup"
                    disabled={Boolean(editingName)}
                    className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm disabled:opacity-60"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-sm text-text-secondary">Schedule Cron</span>
                  <input
                    value={scheduleForm.cron}
                    onChange={(e) => setScheduleForm((previous) => ({ ...previous, cron: e.target.value }))}
                    className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-sm text-text-secondary">Timezone</span>
                  <input
                    value={scheduleForm.timezone}
                    onChange={(e) => setScheduleForm((previous) => ({ ...previous, timezone: e.target.value }))}
                    placeholder="Asia/Bangkok"
                    className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-sm text-text-secondary">Include Namespaces</span>
                  <div ref={includeMenuRef} className="relative">
                    <button
                      type="button"
                      onClick={() => {
                        setShowExcludeMenu(false);
                        setShowIncludeMenu((previous) => !previous);
                      }}
                      className="w-full inline-flex items-center justify-between gap-2 rounded-md border border-border bg-surface px-3 py-2 text-sm"
                    >
                      <span className="truncate text-left">
                        {scheduleForm.includeNamespaces.includes(ALL_INCLUDE_OPTION)
                          ? 'ALL namespaces'
                          : scheduleForm.includeNamespaces.length === 0
                          ? 'Select namespaces'
                          : scheduleForm.includeNamespaces.length === 1
                          ? scheduleForm.includeNamespaces[0]
                          : `${scheduleForm.includeNamespaces.length} selected`}
                      </span>
                      <ChevronDown size={14} className={showIncludeMenu ? 'rotate-180 transition-transform' : 'transition-transform'} />
                    </button>

                    {showIncludeMenu && (
                      <div className="absolute left-0 right-0 mt-1 z-[110] max-h-64 overflow-y-auto rounded-md border border-border bg-surface shadow-lg">
                        <div className="p-2 border-b border-border">
                          <input
                            type="text"
                            value={includeSearch}
                            onChange={(e) => setIncludeSearch(e.target.value)}
                            placeholder="Filter namespaces..."
                            className="w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => setScheduleForm((previous) => ({ ...previous, includeNamespaces: [ALL_INCLUDE_OPTION] }))}
                          className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-hover border-b border-border"
                        >
                          <Checkbox
                            checked={scheduleForm.includeNamespaces.includes(ALL_INCLUDE_OPTION)}
                            onChange={() => setScheduleForm((previous) => ({ ...previous, includeNamespaces: [ALL_INCLUDE_OPTION] }))}
                          />
                          <span>ALL namespaces</span>
                        </button>
                        {filteredIncludeNamespaces.length === 0 ? (
                          <div className="px-3 py-2 text-xs text-text-secondary">No namespaces found.</div>
                        ) : (
                          filteredIncludeNamespaces.map((namespaceName) => {
                            const checked = scheduleForm.includeNamespaces.includes(namespaceName);
                            return (
                              <button
                                key={namespaceName}
                                type="button"
                                onClick={() => toggleIncludeNamespace(namespaceName)}
                                className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-hover border-b border-border"
                              >
                                <Checkbox checked={checked} onChange={() => toggleIncludeNamespace(namespaceName)} />
                                <span>{namespaceName}</span>
                              </button>
                            );
                          })
                        )}
                      </div>
                    )}
                  </div>
                </label>
                <label className="space-y-1">
                  <span className="text-sm text-text-secondary">Exclude Namespaces</span>
                  <div ref={excludeMenuRef} className="relative">
                    <button
                      type="button"
                      onClick={() => {
                        setShowIncludeMenu(false);
                        setShowExcludeMenu((previous) => !previous);
                      }}
                      className="w-full inline-flex items-center justify-between gap-2 rounded-md border border-border bg-surface px-3 py-2 text-sm"
                    >
                      <span className="truncate text-left">
                        {scheduleForm.excludeNamespaces.length === 0
                          ? 'No excluded namespaces'
                          : scheduleForm.excludeNamespaces.length === 1
                          ? scheduleForm.excludeNamespaces[0]
                          : `${scheduleForm.excludeNamespaces.length} selected`}
                      </span>
                      <ChevronDown size={14} className={showExcludeMenu ? 'rotate-180 transition-transform' : 'transition-transform'} />
                    </button>

                    {showExcludeMenu && (
                      <div className="absolute left-0 right-0 mt-1 z-[110] max-h-64 overflow-y-auto rounded-md border border-border bg-surface shadow-lg">
                        <div className="p-2 border-b border-border">
                          <input
                            type="text"
                            value={excludeSearch}
                            onChange={(e) => setExcludeSearch(e.target.value)}
                            placeholder="Filter namespaces..."
                            className="w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm"
                          />
                        </div>
                        {filteredExcludeNamespaces.length === 0 ? (
                          <div className="px-3 py-2 text-xs text-text-secondary">No namespaces found.</div>
                        ) : (
                          filteredExcludeNamespaces.map((namespaceName) => {
                            const checked = scheduleForm.excludeNamespaces.includes(namespaceName);
                            return (
                              <button
                                key={namespaceName}
                                type="button"
                                onClick={() => toggleExcludeNamespace(namespaceName)}
                                className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-hover border-b border-border"
                              >
                                <Checkbox checked={checked} onChange={() => toggleExcludeNamespace(namespaceName)} />
                                <span>{namespaceName}</span>
                              </button>
                            );
                          })
                        )}
                      </div>
                    )}
                  </div>
                </label>
                <label className="inline-flex items-center gap-2 text-sm text-text-secondary">
                  <input
                    type="checkbox"
                    checked={scheduleForm.paused}
                    onChange={(e) => setScheduleForm((previous) => ({ ...previous, paused: e.target.checked }))}
                  />
                  Pause schedule
                </label>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleSaveSchedule}
                  disabled={isCreatingSchedule || isLoading}
                  className="px-4 py-2 rounded-lg border border-border bg-surface-elevated text-sm font-medium disabled:opacity-50"
                >
                  {isCreatingSchedule ? 'Saving...' : editingName ? 'Save Changes' : 'Create Scheduler'}
                </button>
                <button
                  type="button"
                  onClick={closePanel}
                  className="px-4 py-2 rounded-lg border border-border bg-surface text-sm font-medium"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </>
      )}

    </div>
  );
};
