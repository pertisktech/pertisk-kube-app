use serde::{Deserialize, Serialize};

#[derive(Deserialize)]
pub struct ScaleRequest {
    pub replicas: i32,
}

#[derive(Serialize)]
pub struct HealthResponse {
    pub status: String,
}

#[derive(Serialize)]
pub struct ApiResponse<T> {
    pub data: Vec<T>,
    pub total: usize,
}

#[derive(Serialize)]
pub struct NamespaceItem {
    pub name: String,
    pub phase: String,
    pub labels: String,
    pub age: String,
}

#[derive(Serialize)]
pub struct PodItem {
    pub name: String,
    pub namespace: String,
    pub status: Option<String>,
    pub phase: Option<String>,
    pub ready: String,
    pub restarts: u32,
    pub age: String,
    pub node: Option<String>,
    pub pod_ip: Option<String>,
    pub cpu: String,
    pub memory: String,
    pub cpu_capacity: Option<String>,
    pub memory_capacity: Option<String>,
    pub cpu_usage_percent: Option<f64>,
    pub memory_usage_percent: Option<f64>,
    pub controlled_by: String,
    pub qos: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub labels: Option<serde_json::Map<String, serde_json::Value>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub annotations: Option<serde_json::Map<String, serde_json::Value>>,
}

#[derive(Serialize)]
pub struct NodeItem {
    pub name: String,
    pub ready: Option<String>,
    pub roles: Vec<String>,
    pub kubelet_version: Option<String>,
    pub os_image: Option<String>,
    pub ip: Option<String>,
    pub ipv4: Option<String>,
    pub ipv6: Option<String>,
    pub internal_ip: Option<String>,
    pub external_ip: Option<String>,
    pub taints: Vec<String>,
    pub labels: Option<serde_json::Map<String, serde_json::Value>>,
    pub annotations: Option<serde_json::Map<String, serde_json::Value>>,
    pub runtime: Option<String>,
    pub architecture: Option<String>,
    pub operating_system: Option<String>,
    pub kernel_version: Option<String>,
    pub age: Option<String>,
    pub cpu: Option<String>,
    pub memory: Option<String>,
    pub ephemeral_storage: Option<String>,
    pub pods: Option<String>,
    pub cpu_used: Option<String>,
    pub memory_used: Option<String>,
    pub cpu_usage_percent: Option<f64>,
    pub memory_usage_percent: Option<f64>,
    pub unschedulable: bool,
}

#[derive(Serialize)]
pub struct EventItem {
    pub name: String,
    pub namespace: String,
    pub kind: Option<String>,
    pub reason: Option<String>,
    pub message: Option<String>,
    pub type_: Option<String>,
}

#[derive(Serialize)]
pub struct DeploymentItem {
    pub name: String,
    pub namespace: String,
    pub status: String,
    pub ready: String,
    pub updated: i32,
    pub available: i32,
    pub images: Vec<String>,
    pub age: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub labels: Option<serde_json::Map<String, serde_json::Value>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub annotations: Option<serde_json::Map<String, serde_json::Value>>,
}

#[derive(Serialize)]
pub struct StatefulSetItem {
    pub name: String,
    pub namespace: String,
    pub status: String,
    pub ready: String,
    pub current: i32,
    pub updated: i32,
    pub age: String,
    pub images: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub labels: Option<serde_json::Map<String, serde_json::Value>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub annotations: Option<serde_json::Map<String, serde_json::Value>>,
}

#[derive(Serialize)]
pub struct DaemonSetItem {
    pub name: String,
    pub namespace: String,
    pub status: String,
    pub desired: i32,
    pub current: i32,
    pub ready: i32,
    pub available: i32,
    pub updated: i32,
    pub node_selector: std::collections::BTreeMap<String, String>,
    pub age: String,
    pub images: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub labels: Option<serde_json::Map<String, serde_json::Value>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub annotations: Option<serde_json::Map<String, serde_json::Value>>,
}

#[derive(Serialize)]
pub struct ReplicaSetItem {
    pub name: String,
    pub namespace: String,
    pub status: String,
    pub desired: i32,
    pub current: i32,
    pub ready: i32,
    pub available: i32,
    pub age: String,
    pub images: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub labels: Option<serde_json::Map<String, serde_json::Value>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub annotations: Option<serde_json::Map<String, serde_json::Value>>,
}

#[derive(Serialize)]
pub struct JobItem {
    pub name: String,
    pub namespace: String,
    pub status: String,
    pub completions: String,
    pub duration: String,
    pub age: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub labels: Option<serde_json::Map<String, serde_json::Value>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub annotations: Option<serde_json::Map<String, serde_json::Value>>,
}

#[derive(Serialize)]
pub struct CronJobItem {
    pub name: String,
    pub namespace: String,
    pub schedule: String,
    pub suspend: bool,
    pub active: i32,
    pub last_schedule: String,
    pub next_execution: String,
    pub time_zone: String,
    pub age: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub labels: Option<serde_json::Map<String, serde_json::Value>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub annotations: Option<serde_json::Map<String, serde_json::Value>>,
}

#[derive(Serialize)]
pub struct ConfigMapItem {
    pub name: String,
    pub namespace: String,
    pub data_keys: usize,
    pub age: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub labels: Option<serde_json::Map<String, serde_json::Value>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub annotations: Option<serde_json::Map<String, serde_json::Value>>,
}

#[derive(Serialize)]
pub struct SecretItem {
    pub name: String,
    pub namespace: String,
    pub secret_type: String,
    pub data_keys: usize,
    pub age: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub labels: Option<serde_json::Map<String, serde_json::Value>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub annotations: Option<serde_json::Map<String, serde_json::Value>>,
}

#[derive(Serialize)]
pub struct ResourceQuotaItem {
    pub name: String,
    pub namespace: String,
    pub status: String,
    pub age: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub labels: Option<serde_json::Map<String, serde_json::Value>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub annotations: Option<serde_json::Map<String, serde_json::Value>>,
}

#[derive(Serialize)]
pub struct LimitRangeItem {
    pub name: String,
    pub namespace: String,
    pub limits: usize,
    pub age: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub labels: Option<serde_json::Map<String, serde_json::Value>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub annotations: Option<serde_json::Map<String, serde_json::Value>>,
}

#[derive(Serialize)]
pub struct HPAItem {
    pub name: String,
    pub namespace: String,
    pub reference: String,
    pub targets: usize,
    pub current_replicas: i32,
    pub desired_replicas: i32,
    pub min_replicas: i32,
    pub max_replicas: i32,
    pub age: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub labels: Option<serde_json::Map<String, serde_json::Value>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub annotations: Option<serde_json::Map<String, serde_json::Value>>,
}

#[derive(Serialize)]
pub struct PDBItem {
    pub name: String,
    pub namespace: String,
    pub min_available: String,
    pub allowed_disruptions: i32,
    pub status: String,
    pub age: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub labels: Option<serde_json::Map<String, serde_json::Value>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub annotations: Option<serde_json::Map<String, serde_json::Value>>,
}

#[derive(Serialize)]
pub struct PriorityClassItem {
    pub name: String,
    pub value: i32,
    pub global_default: bool,
    pub age: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub labels: Option<serde_json::Map<String, serde_json::Value>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub annotations: Option<serde_json::Map<String, serde_json::Value>>,
}

#[derive(Serialize)]
pub struct RuntimeClassItem {
    pub name: String,
    pub handler: String,
    pub scheduling: String,
    pub age: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub labels: Option<serde_json::Map<String, serde_json::Value>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub annotations: Option<serde_json::Map<String, serde_json::Value>>,
}

#[derive(Serialize)]
pub struct LeaseItem {
    pub name: String,
    pub namespace: String,
    pub holder_identity: String,
    pub lease_duration_seconds: i32,
    pub age: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub labels: Option<serde_json::Map<String, serde_json::Value>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub annotations: Option<serde_json::Map<String, serde_json::Value>>,
}

#[derive(Serialize)]
pub struct MwcItem {
    pub name: String,
    pub webhooks_count: usize,
    pub age: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub labels: Option<serde_json::Map<String, serde_json::Value>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub annotations: Option<serde_json::Map<String, serde_json::Value>>,
}

#[derive(Serialize)]
pub struct VwcItem {
    pub name: String,
    pub webhooks_count: usize,
    pub age: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub labels: Option<serde_json::Map<String, serde_json::Value>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub annotations: Option<serde_json::Map<String, serde_json::Value>>,
}

#[derive(Serialize)]
pub struct ServiceItem {
    pub name: String,
    pub namespace: String,
    pub service_type: String,
    pub cluster_ip: String,
    pub external_ip: String,
    pub ports: String,
    pub age: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub labels: Option<serde_json::Map<String, serde_json::Value>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub annotations: Option<serde_json::Map<String, serde_json::Value>>,
}

#[derive(Serialize)]
pub struct EndpointItem {
    pub name: String,
    pub namespace: String,
    pub addresses: usize,
    pub not_ready: usize,
    pub ports: String,
    pub age: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub labels: Option<serde_json::Map<String, serde_json::Value>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub annotations: Option<serde_json::Map<String, serde_json::Value>>,
}

#[derive(Serialize)]
pub struct IngressItem {
    pub name: String,
    pub namespace: String,
    pub ingress_class: String,
    pub hosts: String,
    pub address: String,
    pub rules: usize,
    pub age: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub labels: Option<serde_json::Map<String, serde_json::Value>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub annotations: Option<serde_json::Map<String, serde_json::Value>>,
}

#[derive(Serialize)]
pub struct IngressClassItem {
    pub name: String,
    pub controller: String,
    pub is_default: bool,
    pub parameters: String,
    pub age: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub labels: Option<serde_json::Map<String, serde_json::Value>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub annotations: Option<serde_json::Map<String, serde_json::Value>>,
}

#[derive(Serialize)]
pub struct NetworkPolicyItem {
    pub name: String,
    pub namespace: String,
    pub pod_selector: String,
    pub policy_types: String,
    pub ingress_rules: usize,
    pub egress_rules: usize,
    pub age: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub labels: Option<serde_json::Map<String, serde_json::Value>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub annotations: Option<serde_json::Map<String, serde_json::Value>>,
}

#[derive(Serialize)]
pub struct PersistentVolumeItem {
    pub name: String,
    pub capacity: String,
    pub access_modes: String,
    pub reclaim_policy: String,
    pub status: String,
    pub claim: String,
    pub storage_class: String,
    pub age: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub labels: Option<serde_json::Map<String, serde_json::Value>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub annotations: Option<serde_json::Map<String, serde_json::Value>>,
}

#[derive(Serialize)]
pub struct PersistentVolumeClaimItem {
    pub name: String,
    pub namespace: String,
    pub status: String,
    pub volume: String,
    pub capacity: String,
    pub access_modes: String,
    pub storage_class: String,
    pub age: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub labels: Option<serde_json::Map<String, serde_json::Value>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub annotations: Option<serde_json::Map<String, serde_json::Value>>,
}

#[derive(Serialize)]
pub struct StorageClassItem {
    pub name: String,
    pub provisioner: String,
    pub reclaim_policy: String,
    pub volume_binding_mode: String,
    pub allow_volume_expansion: bool,
    pub is_default: bool,
    pub age: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub labels: Option<serde_json::Map<String, serde_json::Value>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub annotations: Option<serde_json::Map<String, serde_json::Value>>,
}

#[derive(Serialize)]
pub struct ServiceAccountItem {
    pub name: String,
    pub namespace: String,
    pub secrets: usize,
    pub age: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub labels: Option<serde_json::Map<String, serde_json::Value>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub annotations: Option<serde_json::Map<String, serde_json::Value>>,
}

#[derive(Serialize)]
pub struct RoleItem {
    pub name: String,
    pub namespace: String,
    pub rules: usize,
    pub age: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub labels: Option<serde_json::Map<String, serde_json::Value>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub annotations: Option<serde_json::Map<String, serde_json::Value>>,
}

#[derive(Serialize)]
pub struct RoleBindingItem {
    pub name: String,
    pub namespace: String,
    pub role: String,
    pub subjects: usize,
    pub age: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub labels: Option<serde_json::Map<String, serde_json::Value>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub annotations: Option<serde_json::Map<String, serde_json::Value>>,
}

#[derive(Serialize)]
pub struct ClusterRoleItem {
    pub name: String,
    pub rules: usize,
    pub age: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub labels: Option<serde_json::Map<String, serde_json::Value>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub annotations: Option<serde_json::Map<String, serde_json::Value>>,
}

#[derive(Serialize)]
pub struct ClusterRoleBindingItem {
    pub name: String,
    pub role: String,
    pub subjects: usize,
    pub age: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub labels: Option<serde_json::Map<String, serde_json::Value>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub annotations: Option<serde_json::Map<String, serde_json::Value>>,
}

#[derive(Serialize)]
pub struct CrdVersionItem {
    pub name: String,
    pub served: bool,
    pub storage: bool,
}

/// Printer column for CRD table (matches frontend CrdPrinterColumn).
#[derive(Serialize)]
pub struct CrdPrinterColumnItem {
    pub name: String,
    #[serde(rename = "jsonPath")]
    pub json_path: String,
    #[serde(rename = "type", skip_serializing_if = "Option::is_none")]
    pub type_: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub priority: Option<i32>,
}

#[derive(Serialize)]
pub struct CrdItem {
    pub name: String,
    pub group: String,
    pub scope: String,
    pub kind: String,
    pub singular: String,
    pub plural: String,
    pub short_names: Vec<String>,
    pub versions: Vec<CrdVersionItem>,
    pub created_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub printer_columns: Option<Vec<CrdPrinterColumnItem>>,
}

#[derive(Serialize)]
pub struct CustomResourceItem {
    pub name: String,
    pub namespace: Option<String>,
    pub created_at: Option<String>,
    pub spec: serde_json::Value,
    pub status: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub labels: Option<std::collections::HashMap<String, String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub annotations: Option<std::collections::HashMap<String, String>>,
}

#[derive(Serialize)]
pub struct DashboardSummary {
    pub namespaces: usize,
    pub pods: usize,
    pub deployments: usize,
    pub statefulsets: usize,
    pub daemonsets: usize,
    pub replicasets: usize,
    pub jobs: usize,
    pub cronjobs: usize,
    pub events: usize,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cluster_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub api_endpoint: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub kube_version: Option<String>,
}
