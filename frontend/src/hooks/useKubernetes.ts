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
