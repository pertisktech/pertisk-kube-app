import { useEffect, useRef, useState } from 'react';
import { getDesktopSidecarLogs } from '../utils/tauriDesktop';

interface Props {
  open: boolean;
  onClose: () => void;
}

export function SidecarLogsPanel({ open, onClose }: Props) {
  const [logs, setLogs] = useState<string[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [filter, setFilter] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = () => {
    void getDesktopSidecarLogs()
      .then((nextLogs) => {
        setLogs(nextLogs);
        setLoadError(null);
      })
      .catch((err) => {
        const message = err instanceof Error ? err.message : String(err);
        setLoadError(message);
      });
  };

  useEffect(() => {
    if (!open) return;
    refresh();
    intervalRef.current = setInterval(refresh, 1500);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [open]);

  useEffect(() => {
    if (autoScroll && open) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, autoScroll, open]);

  if (!open) return null;

  const q = filter.toLowerCase();
  const visible = q ? logs.filter((l) => l.toLowerCase().includes(q)) : logs;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50" onClick={onClose}>
      <div
        className="w-full max-w-5xl h-[60vh] bg-surface border border-border rounded-t-xl flex flex-col shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-border shrink-0">
          <span className="text-sm font-semibold text-text">Backend Logs</span>
          <div className="flex items-center gap-3">
            <input
              type="text"
              placeholder="Filter..."
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="rounded border border-border bg-bg px-2 py-1 text-xs text-text w-40"
            />
            <label className="flex items-center gap-1 text-xs text-text-secondary cursor-pointer select-none">
              <input
                type="checkbox"
                checked={autoScroll}
                onChange={(e) => setAutoScroll(e.target.checked)}
                className="accent-primary"
              />
              Auto-scroll
            </label>
            <button
              type="button"
              onClick={refresh}
              className="text-xs text-text-secondary hover:text-text px-2 py-1 rounded border border-border"
            >
              Refresh
            </button>
            <button
              type="button"
              onClick={onClose}
              className="text-xs text-text-secondary hover:text-text px-2 py-1 rounded border border-border"
            >
              Close
            </button>
          </div>
        </div>

        {/* Log body */}
        <div className="flex-1 overflow-auto font-mono text-xs p-3 space-y-0.5 bg-bg">
          {loadError ? (
            <p className="text-red-400">Failed to load logs: {loadError}</p>
          ) : null}
          {visible.length === 0 ? (
            <p className="text-text-secondary italic">No log entries yet.</p>
          ) : (
            visible.map((line, i) => {
              const isErr = line.includes('[err]') || line.toLowerCase().includes('error') || line.toLowerCase().includes('panic');
              const isWarn = line.toLowerCase().includes('warn');
              return (
                <div
                  key={i}
                  className={
                    isErr
                      ? 'text-red-400 whitespace-pre min-w-max'
                      : isWarn
                      ? 'text-yellow-400 whitespace-pre min-w-max'
                      : 'text-text-secondary whitespace-pre min-w-max'
                  }
                >
                  {line}
                </div>
              );
            })
          )}
          <div ref={bottomRef} />
        </div>
      </div>
    </div>
  );
}
