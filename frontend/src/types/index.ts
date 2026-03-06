// Kubernetes resource types
export interface Namespace {
  name: string;
  phase: string;
  labels: string;
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
  node?: string;
  pod_ip?: string;
  cpu?: string;
  memory?: string;
  controlled_by?: string;
  qos?: string;
}

export interface Deployment {
  name: string;
  namespace: string;
  status: string;
  ready: string;
  updated: number;
  available: number;
  age: string;
  images: string[];
}

export interface StatefulSet {
  name: string;
  namespace: string;
  status: string;
  ready: string;
  current: number;
  updated: number;
  age: string;
  images: string[];
}

export interface DaemonSet {
  name: string;
  namespace: string;
  status: string;
  desired: number;
  current: number;
  ready: number;
  available: number;
  updated: number;
  node_selector: Record<string, string>;
  age: string;
  images: string[];
}

export interface ReplicaSet {
  name: string;
  namespace: string;
  status: string;
  desired: number;
  current: number;
  ready: number;
  available: number;
  age: string;
  images: string[];
}

export interface Job {
  name: string;
  namespace: string;
  status?: string;
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
  next_execution: string;
  time_zone: string;
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
  ip?: string;
  ipv4?: string;
  ipv6?: string;
  internal_ip?: string;
  external_ip?: string;
  taints?: string[];
  runtime?: string;
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
  cluster_name?: string;
  api_endpoint?: string;
  kube_version?: string;
}

export interface NodeGroup {
  name: string;
  node_count: number;
  ready_count: number;
  roles: string[];
}

export interface ApiResponse<T> {
  data: T[];
  total: number;
}

// Config Resources
export interface ConfigMap {
  name: string;
  namespace: string;
  data_keys: number;
  age: string;
}

export interface Secret {
  name: string;
  namespace: string;
  secret_type: string;
  data_keys: number;
  age: string;
}

export interface ResourceQuota {
  name: string;
  namespace: string;
  status: string;
  age: string;
}

export interface LimitRange {
  name: string;
  namespace: string;
  limits: number;
  age: string;
}

export interface HPA {
  name: string;
  namespace: string;
  reference: string;
  targets: number;
  current_replicas: number;
  desired_replicas: number;
  min_replicas: number;
  max_replicas: number;
  age: string;
}

export interface PDB {
  name: string;
  namespace: string;
  min_available: string;
  allowed_disruptions: number;
  status: string;
  age: string;
}

export interface PriorityClass {
  name: string;
  value: number;
  global_default: boolean;
  age: string;
}

export interface RuntimeClass {
  name: string;
  handler: string;
  scheduling: string;
  age: string;
}

export interface Lease {
  name: string;
  namespace: string;
  holder_identity: string;
  lease_duration_seconds: number;
  age: string;
}

// Network Resources
export interface Service {
  name: string;
  namespace: string;
  service_type: string;
  cluster_ip: string;
  external_ip: string;
  ports: string;
  age: string;
}

export interface Endpoint {
  name: string;
  namespace: string;
  addresses: number;
  not_ready: number;
  ports: string;
  age: string;
}

export interface Ingress {
  name: string;
  namespace: string;
  ingress_class: string;
  hosts: string;
  address: string;
  rules: number;
  age: string;
}

export interface IngressClass {
  name: string;
  controller: string;
  is_default: boolean;
  parameters: string;
  age: string;
}

export interface NetworkPolicy {
  name: string;
  namespace: string;
  pod_selector: string;
  policy_types: string;
  ingress_rules: number;
  egress_rules: number;
  age: string;
}

// Storage Resources
export interface PersistentVolume {
  name: string;
  capacity: string;
  access_modes: string;
  reclaim_policy: string;
  status: string;
  claim: string;
  storage_class: string;
  age: string;
}

export interface PersistentVolumeClaim {
  name: string;
  namespace: string;
  status: string;
  volume: string;
  capacity: string;
  access_modes: string;
  storage_class: string;
  age: string;
}

export interface StorageClass {
  name: string;
  provisioner: string;
  reclaim_policy: string;
  volume_binding_mode: string;
  allow_volume_expansion: boolean;
  is_default: boolean;
  age: string;
}

// Access Control (RBAC) Resources
export interface ServiceAccount {
  name: string;
  namespace: string;
  secrets: number;
  age: string;
}

export interface Role {
  name: string;
  namespace: string;
  rules: number;
  age: string;
}

export interface RoleBinding {
  name: string;
  namespace: string;
  role: string;
  subjects: number;
  age: string;
}

export interface ClusterRole {
  name: string;
  rules: number;
  age: string;
}

export interface ClusterRoleBinding {
  name: string;
  role: string;
  subjects: number;
  age: string;
}
