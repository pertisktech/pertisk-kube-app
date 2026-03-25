import { useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Box, FileText, Upload, RotateCw, ArrowUp, ArrowDown } from './Icons';
import { downloadPodPath, getPodFiles, uploadPodFiles } from '../hooks/useKubernetes';

type LocalQueuedFile = {
  id: string;
  file: File;
  relativePath: string;
};

interface PodFileTransferProps {
  namespace: string;
  podName: string;
  containerName?: string;
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

const normalizeRelativePath = (file: File): string => {
  const maybeWithWebkit = file as File & { webkitRelativePath?: string };
  const fromFolder = maybeWithWebkit.webkitRelativePath?.trim();
  if (fromFolder) return fromFolder;
  return file.name;
};

const splitSegments = (value: string): string[] =>
  value
    .split('/')
    .map((s) => s.trim())
    .filter(Boolean);

const normalizeUploadPathForDestination = (relativePath: string, destination: string): string => {
  const rel = splitSegments(relativePath.replace(/\\/g, '/'));
  if (rel.length === 0) return 'file';

  const dest = splitSegments(destination);
  if (dest.length === 0 || rel.length <= dest.length) {
    return rel.join('/');
  }

  const hasDestPrefix = dest.every((segment, index) => rel[index] === segment);
  if (!hasDestPrefix) {
    return rel.join('/');
  }

  return rel.slice(dest.length).join('/');
};

const allFolderPathsFromRelativePath = (relativePath: string): string[] => {
  const segments = splitSegments(relativePath.replace(/\\/g, '/'));
  if (segments.length <= 1) return [];

  const folders: string[] = [];
  for (let i = 1; i < segments.length; i += 1) {
    folders.push(segments.slice(0, i).join('/'));
  }
  return folders;
};

const parentPath = (path: string): string => {
  if (path === '/') return '/';
  const parts = path.split('/').filter(Boolean);
  parts.pop();
  return `/${parts.join('/')}` || '/';
};

export const PodFileTransfer = ({ namespace, podName, containerName }: PodFileTransferProps) => {
  const [remotePath, setRemotePath] = useState('/');
  const [queuedFiles, setQueuedFiles] = useState<LocalQueuedFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [dropUploading, setDropUploading] = useState(false);
  const [downloadingPath, setDownloadingPath] = useState<string | null>(null);
  const [isRemoteDropActive, setIsRemoteDropActive] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  const { data: remoteItems = [], isLoading, error, refetch } = useQuery({
    queryKey: ['pod-files', namespace, podName, containerName ?? '', remotePath],
    queryFn: () => getPodFiles(namespace, podName, remotePath, containerName),
    refetchOnWindowFocus: false,
  });

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

  const localFolders = useMemo(() => {
    const set = new Set<string>();
    queuedFiles.forEach((q) => {
      allFolderPathsFromRelativePath(q.relativePath).forEach((folder) => set.add(folder));
    });
    return Array.from(set.values()).sort((a, b) => a.localeCompare(b));
  }, [queuedFiles]);

  const addFilesToQueue = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setQueuedFiles((prev) => {
      const map = new Map(prev.map((f) => [f.id, f]));
      Array.from(files).forEach((file) => {
        const relativePath = normalizeRelativePath(file);
        const id = `${relativePath}:${file.size}:${file.lastModified}`;
        map.set(id, { id, file, relativePath });
      });
      return Array.from(map.values()).sort((a, b) => a.relativePath.localeCompare(b.relativePath));
    });
  };

  const uploadQueued = async () => {
    if (queuedFiles.length === 0) {
      toast.error('Choose files or folder first.');
      return;
    }

    setUploading(true);
    try {
      await uploadPodFiles(
        namespace,
        podName,
        remotePath,
        queuedFiles.map((q) => ({
          file: q.file,
          relativePath: normalizeUploadPathForDestination(q.relativePath, remotePath),
        })),
        containerName,
      );
      toast.success(`Uploaded ${queuedFiles.length} item(s) to ${remotePath}`);
      setQueuedFiles([]);
      await refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const uploadDropped = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    const payload = Array.from(files).map((file) => ({
      file,
      relativePath: normalizeUploadPathForDestination(normalizeRelativePath(file), remotePath),
    }));

    setDropUploading(true);
    try {
      await uploadPodFiles(namespace, podName, remotePath, payload, containerName);
      toast.success(`Uploaded ${payload.length} item(s) to ${remotePath}`);
      await refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setDropUploading(false);
    }
  };

  const triggerDownload = async (path: string) => {
    setDownloadingPath(path);
    try {
      const { blob, filename } = await downloadPodPath(namespace, podName, path, containerName);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success(`Downloaded ${filename}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Download failed');
    } finally {
      setDownloadingPath(null);
    }
  };

  return (
    <div className="h-full min-h-0 flex flex-col bg-surface-elevated">
      <div className="px-3 py-2 border-b border-border text-xs text-text-secondary flex items-center gap-2">
        <span className="font-medium">Pod files</span>
        <span>{namespace}/{podName}</span>
        {containerName && <span>container: {containerName}</span>}
      </div>

      <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-2 gap-3 p-3 overflow-hidden">
        <section className="min-h-0 border border-border rounded-lg bg-surface flex flex-col overflow-hidden">
          <div className="px-3 py-2 border-b border-border flex items-center justify-between">
            <span className="text-sm font-medium text-text">Local files</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="px-2 py-1 text-xs rounded border border-border text-text hover:bg-hover"
              >
                Add files
              </button>
              <button
                type="button"
                onClick={() => folderInputRef.current?.click()}
                className="px-2 py-1 text-xs rounded border border-border text-text hover:bg-hover"
              >
                Add folder
              </button>
              <button
                type="button"
                onClick={() => setQueuedFiles([])}
                className="px-2 py-1 text-xs rounded border border-border text-text-secondary hover:bg-hover"
              >
                Clear
              </button>
            </div>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => addFilesToQueue(e.target.files)}
          />
          <input
            ref={folderInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => addFilesToQueue(e.target.files)}
            {...({ webkitdirectory: 'true', directory: 'true' } as Record<string, string>)}
          />

          <div
            className="flex-1 min-h-0 overflow-auto p-2"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              addFilesToQueue(e.dataTransfer.files);
            }}
          >
            {queuedFiles.length === 0 ? (
              <div className="h-full border border-dashed border-border rounded-md flex items-center justify-center text-xs text-text-secondary px-4 text-center">
                Drop files/folders here, or choose from buttons above.
              </div>
            ) : (
              <div className="space-y-2">
                {localFolders.length > 0 && (
                  <div className="space-y-1">
                    <div className="px-2 text-[11px] font-medium uppercase tracking-wide text-text-secondary">Folders</div>
                    {localFolders.map((folder) => (
                      <div key={`folder:${folder}`} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-hover">
                        <Box size={13} className="text-primary flex-shrink-0" />
                        <span className="truncate text-xs text-text">{folder}</span>
                      </div>
                    ))}
                  </div>
                )}

                <div className="space-y-1">
                  <div className="px-2 text-[11px] font-medium uppercase tracking-wide text-text-secondary">Files</div>
                  {queuedFiles.map((qf) => (
                    <div key={qf.id} className="flex items-center justify-between gap-2 px-2 py-1.5 rounded hover:bg-hover">
                      <div className="min-w-0 flex items-center gap-2 text-xs text-text">
                        <FileText size={13} className="text-text-secondary flex-shrink-0" />
                        <span className="truncate">{qf.relativePath}</span>
                      </div>
                      <span className="text-[11px] text-text-secondary flex-shrink-0">{formatBytes(qf.file.size)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="px-3 py-2 border-t border-border flex items-center justify-between">
            <span className="text-xs text-text-secondary">{queuedFiles.length} queued</span>
            <button
              type="button"
              onClick={() => void uploadQueued()}
              disabled={uploading || queuedFiles.length === 0}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded bg-primary text-white disabled:opacity-50"
            >
              <Upload size={12} />
              {uploading ? 'Uploading...' : 'Upload to pod'}
            </button>
          </div>
        </section>

        <section
          className={`min-h-0 border rounded-lg bg-surface flex flex-col overflow-hidden ${isRemoteDropActive ? 'border-primary' : 'border-border'}`}
          onDragOver={(e) => {
            e.preventDefault();
            setIsRemoteDropActive(true);
          }}
          onDragLeave={() => setIsRemoteDropActive(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsRemoteDropActive(false);
            void uploadDropped(e.dataTransfer.files);
          }}
        >
          <div className="px-3 py-2 border-b border-border flex items-center justify-between gap-2">
            <div className="min-w-0 flex items-center gap-1 overflow-x-auto">
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
                onClick={() => void triggerDownload(remotePath)}
                title="Download current directory"
                disabled={downloadingPath === remotePath}
                className="p-1 rounded hover:bg-hover text-text-secondary disabled:opacity-50"
              >
                <ArrowDown size={13} />
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

          <div className="flex-1 min-h-0 overflow-auto p-2">
            {error ? (
              <div className="text-xs text-red-500 px-2 py-1">{error instanceof Error ? error.message : 'Failed to load pod files'}</div>
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
                {remoteItems.length === 0 && (
                  <div className="text-xs text-text-secondary px-2 py-1">Directory is empty.</div>
                )}
                {remoteItems.map((item) => (
                  <div
                    key={`${item.path}:${item.is_dir ? 'd' : 'f'}`}
                    className="w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded hover:bg-hover"
                  >
                    <button
                      type="button"
                      onClick={() => {
                        if (item.is_dir) {
                          setRemotePath(item.path);
                        }
                      }}
                      className="min-w-0 flex items-center gap-2 text-xs text-text text-left"
                    >
                      {item.is_dir ? (
                        <Box size={13} className="text-primary flex-shrink-0" />
                      ) : (
                        <FileText size={13} className="text-text-secondary flex-shrink-0" />
                      )}
                      <span className="truncate">{item.name}</span>
                    </button>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="text-[11px] text-text-secondary">
                        {item.is_dir ? 'dir' : formatBytes(item.size)}
                      </span>
                      <button
                        type="button"
                        onClick={() => void triggerDownload(item.path)}
                        title={`Download ${item.name}`}
                        disabled={downloadingPath === item.path}
                        className="p-1 rounded hover:bg-hover text-text-secondary disabled:opacity-50"
                      >
                        <ArrowDown size={12} />
                      </button>
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>

          <div className="px-3 py-2 border-t border-border text-xs text-text-secondary">
            {dropUploading ? 'Uploading dropped items...' : 'Drop files/folders here to upload to current pod path'}
          </div>
        </section>
      </div>
    </div>
  );
};
