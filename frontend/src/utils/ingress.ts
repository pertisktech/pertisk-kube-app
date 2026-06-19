import { getAuthToken } from './auth';

const INGRESS_ADDRESS_ANNOTATIONS = [
  'external-dns.alpha.kubernetes.io/target',
  'external-dns.alpha.kubernetes.io/hostname',
  'nginx.ingress.kubernetes.io/external-dns',
] as const;

function sortIngressAddresses(addresses: string[]): string[] {
  return [...new Set(addresses)].sort((a, b) => {
    const isIpv4 = (value: string) => value.includes('.') && !value.includes(':');
    if (isIpv4(a) && !isIpv4(b)) return -1;
    if (!isIpv4(a) && isIpv4(b)) return 1;
    return a.localeCompare(b);
  });
}

export function normalizeIngressHosts(hosts: string): string[] {
  return hosts
    .split(',')
    .map((host) => host.trim())
    .filter(Boolean);
}

export function toExternalIngressUrl(host: string): string | null {
  const sanitized = host.replace(/^\*\./, '').trim();
  if (!sanitized) return null;

  const normalized = sanitized.toLowerCase();
  if (normalized === '-' || normalized === '<none>' || normalized === 'none' || normalized === 'n/a') {
    return null;
  }

  if (/^https?:\/\//i.test(sanitized)) return sanitized;

  const defaultProtocol =
    typeof window !== 'undefined' && window.location.protocol === 'http:' ? 'http' : 'https';
  return `${defaultProtocol}://${sanitized}`;
}

export function extractIngressAddress(raw: Record<string, unknown>): string {
  const status = (raw.status as Record<string, unknown> | undefined) ?? {};
  const loadBalancer =
    (status.loadBalancer as Record<string, unknown> | undefined) ??
    (status.load_balancer as Record<string, unknown> | undefined);
  const ingressEntries = (loadBalancer?.ingress as Array<Record<string, unknown>> | undefined) ?? [];

  const fromStatus = ingressEntries
    .map((entry) => {
      const ip = entry.ip;
      const hostname = entry.hostname;
      if (typeof ip === 'string' && ip.trim()) return ip.trim();
      if (typeof hostname === 'string' && hostname.trim()) return hostname.trim();
      return null;
    })
    .filter((value): value is string => Boolean(value));

  if (fromStatus.length > 0) {
    return sortIngressAddresses(fromStatus).join(', ');
  }

  const annotations = (raw.metadata as Record<string, unknown> | undefined)?.annotations as
    | Record<string, string>
    | undefined;
  if (annotations) {
    const fromAnnotations = INGRESS_ADDRESS_ANNOTATIONS.flatMap((key) => {
      const value = annotations[key];
      if (!value?.trim()) return [];
      return value.split(',').map((part) => part.trim()).filter(Boolean);
    });
    if (fromAnnotations.length > 0) {
      return sortIngressAddresses(fromAnnotations).join(', ');
    }
  }

  return '-';
}

export async function fetchIngressClassAddressMap(signal?: AbortSignal): Promise<Record<string, string>> {
  const token = getAuthToken();
  const response = await fetch('/api/ingressclasses', {
    cache: 'no-store',
    signal,
    headers: token ? { Authorization: token } : undefined,
  });
  if (!response.ok) {
    return {};
  }

  const payload = await response.json() as { data?: Array<{ name?: string; address?: string }> };
  const map: Record<string, string> = {};
  for (const item of payload.data ?? []) {
    if (item.name && item.address && item.address !== '-') {
      map[item.name] = item.address;
    }
  }
  return map;
}

interface IngressLike {
  ingress_class: string;
  address: string;
}

export function applyIngressControllerAddresses<T extends IngressLike>(
  items: T[],
  classAddressMap: Record<string, string>,
): T[] {
  const classAddresses = new Map<string, string[]>();

  for (const [className, address] of Object.entries(classAddressMap)) {
    if (!address || address === '-') continue;
    classAddresses.set(
      className,
      address.split(',').map((part) => part.trim()).filter(Boolean),
    );
  }

  for (const item of items) {
    if (!item.address || item.address === '-') continue;
    const existing = classAddresses.get(item.ingress_class) ?? [];
    const parts = item.address.split(',').map((part) => part.trim()).filter(Boolean);
    classAddresses.set(item.ingress_class, [...new Set([...existing, ...parts])]);
  }

  return items.map((item) => {
    const controllerAddress = classAddressMap[item.ingress_class];
    if (controllerAddress && controllerAddress !== '-') {
      return { ...item, address: controllerAddress };
    }

    if (item.address && item.address !== '-') {
      return item;
    }

    const fallback = classAddresses.get(item.ingress_class);
    if (!fallback?.length) {
      return item;
    }

    return { ...item, address: sortIngressAddresses(fallback).join(', ') };
  });
}
