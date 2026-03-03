export const formatDate = (timestamp: string): string => {
  try {
    const date = new Date(timestamp);
    return date.toLocaleString();
  } catch {
    return timestamp;
  }
};

export const timeAgo = (timestamp: string): string => {
  try {
    const date = new Date(timestamp);
    const now = new Date();
    const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (seconds < 60) return `${seconds}s ago`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;

    return `${Math.floor(seconds / 604800)}w ago`;
  } catch {
    return timestamp;
  }
};

export const getStatusColor = (
  status: string
): 'green' | 'yellow' | 'red' | 'gray' => {
  const lower = status?.toLowerCase() || '';
  if (lower === 'running' || lower === 'active' || lower === 'true' || lower === 'ready')
    return 'green';
  if (lower === 'pending' || lower === 'unknown' || lower === 'false')
    return 'yellow';
  if (lower === 'failed' || lower === 'error' || lower === 'crashed')
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
