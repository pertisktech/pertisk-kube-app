export const formatDate = (timestamp?: string | null): string => {
  if (!timestamp) return '-';
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return timestamp;
  return date.toLocaleString();
};

const formatCompactAge = (seconds: number): string => {
  if (seconds < 60) return `${seconds}s`;

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (seconds < 3600) {
    return remainingSeconds > 0 ? `${minutes}m${remainingSeconds}s` : `${minutes}m`;
  }

  const hours = Math.floor(seconds / 3600);
  const remainingMinutes = Math.floor((seconds % 3600) / 60);
  if (seconds < 86400) {
    return remainingMinutes > 0 ? `${hours}h${remainingMinutes}m` : `${hours}h`;
  }

  const days = Math.floor(seconds / 86400);
  const remainingHours = Math.floor((seconds % 86400) / 3600);
  if (seconds < 604800) {
    return remainingHours > 0 ? `${days}d${remainingHours}h` : `${days}d`;
  }

  const weeks = Math.floor(seconds / 604800);
  const remainingDays = Math.floor((seconds % 604800) / 86400);
  return remainingDays > 0 ? `${weeks}w${remainingDays}d` : `${weeks}w`;
};

export const timeAgo = (timestamp?: string | null): string => {
  if (!timestamp) return '-';

  const trimmed = timestamp.trim();
  if (!trimmed) return '-';

  if (/^\d+\s*[smhdw](\d+\s*[smhdw])?$/i.test(trimmed)) {
    return trimmed;
  }

  const agoMatch = trimmed.match(/^(\d+)\s*([smhdw])\s*ago$/i);
  if (agoMatch) {
    return `${agoMatch[1]}${agoMatch[2].toLowerCase()}`;
  }

  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) return '-';

  const now = new Date();
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (!Number.isFinite(seconds) || seconds < 0) return '-';

  return formatCompactAge(seconds);
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
  
  // Warning states (transient/initializing)
  if (
    lower === 'pending' ||
    lower === 'unknown' ||
    lower === 'false' ||
    lower === 'progressing' ||
    lower === 'containercreating' ||
    lower === 'containerstarting' ||
    lower === 'podinitialized' ||
    lower === 'podinitializing' ||
    lower === 'terminating' ||
    lower === 'notready' ||
    lower.startsWith('init:')
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
    lower === 'errimageneverpu' ||
    lower === 'createcontainerconfigerror' ||
    lower === 'invalidimagelink' ||
    lower === 'unschedulable' ||
    lower === 'evicted' ||
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
