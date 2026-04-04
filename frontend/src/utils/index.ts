import { JSONPath } from '@astronautlabs/jsonpath';

/** Returns true if name matches the resource name filter (case-insensitive substring). Empty filter matches all. */
export const matchesResourceNameFilter = (name: string | undefined, filter: string): boolean => {
  const q = filter.trim();
  if (!q) return true;
  if (!name) return false;
  return name.toLowerCase().includes(q.toLowerCase());
};

export const formatDate = (timestamp?: string | null): string => {
  if (!timestamp) return '-';
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return timestamp;
  return date.toLocaleString();
};

/** Parse Kubernetes CPU (e.g. "500m", "1", "0.5") to cores (number). */
export const parseCpuToCores = (cpuStr?: string | null): number => {
  if (!cpuStr || typeof cpuStr !== 'string') return 0;
  const s = cpuStr.trim();
  if (!s) return 0;
  if (s.endsWith('m')) {
    const m = parseInt(s.slice(0, -1), 10);
    return Number.isNaN(m) ? 0 : m / 1000;
  }
  const n = parseFloat(s);
  return Number.isNaN(n) ? 0 : n;
};

/** Format a single CPU value in cores for display; 3 decimal places for consistency (0 -> "0.000", 0.003 -> "0.003"). */
export const formatCpuCores = (cores: number): string => {
  return Number(cores).toFixed(3);
};

/**
 * Format "used / total" CPU (Kubernetes millicores or cores) for display.
 * e.g. "429m", "7950m" -> "0.43 / 7.95 cores"
 */
export const formatCpuRange = (
  used?: string | null,
  total?: string | null
): string => {
  const u = parseCpuToCores(used);
  const t = parseCpuToCores(total);
  if (u === 0 && t === 0) return '—';
  return `${formatCpuCores(u)} / ${formatCpuCores(t)} cores`;
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

/** Relative time that supports both past and future timestamps (e.g. "5m" or "in 5m"). */
export const timeFromNow = (timestamp?: string | null): string => {
  if (!timestamp) return '-';

  const trimmed = timestamp.trim();
  if (!trimmed) return '-';

  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) return '-';

  const now = Date.now();
  const deltaSeconds = Math.floor((date.getTime() - now) / 1000);

  if (!Number.isFinite(deltaSeconds)) return '-';

  if (deltaSeconds >= 0) {
    return `in ${formatCompactAge(deltaSeconds)}`;
  }

  return formatCompactAge(Math.abs(deltaSeconds));
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
    lower === 'bound' ||
    lower === 'succeeded' ||
    lower === 'completed' ||
    lower === 'exposed' ||
    lower === 'internal' ||
    lower === 'headless' ||
    lower === 'externalname' ||
    // Helm release
    lower === 'deployed'
  )
    return 'green';

  // Warning states (transient/initializing)
  if (
    lower === 'paused' ||
    lower === 'pending' ||
    lower === 'unknown' ||
    lower === 'false' ||
    lower === 'progressing' ||
    lower === 'containercreating' ||
    lower === 'containerstarting' ||
    lower === 'podinitialized' ||
    lower === 'podinitializing' ||
    lower === 'terminating' ||
    lower === 'released' ||
    lower.startsWith('init:') ||
    lower.includes('pending') ||
    // Helm release
    lower === 'uninstalling'
  )
    return 'yellow';

  // Neutral/inactive Helm states
  if (lower === 'superseded' || lower === 'uninstalled')
    return 'gray';
  
  // Error states
  if (
    lower === 'notready' ||
    lower === 'not ready' ||
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
    lower === 'lost' ||
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

/**
 * Parse Kubernetes quantity (memory/storage) to bytes. Handles Ki, Mi, Gi (binary) and plain numbers (bytes).
 */
export function parseK8sQuantityToBytes(str: string | undefined | null): number {
  if (str == null || typeof str !== 'string') return 0;
  const s = str.trim();
  if (!s) return 0;
  const num = parseFloat(s.replace(/[^\d.]/g, ''));
  if (Number.isNaN(num)) return 0;
  const lower = s.toLowerCase();
  if (lower.endsWith('ki')) return num * 1024;
  if (lower.endsWith('mi')) return num * 1024 * 1024;
  if (lower.endsWith('gi')) return num * 1024 * 1024 * 1024;
  if (lower.endsWith('ti')) return num * 1024 * 1024 * 1024 * 1024;
  return num; // no suffix = bytes
}

/** Format a single K8s memory/storage quantity for display (e.g. "15471952Ki" -> "14.75 GB"). */
export function formatK8sQuantity(str: string | undefined | null): string {
  const bytes = parseK8sQuantityToBytes(str);
  if (bytes === 0) return '—';
  return formatBytes(bytes);
}

/**
 * Parse Kubernetes memory string (e.g. "15340880Ki", "2.4Gi", "16384Mi") to GB (binary: 1024).
 */
export function parseK8sMemoryToGB(str: string | undefined | null): number {
  if (str == null || typeof str !== 'string') return 0;
  const s = str.trim();
  if (!s) return 0;
  const num = parseFloat(s.replace(/[^\d.]/g, ''));
  if (Number.isNaN(num)) return 0;
  const lower = s.toLowerCase();
  if (lower.endsWith('ki')) return num / (1024 * 1024);
  if (lower.endsWith('mi')) return num / 1024;
  if (lower.endsWith('gi')) return num;
  if (lower.endsWith('k')) return num / (1000 * 1000);
  if (lower.endsWith('m')) return num / 1000;
  if (lower.endsWith('g')) return num;
  return num;
}

/** Format memory for display: "X GB / Y GB" from K8s used/allocatable strings. */
export function formatMemoryUsedAlloc(used: string | undefined | null, alloc: string | undefined | null): string {
  const usedGB = parseK8sMemoryToGB(used);
  const allocGB = parseK8sMemoryToGB(alloc);
  if (allocGB === 0 && usedGB === 0) return '-';
  const fmt = (gb: number) => (gb === 0 ? '-' : gb % 1 === 0 ? `${gb} GB` : `${gb.toFixed(2)} GB`);
  return `${fmt(usedGB)} / ${fmt(allocGB)}`;
}

export function formatK8sQuantityUsedAlloc(used: string | undefined | null, alloc: string | undefined | null): string {
  const usedBytes = parseK8sQuantityToBytes(used);
  const allocBytes = parseK8sQuantityToBytes(alloc);

  if (allocBytes === 0 && usedBytes === 0) return '-';

  const fmt = (bytes: number, showDashForZero = false) => {
    if (bytes === 0) return showDashForZero ? '-' : '0 B';
    return formatBytes(bytes);
  };

  return `${fmt(usedBytes)} / ${fmt(allocBytes, true)}`;
}

export const cn = (...classes: (string | false | undefined)[]): string => {
  return classes.filter(Boolean).join(' ');
};

const SLASH_DASH = /[/\\-]/g;
const PATH_BY_BARE_DOTS = /(?<=\w)\./;
const TEXT_BEFORE_FIRST_SQUARE = /^.*(?=\[)/g;
const KUBECTL_PREFIX = /^\$?\.?(?<pathExpression>.*)/s;
const SLICE_EMPTY = /\[\]/g;
const TRIPLE_DOT = /\.\.\.(?<trailing>.)/g;
const TRAILING_DOTDOT = /\.\.$/;

/**
 * Convert kubectl/CRD JSONPath shorthands to standard JSONPath (Freelens-style).
 * - Leading $ and . are optional; [] => [0]; keys with / or - use bracket notation; strip \.
 */
function convertKubectlJsonPathToNodeJsonPath(jsonPath: string): string {
  const m = jsonPath.match(KUBECTL_PREFIX);
  let pathExpression = m?.groups?.pathExpression?.trim() ?? '';
  if (pathExpression.match(SLASH_DASH)) {
    const parts = pathExpression.split(PATH_BY_BARE_DOTS);
    const first = parts[0] ?? '';
    const rest = parts.slice(1);
    pathExpression =
      convertToIndexNotation(first, true) +
      rest.map((v) => convertToIndexNotation(v)).join('');
  }
  pathExpression = pathExpression.replace(TRAILING_DOTDOT, '').replace(TRIPLE_DOT, '..$<trailing>');
  let start = '$';
  if (!pathExpression.startsWith('[')) start += '.';
  return start + pathExpression.replace(/\\/g, '').replace(SLICE_EMPTY, '[0]');
}

function convertToIndexNotation(key: string, firstItem = false): string {
  if (!key.match(SLASH_DASH)) {
    return (firstItem ? '' : '.') + key;
  }
  if (key.includes('[')) {
    const before = key.match(TEXT_BEFORE_FIRST_SQUARE)?.[0];
    if (before && before.match(SLASH_DASH)) {
      return key.replace(before, `['${before}']`);
    }
    return '.' + key;
  }
  return `['${key}']`;
}

/**
 * Resolve a Kubernetes/CRD JSONPath from an object (Freelens-compatible).
 * Uses @astronautlabs/jsonpath and kubectl path conversion so paths like
 * .spec.addresses[0].ip, .metadata.labels, and keys with - or / work.
 */
export function safeJsonPathValue(obj: unknown, path: string): unknown {
  if (obj == null || typeof path !== 'string') return undefined;
  const trimmed = path.trim();
  if (!trimmed) return obj;
  try {
    const normalizedPath = convertKubectlJsonPathToNodeJsonPath(trimmed);
    const parsed = JSONPath.parse(normalizedPath);
    const isSlice = parsed.some(
      (exp: { expression?: { type?: string } }) =>
        exp.expression?.type === 'slice' || exp.expression?.type === 'wildcard'
    );
    const value = JSONPath.query(obj as object, JSONPath.stringify(parsed), isSlice ? Infinity : 1);
    if (isSlice) return value;
    return value[0];
  } catch {
    return undefined;
  }
}

/** Format a value for display in CRD printer columns (like kubectl). */
export function formatJsonValue(value: unknown): string {
  if (value == null) return '';
  if (Array.isArray(value)) return value.map(formatJsonValue).join(', ');
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}
