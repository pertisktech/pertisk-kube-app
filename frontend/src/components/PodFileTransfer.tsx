import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { Folder, FileText, RotateCw, ArrowUp, ArrowDown, HardDrive, Server } from './Icons';
import { getPodFiles, getPodPathDownloadUrl, uploadPodFiles, usePods } from '../hooks/useKubernetes';

const nativeDownload = async (url: string, filename: string): Promise<void> => {
  if (isTauri()) {
    const safeName = filename.replace(/\//g, '_');
    try {
      const home = await invoke<string>('get_home_directory');
      const localPath = `${home}/Downloads/${safeName}`;
      const savedPath = await invoke<string>('save_pod_file', { url, localPath });
      toast.success(`Saved to ${savedPath}`);
      return;
    } catch (err) {
      // Fallback: open in system browser so user still gets a local download flow.
      try {
        await invoke('open_external_url', { url });
        toast.success('Opened download in browser');
        return;
      } catch {
        throw err;
      }
    }
  } else {
    // Fallback for browser dev mode
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.rel = 'noopener';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    toast.success('Download started');
  }
};

type LocalFileEntry = {
  name: string;
  path: string;
  is_dir: boolean;
  size: number;
};

type LocalFilePayload = {
  name: string;
  path: string;
  contentBase64: string;
};

interface PodFileTransferProps {
  namespace: string;
  podName: string;
  containerName?: string;
  onPodReplaced?: (newPodName: string) => void;
}

const formatBytes = (bytes: number): string => {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let idx = 0;
  while (value >= 1024 && idx < units.length - 1) {
    value /= 1024;
    idx += 1;
  }
  return `${value >= 10 ? value.toFixed(1) : value.toFixed(2)} ${units[idx]}`;
};

const parentPath = (path: string): string => {
  if (path === '/') return '/';
  const parts = path.split('/').filter(Boolean);
  parts.pop();
  return `/${parts.join('/')}` || '/';
};

const parentLocalPath = (path: string): string => {
  if (!path || path === '/') return '/';
  const trimmed = path.endsWith('/') && path.length > 1 ? path.slice(0, -1) : path;
  const idx = trimmed.lastIndexOf('/');
  if (idx <= 0) return '/';
  return trimmed.slice(0, idx);
};

const base64ToFile = (base64: string, name: string): File => {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new File([bytes], name);
};

const matchesFilter = (value: string, filter: string): boolean => {
  if (!filter.trim()) return true;
  return value.toLowerCase().includes(filter.trim().toLowerCase());
};

const sortEntries = <T extends { is_dir: boolean; name: string }>(entries: T[]): T[] => {
  return [...entries].sort((a, b) => {
    if (a.is_dir !== b.is_dir) return a.is_dir ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
};

const podRolloutPrefix = (name: string): string => {
  const idx = name.lastIndexOf('-');
  if (idx <= 0) return name;
  return name.slice(0, idx);
};

const podWorkloadPrefix = (name: string): string => {
  const parts = name.split('-').filter(Boolean);
  if (parts.length <= 2) return name;
  return parts.slice(0, -2).join('-');
};

const createdAt = (value?: string): number => {
  if (!value) return 0;
  const ts = Date.parse(value);
  return Number.isNaN(ts) ? 0 : ts;
};

export const PodFileTransfer = ({ namespace, podName, containerName, onPodReplaced }: PodFileTransferProps) => {
  const [remotePath, setRemotePath] = useState('/');
  const [selectedRemotePaths, setSelectedRemotePaths] = useState<Set<string>>(new Set());
  const [selectedLocalPaths, setSelectedLocalPaths] = useState<Set<string>>(new Set());
  const [localFilter, setLocalFilter] = useState('');
  const [remoteFilter, setRemoteFilter] = useState('');
  const [localPath, setLocalPath] = useState('');
  const [localEntries, setLocalEntries] = useState<LocalFileEntry[]>([]);
  const [localLoading, setLocalLoading] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [downloadStatus, setDownloadStatus] = useState<string | null>(null);
  const [recoveringPod, setRecoveringPod] = useState(false);
  const staleRecoveryAttempted = useRef(false);
  const staleRetryAttempted = useRef(false);
  const lastKnownController = useRef<string | null>(null);

  const { data: pods = [] } = usePods();

  const loadLocalDirectory = async (path: string) => {
    if (!isTauri()) {
      setLocalError('Local filesystem browsing is available in desktop app.');
      return;
    }
    setLocalLoading(true);
    setLocalError(null);
    try {
      const entries = await invoke<LocalFileEntry[]>('list_local_directory', { path });
      setLocalEntries(entries);
      setLocalPath(path);
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Failed to list local directory');
    } finally {
      setLocalLoading(false);
    }
  };

  useEffect(() => {
    if (!isTauri()) return;
    const init = async () => {
      try {
        const home = await invoke<string>('get_home_directory');
        await loadLocalDirectory(home);
      } catch {
        setLocalError('Failed to load local home directory');
      }
    };
    void init();
  }, []);

  useEffect(() => {
    const valid = new Set(localEntries.map((e) => e.path));
    setSelectedLocalPaths((prev) => new Set(Array.from(prev).filter((p) => valid.has(p))));
  }, [localEntries]);

  const { data: remoteItems = [], isLoading, error, refetch } = useQuery({
    queryKey: ['pod-files', namespace, podName, containerName ?? '', remotePath],
    queryFn: () => getPodFiles(namespace, podName, remotePath, containerName),
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    const valid = new Set(remoteItems.map((e) => e.path));
    setSelectedRemotePaths((prev) => new Set(Array.from(prev).filter((p) => valid.has(p))));
  }, [remoteItems]);

  const breadcrumb = useMemo(() => {
    const parts = remotePath.split('/').filter(Boolean);
    const out: Array<{ label: string; path: string }> = [{ label: '/', path: '/' }];
    let running = '';
    parts.forEach((p) => {
      running += `/${p}`;
      out.push({ label: p, path: running });
    });
    return out;
  }, [remotePath]);

  const visibleLocalEntries = useMemo(
    () => sortEntries(localEntries).filter((entry) => matchesFilter(entry.name, localFilter)),
    [localEntries, localFilter]
  );

  const visibleRemoteItems = useMemo(
    () => sortEntries(remoteItems).filter((item) => matchesFilter(item.name, remoteFilter)),
    [remoteItems, remoteFilter]
  );

  const stalePodError =
    error instanceof Error &&
    /no longer exists|replaced during a restart or rollout|changed during restart\/rollout|pod[s]?\s+"[^"]+"\s+not\s+found/i.test(error.message);

  const namespacePods = useMemo(
    () =>
      pods
        .filter((pod) => pod.namespace === namespace)
        .sort((a, b) => {
          const byCreated = createdAt(b.created) - createdAt(a.created);
          if (byCreated !== 0) return byCreated;
          return b.name.localeCompare(a.name);
        }),
    [pods, namespace]
  );

  useEffect(() => {
    const current = namespacePods.find((p) => p.name === podName);
    if (current?.controlled_by) {
      lastKnownController.current = current.controlled_by;
    }
  }, [namespacePods, podName]);

  useEffect(() => {
    staleRecoveryAttempted.current = false;
    staleRetryAttempted.current = false;
    setRecoveringPod(false);
  }, [namespace, podName]);

  useEffect(() => {
    if (!stalePodError || staleRetryAttempted.current) return;
    const currentPodStillExists = pods.some((p) => p.namespace === namespace && p.name === podName);
    if (!currentPodStillExists) return;

    staleRetryAttempted.current = true;
    const t = window.setTimeout(() => {
      void refetch();
    }, 350);
    return () => window.clearTimeout(t);
  }, [stalePodError, pods, namespace, podName, refetch]);

  useEffect(() => {
    if (!stalePodError || staleRecoveryAttempted.current || !onPodReplaced) return;

    const rolloutPrefix = podRolloutPrefix(podName);
    const workloadPrefix = podWorkloadPrefix(podName);
    const candidates = namespacePods
      .filter((pod) => pod.name !== podName)
      .filter((pod) => {
        if (lastKnownController.current && pod.controlled_by === lastKnownController.current) return true;
        if (pod.name.startsWith(`${rolloutPrefix}-`)) return true;
        if (workloadPrefix && pod.name.startsWith(`${workloadPrefix}-`)) return true;
        return false;
      });

    // Fallback for basic workloads: if namespace has a single current pod, switch to it.
    if (candidates.length === 0 && namespacePods.length === 1 && namespacePods[0].name !== podName) {
      staleRecoveryAttempted.current = true;
      setRecoveringPod(true);
      toast.info(`Pod restarted. Switched to ${namespacePods[0].name}`);
      onPodReplaced(namespacePods[0].name);
      return;
    }

    if (candidates.length === 0) return;

    const next = candidates[0];
    staleRecoveryAttempted.current = true;
    setRecoveringPod(true);
    toast.info(`Pod restarted. Switched to ${next.name}`);
    onPodReplaced(next.name);
  }, [stalePodError, namespacePods, namespace, podName, onPodReplaced]);

  const uploadSelectedLocal = async () => {
    if (selectedLocalPaths.size === 0) {
      toast.error('Select local files first.');
      return;
    }

    const selectedFiles = localEntries.filter((e) => selectedLocalPaths.has(e.path) && !e.is_dir);
    if (selectedFiles.length === 0) {
      toast.error('Selected items are folders. Select file(s) to upload.');
      return;
    }

    try {
      const payloads = await invoke<LocalFilePayload[]>('read_local_files', {
        paths: selectedFiles.map((f) => f.path),
      });
      const uploadPayload = payloads.map((item) => ({
        file: base64ToFile(item.contentBase64, item.name),
        relativePath: item.name,
      }));

      setUploading(true);
      await uploadPodFiles(namespace, podName, remotePath, uploadPayload, containerName);
      toast.success(`Uploaded ${uploadPayload.length} item(s) to ${remotePath}`);
      await refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to upload selected local files');
    } finally {
      setUploading(false);
    }
  };

  const triggerDownload = (path: string, suggestedName?: string) => {
    const url = getPodPathDownloadUrl(namespace, podName, path, containerName);
    const filename = suggestedName || path.split('/').filter(Boolean).pop() || 'download.bin';
    setDownloadStatus(`Downloading ${filename}...`);
    nativeDownload(url, filename).catch((err) => {
      setDownloadStatus(`Download failed: ${err instanceof Error ? err.message : 'unknown error'}`);
      toast.error(err instanceof Error ? err.message : 'Download failed');
    }).then(() => {
      setDownloadStatus((prev) => (prev?.startsWith('Download failed') ? prev : `Downloaded ${filename}`));
    });
  };

  const downloadSelectedRemote = () => {
    if (selectedRemotePaths.size === 0) {
      toast.error('Select pod files first.');
      return;
    }
    const selectedItems = remoteItems.filter((item) => selectedRemotePaths.has(item.path));
    selectedItems.forEach((item) => {
      triggerDownload(item.path, item.is_dir ? `${item.name}.tar.gz` : item.name);
    });
  };

  return (
    <div className="pod-transfer-shell h-full min-h-0 flex flex-col">
      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] gap-3 p-3 overflow-hidden">
        <section className="min-h-0 border border-border rounded-xl bg-surface flex flex-col overflow-hidden shadow-sm">
          <div className="px-3 py-2 border-b border-border flex items-center justify-between gap-2">
            <span className="text-sm font-medium text-text inline-flex items-center gap-1.5">
              <HardDrive size={14} className="text-primary" />
              Local Files
            </span>
            <span className="text-[11px] text-text-secondary">{selectedLocalPaths.size} selected</span>
          </div>

          <div className="flex-1 min-h-0 p-2 flex flex-col gap-2">
            <div className="border border-border rounded-md overflow-hidden min-h-0 flex flex-col">
              <div className="px-2 py-1.5 border-b border-border flex items-center gap-2 bg-surface-elevated/40">
                <button
                  type="button"
                  onClick={() => void loadLocalDirectory(parentLocalPath(localPath))}
                  disabled={!localPath || localPath === '/' || localLoading || !isTauri()}
                  className="p-1 rounded hover:bg-hover text-text-secondary disabled:opacity-50"
                  title="Go up"
                >
                  <ArrowUp size={12} />
                </button>
                <button
                  type="button"
                  onClick={() => void loadLocalDirectory(localPath)}
                  disabled={!localPath || localLoading || !isTauri()}
                  className="p-1 rounded hover:bg-hover text-text-secondary disabled:opacity-50"
                  title="Refresh local"
                >
                  <RotateCw size={12} />
                </button>
                <div className="min-w-0 text-[11px] text-text-secondary truncate" title={localPath || 'Local path'}>
                  {localPath || 'Local path'}
                </div>
              </div>
              <div className="px-2 py-1.5 border-b border-border">
                <input
                  type="text"
                  value={localFilter}
                  onChange={(e) => setLocalFilter(e.target.value)}
                  className="w-full rounded-md border border-border bg-surface px-2 py-1 text-xs text-text placeholder:text-text-secondary/70 outline-none focus:border-primary/70"
                  placeholder="Filter local files..."
                />
              </div>
              <div className="flex-1 min-h-0 overflow-auto p-1">
                {!isTauri() ? (
                  <div className="text-xs text-text-secondary px-2 py-2">Open desktop app to browse local filesystem.</div>
                ) : localError ? (
                  <div className="text-xs text-red-500 px-2 py-2">{localError}</div>
                ) : localLoading ? (
                  <div className="text-xs text-text-secondary px-2 py-2">Loading local files...</div>
                ) : visibleLocalEntries.length === 0 ? (
                  <div className="text-xs text-text-secondary px-2 py-2">Directory is empty.</div>
                ) : (
                  visibleLocalEntries.map((entry) => (
                    <div
                      key={`local:${entry.path}`}
                      role="button"
                      tabIndex={0}
                      onClick={() => {
                        if (entry.is_dir) {
                          void loadLocalDirectory(entry.path);
                        }
                      }}
                      onKeyDown={(e) => {
                        if ((e.key === 'Enter' || e.key === ' ') && entry.is_dir) {
                          e.preventDefault();
                          void loadLocalDirectory(entry.path);
                        }
                      }}
                      className="w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded border border-transparent hover:border-border hover:bg-hover text-left transition-colors"
                      title={entry.path}
                    >
                      <span className="min-w-0 flex items-center gap-2 text-xs text-text">
                        <input
                          type="checkbox"
                          className="h-5 w-5 accent-primary rounded cursor-pointer"
                          checked={selectedLocalPaths.has(entry.path)}
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) => {
                            setSelectedLocalPaths((prev) => {
                              const next = new Set(prev);
                              if (e.target.checked) next.add(entry.path);
                              else next.delete(entry.path);
                              return next;
                            });
                          }}
                        />
                        {entry.is_dir ? (
                          <Folder size={14} className="text-primary flex-shrink-0" />
                        ) : (
                          <FileText size={13} className="text-text-secondary flex-shrink-0" />
                        )}
                        <span className="truncate font-medium">{entry.name}</span>
                      </span>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="text-[11px] text-text-secondary">{entry.is_dir ? '--' : formatBytes(entry.size)}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
              <div className="px-2 py-1 border-t border-border flex items-center justify-between gap-2">
                <span className="text-[11px] text-text-secondary">{visibleLocalEntries.length} visible</span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    className="px-2 py-1 text-[11px] rounded border border-border text-text hover:bg-hover"
                    onClick={() => {
                      const all = new Set(visibleLocalEntries.map((e) => e.path));
                      const allSelected = visibleLocalEntries.length > 0 && visibleLocalEntries.every((e) => selectedLocalPaths.has(e.path));
                      setSelectedLocalPaths(allSelected ? new Set() : all);
                    }}
                  >
                    {visibleLocalEntries.length > 0 && visibleLocalEntries.every((e) => selectedLocalPaths.has(e.path)) ? 'Clear' : 'Select visible'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="min-h-0 flex items-center justify-center">
          <div className="transfer-actions-panel flex lg:flex-col flex-row gap-2 rounded-xl border border-border bg-surface p-2 shadow-sm">
            <button
              type="button"
              onClick={() => void uploadSelectedLocal()}
              disabled={uploading || selectedLocalPaths.size === 0}
              className="px-3 py-2 text-sm rounded-md border border-border text-text hover:bg-hover disabled:opacity-50 inline-flex items-center gap-1.5"
              title="Upload selected local files to pod"
            >
              <ArrowUp size={14} className="text-primary" />
              <span className="text-xs">Upload to Pod</span>
            </button>
            <button
              type="button"
              onClick={downloadSelectedRemote}
              disabled={selectedRemotePaths.size === 0}
              className="px-3 py-2 text-sm rounded-md border border-border text-text hover:bg-hover disabled:opacity-50 inline-flex items-center gap-1.5"
              title="Download selected pod files to local"
            >
              <ArrowDown size={14} className="text-primary" />
              <span className="text-xs">Download to Local</span>
            </button>
          </div>
        </section>

        <section className="min-h-0 border rounded-xl bg-surface flex flex-col overflow-hidden border-border shadow-sm">
          <div className="px-3 py-2 border-b border-border flex items-center justify-between gap-2">
            <div className="min-w-0 flex items-center gap-1 overflow-x-auto">
              <span className="text-sm font-medium text-text inline-flex items-center gap-1.5 mr-2">
                <Server size={14} className="text-primary" />
                Pod Files
              </span>
              {breadcrumb.map((b, idx) => (
                <button
                  key={b.path}
                  type="button"
                  onClick={() => setRemotePath(b.path)}
                  className="text-xs text-text-secondary hover:text-text whitespace-nowrap"
                >
                  {idx === 0 ? '/' : `${b.label}/`}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setRemotePath('/')}
                className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded border border-border text-text hover:bg-hover"
                title="Go to root directory"
              >
                /
              </button>
              <button
                type="button"
                onClick={() => {
                  const currentPaths = visibleRemoteItems.map((item) => item.path);
                  const allSelected = currentPaths.length > 0 && currentPaths.every((p) => selectedRemotePaths.has(p));
                  setSelectedRemotePaths(allSelected ? new Set() : new Set(currentPaths));
                }}
                className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded border border-border text-text hover:bg-hover"
                title="Select all items in current pod path"
              >
                {visibleRemoteItems.length > 0 && visibleRemoteItems.every((item) => selectedRemotePaths.has(item.path)) ? 'Clear' : 'Select visible'}
              </button>
              <button
                type="button"
                onClick={() => void refetch()}
                title="Refresh"
                className="p-1 rounded hover:bg-hover text-text-secondary"
              >
                <RotateCw size={13} />
              </button>
            </div>
          </div>
          <div className="px-2 py-1.5 border-b border-border">
            <input
              type="text"
              value={remoteFilter}
              onChange={(e) => setRemoteFilter(e.target.value)}
              className="w-full rounded-md border border-border bg-surface px-2 py-1 text-xs text-text placeholder:text-text-secondary/70 outline-none focus:border-primary/70"
              placeholder="Filter pod files..."
            />
          </div>

          <div className="flex-1 min-h-0 overflow-auto p-2">
            {error ? (
              <div className="text-xs px-2 py-2 rounded border border-border bg-surface-elevated text-text-secondary">
                {recoveringPod
                  ? 'Pod restarted. Switching to replacement pod...'
                  : stalePodError
                  ? 'Pod changed during restart. Pick an available pod below or wait for auto-switch.'
                  : error instanceof Error
                    ? error.message
                    : 'Failed to load pod files'}
                {stalePodError && !recoveringPod && onPodReplaced && namespacePods.length > 0 && (
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    {namespacePods.slice(0, 8).map((pod) => (
                      <button
                        key={pod.name}
                        type="button"
                        onClick={() => onPodReplaced(pod.name)}
                        className="px-2 py-1 text-[11px] rounded border border-border bg-surface text-text hover:bg-hover"
                        title={`Switch to ${pod.name}`}
                      >
                        {pod.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : isLoading ? (
              <div className="text-xs text-text-secondary px-2 py-1">Loading...</div>
            ) : (
              <>
                {remotePath !== '/' && (
                  <button
                    type="button"
                    onClick={() => setRemotePath(parentPath(remotePath))}
                    className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-hover text-xs text-text-secondary"
                  >
                    <ArrowUp size={13} />
                    ..
                  </button>
                )}
                {visibleRemoteItems.length === 0 && (
                  <div className="text-xs text-text-secondary px-2 py-1">Directory is empty.</div>
                )}
                {visibleRemoteItems.map((item) => (
                  <div
                    key={`${item.path}:${item.is_dir ? 'd' : 'f'}`}
                    role="button"
                    tabIndex={0}
                    onClick={() => {
                      if (item.is_dir) {
                        setRemotePath(item.path);
                      }
                    }}
                    onKeyDown={(e) => {
                      if ((e.key === 'Enter' || e.key === ' ') && item.is_dir) {
                        e.preventDefault();
                        setRemotePath(item.path);
                      }
                    }}
                    className="w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded border border-transparent hover:border-border hover:bg-hover transition-colors"
                    title="Select item, then use Download to Local"
                  >
                    <div className="min-w-0 flex items-center gap-2 text-xs text-text text-left">
                      <input
                        type="checkbox"
                        className="h-5 w-5 accent-primary rounded cursor-pointer"
                        checked={selectedRemotePaths.has(item.path)}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => {
                          setSelectedRemotePaths((prev) => {
                            const next = new Set(prev);
                            if (e.target.checked) next.add(item.path);
                            else next.delete(item.path);
                            return next;
                          });
                        }}
                      />
                      {item.is_dir ? (
                        <Folder size={14} className="text-primary flex-shrink-0" />
                      ) : (
                        <FileText size={13} className="text-text-secondary flex-shrink-0" />
                      )}
                      <span className="truncate font-medium">{item.name}</span>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="text-[11px] text-text-secondary">{item.is_dir ? '--' : formatBytes(item.size)}</span>
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>

          <div className="px-3 py-2 border-t border-border text-xs text-text-secondary flex items-center justify-between gap-2">
            <span>{`${selectedRemotePaths.size} selected in pod`}</span>
            <span className="truncate">{downloadStatus || ''}</span>
          </div>
        </section>
      </div>
    </div>
  );
};
