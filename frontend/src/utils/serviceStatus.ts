import type { Service } from '../types';

const hasExternalAddress = (externalIp: string | undefined): boolean => {
  if (!externalIp) return false;
  const normalized = externalIp.trim().toLowerCase();
  if (!normalized) return false;
  if (normalized === '-' || normalized === 'none' || normalized === '<none>' || normalized === '<pending>') {
    return false;
  }
  return true;
};

const isHeadlessService = (clusterIp: string | undefined): boolean => {
  const normalized = (clusterIp || '').trim().toLowerCase();
  return normalized === 'none' || normalized === '';
};

export const isExternalIpPending = (service: Pick<Service, 'service_type' | 'external_ip'>): boolean => {
  return service.service_type === 'LoadBalancer' && !hasExternalAddress(service.external_ip);
};

export const getServiceStatus = (
  service: Pick<Service, 'service_type' | 'cluster_ip' | 'external_ip'>
): 'Pending' | 'Exposed' | 'Internal' | 'Headless' | 'ExternalName' => {
  if (service.service_type === 'ExternalName') return 'ExternalName';
  if (isExternalIpPending(service)) return 'Pending';
  if (service.service_type === 'LoadBalancer' || service.service_type === 'NodePort') return 'Exposed';
  if (isHeadlessService(service.cluster_ip)) return 'Headless';
  return 'Internal';
};

export const getServiceStatusReason = (
  service: Pick<Service, 'service_type' | 'cluster_ip' | 'external_ip'>
): string => {
  if (isExternalIpPending(service)) return 'External IP pending allocation';
  if (service.service_type === 'ExternalName') return 'Routes to external DNS name';
  if (service.service_type === 'LoadBalancer') return 'Public load balancer assigned';
  if (service.service_type === 'NodePort') return 'Exposed on node ports';
  if (isHeadlessService(service.cluster_ip)) return 'Headless service (no virtual ClusterIP)';
  return 'Cluster-internal service';
};

export const getServiceStatusRank = (service: Pick<Service, 'service_type' | 'cluster_ip' | 'external_ip'>): number => {
  const status = getServiceStatus(service);
  if (status === 'Pending') return 0;
  if (status === 'Exposed') return 1;
  if (status === 'Internal') return 2;
  if (status === 'Headless') return 3;
  return 4;
};

export const getServiceExternalIpDisplay = (
  service: Pick<Service, 'service_type' | 'external_ip'>
): string => {
  return isExternalIpPending(service) ? 'Pending allocation' : (service.external_ip || '-');
};