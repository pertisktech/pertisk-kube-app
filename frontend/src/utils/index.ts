export const formatDate = (timestamp?: string | null): string => {
  if (!timestamp) return '-';
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return timestamp;
  return date.toLocaleString();
};

export const timeAgo = (timestamp?: string | null): string => {
  if (!timestamp) return '-';

  const trimmed = timestamp.trim();
  if (!trimmed) return '-';

  if (/^\d+\s*[smhdw]$/i.test(trimmed) || /ago$/i.test(trimmed)) {
    return trimmed;
  }

  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) return '-';

  const now = new Date();
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (!Number.isFinite(seconds) || seconds < 0) return '-';
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;

  return `${Math.floor(seconds / 604800)}w ago`;
};

export const getStatusColor = (
  status: string
): 'green' | 'yellow' | 'red' | 'gray' => {
  const lower = status?.toLowerCase() || '';
  
  // Success states
  if (
    lower === 'running' ||
    lower === 'active' ||
    lower === 'true' ||
    lower === 'ready' ||
    lower === 'available' ||
    lower === 'succeeded' ||
    lower === 'completed'
  )
    return 'green';
  
  // Warning states
  if (
    lower === 'pending' ||
    lower === 'unknown' ||
    lower === 'false' ||
    lower === 'progressing' ||
    lower === 'containercreating' ||
    lower === 'podinitialized' ||
    lower === 'terminating'
  )
    return 'yellow';
  
  // Error states
  if (
    lower === 'failed' ||
    lower === 'error' ||
    lower === 'crashed' ||
    lower === 'unavailable' ||
    lower === 'crashloopbackoff' ||
    lower === 'imagepullbackoff' ||
    lower === 'errimagepull' ||
    lower === 'createcontainerconfigerror' ||
    lower === 'invalidimagelink' ||
    lower === 'oomkilled' ||
    lower === 'terminated'
  )
    return 'red';
  
  return 'gray';
};

export const getStatusBgClass = (status: string): string => {
  const color = getStatusColor(status);
  const colorMap: Record<string, string> = {
    green: 'status-green',
    yellow: 'status-yellow',
    red: 'status-red',
    gray: 'status-gray',
  };
  return colorMap[color] || colorMap.gray;
};

export const truncateString = (str: string, length: number = 50): string => {
  if (str.length <= length) return str;
  return str.substring(0, length) + '...';
};

export const formatBytes = (bytes: number): string => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
};

export const cn = (...classes: (string | false | undefined)[]): string => {
  return classes.filter(Boolean).join(' ');
};
