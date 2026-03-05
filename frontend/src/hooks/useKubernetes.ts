import { useQuery } from '@tanstack/react-query';
import type {
  Namespace,
  Pod,
  Deployment,
  StatefulSet,
  DaemonSet,
  ReplicaSet,
  Job,
  CronJob,
  KubernetesEvent,
  K8sNode,
  DashboardSummary,
  ApiResponse,
  ConfigMap,
  Secret,
  ResourceQuota,
  LimitRange,
  HPA,
  PDB,
  PriorityClass,
  RuntimeClass,
  Lease,
  Service,
  Endpoint,
  Ingress,
  IngressClass,
  NetworkPolicy,
  PersistentVolume,
  PersistentVolumeClaim,
  StorageClass,
  ServiceAccount,
  Role,
  RoleBinding,
  ClusterRole,
  ClusterRoleBinding,
} from '../types';
import { getAuthToken } from '../utils/auth';

const API_BASE = '/api';

const apiFetch = async (path: string) => {
  const token = getAuthToken();
  const res = await fetch(`${API_BASE}${path}`, {
    headers: token
      ? {
          Authorization: token,
        }
      : undefined,
  });

  return res;
};

export const useNamespaces = () => {
  return useQuery({
    queryKey: ['namespaces'],
    queryFn: async () => {
      const res = await apiFetch('/namespaces');
      if (!res.ok) throw new Error('Failed to fetch namespaces');
      const data = (await res.json()) as ApiResponse<Namespace>;
      return data.data;
    },
  });
};

export const usePods = () => {
  return useQuery({
    queryKey: ['pods'],
    queryFn: async () => {
      const res = await apiFetch('/pods');
      if (!res.ok) throw new Error('Failed to fetch pods');
      const data = (await res.json()) as ApiResponse<Pod>;
      return data.data;
    },
  });
};

export const useDeployments = () => {
  return useQuery({
    queryKey: ['deployments'],
    queryFn: async () => {
      const res = await apiFetch('/deployments');
      if (!res.ok) throw new Error('Failed to fetch deployments');
      const data = (await res.json()) as ApiResponse<Deployment>;
      return data.data;
    },
  });
};

export const useStatefulSets = () => {
  return useQuery({
    queryKey: ['statefulsets'],
    queryFn: async () => {
      const res = await apiFetch('/statefulsets');
      if (!res.ok) throw new Error('Failed to fetch statefulsets');
      const data = (await res.json()) as ApiResponse<StatefulSet>;
      return data.data;
    },
  });
};

export const useDaemonSets = () => {
  return useQuery({
    queryKey: ['daemonsets'],
    queryFn: async () => {
      const res = await apiFetch('/daemonsets');
      if (!res.ok) throw new Error('Failed to fetch daemonsets');
      const data = (await res.json()) as ApiResponse<DaemonSet>;
      return data.data;
    },
  });
};

export const useReplicaSets = () => {
  return useQuery({
    queryKey: ['replicasets'],
    queryFn: async () => {
      const res = await apiFetch('/replicasets');
      if (!res.ok) throw new Error('Failed to fetch replicasets');
      const data = (await res.json()) as ApiResponse<ReplicaSet>;
      return data.data;
    },
  });
};

export const useJobs = () => {
  return useQuery({
    queryKey: ['jobs'],
    queryFn: async () => {
      const res = await apiFetch('/jobs');
      if (!res.ok) throw new Error('Failed to fetch jobs');
      const data = (await res.json()) as ApiResponse<Job>;
      return data.data;
    },
  });
};

export const useCronJobs = () => {
  return useQuery({
    queryKey: ['cronjobs'],
    queryFn: async () => {
      const res = await apiFetch('/cronjobs');
      if (!res.ok) throw new Error('Failed to fetch cronjobs');
      const data = (await res.json()) as ApiResponse<CronJob>;
      return data.data;
    },
  });
};

export const useEvents = () => {
  return useQuery({
    queryKey: ['events'],
    queryFn: async () => {
      const res = await apiFetch('/events');
      if (!res.ok) throw new Error('Failed to fetch events');
      const data = (await res.json()) as ApiResponse<KubernetesEvent>;
      return data.data;
    },
  });
};

export const useNodes = () => {
  return useQuery({
    queryKey: ['nodes'],
    queryFn: async () => {
      const res = await apiFetch('/nodes');
      if (!res.ok) throw new Error('Failed to fetch nodes');
      const data = (await res.json()) as ApiResponse<K8sNode>;
      return data.data;
    },
  });
};

export const useDashboard = () => {
  return useQuery({
    queryKey: ['dashboard'],
    queryFn: async () => {
      const res = await apiFetch('/dashboard');
      if (!res.ok) throw new Error('Failed to fetch dashboard summary');
      const data = (await res.json()) as DashboardSummary;
      return data;
    },
  });
};

// Config Resources
export const useConfigMaps = () => {
  return useQuery({
    queryKey: ['configmaps'],
    queryFn: async () => {
      const res = await apiFetch('/configmaps');
      if (!res.ok) throw new Error('Failed to fetch configmaps');
      const data = (await res.json()) as ApiResponse<ConfigMap>;
      return data.data;
    },
  });
};

export const useSecrets = () => {
  return useQuery({
    queryKey: ['secrets'],
    queryFn: async () => {
      const res = await apiFetch('/secrets');
      if (!res.ok) throw new Error('Failed to fetch secrets');
      const data = (await res.json()) as ApiResponse<Secret>;
      return data.data;
    },
  });
};

export const useResourceQuotas = () => {
  return useQuery({
    queryKey: ['resourcequotas'],
    queryFn: async () => {
      const res = await apiFetch('/resourcequotas');
      if (!res.ok) throw new Error('Failed to fetch resourcequotas');
      const data = (await res.json()) as ApiResponse<ResourceQuota>;
      return data.data;
    },
  });
};

export const useLimitRanges = () => {
  return useQuery({
    queryKey: ['limitranges'],
    queryFn: async () => {
      const res = await apiFetch('/limitranges');
      if (!res.ok) throw new Error('Failed to fetch limitranges');
      const data = (await res.json()) as ApiResponse<LimitRange>;
      return data.data;
    },
  });
};

export const useHPA = () => {
  return useQuery({
    queryKey: ['hpa'],
    queryFn: async () => {
      const res = await apiFetch('/hpa');
      if (!res.ok) throw new Error('Failed to fetch hpa');
      const data = (await res.json()) as ApiResponse<HPA>;
      return data.data;
    },
  });
};

export const usePDB = () => {
  return useQuery({
    queryKey: ['pdb'],
    queryFn: async () => {
      const res = await apiFetch('/pdb');
      if (!res.ok) throw new Error('Failed to fetch pdb');
      const data = (await res.json()) as ApiResponse<PDB>;
      return data.data;
    },
  });
};

export const usePriorityClasses = () => {
  return useQuery({
    queryKey: ['priorityclasses'],
    queryFn: async () => {
      const res = await apiFetch('/priorityclasses');
      if (!res.ok) throw new Error('Failed to fetch priorityclasses');
      const data = (await res.json()) as ApiResponse<PriorityClass>;
      return data.data;
    },
  });
};

export const useRuntimeClasses = () => {
  return useQuery({
    queryKey: ['runtimeclasses'],
    queryFn: async () => {
      const res = await apiFetch('/runtimeclasses');
      if (!res.ok) throw new Error('Failed to fetch runtimeclasses');
      const data = (await res.json()) as ApiResponse<RuntimeClass>;
      return data.data;
    },
  });
};

export const useLeases = () => {
  return useQuery({
    queryKey: ['leases'],
    queryFn: async () => {
      const res = await apiFetch('/leases');
      if (!res.ok) throw new Error('Failed to fetch leases');
      const data = (await res.json()) as ApiResponse<Lease>;
      return data.data;
    },
  });
};

// Network Resources
export const useServices = () => {
  return useQuery({
    queryKey: ['services'],
    queryFn: async () => {
      const res = await apiFetch('/services');
      if (!res.ok) throw new Error('Failed to fetch services');
      const data = (await res.json()) as ApiResponse<Service>;
      return data.data;
    },
  });
};

export const useEndpoints = () => {
  return useQuery({
    queryKey: ['endpoints'],
    queryFn: async () => {
      const res = await apiFetch('/endpoints');
      if (!res.ok) throw new Error('Failed to fetch endpoints');
      const data = (await res.json()) as ApiResponse<Endpoint>;
      return data.data;
    },
  });
};

export const useIngresses = () => {
  return useQuery({
    queryKey: ['ingresses'],
    queryFn: async () => {
      const res = await apiFetch('/ingresses');
      if (!res.ok) throw new Error('Failed to fetch ingresses');
      const data = (await res.json()) as ApiResponse<Ingress>;
      return data.data;
    },
  });
};

export const useIngressClasses = () => {
  return useQuery({
    queryKey: ['ingressclasses'],
    queryFn: async () => {
      const res = await apiFetch('/ingressclasses');
      if (!res.ok) throw new Error('Failed to fetch ingress classes');
      const data = (await res.json()) as ApiResponse<IngressClass>;
      return data.data;
    },
  });
};

export const useNetworkPolicies = () => {
  return useQuery({
    queryKey: ['networkpolicies'],
    queryFn: async () => {
      const res = await apiFetch('/networkpolicies');
      if (!res.ok) throw new Error('Failed to fetch network policies');
      const data = (await res.json()) as ApiResponse<NetworkPolicy>;
      return data.data;
    },
  });
};

// Storage Resources
export const usePersistentVolumes = () => {
  return useQuery({
    queryKey: ['persistentvolumes'],
    queryFn: async () => {
      const res = await apiFetch('/persistentvolumes');
      if (!res.ok) throw new Error('Failed to fetch persistent volumes');
      const data = (await res.json()) as ApiResponse<PersistentVolume>;
      return data.data;
    },
  });
};

export const usePersistentVolumeClaims = () => {
  return useQuery({
    queryKey: ['persistentvolumeclaims'],
    queryFn: async () => {
      const res = await apiFetch('/persistentvolumeclaims');
      if (!res.ok) throw new Error('Failed to fetch persistent volume claims');
      const data = (await res.json()) as ApiResponse<PersistentVolumeClaim>;
      return data.data;
    },
  });
};

export const useStorageClasses = () => {
  return useQuery({
    queryKey: ['storageclasses'],
    queryFn: async () => {
      const res = await apiFetch('/storageclasses');
      if (!res.ok) throw new Error('Failed to fetch storage classes');
      const data = (await res.json()) as ApiResponse<StorageClass>;
      return data.data;
    },
  });
};

// Access Control (RBAC) Resources
export const useServiceAccounts = () => {
  return useQuery({
    queryKey: ['serviceaccounts'],
    queryFn: async () => {
      const res = await apiFetch('/serviceaccounts');
      if (!res.ok) throw new Error('Failed to fetch service accounts');
      const data = (await res.json()) as ApiResponse<ServiceAccount>;
      return data.data;
    },
  });
};

export const useRoles = () => {
  return useQuery({
    queryKey: ['roles'],
    queryFn: async () => {
      const res = await apiFetch('/roles');
      if (!res.ok) throw new Error('Failed to fetch roles');
      const data = (await res.json()) as ApiResponse<Role>;
      return data.data;
    },
  });
};

export const useRoleBindings = () => {
  return useQuery({
    queryKey: ['rolebindings'],
    queryFn: async () => {
      const res = await apiFetch('/rolebindings');
      if (!res.ok) throw new Error('Failed to fetch role bindings');
      const data = (await res.json()) as ApiResponse<RoleBinding>;
      return data.data;
    },
  });
};

export const useClusterRoles = () => {
  return useQuery({
    queryKey: ['clusterroles'],
    queryFn: async () => {
      const res = await apiFetch('/clusterroles');
      if (!res.ok) throw new Error('Failed to fetch cluster roles');
      const data = (await res.json()) as ApiResponse<ClusterRole>;
      return data.data;
    },
  });
};

export const useClusterRoleBindings = () => {
  return useQuery({
    queryKey: ['clusterrolebindings'],
    queryFn: async () => {
      const res = await apiFetch('/clusterrolebindings');
      if (!res.ok) throw new Error('Failed to fetch cluster role bindings');
      const data = (await res.json()) as ApiResponse<ClusterRoleBinding>;
      return data.data;
    },
  });
};
