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

/**
 * Resolve a Kubernetes-style JSONPath (e.g. .spec.replicas, .status.conditions[0].status) from an object.
 * Supports dot notation and [index] for arrays. Leading . or $. is stripped.
 */
export function safeJsonPathValue(obj: unknown, path: string): unknown {
  if (obj == null || typeof path !== 'string') return undefined;
  let s = path.replace(/^\$?\.?/, '').trim();
  if (!s) return obj;
  const parts: string[] = [];
  let i = 0;
  while (i < s.length) {
    if (s[i] === '[') {
      const end = s.indexOf(']', i);
      if (end === -1) break;
      parts.push(s.slice(i, end + 1));
      i = end + 1;
      if (s[i] === '.') i += 1;
    } else {
      const dot = s.indexOf('.', i);
      const bracket = s.indexOf('[', i);
      let next = s.length;
      if (dot !== -1) next = Math.min(next, dot);
      if (bracket !== -1) next = Math.min(next, bracket);
      const segment = s.slice(i, next).trim();
      if (segment) parts.push(segment);
      i = next >= s.length ? s.length : next + (s[next] === '.' ? 1 : 0);
    }
  }
  let current: unknown = obj;
  for (const p of parts) {
    if (current == null) return undefined;
    if (p.startsWith('[') && p.endsWith(']')) {
      const inner = p.slice(1, -1).trim();
      const idx = inner === '' ? 0 : parseInt(inner, 10);
      if (Number.isNaN(idx)) return undefined;
      current = Array.isArray(current) ? current[idx] : undefined;
    } else {
      current =
        typeof current === 'object' && current !== null && p in (current as object)
          ? (current as Record<string, unknown>)[p]
          : undefined;
    }
  }
  return current;
}

/** Format a value for display in CRD printer columns (like kubectl). */
export function formatJsonValue(value: unknown): string {
  if (value == null) return '';
  if (Array.isArray(value)) return value.map(formatJsonValue).join(', ');
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}
