import { useEffect, useRef } from 'react';
import { toast } from 'react-toastify';
import { useBackupOverview } from '../hooks/useKubernetes';

const START_PHASES = new Set(['new', 'inprogress', 'running', 'pending']);
const SUCCESS_END_PHASES = new Set(['completed', 'succeeded']);
const ERROR_END_PHASES = new Set(['failed', 'partiallyfailed', 'error', 'canceled', 'cancelled']);

const normalizePhase = (phase: string | undefined): string =>
  (phase || '').toLowerCase().replace(/\s+/g, '');

export const BackupLifecycleToaster = () => {
  const { data } = useBackupOverview({ enabled: true, refetchInterval: 15000 });
  const previousPhasesRef = useRef<Map<string, string>>(new Map());
  const initializedRef = useRef(false);

  useEffect(() => {
    if (!data) return;

    const backups = data?.backups ?? [];
    const currentPhases = new Map<string, string>(
      backups.map((backup) => [backup.name, normalizePhase(backup.phase)]),
    );

    // Prime cache on first load to avoid replaying historical backups as notifications.
    if (!initializedRef.current) {
      previousPhasesRef.current = currentPhases;
      initializedRef.current = true;
      return;
    }

    for (const backup of backups) {
      const current = normalizePhase(backup.phase);
      const hasPrevious = previousPhasesRef.current.has(backup.name);
      const previous = previousPhasesRef.current.get(backup.name) || '';

      if (previous === current) continue;

      // Scheduler runs can appear directly as completed/failed in one poll cycle.
      // In that case, emit both start and end notifications so users still get lifecycle feedback.
      if (!hasPrevious) {
        if (SUCCESS_END_PHASES.has(current)) {
          toast(`Backup started: ${backup.name}`);
          toast.success(`Backup completed: ${backup.name}`);
          continue;
        }
        if (ERROR_END_PHASES.has(current)) {
          toast(`Backup started: ${backup.name}`);
          toast.error(`Backup failed: ${backup.name}`);
          continue;
        }
      }

      if ((!previous || !START_PHASES.has(previous)) && START_PHASES.has(current)) {
        toast(`Backup started: ${backup.name}`);
        continue;
      }

      if (START_PHASES.has(previous) && SUCCESS_END_PHASES.has(current)) {
        toast.success(`Backup completed: ${backup.name}`);
        continue;
      }

      if (START_PHASES.has(previous) && ERROR_END_PHASES.has(current)) {
        toast.error(`Backup failed: ${backup.name}`);
      }
    }

    previousPhasesRef.current = currentPhases;
  }, [data]);

  return null;
};
