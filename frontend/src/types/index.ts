// Kubernetes resource types
export interface Namespace {
  name: string;
  phase: string;
  age: string;
}

export interface Pod {
  name: string;
  namespace: string;
  status?: string;
  phase?: string;
  ready: string;
  restarts: number;
  age: string;
}

export interface Deployment {
  name: string;
  namespace: string;
  ready: string;
  updated: number;
  available: number;
  age: string;
  images: string[];
}

export interface StatefulSet {
  name: string;
  namespace: string;
  ready: string;
  age: string;
}

export interface DaemonSet {
  name: string;
  namespace: string;
  desired: number;
  current: number;
  ready: number;
  available: number;
  node_selector: Record<string, string>;
  age: string;
  images: string[];
}

export interface ReplicaSet {
  name: string;
  namespace: string;
  desired: number;
  current: number;
  ready: number;
  age: string;
  images: string[];
}

export interface Job {
  name: string;
  namespace: string;
  completions: string;
  duration: string;
  age: string;
}

export interface CronJob {
  name: string;
  namespace: string;
  schedule: string;
  suspend: boolean;
  active: number;
  last_schedule: string;
  age: string;
}

export interface KubernetesEvent {
  name: string;
  namespace: string;
  involved_object: string;
  reason: string;
  message: string;
  count: number;
  first_timestamp: string;
  last_timestamp: string;
  type: string;
}

export interface K8sNode {
  name: string;
  ready: boolean | string;
  roles: string[];
  kubelet_version: string;
  os_image: string;
  age?: string;
  cpu?: string;
  memory?: string;
}

export interface DashboardSummary {
  namespaces: number;
  pods: number;
  deployments: number;
  statefulsets: number;
  daemonsets: number;
  replicasets: number;
  jobs: number;
  cronjobs: number;
  events: number;
}

export interface ApiResponse<T> {
  data: T[];
  total: number;
}
