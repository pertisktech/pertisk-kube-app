use axum::{
    extract::{Path, Request, State},
    http::{header, StatusCode},
    middleware::{self, Next},
    response::{IntoResponse, Response},
    routing::{delete, get, post},
    Json, Router,
};
use base64::{engine::general_purpose::STANDARD, Engine as _};
use chrono::Utc;
use chrono::Duration;
use cron::Schedule;
use jsonwebtoken::{decode, encode, DecodingKey, EncodingKey, Header, Validation};
use kube::core::{ApiResource, DynamicObject, GroupVersionKind};
use kube::{api::{DeleteParams, ListParams, Patch, PatchParams}, Api, Client};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::str::FromStr;
use std::{env, net::SocketAddr, path::PathBuf};
use tower_http::{
    cors::{Any, CorsLayer},
    services::{ServeDir, ServeFile},
};
use tonic::transport::Server;
use tracing::{error, info, warn};

mod grpc_service;
mod proto;
mod ws_handler;

#[derive(Clone)]
struct AppState {
    client: Client,
    username: String,
    password: String,
    jwt_secret: String,
}

#[derive(Deserialize)]
struct LoginRequest {
    username: String,
    password: String,
}

#[derive(Deserialize)]
struct ScaleRequest {
    replicas: i32,
}

#[derive(Serialize, Deserialize)]
struct Claims {
    sub: String,
    exp: i64,
    iat: i64,
}

#[derive(Serialize)]
struct LoginResponse {
    success: bool,
    token: Option<String>,
}

#[derive(Serialize)]
struct HealthResponse {
    status: String,
}

#[derive(Serialize)]
struct ApiResponse<T> {
    data: Vec<T>,
    total: usize,
}

#[derive(Serialize)]
struct NamespaceItem {
    name: String,
    phase: String,
    labels: String,
    age: String,
}

#[derive(Serialize)]
struct PodItem {
    name: String,
    namespace: String,
    status: Option<String>,
    phase: Option<String>,
    ready: String,
    restarts: u32,
    age: String,
    node: Option<String>,
    pod_ip: Option<String>,
    cpu: String,
    memory: String,
    cpu_capacity: Option<String>,
    memory_capacity: Option<String>,
    cpu_usage_percent: Option<f64>,
    memory_usage_percent: Option<f64>,
    controlled_by: String,
    qos: String,
}

#[derive(Serialize)]
struct NodeItem {
    name: String,
    ready: Option<String>,
    roles: Vec<String>,
    kubelet_version: Option<String>,
    os_image: Option<String>,
    ip: Option<String>,
    ipv4: Option<String>,
    ipv6: Option<String>,
    internal_ip: Option<String>,
    external_ip: Option<String>,
    taints: Vec<String>,
    runtime: Option<String>,
    cpu: Option<String>,
    memory: Option<String>,
    cpu_used: Option<String>,
    memory_used: Option<String>,
    cpu_usage_percent: Option<f64>,
    memory_usage_percent: Option<f64>,
}

#[derive(Serialize)]
struct EventItem {
    name: String,
    namespace: String,
    kind: Option<String>,
    reason: Option<String>,
    message: Option<String>,
    type_: Option<String>,
}

#[derive(Serialize)]
struct DeploymentItem {
    name: String,
    namespace: String,
    status: String,
    ready: String,
    updated: i32,
    available: i32,
    images: Vec<String>,
    age: String,
}

#[derive(Serialize)]
struct StatefulSetItem {
    name: String,
    namespace: String,
    status: String,
    ready: String,
    current: i32,
    updated: i32,
    age: String,
    images: Vec<String>,
}

#[derive(Serialize)]
struct DaemonSetItem {
    name: String,
    namespace: String,
    status: String,
    desired: i32,
    current: i32,
    ready: i32,
    available: i32,
    updated: i32,
    node_selector: std::collections::BTreeMap<String, String>,
    age: String,
    images: Vec<String>,
}

#[derive(Serialize)]
struct ReplicaSetItem {
    name: String,
    namespace: String,
    status: String,
    desired: i32,
    current: i32,
    ready: i32,
    available: i32,
    age: String,
    images: Vec<String>,
}

#[derive(Serialize)]
struct JobItem {
    name: String,
    namespace: String,
    status: String,
    completions: String,
    duration: String,
    age: String,
}

#[derive(Serialize)]
struct CronJobItem {
    name: String,
    namespace: String,
    schedule: String,
    suspend: bool,
    active: i32,
    last_schedule: String,
    next_execution: String,
    time_zone: String,
    age: String,
}

// Config Resources Structs
#[derive(Serialize)]
struct ConfigMapItem {
    name: String,
    namespace: String,
    data_keys: usize,
    age: String,
}

#[derive(Serialize)]
struct SecretItem {
    name: String,
    namespace: String,
    secret_type: String,
    data_keys: usize,
    age: String,
}

#[derive(Serialize)]
struct ResourceQuotaItem {
    name: String,
    namespace: String,
    status: String,
    age: String,
}

#[derive(Serialize)]
struct LimitRangeItem {
    name: String,
    namespace: String,
    limits: usize,
    age: String,
}

#[derive(Serialize)]
struct HPAItem {
    name: String,
    namespace: String,
    reference: String,
    targets: usize,
    current_replicas: i32,
    desired_replicas: i32,
    min_replicas: i32,
    max_replicas: i32,
    age: String,
}

#[derive(Serialize)]
struct PDBItem {
    name: String,
    namespace: String,
    min_available: String,
    allowed_disruptions: i32,
    status: String,
    age: String,
}

#[derive(Serialize)]
struct PriorityClassItem {
    name: String,
    value: i32,
    global_default: bool,
    age: String,
}

#[derive(Serialize)]
struct RuntimeClassItem {
    name: String,
    handler: String,
    scheduling: String,
    age: String,
}

#[derive(Serialize)]
struct LeaseItem {
    name: String,
    namespace: String,
    holder_identity: String,
    lease_duration_seconds: i32,
    age: String,
}

// Network Resources Structs
#[derive(Serialize)]
struct ServiceItem {
    name: String,
    namespace: String,
    service_type: String,
    cluster_ip: String,
    external_ip: String,
    ports: String,
    age: String,
}

#[derive(Serialize)]
struct EndpointItem {
    name: String,
    namespace: String,
    addresses: usize,
    not_ready: usize,
    ports: String,
    age: String,
}

#[derive(Serialize)]
struct IngressItem {
    name: String,
    namespace: String,
    ingress_class: String,
    hosts: String,
    address: String,
    rules: usize,
    age: String,
}

#[derive(Serialize)]
struct IngressClassItem {
    name: String,
    controller: String,
    is_default: bool,
    parameters: String,
    age: String,
}

#[derive(Serialize)]
struct NetworkPolicyItem {
    name: String,
    namespace: String,
    pod_selector: String,
    policy_types: String,
    ingress_rules: usize,
    egress_rules: usize,
    age: String,
}

// Storage Resources Structs
#[derive(Serialize)]
struct PersistentVolumeItem {
    name: String,
    capacity: String,
    access_modes: String,
    reclaim_policy: String,
    status: String,
    claim: String,
    storage_class: String,
    age: String,
}

#[derive(Serialize)]
struct PersistentVolumeClaimItem {
    name: String,
    namespace: String,
    status: String,
    volume: String,
    capacity: String,
    access_modes: String,
    storage_class: String,
    age: String,
}

#[derive(Serialize)]
struct StorageClassItem {
    name: String,
    provisioner: String,
    reclaim_policy: String,
    volume_binding_mode: String,
    allow_volume_expansion: bool,
    is_default: bool,
    age: String,
}

// Access Control (RBAC) Resources Structs
#[derive(Serialize)]
struct ServiceAccountItem {
    name: String,
    namespace: String,
    secrets: usize,
    age: String,
}

#[derive(Serialize)]
struct RoleItem {
    name: String,
    namespace: String,
    rules: usize,
    age: String,
}

#[derive(Serialize)]
struct RoleBindingItem {
    name: String,
    namespace: String,
    role: String,
    subjects: usize,
    age: String,
}

#[derive(Serialize)]
struct ClusterRoleItem {
    name: String,
    rules: usize,
    age: String,
}

#[derive(Serialize)]
struct ClusterRoleBindingItem {
    name: String,
    role: String,
    subjects: usize,
    age: String,
}

fn format_compact_duration(seconds: i64) -> String {
    if seconds < 60 {
        return format!("{}s", seconds);
    }

    if seconds < 3600 {
        return format!("{}m", seconds / 60);
    }

    if seconds < 86_400 {
        return format!("{}h", seconds / 3600);
    }

    format!("{}d", seconds / 86_400)
}

fn parse_cpu_millicores(value: &str) -> Option<f64> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return None;
    }

    // Handle millicore format: "5m" -> 5
    if let Some(number) = trimmed.strip_suffix('m') {
        return number.parse::<f64>().ok();
    }

    // Handle nanosecond format: "1063320n" -> 1.06332 millicores
    if let Some(number) = trimmed.strip_suffix('n') {
        return number.parse::<f64>().ok().map(|nanos| nanos / 1_000_000.0);
    }

    // Handle microsecond format: "1234u" -> 1.234 millicores
    if let Some(number) = trimmed.strip_suffix('u') {
        return number.parse::<f64>().ok().map(|micros| micros / 1000.0);
    }

    // Handle raw cores: "0.5" -> 500 millicores
    trimmed.parse::<f64>().ok().map(|cores| cores * 1000.0)
}

fn parse_memory_bytes(value: &str) -> Option<f64> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return None;
    }

    let unit_start = trimmed
        .find(|char: char| !char.is_ascii_digit() && char != '.')
        .unwrap_or(trimmed.len());

    let (number_part, unit_part) = trimmed.split_at(unit_start);
    let number = number_part.parse::<f64>().ok()?;

    let factor = match unit_part {
        "" => 1.0,
        "Ki" => 1024.0,
        "Mi" => 1024.0_f64.powi(2),
        "Gi" => 1024.0_f64.powi(3),
        "Ti" => 1024.0_f64.powi(4),
        "K" | "k" => 1000.0,
        "M" => 1000.0_f64.powi(2),
        "G" => 1000.0_f64.powi(3),
        "T" => 1000.0_f64.powi(4),
        "n" => 1.0 / 1_000_000_000.0,
        "u" => 1.0 / 1_000_000.0,
        "m" => 1.0 / 1000.0,
        _ => return None,
    };

    Some(number * factor)
}

fn format_millicores(value: f64) -> String {
    if value < 1000.0 {
        return format!("{}m", value.round() as i64);
    }

    let cores = value / 1000.0;
    if (cores.fract()).abs() < f64::EPSILON {
        format!("{}", cores as i64)
    } else {
        format!("{cores:.2}").trim_end_matches('0').trim_end_matches('.').to_string()
    }
}

fn format_binary_bytes(bytes: f64) -> String {
    let units = ["B", "Ki", "Mi", "Gi", "Ti"];
    let mut value = bytes;
    let mut index = 0;

    while value >= 1024.0 && index < units.len() - 1 {
        value /= 1024.0;
        index += 1;
    }

    if value >= 10.0 {
        format!("{value:.0}{}", units[index])
    } else {
        format!("{value:.1}{}", units[index]).replace(".0", "")
    }
}

async fn fetch_pod_metrics(client: Client) -> HashMap<(String, String), (String, String)> {
    let mut metrics_map: HashMap<(String, String), (String, String)> = HashMap::new();

    let pod_metrics_resource =
        ApiResource::from_gvk(&GroupVersionKind::gvk("metrics.k8s.io", "v1beta1", "PodMetrics"));
    let metrics_api: Api<DynamicObject> = Api::all_with(client, &pod_metrics_resource);

    let metrics_list = match metrics_api.list(&ListParams::default()).await {
        Ok(list) => list,
        Err(err) => {
            error!("Error fetching pod metrics from metrics.k8s.io: {:?}", err);
            return metrics_map;
        }
    };

    info!("Fetched {} pod metrics", metrics_list.items.len());

    for metric in metrics_list.items {
        let namespace = metric.metadata.namespace.clone().unwrap_or_default();
        let name = metric.metadata.name.clone().unwrap_or_default();
        if namespace.is_empty() || name.is_empty() {
            continue;
        }

        let metric_value = match serde_json::to_value(&metric) {
            Ok(value) => value,
            Err(e) => {
                error!("Failed to serialize metric for {}/{}: {}", namespace, name, e);
                continue;
            }
        };

        let containers = match metric_value.get("containers").and_then(|value| value.as_array()) {
            Some(containers) => containers,
            None => {
                warn!("No containers found in metrics for {}/{}", namespace, name);
                continue;
            }
        };

        let mut cpu_millicores_total = 0.0;
        let mut memory_bytes_total = 0.0;
        let mut has_cpu = false;
        let mut has_memory = false;

        for (idx, container) in containers.iter().enumerate() {
            if let Some(cpu_value) = container
                .get("usage")
                .and_then(|value| value.get("cpu"))
                .and_then(|value| value.as_str())
                .and_then(parse_cpu_millicores)
            {
                has_cpu = true;
                cpu_millicores_total += cpu_value;
                info!("Container {} {}/{} CPU: {}m", idx, namespace, name, cpu_value);
            }

            if let Some(memory_value) = container
                .get("usage")
                .and_then(|value| value.get("memory"))
                .and_then(|value| value.as_str())
                .and_then(parse_memory_bytes)
            {
                has_memory = true;
                memory_bytes_total += memory_value;
                info!("Container {} {}/{} Memory: {} bytes", idx, namespace, name, memory_value);
            }
        }

        let cpu = if has_cpu {
            format_millicores(cpu_millicores_total)
        } else {
            "-".to_string()
        };

        let memory = if has_memory {
            format_binary_bytes(memory_bytes_total)
        } else {
            "-".to_string()
        };

        info!("Metrics for {}/{}: CPU={}, Memory={}", namespace, name, cpu, memory);
        metrics_map.insert((namespace, name), (cpu, memory));
    }

    info!("Total metrics collected: {}", metrics_map.len());
    metrics_map
}

async fn fetch_node_metrics(client: Client) -> HashMap<String, (String, String)> {
    let mut metrics_map: HashMap<String, (String, String)> = HashMap::new();

    let node_metrics_resource =
        ApiResource::from_gvk(&GroupVersionKind::gvk("metrics.k8s.io", "v1beta1", "NodeMetrics"));
    let metrics_api: Api<DynamicObject> = Api::all_with(client, &node_metrics_resource);

    let metrics_list = match metrics_api.list(&ListParams::default()).await {
        Ok(list) => list,
        Err(err) => {
            error!("Error fetching node metrics from metrics.k8s.io: {:?}", err);
            return metrics_map;
        }
    };

    for metric in metrics_list.items {
        let name = metric.metadata.name.clone().unwrap_or_default();
        if name.is_empty() {
            continue;
        }

        let metric_value = match serde_json::to_value(&metric) {
            Ok(value) => value,
            Err(e) => {
                error!("Failed to serialize node metric for {}: {}", name, e);
                continue;
            }
        };

        let cpu = metric_value
            .get("usage")
            .and_then(|value| value.get("cpu"))
            .and_then(|value| value.as_str())
            .and_then(parse_cpu_millicores)
            .map(format_millicores)
            .unwrap_or_else(|| "-".to_string());

        let memory = metric_value
            .get("usage")
            .and_then(|value| value.get("memory"))
            .and_then(|value| value.as_str())
            .and_then(parse_memory_bytes)
            .map(format_binary_bytes)
            .unwrap_or_else(|| "-".to_string());

        metrics_map.insert(name, (cpu, memory));
    }

    metrics_map
}

#[derive(Serialize)]
struct DashboardSummary {
    namespaces: usize,
    pods: usize,
    deployments: usize,
    statefulsets: usize,
    daemonsets: usize,
    replicasets: usize,
    jobs: usize,
    cronjobs: usize,
    events: usize,
    #[serde(skip_serializing_if = "Option::is_none")]
    cluster_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    api_endpoint: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    kube_version: Option<String>,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt().with_env_filter("info").init();

    // In-cluster config (works in Kubernetes) or falls back to local kubeconfig.
    let client = Client::try_default().await?;

    let username = env::var("USERNAME").unwrap_or_else(|_| "admin".to_string());
    let password = env::var("PASSWORD").unwrap_or_else(|_| "admin".to_string());
    let jwt_secret = env::var("JWT_SECRET").unwrap_or_else(|_| "your-secret-key-change-in-production".to_string());
    
    let state = AppState {
        client,
        username,
        password,
        jwt_secret,
    };

    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);
    let static_dir: PathBuf = env::var("STATIC_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from("frontend/dist"));

    let public_api = Router::new()
        .route("/health", get(health))
        .route("/readiness", get(readiness))
        .route("/login", post(login));

    let protected_api = Router::new()
        .route("/dashboard", get(get_dashboard_summary))
        .route("/nodes", get(list_nodes))
        .route("/namespaces", get(list_namespaces))
        .route("/pods", get(list_pods))
        .route(
            "/pods/:namespace/:name/yaml",
            get(get_pod_yaml).put(update_pod_yaml),
        )
        .route("/pods/:namespace/:name", delete(delete_pod))
        .route("/pods/:namespace/:name/logs", get(get_pod_logs))
        .route("/events", get(list_events))
        .route("/deployments", get(list_deployments))
        .route(
            "/deployments/:namespace/:name/scale",
            post(scale_deployment),
        )
        .route(
            "/deployments/:namespace/:name/restart",
            post(restart_deployment),
        )
        .route(
            "/deployments/:namespace/:name/yaml",
            get(get_deployment_yaml).put(update_deployment_yaml),
        )
        .route("/deployments/:namespace/:name", delete(delete_deployment))
        .route("/statefulsets", get(list_statefulsets))
        .route(
            "/statefulsets/:namespace/:name/yaml",
            get(get_statefulset_yaml).put(update_statefulset_yaml),
        )
        .route("/statefulsets/:namespace/:name", delete(delete_statefulset))
        .route("/daemonsets", get(list_daemonsets))
        .route(
            "/daemonsets/:namespace/:name/yaml",
            get(get_daemonset_yaml).put(update_daemonset_yaml),
        )
        .route("/daemonsets/:namespace/:name", delete(delete_daemonset))
        .route("/replicasets", get(list_replicasets))
        .route(
            "/replicasets/:namespace/:name/yaml",
            get(get_replicaset_yaml).put(update_replicaset_yaml),
        )
        .route("/replicasets/:namespace/:name", delete(delete_replicaset))
        .route("/jobs", get(list_jobs))
        .route(
            "/jobs/:namespace/:name/yaml",
            get(get_job_yaml).put(update_job_yaml),
        )
        .route("/jobs/:namespace/:name", delete(delete_job))
        .route("/cronjobs", get(list_cronjobs))
        .route(
            "/cronjobs/:namespace/:name/yaml",
            get(get_cronjob_yaml).put(update_cronjob_yaml),
        )
        .route("/cronjobs/:namespace/:name", delete(delete_cronjob))
        .route("/namespaces/:name", delete(delete_namespace))
        .route("/configmaps", get(list_configmaps))
        .route(
            "/configmaps/:namespace/:name/yaml",
            get(get_configmap_yaml).put(update_configmap_yaml),
        )
        .route("/configmaps/:namespace/:name", delete(delete_configmap))
        .route("/secrets", get(list_secrets))
        .route(
            "/secrets/:namespace/:name/yaml",
            get(get_secret_yaml).put(update_secret_yaml),
        )
        .route("/secrets/:namespace/:name", delete(delete_secret))
        .route("/resourcequotas", get(list_resourcequotas))
        .route(
            "/resourcequotas/:namespace/:name/yaml",
            get(get_resourcequota_yaml).put(update_resourcequota_yaml),
        )
        .route("/resourcequotas/:namespace/:name", delete(delete_resourcequota))
        .route("/limitranges", get(list_limitranges))
        .route(
            "/limitranges/:namespace/:name/yaml",
            get(get_limitrange_yaml).put(update_limitrange_yaml),
        )
        .route("/limitranges/:namespace/:name", delete(delete_limitrange))
        .route("/hpa", get(list_hpa))
        .route(
            "/hpa/:namespace/:name/yaml",
            get(get_hpa_yaml).put(update_hpa_yaml),
        )
        .route("/hpa/:namespace/:name", delete(delete_hpa))
        .route("/pdb", get(list_pdb))
        .route(
            "/pdb/:namespace/:name/yaml",
            get(get_pdb_yaml).put(update_pdb_yaml),
        )
        .route("/pdb/:namespace/:name", delete(delete_pdb))
        .route("/priorityclasses", get(list_priorityclasses))
        .route(
            "/priorityclasses/:name/yaml",
            get(get_priorityclass_yaml).put(update_priorityclass_yaml),
        )
        .route("/priorityclasses/:name", delete(delete_priorityclass))
        .route("/runtimeclasses", get(list_runtimeclasses))
        .route(
            "/runtimeclasses/:name/yaml",
            get(get_runtimeclass_yaml).put(update_runtimeclass_yaml),
        )
        .route("/runtimeclasses/:name", delete(delete_runtimeclass))
        .route("/leases", get(list_leases))
        .route(
            "/leases/:namespace/:name/yaml",
            get(get_lease_yaml).put(update_lease_yaml),
        )
        .route("/leases/:namespace/:name", delete(delete_lease))
        .route("/services", get(list_services))
        .route("/endpoints", get(list_endpoints))
        .route("/ingresses", get(list_ingresses))
        .route("/ingressclasses", get(list_ingressclasses))
        .route("/networkpolicies", get(list_networkpolicies))
        .route("/persistentvolumes", get(list_persistent_volumes))
        .route("/persistentvolumeclaims", get(list_persistent_volume_claims))
        .route("/storageclasses", get(list_storage_classes))
        .route("/serviceaccounts", get(list_service_accounts))
        .route("/roles", get(list_roles))
        .route("/rolebindings", get(list_role_bindings))
        .route("/clusterroles", get(list_cluster_roles))
        .route("/clusterrolebindings", get(list_cluster_role_bindings))
        .route_layer(middleware::from_fn_with_state(
            state.clone(),
            require_basic_auth,
        ));

    let api = public_api.merge(protected_api);

    let index_html = static_dir.join("index.html");
    let assets_dir = static_dir.join("assets");
    let config_js = static_dir.join("config.js");
    let favicon_svg = static_dir.join("favicon.svg");

    // Clone client for gRPC server before moving state
    let grpc_client = state.client.clone();

    let app = Router::new()
        .route("/ws", get(ws_handler::ws_handler))  // WebSocket endpoint
        .route("/api/exec", get(ws_handler::exec_ws_handler))
        .nest("/api", api)
        .nest_service("/assets", ServeDir::new(assets_dir))
        .route_service("/config.js", ServeFile::new(config_js))
        .route_service("/favicon.svg", ServeFile::new(favicon_svg))
        .route_service("/", ServeFile::new(index_html.clone()))
        .fallback_service(ServeFile::new(index_html))
        .with_state(state)
        .layer(cors);

    let addr: SocketAddr = ([0, 0, 0, 0], 8091).into();
    info!("Starting HTTP server on {}", addr);
    let listener = tokio::net::TcpListener::bind(addr).await?;
    let http_server = axum::serve(listener, app);

    // gRPC server
    let grpc_addr: SocketAddr = ([0, 0, 0, 0], 50051).into();
    info!("Starting gRPC server on {}", grpc_addr);
    
    let grpc_service = grpc_service::KubernetesWatchService::new(grpc_client).into_server();
    let grpc_server = Server::builder()
        .accept_http1(true)  // Required for grpc-web
        .add_service(tonic_web::enable(grpc_service))
        .serve(grpc_addr);

    // Run both servers concurrently
    tokio::try_join!(
        async { http_server.await.map_err(|e| anyhow::anyhow!(e)) },
        async { grpc_server.await.map_err(|e| anyhow::anyhow!(e)) }
    )?;

    Ok(())
}

async fn health() -> impl IntoResponse {
    let body = HealthResponse {
        status: "ok".into(),
    };
    (StatusCode::OK, Json(body))
}

async fn readiness(State(state): State<AppState>) -> impl IntoResponse {
    // Check if we can connect to Kubernetes API
    match state.client.apiserver_version().await {
        Ok(_) => {
            let body = HealthResponse {
                status: "ready".into(),
            };
            (StatusCode::OK, Json(body)).into_response()
        }
        Err(err) => {
            error!("Kubernetes API not reachable: {}", err);
            (StatusCode::SERVICE_UNAVAILABLE, Json(HealthResponse {
                status: "not ready".into(),
            })).into_response()
        }
    }
}

async fn login(State(state): State<AppState>, Json(payload): Json<LoginRequest>) -> impl IntoResponse {
    if payload.username == state.username && payload.password == state.password {
        // Create JWT token with 1-hour expiration
        let now = Utc::now();
        let exp = now + Duration::hours(1);
        
        let claims = Claims {
            sub: payload.username,
            exp: exp.timestamp(),
            iat: now.timestamp(),
        };
        
        match encode(
            &Header::default(),
            &claims,
            &EncodingKey::from_secret(state.jwt_secret.as_ref()),
        ) {
            Ok(token) => {
                return (StatusCode::OK, Json(LoginResponse { 
                    success: true, 
                    token: Some(token) 
                })).into_response();
            }
            Err(_) => {
                return StatusCode::INTERNAL_SERVER_ERROR.into_response();
            }
        }
    }

    (StatusCode::UNAUTHORIZED, Json(LoginResponse { 
        success: false, 
        token: None 
    })).into_response()
}

async fn require_basic_auth(
    State(state): State<AppState>,
    request: Request,
    next: Next,
) -> Response {
    let auth_header = request
        .headers()
        .get(header::AUTHORIZATION)
        .and_then(|value| value.to_str().ok());

    // Check for JWT Bearer token
    if let Some(auth) = auth_header {
        if auth.starts_with("Bearer ") {
            let token = &auth[7..];
            match decode::<Claims>(
                token,
                &DecodingKey::from_secret(state.jwt_secret.as_ref()),
                &Validation::default(),
            ) {
                Ok(_) => return next.run(request).await,
                Err(_) => return StatusCode::UNAUTHORIZED.into_response(),
            }
        }
    }

    // Fall back to Basic Auth
    let credentials = auth_header
        .and_then(parse_basic_auth);

    match credentials {
        Some((username, password)) if username == state.username && password == state.password => {
            next.run(request).await
        }
        _ => StatusCode::UNAUTHORIZED.into_response(),
    }
}

fn parse_basic_auth(value: &str) -> Option<(String, String)> {
    let encoded = value.strip_prefix("Basic ")?;
    let decoded = STANDARD.decode(encoded).ok()?;
    let decoded_str = String::from_utf8(decoded).ok()?;
    let (username, password) = decoded_str.split_once(':')?;
    Some((username.to_string(), password.to_string()))
}

async fn list_namespaces(State(state): State<AppState>) -> impl IntoResponse {
    use k8s_openapi::api::core::v1::Namespace;

    let api: Api<Namespace> = Api::all(state.client);
    match api.list(&ListParams::default()).await {
        Ok(list) => {
            let items: Vec<NamespaceItem> = list
                .items
                .into_iter()
                .filter_map(|ns| {
                    ns.metadata.name.map(|name| NamespaceItem {
                        name,
                        phase: ns
                            .status
                            .as_ref()
                            .and_then(|s| s.phase.clone())
                            .unwrap_or_else(|| "Unknown".into()),
                        labels: ns
                            .metadata
                            .labels
                            .as_ref()
                            .map(|labels| {
                                let mut pairs: Vec<String> = labels
                                    .iter()
                                    .map(|(key, value)| format!("{}={}", key, value))
                                    .collect();
                                pairs.sort();
                                if pairs.is_empty() {
                                    "-".to_string()
                                } else {
                                    pairs.join(", ")
                                }
                            })
                            .unwrap_or_else(|| "-".to_string()),
                        age: ns
                            .metadata
                            .creation_timestamp
                            .as_ref()
                            .map(|t| t.0.to_rfc3339())
                            .unwrap_or_default(),
                    })
                })
                .collect();
            let total = items.len();
            (StatusCode::OK, Json(ApiResponse { data: items, total })).into_response()
        }
        Err(err) => {
            error!("Error listing namespaces: {:?}", err);
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}

async fn list_pods(State(state): State<AppState>) -> impl IntoResponse {
    use k8s_openapi::api::core::v1::Pod;

    let client = state.client.clone();
    let api: Api<Pod> = Api::all(client.clone());
    let pod_metrics = fetch_pod_metrics(client).await;
    match api.list(&ListParams::default()).await {
        Ok(list) => {
            let items: Vec<PodItem> = list
                .items
                .into_iter()
                .map(|pod| {
                    let name = pod.metadata.name.unwrap_or_default();
                    let namespace = pod.metadata.namespace.unwrap_or_else(|| "default".into());
                    let (cpu, memory) = pod_metrics
                        .get(&(namespace.clone(), name.clone()))
                        .cloned()
                        .unwrap_or_else(|| ("-".to_string(), "-".to_string()));

                    let mut cpu_request_millicores_total = 0.0;
                    let mut memory_request_bytes_total = 0.0;
                    let mut cpu_limit_millicores_total = 0.0;
                    let mut memory_limit_bytes_total = 0.0;

                    if let Some(spec) = &pod.spec {
                        for container in &spec.containers {
                            if let Some(resources) = &container.resources {
                                if let Some(requests) = &resources.requests {
                                    if let Some(cpu_request) = requests
                                        .get("cpu")
                                        .and_then(|quantity| parse_cpu_millicores(&quantity.0))
                                    {
                                        cpu_request_millicores_total += cpu_request;
                                    }

                                    if let Some(memory_request) = requests
                                        .get("memory")
                                        .and_then(|quantity| parse_memory_bytes(&quantity.0))
                                    {
                                        memory_request_bytes_total += memory_request;
                                    }
                                }

                                if let Some(limits) = &resources.limits {
                                    if let Some(cpu_limit) = limits
                                        .get("cpu")
                                        .and_then(|quantity| parse_cpu_millicores(&quantity.0))
                                    {
                                        cpu_limit_millicores_total += cpu_limit;
                                    }

                                    if let Some(memory_limit) = limits
                                        .get("memory")
                                        .and_then(|quantity| parse_memory_bytes(&quantity.0))
                                    {
                                        memory_limit_bytes_total += memory_limit;
                                    }
                                }
                            }
                        }
                    }

                    let cpu_capacity_millicores = if cpu_limit_millicores_total > 0.0 {
                        Some(cpu_limit_millicores_total)
                    } else if cpu_request_millicores_total > 0.0 {
                        Some(cpu_request_millicores_total)
                    } else {
                        None
                    };

                    let memory_capacity_bytes = if memory_limit_bytes_total > 0.0 {
                        Some(memory_limit_bytes_total)
                    } else if memory_request_bytes_total > 0.0 {
                        Some(memory_request_bytes_total)
                    } else {
                        None
                    };

                    let cpu_usage_percent = match (
                        parse_cpu_millicores(&cpu),
                        cpu_capacity_millicores,
                    ) {
                        (Some(used), Some(capacity)) if capacity > 0.0 => {
                            Some((used / capacity * 100.0).min(100.0))
                        }
                        _ => None,
                    };

                    let memory_usage_percent = match (
                        parse_memory_bytes(&memory),
                        memory_capacity_bytes,
                    ) {
                        (Some(used), Some(capacity)) if capacity > 0.0 => {
                            Some((used / capacity * 100.0).min(100.0))
                        }
                        _ => None,
                    };

                    let cpu_capacity = cpu_capacity_millicores.map(format_millicores);
                    let memory_capacity = memory_capacity_bytes.map(format_binary_bytes);

                    let controlled_by = pod
                        .metadata
                        .owner_references
                        .as_ref()
                        .and_then(|owners| owners.first())
                        .map(|owner| format!("{}/{}", owner.kind, owner.name))
                        .unwrap_or_else(|| "-".to_string());
                    let creation_timestamp = pod
                        .metadata
                        .creation_timestamp
                        .as_ref()
                        .map(|t| t.0.to_rfc3339())
                        .unwrap_or_default();

                    // Check if pod is being deleted
                    let is_terminating = pod.metadata.deletion_timestamp.is_some();

                    let (status, phase, ready, restarts, pod_ip) = pod
                        .status
                        .as_ref()
                        .map(|status| {
                            let phase = status.phase.clone();
                            let container_statuses = status.container_statuses.as_ref();

                            // Calculate ready containers
                            let (ready_count, total_count) = container_statuses
                                .map(|items| {
                                    let ready_count = items.iter().filter(|item| item.ready).count();
                                    let total_count = items.len();
                                    (ready_count, total_count)
                                })
                                .unwrap_or((0, 0));

                            // Calculate total restarts from all containers
                            let restarts: u32 = container_statuses
                                .map(|items| {
                                    items
                                        .iter()
                                        .map(|item| item.restart_count.max(0) as u32)
                                        .sum()
                                })
                                .unwrap_or(0);

                            let ready = format!("{}/{}", ready_count, total_count);

                            // Determine accurate status
                            let computed_status = if is_terminating {
                                "Terminating".to_string()
                            } else if let Some(containers) = container_statuses {
                                // Check container states for more specific status
                                let mut found_waiting = false;
                                let mut waiting_reason = None;
                                let mut found_terminated = false;
                                let mut terminated_reason = None;

                                for container in containers {
                                    if let Some(state) = &container.state {
                                        if let Some(waiting) = &state.waiting {
                                            found_waiting = true;
                                            waiting_reason = waiting.reason.clone();
                                            break;
                                        }
                                        if let Some(terminated) = &state.terminated {
                                            found_terminated = true;
                                            terminated_reason = terminated.reason.clone();
                                        }
                                    }
                                }

                                if found_waiting {
                                    waiting_reason.unwrap_or_else(|| "Waiting".to_string())
                                } else if found_terminated {
                                    terminated_reason.unwrap_or_else(|| "Terminated".to_string())
                                } else {
                                    phase.clone().unwrap_or_else(|| "Unknown".to_string())
                                }
                            } else {
                                phase.clone().unwrap_or_else(|| "Unknown".to_string())
                            };

                            (Some(computed_status), phase, ready, restarts, status.pod_ip.clone())
                        })
                        .unwrap_or_else(|| {
                            let status = if is_terminating {
                                Some("Terminating".to_string())
                            } else {
                                Some("Unknown".to_string())
                            };
                            (status, None, "0/0".to_string(), 0, None)
                        });

                    let node = pod.spec.as_ref().and_then(|spec| spec.node_name.clone());
                    let qos = pod
                        .status
                        .as_ref()
                        .and_then(|status| status.qos_class.clone())
                        .unwrap_or_else(|| "-".to_string());

                    PodItem {
                        name,
                        namespace,
                        status,
                        phase,
                        ready,
                        restarts,
                        age: creation_timestamp,
                        node,
                        pod_ip,
                        cpu,
                        memory,
                        cpu_capacity,
                        memory_capacity,
                        cpu_usage_percent,
                        memory_usage_percent,
                        controlled_by,
                        qos,
                    }
                })
                .collect();
            let total = items.len();
            (StatusCode::OK, Json(ApiResponse { data: items, total })).into_response()
        }
        Err(err) => {
            error!("Error listing pods: {:?}", err);
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}

async fn list_nodes(State(state): State<AppState>) -> impl IntoResponse {
    use k8s_openapi::api::core::v1::Node;

    let client = state.client.clone();
    let api: Api<Node> = Api::all(client.clone());
    let node_metrics_map = fetch_node_metrics(client).await;
    match api.list(&ListParams::default()).await {
        Ok(list) => {
            let items: Vec<NodeItem> = list
                .items
                .into_iter()
                .map(|node| {
                    let name = node.metadata.name.unwrap_or_default();
                    let roles = node
                        .metadata
                        .labels
                        .as_ref()
                        .map(|labels| {
                            let mut collected: Vec<String> = labels
                                .keys()
                                .filter_map(|key| {
                                    if let Some(role) = key.strip_prefix("node-role.kubernetes.io/") {
                                        if role.is_empty() {
                                            Some("node".to_string())
                                        } else {
                                            Some(role.to_string())
                                        }
                                    } else {
                                        None
                                    }
                                })
                                .collect();

                            if let Some(role) = labels.get("kubernetes.io/role") {
                                if !role.is_empty() {
                                    collected.push(role.clone());
                                }
                            }

                            if collected.is_empty() {
                                collected.push("worker".to_string());
                            }

                            collected.sort();
                            collected.dedup();
                            collected
                        })
                        .unwrap_or_else(|| vec!["worker".to_string()]);
                    let ready = node
                        .status
                        .as_ref()
                        .and_then(|status| status.conditions.as_ref())
                        .and_then(|conditions| {
                            conditions
                                .iter()
                                .find(|condition| condition.type_ == "Ready")
                                .map(|condition| condition.status.clone())
                        });
                    let kubelet_version = node
                        .status
                        .as_ref()
                        .and_then(|status| status.node_info.as_ref())
                        .map(|info| info.kubelet_version.clone());
                    let os_image = node
                        .status
                        .as_ref()
                        .and_then(|status| status.node_info.as_ref())
                        .map(|info| info.os_image.clone());
                    let internal_ip = node
                        .status
                        .as_ref()
                        .and_then(|status| status.addresses.as_ref())
                        .and_then(|addresses| {
                            addresses
                                .iter()
                                .find(|address| address.type_ == "InternalIP")
                                .map(|address| address.address.clone())
                        });
                    let external_ip = node
                        .status
                        .as_ref()
                        .and_then(|status| status.addresses.as_ref())
                        .and_then(|addresses| {
                            addresses
                                .iter()
                                .find(|address| address.type_ == "ExternalIP")
                                .map(|address| address.address.clone())
                        });
                    let (ipv4, ipv6) = node
                        .status
                        .as_ref()
                        .and_then(|status| status.addresses.as_ref())
                        .map(|addresses| {
                            let first_ipv4 = addresses
                                .iter()
                                .filter(|address| {
                                    address.type_ == "InternalIP" || address.type_ == "ExternalIP"
                                })
                                .map(|address| address.address.clone())
                                .find(|address| address.contains('.'));

                            let first_ipv6 = addresses
                                .iter()
                                .filter(|address| {
                                    address.type_ == "InternalIP" || address.type_ == "ExternalIP"
                                })
                                .map(|address| address.address.clone())
                                .find(|address| address.contains(':'));

                            (first_ipv4, first_ipv6)
                        })
                        .unwrap_or((None, None));
                    let ip = ipv4
                        .clone()
                        .or_else(|| internal_ip.clone())
                        .or_else(|| external_ip.clone())
                        .or_else(|| ipv6.clone());
                    let taints = node
                        .spec
                        .as_ref()
                        .and_then(|spec| spec.taints.as_ref())
                        .map(|items| {
                            items
                                .iter()
                                .map(|taint| {
                                    let key = taint.key.clone();
                                    let effect = taint.effect.clone();
                                    match &taint.value {
                                        Some(value) => format!("{}={}:{}", key, value, effect),
                                        None => format!("{}:{}", key, effect),
                                    }
                                })
                                .collect::<Vec<String>>()
                        })
                        .unwrap_or_default();
                    let runtime = node
                        .status
                        .as_ref()
                        .and_then(|status| status.node_info.as_ref())
                        .map(|info| info.container_runtime_version.clone());

                    let cpu = node
                        .status
                        .as_ref()
                        .and_then(|status| status.allocatable.as_ref())
                        .and_then(|allocatable| allocatable.get("cpu"))
                        .map(|cpu_value| cpu_value.0.clone());

                    let memory = node
                        .status
                        .as_ref()
                        .and_then(|status| status.allocatable.as_ref())
                        .and_then(|allocatable| allocatable.get("memory"))
                        .map(|mem_value| mem_value.0.clone());

                    let (cpu_used_raw, memory_used_raw) = node_metrics_map
                        .get(&name)
                        .cloned()
                        .unwrap_or_else(|| ("-".to_string(), "-".to_string()));

                    let cpu_usage_percent = match (
                        cpu.as_deref().and_then(parse_cpu_millicores),
                        parse_cpu_millicores(&cpu_used_raw),
                    ) {
                        (Some(capacity), Some(used)) if capacity > 0.0 => {
                            Some((used / capacity * 100.0).min(100.0))
                        }
                        _ => None,
                    };

                    let memory_usage_percent = match (
                        memory.as_deref().and_then(parse_memory_bytes),
                        parse_memory_bytes(&memory_used_raw),
                    ) {
                        (Some(capacity), Some(used)) if capacity > 0.0 => {
                            Some((used / capacity * 100.0).min(100.0))
                        }
                        _ => None,
                    };

                    let cpu_used = if cpu_used_raw == "-" {
                        None
                    } else {
                        Some(cpu_used_raw)
                    };

                    let memory_used = if memory_used_raw == "-" {
                        None
                    } else {
                        Some(memory_used_raw)
                    };

                    NodeItem {
                        name,
                        ready,
                        roles,
                        kubelet_version,
                        os_image,
                        ip,
                        ipv4,
                        ipv6,
                        internal_ip,
                        external_ip,
                        taints,
                        runtime,
                        cpu,
                        memory,
                        cpu_used,
                        memory_used,
                        cpu_usage_percent,
                        memory_usage_percent,
                    }
                })
                .collect();
            let total = items.len();
            (StatusCode::OK, Json(ApiResponse { data: items, total })).into_response()
        }
        Err(err) => {
            error!("Error listing nodes: {:?}", err);
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}

async fn list_events(State(state): State<AppState>) -> impl IntoResponse {
    use k8s_openapi::api::core::v1::Event;

    let api: Api<Event> = Api::all(state.client);
    match api.list(&ListParams::default()).await {
        Ok(list) => {
            let items: Vec<EventItem> = list
                .items
                .into_iter()
                .map(|event| {
                    let name = event.metadata.name.unwrap_or_default();
                    let namespace = event.metadata.namespace.unwrap_or_else(|| "default".into());
                    let kind = event.involved_object.kind;
                    let reason = event.reason;
                    let message = event.message;
                    let type_ = event.type_;
                    EventItem {
                        name,
                        namespace,
                        kind,
                        reason,
                        message,
                        type_,
                    }
                })
                .collect();
            let total = items.len();
            (StatusCode::OK, Json(ApiResponse { data: items, total })).into_response()
        }
        Err(err) => {
            error!("Error listing events: {:?}", err);
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}

async fn list_deployments(State(state): State<AppState>) -> impl IntoResponse {
    use k8s_openapi::api::apps::v1::Deployment;

    let api: Api<Deployment> = Api::all(state.client);
    match api.list(&ListParams::default()).await {
        Ok(list) => {
            let items: Vec<DeploymentItem> = list
                .items
                .into_iter()
                .map(|item| {
                    let name = item.metadata.name.unwrap_or_default();
                    let namespace = item.metadata.namespace.unwrap_or_else(|| "default".into());
                    let desired = item
                        .spec
                        .as_ref()
                        .and_then(|spec| spec.replicas)
                        .unwrap_or(1);
                    let ready = item
                        .status
                        .as_ref()
                        .and_then(|s| s.ready_replicas)
                        .unwrap_or(0);
                    let updated = item
                        .status
                        .as_ref()
                        .and_then(|s| s.updated_replicas)
                        .unwrap_or(0);
                    let available = item
                        .status
                        .as_ref()
                        .and_then(|s| s.available_replicas)
                        .unwrap_or(0);
                    let images = item
                        .spec
                        .as_ref()
                        .and_then(|spec| spec.template.spec.as_ref())
                        .map(|pod_spec| {
                            pod_spec
                                .containers
                                .iter()
                                .map(|container| container.image.clone().unwrap_or_default())
                                .filter(|image| !image.is_empty())
                                .collect::<Vec<String>>()
                        })
                        .unwrap_or_default();
                    let age = item
                        .metadata
                        .creation_timestamp
                        .as_ref()
                        .map(|t| t.0.to_rfc3339())
                        .unwrap_or_default();
                    let status = if desired == 0 {
                        "Stopped".to_string()
                    } else if updated >= desired && available >= desired {
                        "Running".to_string()
                    } else if updated > 0 || available > 0 {
                        "Progressing".to_string()
                    } else {
                        "Pending".to_string()
                    };

                    DeploymentItem {
                        name,
                        namespace,
                        status,
                        ready: format!("{}/{}", ready, desired),
                        updated,
                        available,
                        images,
                        age,
                    }
                })
                .collect();
            let total = items.len();
            (StatusCode::OK, Json(ApiResponse { data: items, total })).into_response()
        }
        Err(err) => {
            error!("Error listing deployments: {:?}", err);
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}

async fn scale_deployment(
    Path((namespace, name)): Path<(String, String)>,
    State(state): State<AppState>,
    Json(payload): Json<ScaleRequest>,
) -> impl IntoResponse {
    use k8s_openapi::api::apps::v1::Deployment;

    let api: Api<Deployment> = Api::namespaced(state.client, &namespace);
    
    match api.get(&name).await {
        Ok(mut deployment) => {
            if let Some(ref mut spec) = deployment.spec {
                spec.replicas = Some(payload.replicas);
            }
            
            match api.replace(&name, &Default::default(), &deployment).await {
                Ok(_) => {
                    info!("Scaled deployment {}/{} to {} replicas", namespace, name, payload.replicas);
                    (StatusCode::OK, Json(serde_json::json!({
                        "success": true,
                        "replicas": payload.replicas
                    }))).into_response()
                }
                Err(err) => {
                    error!("Error scaling deployment {}/{}: {:?}", namespace, name, err);
                    StatusCode::INTERNAL_SERVER_ERROR.into_response()
                }
            }
        }
        Err(err) => {
            error!("Error getting deployment {}/{}: {:?}", namespace, name, err);
            StatusCode::NOT_FOUND.into_response()
        }
    }
}

async fn restart_deployment(
    Path((namespace, name)): Path<(String, String)>,
    State(state): State<AppState>,
) -> impl IntoResponse {
    use k8s_openapi::api::apps::v1::Deployment;

    let api: Api<Deployment> = Api::namespaced(state.client, &namespace);
    let restarted_at = Utc::now().to_rfc3339();

    let patch = serde_json::json!({
        "spec": {
            "template": {
                "metadata": {
                    "annotations": {
                        "kubectl.kubernetes.io/restartedAt": restarted_at
                    }
                }
            }
        }
    });

    match api
        .patch(
            &name,
            &PatchParams::default(),
            &Patch::Merge(&patch),
        )
        .await
    {
        Ok(_) => {
            info!("Restarted deployment {}/{}", namespace, name);
            (StatusCode::OK, Json(serde_json::json!({ "success": true }))).into_response()
        }
        Err(err) => {
            error!("Error restarting deployment {}/{}: {:?}", namespace, name, err);
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}

async fn get_pod_yaml(
    Path((namespace, name)): Path<(String, String)>,
    State(state): State<AppState>,
) -> impl IntoResponse {
    use k8s_openapi::api::core::v1::Pod;

    let api: Api<Pod> = Api::namespaced(state.client, &namespace);
    match api.get(&name).await {
        Ok(pod) => match serde_yaml::to_string(&pod) {
            Ok(yaml) => (
                StatusCode::OK,
                [(header::CONTENT_TYPE, "application/yaml; charset=utf-8")],
                yaml,
            )
                .into_response(),
            Err(err) => {
                error!(
                    "Failed to serialize pod to YAML {}/{}: {:?}",
                    namespace, name, err
                );
                StatusCode::INTERNAL_SERVER_ERROR.into_response()
            }
        },
        Err(err) => {
            error!("Error getting pod YAML {}/{}: {:?}", namespace, name, err);
            StatusCode::NOT_FOUND.into_response()
        }
    }
}

async fn get_pod_logs(
    Path((namespace, name)): Path<(String, String)>,
    State(state): State<AppState>,
) -> impl IntoResponse {
    use k8s_openapi::api::core::v1::Pod;
    use kube::api::LogParams;

    let api: Api<Pod> = Api::namespaced(state.client, &namespace);
    
    let log_params = LogParams {
        tail_lines: Some(1000),
        timestamps: true,
        ..Default::default()
    };

    match api.logs(&name, &log_params).await {
        Ok(logs) => (
            StatusCode::OK,
            [(header::CONTENT_TYPE, "text/plain; charset=utf-8")],
            logs,
        )
            .into_response(),
        Err(err) => {
            error!("Error getting pod logs {}/{}: {:?}", namespace, name, err);
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}

async fn update_pod_yaml(
    Path((namespace, name)): Path<(String, String)>,
    State(state): State<AppState>,
    body: String,
) -> impl IntoResponse {
    use k8s_openapi::api::core::v1::Pod;

    let mut pod: Pod = match serde_yaml::from_str(&body) {
        Ok(pod) => pod,
        Err(err) => {
            return (
                StatusCode::BAD_REQUEST,
                Json(serde_json::json!({
                    "success": false,
                    "message": format!("Invalid YAML: {}", err),
                })),
            )
                .into_response();
        }
    };

    pod.metadata.name = Some(name.clone());
    pod.metadata.namespace = Some(namespace.clone());

    let api: Api<Pod> = Api::namespaced(state.client, &namespace);
    let patch_value = match serde_json::to_value(&pod) {
        Ok(value) => value,
        Err(err) => {
            error!(
                "Failed converting pod YAML to JSON {}/{}: {:?}",
                namespace, name, err
            );
            return StatusCode::INTERNAL_SERVER_ERROR.into_response();
        }
    };

    let patch_params = PatchParams::apply("pertisk-kube-web").force();
    match api.patch(&name, &patch_params, &Patch::Apply(patch_value)).await {
        Ok(_) => (
            StatusCode::OK,
            Json(serde_json::json!({
                "success": true,
                "message": "Pod updated successfully"
            })),
        )
            .into_response(),
        Err(err) => {
            error!("Error updating pod YAML {}/{}: {:?}", namespace, name, err);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({
                    "success": false,
                    "message": format!("Failed to update pod: {}", err)
                })),
            )
                .into_response()
        }
    }
}

async fn get_deployment_yaml(
    Path((namespace, name)): Path<(String, String)>,
    State(state): State<AppState>,
) -> impl IntoResponse {
    use k8s_openapi::api::apps::v1::Deployment;

    let api: Api<Deployment> = Api::namespaced(state.client, &namespace);
    match api.get(&name).await {
        Ok(deployment) => match serde_yaml::to_string(&deployment) {
            Ok(yaml) => (
                StatusCode::OK,
                [(header::CONTENT_TYPE, "application/yaml; charset=utf-8")],
                yaml,
            )
                .into_response(),
            Err(err) => {
                error!(
                    "Failed to serialize deployment to YAML {}/{}: {:?}",
                    namespace, name, err
                );
                StatusCode::INTERNAL_SERVER_ERROR.into_response()
            }
        },
        Err(err) => {
            error!("Error getting deployment YAML {}/{}: {:?}", namespace, name, err);
            StatusCode::NOT_FOUND.into_response()
        }
    }
}

async fn update_deployment_yaml(
    Path((namespace, name)): Path<(String, String)>,
    State(state): State<AppState>,
    body: String,
) -> impl IntoResponse {
    use k8s_openapi::api::apps::v1::Deployment;

    let mut deployment: Deployment = match serde_yaml::from_str(&body) {
        Ok(deployment) => deployment,
        Err(err) => {
            return (
                StatusCode::BAD_REQUEST,
                Json(serde_json::json!({
                    "success": false,
                    "message": format!("Invalid YAML: {}", err),
                })),
            )
                .into_response();
        }
    };

    deployment.metadata.name = Some(name.clone());
    deployment.metadata.namespace = Some(namespace.clone());

    let api: Api<Deployment> = Api::namespaced(state.client, &namespace);
    let patch_value = match serde_json::to_value(&deployment) {
        Ok(value) => value,
        Err(err) => {
            error!(
                "Failed converting deployment YAML to JSON {}/{}: {:?}",
                namespace, name, err
            );
            return StatusCode::INTERNAL_SERVER_ERROR.into_response();
        }
    };

    let patch_params = PatchParams::apply("pertisk-kube-web").force();
    match api.patch(&name, &patch_params, &Patch::Apply(patch_value)).await {
        Ok(_) => (
            StatusCode::OK,
            Json(serde_json::json!({
                "success": true,
                "message": "Deployment updated successfully"
            })),
        )
            .into_response(),
        Err(err) => {
            error!("Error updating deployment YAML {}/{}: {:?}", namespace, name, err);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({
                    "success": false,
                    "message": format!("Failed to update deployment: {}", err),
                })),
            )
                .into_response()
        }
    }
}

async fn get_statefulset_yaml(
    Path((namespace, name)): Path<(String, String)>,
    State(state): State<AppState>,
) -> impl IntoResponse {
    use k8s_openapi::api::apps::v1::StatefulSet;

    let api: Api<StatefulSet> = Api::namespaced(state.client, &namespace);
    match api.get(&name).await {
        Ok(statefulset) => match serde_yaml::to_string(&statefulset) {
            Ok(yaml) => (
                StatusCode::OK,
                [(header::CONTENT_TYPE, "application/yaml; charset=utf-8")],
                yaml,
            )
                .into_response(),
            Err(err) => {
                error!(
                    "Failed to serialize statefulset to YAML {}/{}: {:?}",
                    namespace, name, err
                );
                StatusCode::INTERNAL_SERVER_ERROR.into_response()
            }
        },
        Err(err) => {
            error!("Error getting statefulset YAML {}/{}: {:?}", namespace, name, err);
            StatusCode::NOT_FOUND.into_response()
        }
    }
}

async fn update_statefulset_yaml(
    Path((namespace, name)): Path<(String, String)>,
    State(state): State<AppState>,
    body: String,
) -> impl IntoResponse {
    use k8s_openapi::api::apps::v1::StatefulSet;

    let mut statefulset: StatefulSet = match serde_yaml::from_str(&body) {
        Ok(statefulset) => statefulset,
        Err(err) => {
            return (
                StatusCode::BAD_REQUEST,
                Json(serde_json::json!({
                    "success": false,
                    "message": format!("Invalid YAML: {}", err),
                })),
            )
                .into_response();
        }
    };

    statefulset.metadata.name = Some(name.clone());
    statefulset.metadata.namespace = Some(namespace.clone());

    let api: Api<StatefulSet> = Api::namespaced(state.client, &namespace);
    let patch_value = match serde_json::to_value(&statefulset) {
        Ok(value) => value,
        Err(err) => {
            error!(
                "Failed converting statefulset YAML to JSON {}/{}: {:?}",
                namespace, name, err
            );
            return StatusCode::INTERNAL_SERVER_ERROR.into_response();
        }
    };

    let patch_params = PatchParams::apply("pertisk-kube-web").force();
    match api.patch(&name, &patch_params, &Patch::Apply(patch_value)).await {
        Ok(_) => (
            StatusCode::OK,
            Json(serde_json::json!({
                "success": true,
                "message": "StatefulSet updated successfully"
            })),
        )
            .into_response(),
        Err(err) => {
            error!("Error updating statefulset YAML {}/{}: {:?}", namespace, name, err);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({
                    "success": false,
                    "message": format!("Failed to update statefulset: {}", err),
                })),
            )
                .into_response()
        }
    }
}

async fn get_daemonset_yaml(
    Path((namespace, name)): Path<(String, String)>,
    State(state): State<AppState>,
) -> impl IntoResponse {
    use k8s_openapi::api::apps::v1::DaemonSet;

    let api: Api<DaemonSet> = Api::namespaced(state.client, &namespace);
    match api.get(&name).await {
        Ok(daemonset) => match serde_yaml::to_string(&daemonset) {
            Ok(yaml) => (
                StatusCode::OK,
                [(header::CONTENT_TYPE, "application/yaml; charset=utf-8")],
                yaml,
            )
                .into_response(),
            Err(err) => {
                error!(
                    "Failed to serialize daemonset to YAML {}/{}: {:?}",
                    namespace, name, err
                );
                StatusCode::INTERNAL_SERVER_ERROR.into_response()
            }
        },
        Err(err) => {
            error!("Error getting daemonset YAML {}/{}: {:?}", namespace, name, err);
            StatusCode::NOT_FOUND.into_response()
        }
    }
}

async fn update_daemonset_yaml(
    Path((namespace, name)): Path<(String, String)>,
    State(state): State<AppState>,
    body: String,
) -> impl IntoResponse {
    use k8s_openapi::api::apps::v1::DaemonSet;

    let mut daemonset: DaemonSet = match serde_yaml::from_str(&body) {
        Ok(daemonset) => daemonset,
        Err(err) => {
            return (
                StatusCode::BAD_REQUEST,
                Json(serde_json::json!({
                    "success": false,
                    "message": format!("Invalid YAML: {}", err),
                })),
            )
                .into_response();
        }
    };

    daemonset.metadata.name = Some(name.clone());
    daemonset.metadata.namespace = Some(namespace.clone());

    let api: Api<DaemonSet> = Api::namespaced(state.client, &namespace);
    let patch_value = match serde_json::to_value(&daemonset) {
        Ok(value) => value,
        Err(err) => {
            error!(
                "Failed converting daemonset YAML to JSON {}/{}: {:?}",
                namespace, name, err
            );
            return StatusCode::INTERNAL_SERVER_ERROR.into_response();
        }
    };

    let patch_params = PatchParams::apply("pertisk-kube-web").force();
    match api.patch(&name, &patch_params, &Patch::Apply(patch_value)).await {
        Ok(_) => (
            StatusCode::OK,
            Json(serde_json::json!({
                "success": true,
                "message": "DaemonSet updated successfully"
            })),
        )
            .into_response(),
        Err(err) => {
            error!("Error updating daemonset YAML {}/{}: {:?}", namespace, name, err);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({
                    "success": false,
                    "message": format!("Failed to update daemonset: {}", err),
                })),
            )
                .into_response()
        }
    }
}

async fn get_job_yaml(
    Path((namespace, name)): Path<(String, String)>,
    State(state): State<AppState>,
) -> impl IntoResponse {
    use k8s_openapi::api::batch::v1::Job;

    let api: Api<Job> = Api::namespaced(state.client, &namespace);
    match api.get(&name).await {
        Ok(job) => match serde_yaml::to_string(&job) {
            Ok(yaml) => (
                StatusCode::OK,
                [(header::CONTENT_TYPE, "application/yaml; charset=utf-8")],
                yaml,
            )
                .into_response(),
            Err(err) => {
                error!(
                    "Failed to serialize job to YAML {}/{}: {:?}",
                    namespace, name, err
                );
                StatusCode::INTERNAL_SERVER_ERROR.into_response()
            }
        },
        Err(err) => {
            error!("Error getting job YAML {}/{}: {:?}", namespace, name, err);
            StatusCode::NOT_FOUND.into_response()
        }
    }
}

async fn update_job_yaml(
    Path((namespace, name)): Path<(String, String)>,
    State(state): State<AppState>,
    body: String,
) -> impl IntoResponse {
    use k8s_openapi::api::batch::v1::Job;

    let mut job: Job = match serde_yaml::from_str(&body) {
        Ok(job) => job,
        Err(err) => {
            return (
                StatusCode::BAD_REQUEST,
                Json(serde_json::json!({
                    "success": false,
                    "message": format!("Invalid YAML: {}", err),
                })),
            )
                .into_response();
        }
    };

    job.metadata.name = Some(name.clone());
    job.metadata.namespace = Some(namespace.clone());

    let api: Api<Job> = Api::namespaced(state.client, &namespace);
    let patch_value = match serde_json::to_value(&job) {
        Ok(value) => value,
        Err(err) => {
            error!(
                "Failed converting job YAML to JSON {}/{}: {:?}",
                namespace, name, err
            );
            return StatusCode::INTERNAL_SERVER_ERROR.into_response();
        }
    };

    let patch_params = PatchParams::apply("pertisk-kube-web").force();
    match api.patch(&name, &patch_params, &Patch::Apply(patch_value)).await {
        Ok(_) => (
            StatusCode::OK,
            Json(serde_json::json!({
                "success": true,
                "message": "Job updated successfully"
            })),
        )
            .into_response(),
        Err(err) => {
            error!("Error updating job YAML {}/{}: {:?}", namespace, name, err);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({
                    "success": false,
                    "message": format!("Failed to update job: {}", err),
                })),
            )
                .into_response()
        }
    }
}

async fn get_cronjob_yaml(
    Path((namespace, name)): Path<(String, String)>,
    State(state): State<AppState>,
) -> impl IntoResponse {
    use k8s_openapi::api::batch::v1::CronJob;

    let api: Api<CronJob> = Api::namespaced(state.client, &namespace);
    match api.get(&name).await {
        Ok(cronjob) => match serde_yaml::to_string(&cronjob) {
            Ok(yaml) => (
                StatusCode::OK,
                [(header::CONTENT_TYPE, "application/yaml; charset=utf-8")],
                yaml,
            )
                .into_response(),
            Err(err) => {
                error!(
                    "Failed to serialize cronjob to YAML {}/{}: {:?}",
                    namespace, name, err
                );
                StatusCode::INTERNAL_SERVER_ERROR.into_response()
            }
        },
        Err(err) => {
            error!("Error getting cronjob YAML {}/{}: {:?}", namespace, name, err);
            StatusCode::NOT_FOUND.into_response()
        }
    }
}

async fn update_cronjob_yaml(
    Path((namespace, name)): Path<(String, String)>,
    State(state): State<AppState>,
    body: String,
) -> impl IntoResponse {
    use k8s_openapi::api::batch::v1::CronJob;

    let mut cronjob: CronJob = match serde_yaml::from_str(&body) {
        Ok(cronjob) => cronjob,
        Err(err) => {
            return (
                StatusCode::BAD_REQUEST,
                Json(serde_json::json!({
                    "success": false,
                    "message": format!("Invalid YAML: {}", err),
                })),
            )
                .into_response();
        }
    };

    cronjob.metadata.name = Some(name.clone());
    cronjob.metadata.namespace = Some(namespace.clone());

    let api: Api<CronJob> = Api::namespaced(state.client, &namespace);
    let patch_value = match serde_json::to_value(&cronjob) {
        Ok(value) => value,
        Err(err) => {
            error!(
                "Failed converting cronjob YAML to JSON {}/{}: {:?}",
                namespace, name, err
            );
            return StatusCode::INTERNAL_SERVER_ERROR.into_response();
        }
    };

    let patch_params = PatchParams::apply("pertisk-kube-web").force();
    match api.patch(&name, &patch_params, &Patch::Apply(patch_value)).await {
        Ok(_) => (
            StatusCode::OK,
            Json(serde_json::json!({
                "success": true,
                "message": "CronJob updated successfully"
            })),
        )
            .into_response(),
        Err(err) => {
            error!("Error updating cronjob YAML {}/{}: {:?}", namespace, name, err);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({
                    "success": false,
                    "message": format!("Failed to update cronjob: {}", err),
                })),
            )
                .into_response()
        }
    }
}

async fn list_statefulsets(State(state): State<AppState>) -> impl IntoResponse {
    use k8s_openapi::api::apps::v1::StatefulSet;

    let api: Api<StatefulSet> = Api::all(state.client);
    match api.list(&ListParams::default()).await {
        Ok(list) => {
            let items: Vec<StatefulSetItem> = list
                .items
                .into_iter()
                .map(|item| {
                    let name = item.metadata.name.unwrap_or_default();
                    let namespace = item.metadata.namespace.unwrap_or_else(|| "default".into());
                    let ready = item
                        .status
                        .as_ref()
                        .and_then(|s| s.ready_replicas)
                        .unwrap_or(0);
                    let desired = item.spec.as_ref().and_then(|s| s.replicas).unwrap_or(0);
                    let current = item
                        .status
                        .as_ref()
                        .and_then(|s| s.current_replicas)
                        .unwrap_or(0);
                    let updated = item
                        .status
                        .as_ref()
                        .and_then(|s| s.updated_replicas)
                        .unwrap_or(0);
                    let age = item
                        .metadata
                        .creation_timestamp
                        .as_ref()
                        .map(|t| t.0.to_rfc3339())
                        .unwrap_or_default();
                    let images = item
                        .spec
                        .as_ref()
                        .and_then(|spec| spec.template.spec.as_ref())
                        .map(|pod_spec| {
                            pod_spec
                                .containers
                                .iter()
                                .filter_map(|container| container.image.clone())
                                .collect::<Vec<_>>()
                        })
                        .unwrap_or_default();
                    let status = if desired == 0 {
                        "Stopped".to_string()
                    } else if ready >= desired {
                        "Running".to_string()
                    } else if ready > 0 {
                        "Progressing".to_string()
                    } else {
                        "Pending".to_string()
                    };

                    StatefulSetItem {
                        name,
                        namespace,
                        status,
                        ready: format!("{}/{}", ready, desired),
                        current,
                        updated,
                        age,
                        images,
                    }
                })
                .collect();
            let total = items.len();
            (StatusCode::OK, Json(ApiResponse { data: items, total })).into_response()
        }
        Err(err) => {
            error!("Error listing statefulsets: {:?}", err);
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}

async fn list_daemonsets(State(state): State<AppState>) -> impl IntoResponse {
    use k8s_openapi::api::apps::v1::DaemonSet;

    let api: Api<DaemonSet> = Api::all(state.client);
    match api.list(&ListParams::default()).await {
        Ok(list) => {
            let items: Vec<DaemonSetItem> = list
                .items
                .into_iter()
                .map(|item| {
                    let name = item.metadata.name.unwrap_or_default();
                    let namespace = item.metadata.namespace.unwrap_or_else(|| "default".into());
                    let ready = item.status.as_ref().map(|s| s.number_ready).unwrap_or(0);
                    let desired = item
                        .status
                        .as_ref()
                        .map(|s| s.desired_number_scheduled)
                        .unwrap_or(0);
                    let current = item
                        .status
                        .as_ref()
                        .map(|s| s.current_number_scheduled)
                        .unwrap_or(0);
                    let available = item
                        .status
                        .as_ref()
                        .and_then(|s| s.number_available)
                        .unwrap_or(0);
                    let updated = item
                        .status
                        .as_ref()
                        .and_then(|s| s.updated_number_scheduled)
                        .unwrap_or(0);
                    let node_selector = item
                        .spec
                        .as_ref()
                        .and_then(|spec| spec.template.spec.as_ref())
                        .and_then(|pod_spec| pod_spec.node_selector.clone())
                        .unwrap_or_default();
                    let images = item
                        .spec
                        .as_ref()
                        .and_then(|spec| spec.template.spec.as_ref())
                        .map(|pod_spec| {
                            pod_spec
                                .containers
                                .iter()
                                .filter_map(|container| container.image.clone())
                                .collect::<Vec<_>>()
                        })
                        .unwrap_or_default();
                    let age = item
                        .metadata
                        .creation_timestamp
                        .as_ref()
                        .map(|t| t.0.to_rfc3339())
                        .unwrap_or_default();
                    let status = if desired == 0 {
                        "Stopped".to_string()
                    } else if ready >= desired {
                        "Running".to_string()
                    } else if ready > 0 || available > 0 {
                        "Progressing".to_string()
                    } else {
                        "Pending".to_string()
                    };

                    DaemonSetItem {
                        name,
                        namespace,
                        status,
                        desired,
                        current,
                        ready,
                        available,
                        updated,
                        node_selector,
                        age,
                        images,
                    }
                })
                .collect();
            let total = items.len();
            (StatusCode::OK, Json(ApiResponse { data: items, total })).into_response()
        }
        Err(err) => {
            error!("Error listing daemonsets: {:?}", err);
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}

async fn list_replicasets(State(state): State<AppState>) -> impl IntoResponse {
    use k8s_openapi::api::apps::v1::ReplicaSet;

    let api: Api<ReplicaSet> = Api::all(state.client);
    match api.list(&ListParams::default()).await {
        Ok(list) => {
            let items: Vec<ReplicaSetItem> = list
                .items
                .into_iter()
                .map(|item| {
                    let name = item.metadata.name.unwrap_or_default();
                    let namespace = item.metadata.namespace.unwrap_or_else(|| "default".into());
                    let ready = item
                        .status
                        .as_ref()
                        .and_then(|s| s.ready_replicas)
                        .unwrap_or(0);
                    let desired = item.spec.as_ref().and_then(|s| s.replicas).unwrap_or(0);
                    let current = item.status.as_ref().map(|s| s.replicas).unwrap_or(0);
                    let available = item
                        .status
                        .as_ref()
                        .and_then(|s| s.available_replicas)
                        .unwrap_or(0);
                    let age = item
                        .metadata
                        .creation_timestamp
                        .as_ref()
                        .map(|t| t.0.to_rfc3339())
                        .unwrap_or_default();
                    let images = item
                        .spec
                        .as_ref()
                        .and_then(|spec| spec.template.as_ref())
                        .and_then(|template| template.spec.as_ref())
                        .map(|pod_spec| {
                            pod_spec
                                .containers
                                .iter()
                                .filter_map(|container| container.image.clone())
                                .collect::<Vec<_>>()
                        })
                        .unwrap_or_default();
                    let status = if desired == 0 {
                        "Stopped".to_string()
                    } else if ready >= desired {
                        "Running".to_string()
                    } else if ready > 0 || available > 0 {
                        "Progressing".to_string()
                    } else {
                        "Pending".to_string()
                    };

                    ReplicaSetItem {
                        name,
                        namespace,
                        status,
                        desired,
                        current,
                        ready,
                        available,
                        age,
                        images,
                    }
                })
                .collect();
            let total = items.len();
            (StatusCode::OK, Json(ApiResponse { data: items, total })).into_response()
        }
        Err(err) => {
            error!("Error listing replicasets: {:?}", err);
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}

async fn get_replicaset_yaml(
    Path((namespace, name)): Path<(String, String)>,
    State(state): State<AppState>,
) -> impl IntoResponse {
    use k8s_openapi::api::apps::v1::ReplicaSet;

    let api: Api<ReplicaSet> = Api::namespaced(state.client, &namespace);
    match api.get(&name).await {
        Ok(replicaset) => match serde_yaml::to_string(&replicaset) {
            Ok(yaml) => (
                StatusCode::OK,
                [(header::CONTENT_TYPE, "application/yaml; charset=utf-8")],
                yaml,
            )
                .into_response(),
            Err(err) => {
                error!(
                    "Failed to serialize replicaset to YAML {}/{}: {:?}",
                    namespace, name, err
                );
                StatusCode::INTERNAL_SERVER_ERROR.into_response()
            }
        },
        Err(err) => {
            error!("Error getting replicaset YAML {}/{}: {:?}", namespace, name, err);
            StatusCode::NOT_FOUND.into_response()
        }
    }
}

async fn update_replicaset_yaml(
    Path((namespace, name)): Path<(String, String)>,
    State(state): State<AppState>,
    body: String,
) -> impl IntoResponse {
    use k8s_openapi::api::apps::v1::ReplicaSet;

    let mut replicaset: ReplicaSet = match serde_yaml::from_str(&body) {
        Ok(replicaset) => replicaset,
        Err(err) => {
            return (
                StatusCode::BAD_REQUEST,
                Json(serde_json::json!({
                    "success": false,
                    "message": format!("Invalid YAML: {}", err),
                })),
            )
                .into_response();
        }
    };

    replicaset.metadata.name = Some(name.clone());
    replicaset.metadata.namespace = Some(namespace.clone());

    let api: Api<ReplicaSet> = Api::namespaced(state.client, &namespace);
    let patch_value = match serde_json::to_value(&replicaset) {
        Ok(value) => value,
        Err(err) => {
            error!(
                "Failed converting replicaset YAML to JSON {}/{}: {:?}",
                namespace, name, err
            );
            return StatusCode::INTERNAL_SERVER_ERROR.into_response();
        }
    };

    let patch_params = PatchParams::apply("pertisk-kube-web").force();
    match api.patch(&name, &patch_params, &Patch::Apply(patch_value)).await {
        Ok(_) => (
            StatusCode::OK,
            Json(serde_json::json!({
                "success": true,
                "message": "ReplicaSet updated successfully"
            })),
        )
            .into_response(),
        Err(err) => {
            error!("Error updating replicaset YAML {}/{}: {:?}", namespace, name, err);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({
                    "success": false,
                    "message": format!("Failed to update replicaset: {}", err),
                })),
            )
                .into_response()
        }
    }
}

async fn list_jobs(State(state): State<AppState>) -> impl IntoResponse {
    use k8s_openapi::api::batch::v1::Job;

    let api: Api<Job> = Api::all(state.client);
    match api.list(&ListParams::default()).await {
        Ok(list) => {
            let items: Vec<JobItem> = list
                .items
                .into_iter()
                .map(|item| {
                    let name = item.metadata.name.unwrap_or_default();
                    let namespace = item.metadata.namespace.unwrap_or_else(|| "default".into());

                    let desired_completions = item
                        .spec
                        .as_ref()
                        .and_then(|s| s.completions)
                        .unwrap_or(1)
                        .max(1);

                    let status = item.status.as_ref();
                    let succeeded = status.and_then(|s| s.succeeded).unwrap_or(0).max(0);
                    let failed = status.and_then(|s| s.failed).unwrap_or(0).max(0);
                    let active = status.and_then(|s| s.active).unwrap_or(0).max(0);

                    let status_text = if failed > 0 {
                        "Failed".to_string()
                    } else if succeeded >= desired_completions {
                        "Completed".to_string()
                    } else if active > 0 {
                        "Running".to_string()
                    } else {
                        "Pending".to_string()
                    };

                    let completions = format!("{}/{}", succeeded, desired_completions);

                    let duration = if let Some(start_time) = status.and_then(|s| s.start_time.clone()) {
                        let start = start_time.0;
                        let end = status
                            .and_then(|s| s.completion_time.clone())
                            .map(|t| t.0)
                            .unwrap_or_else(Utc::now);
                        let elapsed = (end - start).num_seconds().max(0);
                        format_compact_duration(elapsed)
                    } else {
                        "-".to_string()
                    };

                    let age = item
                        .metadata
                        .creation_timestamp
                        .map(|t| t.0.to_rfc3339())
                        .unwrap_or_default();

                    JobItem {
                        name,
                        namespace,
                        status: status_text,
                        completions,
                        duration,
                        age,
                    }
                })
                .collect();
            let total = items.len();
            (StatusCode::OK, Json(ApiResponse { data: items, total })).into_response()
        }
        Err(err) => {
            error!("Error listing jobs: {:?}", err);
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}

async fn list_cronjobs(State(state): State<AppState>) -> impl IntoResponse {
    use k8s_openapi::api::batch::v1::CronJob;

    let api: Api<CronJob> = Api::all(state.client);
    match api.list(&ListParams::default()).await {
        Ok(list) => {
            let items: Vec<CronJobItem> = list
                .items
                .into_iter()
                .map(|item| {
                    let name = item.metadata.name.unwrap_or_default();
                    let namespace = item.metadata.namespace.unwrap_or_else(|| "default".into());
                    let schedule = item
                        .spec
                        .as_ref()
                        .map(|s| s.schedule.clone())
                        .filter(|s| !s.is_empty())
                        .unwrap_or_else(|| "-".into());
                    let suspend = item.spec.as_ref().and_then(|s| s.suspend).unwrap_or(false);
                    let active = item
                        .status
                        .as_ref()
                        .and_then(|s| s.active.as_ref())
                        .map(|a| a.len() as i32)
                        .unwrap_or(0);
                    let last_schedule = item
                        .status
                        .as_ref()
                        .and_then(|s| s.last_schedule_time.clone())
                        .map(|t| t.0.to_rfc3339())
                        .unwrap_or_default();

                    let next_execution = Schedule::from_str(&schedule)
                        .ok()
                        .and_then(|parsed| parsed.after(&Utc::now()).next())
                        .map(|t| t.to_rfc3339())
                        .unwrap_or_default();

                    let time_zone = item
                        .spec
                        .as_ref()
                        .and_then(|s| s.time_zone.clone())
                        .unwrap_or_else(|| "Local".into());

                    let age = item
                        .metadata
                        .creation_timestamp
                        .map(|t| t.0.to_rfc3339())
                        .unwrap_or_default();
                    CronJobItem {
                        name,
                        namespace,
                        schedule,
                        suspend,
                        active,
                        last_schedule,
                        next_execution,
                        time_zone,
                        age,
                    }
                })
                .collect();
            let total = items.len();
            (StatusCode::OK, Json(ApiResponse { data: items, total })).into_response()
        }
        Err(err) => {
            error!("Error listing cronjobs: {:?}", err);
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}

async fn get_dashboard_summary(State(state): State<AppState>) -> impl IntoResponse {
    use k8s_openapi::api::{
        apps::v1::{DaemonSet, Deployment, ReplicaSet, StatefulSet},
        batch::v1::{CronJob, Job},
        core::v1::{Event, Namespace, Pod},
    };

    let namespaces_api: Api<Namespace> = Api::all(state.client.clone());
    let pods_api: Api<Pod> = Api::all(state.client.clone());
    let deployments_api: Api<Deployment> = Api::all(state.client.clone());
    let statefulsets_api: Api<StatefulSet> = Api::all(state.client.clone());
    let daemonsets_api: Api<DaemonSet> = Api::all(state.client.clone());
    let replicasets_api: Api<ReplicaSet> = Api::all(state.client.clone());
    let jobs_api: Api<Job> = Api::all(state.client.clone());
    let cronjobs_api: Api<CronJob> = Api::all(state.client.clone());
    let events_api: Api<Event> = Api::all(state.client.clone());

    let result = async {
        let namespaces = namespaces_api.list(&ListParams::default()).await?.items.len();
        let pods = pods_api.list(&ListParams::default()).await?.items.len();
        let deployments = deployments_api.list(&ListParams::default()).await?.items.len();
        let statefulsets = statefulsets_api.list(&ListParams::default()).await?.items.len();
        let daemonsets = daemonsets_api.list(&ListParams::default()).await?.items.len();
        let replicasets = replicasets_api.list(&ListParams::default()).await?.items.len();
        let jobs = jobs_api.list(&ListParams::default()).await?.items.len();
        let cronjobs = cronjobs_api.list(&ListParams::default()).await?.items.len();
        let events = events_api.list(&ListParams::default()).await?.items.len();

        // Get cluster version info
        let kube_version = state.client.apiserver_version().await.ok().map(|v| v.git_version);
        
        // Try to get cluster name from kubeconfig or default
        let cluster_name = Some(env::var("CLUSTER_NAME").unwrap_or_else(|_| {
            let kubeconfig = env::var("KUBECONFIG").unwrap_or_else(|_| "~/.kube/config".to_string());
            if kubeconfig.contains("talos") {
                "talos-cluster".to_string()
            } else if kubeconfig.contains("omni") {
                "omni-cluster".to_string()
            } else {
                "kubernetes-cluster".to_string()
            }
        }));

        // Get API endpoint from environment or default
        let api_endpoint = Some(env::var("KUBERNETES_SERVICE_HOST")
            .unwrap_or_else(|_| "kubernetes.default.svc.cluster.local".to_string()));


        Ok::<DashboardSummary, kube::Error>(DashboardSummary {
            namespaces,
            pods,
            deployments,
            statefulsets,
            daemonsets,
            replicasets,
            jobs,
            cronjobs,
            events,
            cluster_name,
            api_endpoint,
            kube_version,
        })
    }
    .await;

    match result {
        Ok(summary) => (StatusCode::OK, Json(summary)).into_response(),
        Err(err) => {
            error!("Error building dashboard summary: {:?}", err);
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}

// Config Resource Handlers
async fn list_configmaps(State(state): State<AppState>) -> impl IntoResponse {
    use k8s_openapi::api::core::v1::ConfigMap;

    let api: Api<ConfigMap> = Api::all(state.client);
    match api.list(&ListParams::default()).await {
        Ok(list) => {
            let items: Vec<ConfigMapItem> = list
                .items
                .into_iter()
                .map(|cm| {
                    let name = cm.metadata.name.unwrap_or_default();
                    let namespace = cm.metadata.namespace.unwrap_or_else(|| "default".into());
                    let data_keys = cm.data.as_ref().map(|d| d.len()).unwrap_or(0);
                    let age = cm
                        .metadata
                        .creation_timestamp
                        .as_ref()
                        .map(|t| t.0.to_rfc3339())
                        .unwrap_or_default();
                    ConfigMapItem {
                        name,
                        namespace,
                        data_keys,
                        age,
                    }
                })
                .collect();
            let total = items.len();
            (StatusCode::OK, Json(ApiResponse { data: items, total })).into_response()
        }
        Err(err) => {
            error!("Error listing configmaps: {:?}", err);
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}

async fn list_secrets(State(state): State<AppState>) -> impl IntoResponse {
    use k8s_openapi::api::core::v1::Secret;

    let api: Api<Secret> = Api::all(state.client);
    match api.list(&ListParams::default()).await {
        Ok(list) => {
            let items: Vec<SecretItem> = list
                .items
                .into_iter()
                .map(|secret| {
                    let name = secret.metadata.name.unwrap_or_default();
                    let namespace = secret.metadata.namespace.unwrap_or_else(|| "default".into());
                    let secret_type = secret.type_.unwrap_or_default();
                    let data_keys = secret.data.as_ref().map(|d| d.len()).unwrap_or(0);
                    let age = secret
                        .metadata
                        .creation_timestamp
                        .as_ref()
                        .map(|t| t.0.to_rfc3339())
                        .unwrap_or_default();
                    SecretItem {
                        name,
                        namespace,
                        secret_type,
                        data_keys,
                        age,
                    }
                })
                .collect();
            let total = items.len();
            (StatusCode::OK, Json(ApiResponse { data: items, total })).into_response()
        }
        Err(err) => {
            error!("Error listing secrets: {:?}", err);
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}

async fn list_resourcequotas(State(state): State<AppState>) -> impl IntoResponse {
    use k8s_openapi::api::core::v1::ResourceQuota;

    let api: Api<ResourceQuota> = Api::all(state.client);
    match api.list(&ListParams::default()).await {
        Ok(list) => {
            let items: Vec<ResourceQuotaItem> = list
                .items
                .into_iter()
                .map(|rq| {
                    let name = rq.metadata.name.unwrap_or_default();
                    let namespace = rq.metadata.namespace.unwrap_or_else(|| "default".into());
                    let status = "Active".to_string();
                    let age = rq
                        .metadata
                        .creation_timestamp
                        .as_ref()
                        .map(|t| t.0.to_rfc3339())
                        .unwrap_or_default();
                    ResourceQuotaItem {
                        name,
                        namespace,
                        status,
                        age,
                    }
                })
                .collect();
            let total = items.len();
            (StatusCode::OK, Json(ApiResponse { data: items, total })).into_response()
        }
        Err(err) => {
            error!("Error listing resourcequotas: {:?}", err);
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}

async fn list_limitranges(State(state): State<AppState>) -> impl IntoResponse {
    use k8s_openapi::api::core::v1::LimitRange;

    let api: Api<LimitRange> = Api::all(state.client);
    match api.list(&ListParams::default()).await {
        Ok(list) => {
            let items: Vec<LimitRangeItem> = list
                .items
                .into_iter()
                .map(|lr| {
                    let name = lr.metadata.name.unwrap_or_default();
                    let namespace = lr.metadata.namespace.unwrap_or_else(|| "default".into());
                    let limits = if let Some(spec) = lr.spec.as_ref() {
                        spec.limits.len()
                    } else {
                        0
                    };
                    let age = lr
                        .metadata
                        .creation_timestamp
                        .as_ref()
                        .map(|t| t.0.to_rfc3339())
                        .unwrap_or_default();
                    LimitRangeItem {
                        name,
                        namespace,
                        limits,
                        age,
                    }
                })
                .collect();
            let total = items.len();
            (StatusCode::OK, Json(ApiResponse { data: items, total })).into_response()
        }
        Err(err) => {
            error!("Error listing limitranges: {:?}", err);
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}

async fn list_hpa(State(state): State<AppState>) -> impl IntoResponse {
    use k8s_openapi::api::autoscaling::v2::HorizontalPodAutoscaler;

    let api: Api<HorizontalPodAutoscaler> = Api::all(state.client);
    match api.list(&ListParams::default()).await {
        Ok(list) => {
            let items: Vec<HPAItem> = list
                .items
                .into_iter()
                .map(|hpa| {
                    let name = hpa.metadata.name.unwrap_or_default();
                    let namespace = hpa.metadata.namespace.unwrap_or_else(|| "default".into());
                    let spec = hpa.spec.as_ref();
                    let status = hpa.status.as_ref();
                    let reference = spec
                        .map(|s| format!("{}/{}", s.scale_target_ref.kind, s.scale_target_ref.name))
                        .unwrap_or_default();
                    let min_replicas = spec.and_then(|s| s.min_replicas).unwrap_or(1);
                    let max_replicas = spec.map(|s| s.max_replicas).unwrap_or(0);
                    let targets = spec
                        .and_then(|s| s.metrics.as_ref())
                        .map(|m| m.len())
                        .unwrap_or(0);
                    let current_replicas = status.and_then(|s| s.current_replicas).unwrap_or(0);
                    let desired_replicas = status.map(|s| s.desired_replicas).unwrap_or(0);
                    let age = hpa
                        .metadata
                        .creation_timestamp
                        .as_ref()
                        .map(|t| t.0.to_rfc3339())
                        .unwrap_or_default();
                    HPAItem {
                        name,
                        namespace,
                        reference,
                        targets,
                        current_replicas,
                        desired_replicas,
                        min_replicas,
                        max_replicas,
                        age,
                    }
                })
                .collect();
            let total = items.len();
            (StatusCode::OK, Json(ApiResponse { data: items, total })).into_response()
        }
        Err(err) => {
            error!("Error listing hpa: {:?}", err);
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}

async fn list_pdb(State(state): State<AppState>) -> impl IntoResponse {
    use k8s_openapi::api::policy::v1::PodDisruptionBudget;

    let api: Api<PodDisruptionBudget> = Api::all(state.client);
    match api.list(&ListParams::default()).await {
        Ok(list) => {
            let items: Vec<PDBItem> = list
                .items
                .into_iter()
                .map(|pdb| {
                    let name = pdb.metadata.name.unwrap_or_default();
                    let namespace = pdb.metadata.namespace.unwrap_or_else(|| "default".into());
                    let spec = pdb.spec.as_ref();
                    let min_available = spec
                        .and_then(|s| s.min_available.as_ref())
                        .map(|m| format!("{:?}", m))
                        .unwrap_or_default();
                    let allowed_disruptions = pdb
                        .status
                        .as_ref()
                        .map(|s| s.disruptions_allowed)
                        .unwrap_or(0);
                    let status = if allowed_disruptions > 0 {
                        "Healthy".to_string()
                    } else {
                        "Unhealthy".to_string()
                    };
                    let age = pdb
                        .metadata
                        .creation_timestamp
                        .as_ref()
                        .map(|t| t.0.to_rfc3339())
                        .unwrap_or_default();
                    PDBItem {
                        name,
                        namespace,
                        min_available,
                        allowed_disruptions,
                        status,
                        age,
                    }
                })
                .collect();
            let total = items.len();
            (StatusCode::OK, Json(ApiResponse { data: items, total })).into_response()
        }
        Err(err) => {
            error!("Error listing pdb: {:?}", err);
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}

async fn list_priorityclasses(State(state): State<AppState>) -> impl IntoResponse {
    use k8s_openapi::api::scheduling::v1::PriorityClass;

    let api: Api<PriorityClass> = Api::all(state.client);
    match api.list(&ListParams::default()).await {
        Ok(list) => {
            let items: Vec<PriorityClassItem> = list
                .items
                .into_iter()
                .map(|pc| {
                    let name = pc.metadata.name.unwrap_or_default();
                    let value = pc.value;
                    let global_default = pc.global_default.unwrap_or(false);
                    let age = pc
                        .metadata
                        .creation_timestamp
                        .as_ref()
                        .map(|t| t.0.to_rfc3339())
                        .unwrap_or_default();
                    PriorityClassItem {
                        name,
                        value,
                        global_default,
                        age,
                    }
                })
                .collect();
            let total = items.len();
            (StatusCode::OK, Json(ApiResponse { data: items, total })).into_response()
        }
        Err(err) => {
            if let kube::Error::Api(api_err) = &err {
                if api_err.code == 403 || api_err.code == 404 {
                    warn!(
                        "PriorityClass API unavailable or forbidden (code {}): {}",
                        api_err.code, api_err.message
                    );
                    return (StatusCode::OK, Json(ApiResponse::<PriorityClassItem> { data: vec![], total: 0 }))
                        .into_response();
                }
            }
            error!("Error listing priorityclasses: {:?}", err);
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}

async fn list_runtimeclasses(State(state): State<AppState>) -> impl IntoResponse {
    use k8s_openapi::api::node::v1::RuntimeClass;

    let api: Api<RuntimeClass> = Api::all(state.client);
    match api.list(&ListParams::default()).await {
        Ok(list) => {
            let items: Vec<RuntimeClassItem> = list
                .items
                .into_iter()
                .map(|rc| {
                    let name = rc.metadata.name.unwrap_or_default();
                    let handler = rc.handler;
                    let scheduling = rc
                        .scheduling
                        .as_ref()
                        .map(|_| "Configured".into())
                        .unwrap_or_default();
                    let age = rc
                        .metadata
                        .creation_timestamp
                        .as_ref()
                        .map(|t| t.0.to_rfc3339())
                        .unwrap_or_default();
                    RuntimeClassItem {
                        name,
                        handler,
                        scheduling,
                        age,
                    }
                })
                .collect();
            let total = items.len();
            (StatusCode::OK, Json(ApiResponse { data: items, total })).into_response()
        }
        Err(err) => {
            if let kube::Error::Api(api_err) = &err {
                if api_err.code == 403 || api_err.code == 404 {
                    warn!(
                        "RuntimeClass API unavailable or forbidden (code {}): {}",
                        api_err.code, api_err.message
                    );
                    return (StatusCode::OK, Json(ApiResponse::<RuntimeClassItem> { data: vec![], total: 0 }))
                        .into_response();
                }
            }
            error!("Error listing runtimeclasses: {:?}", err);
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}

async fn list_leases(State(state): State<AppState>) -> impl IntoResponse {
    use k8s_openapi::api::coordination::v1::Lease;

    let api: Api<Lease> = Api::all(state.client);
    match api.list(&ListParams::default()).await {
        Ok(list) => {
            let items: Vec<LeaseItem> = list
                .items
                .into_iter()
                .map(|lease| {
                    let name = lease.metadata.name.unwrap_or_default();
                    let namespace = lease.metadata.namespace.unwrap_or_else(|| "default".into());
                    let spec = lease.spec.as_ref();
                    let holder_identity = spec
                        .and_then(|s| s.holder_identity.clone())
                        .unwrap_or_default();
                    let lease_duration_seconds = spec
                        .and_then(|s| s.lease_duration_seconds)
                        .unwrap_or(0);
                    let age = lease
                        .metadata
                        .creation_timestamp
                        .as_ref()
                        .map(|t| t.0.to_rfc3339())
                        .unwrap_or_default();
                    LeaseItem {
                        name,
                        namespace,
                        holder_identity,
                        lease_duration_seconds,
                        age,
                    }
                })
                .collect();
            let total = items.len();
            (StatusCode::OK, Json(ApiResponse { data: items, total })).into_response()
        }
        Err(err) => {
            if let kube::Error::Api(api_err) = &err {
                if api_err.code == 403 || api_err.code == 404 {
                    warn!(
                        "Lease API unavailable or forbidden (code {}): {}",
                        api_err.code, api_err.message
                    );
                    return (StatusCode::OK, Json(ApiResponse::<LeaseItem> { data: vec![], total: 0 }))
                        .into_response();
                }
            }
            error!("Error listing leases: {:?}", err);
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}

async fn list_services(State(state): State<AppState>) -> impl IntoResponse {
    use k8s_openapi::api::core::v1::Service;

    let api: Api<Service> = Api::all(state.client);
    match api.list(&ListParams::default()).await {
        Ok(list) => {
            let items: Vec<ServiceItem> = list
                .items
                .into_iter()
                .map(|svc| {
                    let name = svc.metadata.name.unwrap_or_default();
                    let namespace = svc.metadata.namespace.unwrap_or_else(|| "default".into());
                    let spec = svc.spec.as_ref();
                    let status = svc.status.as_ref();

                    let service_type = spec
                        .and_then(|s| s.type_.clone())
                        .unwrap_or_else(|| "ClusterIP".into());

                    let cluster_ip = spec
                        .and_then(|s| s.cluster_ip.clone())
                        .unwrap_or_else(|| "-".into());

                    let mut external_values: Vec<String> = spec
                        .and_then(|s| s.external_ips.clone())
                        .unwrap_or_default();

                    if let Some(lb_ingress) = status
                        .and_then(|s| s.load_balancer.as_ref())
                        .and_then(|lb| lb.ingress.as_ref())
                    {
                        external_values.extend(lb_ingress.iter().map(|entry| {
                            entry
                                .ip
                                .clone()
                                .or_else(|| entry.hostname.clone())
                                .unwrap_or_else(|| "-".into())
                        }));
                    }

                    external_values.retain(|value| value != "-");
                    external_values.sort();
                    external_values.dedup();

                    let external_ip = if external_values.is_empty() {
                        "-".into()
                    } else {
                        external_values.join(", ")
                    };

                    let ports = spec
                        .and_then(|s| s.ports.clone())
                        .map(|values| {
                            let rendered: Vec<String> = values
                                .into_iter()
                                .map(|port| format!("{}/{}", port.port, port.protocol.unwrap_or_else(|| "TCP".into())))
                                .collect();
                            if rendered.is_empty() {
                                "-".into()
                            } else {
                                rendered.join(", ")
                            }
                        })
                        .unwrap_or_else(|| "-".into());

                    let age = svc
                        .metadata
                        .creation_timestamp
                        .as_ref()
                        .map(|t| t.0.to_rfc3339())
                        .unwrap_or_default();

                    ServiceItem {
                        name,
                        namespace,
                        service_type,
                        cluster_ip,
                        external_ip,
                        ports,
                        age,
                    }
                })
                .collect();

            let total = items.len();
            (StatusCode::OK, Json(ApiResponse { data: items, total })).into_response()
        }
        Err(err) => {
            error!("Error listing services: {:?}", err);
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}

async fn list_endpoints(State(state): State<AppState>) -> impl IntoResponse {
    use k8s_openapi::api::core::v1::Endpoints;

    let api: Api<Endpoints> = Api::all(state.client);
    match api.list(&ListParams::default()).await {
        Ok(list) => {
            let items: Vec<EndpointItem> = list
                .items
                .into_iter()
                .map(|ep| {
                    let name = ep.metadata.name.unwrap_or_default();
                    let namespace = ep.metadata.namespace.unwrap_or_else(|| "default".into());

                    let subsets = ep.subsets.unwrap_or_default();
                    let addresses = subsets
                        .iter()
                        .map(|subset| subset.addresses.as_ref().map_or(0, |a| a.len()))
                        .sum();
                    let not_ready = subsets
                        .iter()
                        .map(|subset| subset.not_ready_addresses.as_ref().map_or(0, |a| a.len()))
                        .sum();

                    let mut unique_ports: Vec<String> = subsets
                        .iter()
                        .flat_map(|subset| {
                            subset
                                .ports
                                .as_ref()
                                .map(|ports| {
                                    ports
                                        .iter()
                                        .map(|port| format!("{}/{}", port.port, port.protocol.clone().unwrap_or_else(|| "TCP".into())))
                                        .collect::<Vec<_>>()
                                })
                                .unwrap_or_default()
                        })
                        .collect();
                    unique_ports.sort();
                    unique_ports.dedup();

                    let ports = if unique_ports.is_empty() {
                        "-".into()
                    } else {
                        unique_ports.join(", ")
                    };

                    let age = ep
                        .metadata
                        .creation_timestamp
                        .as_ref()
                        .map(|t| t.0.to_rfc3339())
                        .unwrap_or_default();

                    EndpointItem {
                        name,
                        namespace,
                        addresses,
                        not_ready,
                        ports,
                        age,
                    }
                })
                .collect();

            let total = items.len();
            (StatusCode::OK, Json(ApiResponse { data: items, total })).into_response()
        }
        Err(err) => {
            error!("Error listing endpoints: {:?}", err);
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}

async fn list_ingresses(State(state): State<AppState>) -> impl IntoResponse {
    use k8s_openapi::api::networking::v1::Ingress;

    let api: Api<Ingress> = Api::all(state.client);
    match api.list(&ListParams::default()).await {
        Ok(list) => {
            let items: Vec<IngressItem> = list
                .items
                .into_iter()
                .map(|ing| {
                    let name = ing.metadata.name.unwrap_or_default();
                    let namespace = ing.metadata.namespace.unwrap_or_else(|| "default".into());
                    let spec = ing.spec.as_ref();
                    let status = ing.status.as_ref();

                    let ingress_class = spec
                        .and_then(|s| s.ingress_class_name.clone())
                        .unwrap_or_else(|| "-".into());

                    let rules = spec
                        .and_then(|s| s.rules.as_ref())
                        .map_or(0, |values| values.len());

                    let mut hosts: Vec<String> = spec
                        .and_then(|s| s.rules.as_ref())
                        .map(|values| {
                            values
                                .iter()
                                .filter_map(|rule| rule.host.clone())
                                .collect::<Vec<_>>()
                        })
                        .unwrap_or_default();
                    hosts.sort();
                    hosts.dedup();
                    let hosts = if hosts.is_empty() {
                        "-".into()
                    } else {
                        hosts.join(", ")
                    };

                    let mut addresses: Vec<String> = status
                        .and_then(|s| s.load_balancer.as_ref())
                        .and_then(|lb| lb.ingress.as_ref())
                        .map(|entries| {
                            entries
                                .iter()
                                .map(|entry| {
                                    entry
                                        .ip
                                        .clone()
                                        .or_else(|| entry.hostname.clone())
                                        .unwrap_or_else(|| "-".into())
                                })
                                .collect::<Vec<_>>()
                        })
                        .unwrap_or_default();
                    addresses.retain(|value| value != "-");
                    addresses.sort();
                    addresses.dedup();
                    let address = if addresses.is_empty() {
                        "-".into()
                    } else {
                        addresses.join(", ")
                    };

                    let age = ing
                        .metadata
                        .creation_timestamp
                        .as_ref()
                        .map(|t| t.0.to_rfc3339())
                        .unwrap_or_default();

                    IngressItem {
                        name,
                        namespace,
                        ingress_class,
                        hosts,
                        address,
                        rules,
                        age,
                    }
                })
                .collect();

            let total = items.len();
            (StatusCode::OK, Json(ApiResponse { data: items, total })).into_response()
        }
        Err(err) => {
            error!("Error listing ingresses: {:?}", err);
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}

async fn list_ingressclasses(State(state): State<AppState>) -> impl IntoResponse {
    use k8s_openapi::api::networking::v1::IngressClass;

    let api: Api<IngressClass> = Api::all(state.client);
    match api.list(&ListParams::default()).await {
        Ok(list) => {
            let items: Vec<IngressClassItem> = list
                .items
                .into_iter()
                .map(|ing_class| {
                    let name = ing_class.metadata.name.unwrap_or_default();
                    let controller = ing_class
                        .spec
                        .as_ref()
                        .and_then(|spec| spec.controller.clone())
                        .unwrap_or_else(|| "-".into());
                    let parameters = ing_class
                        .spec
                        .as_ref()
                        .and_then(|spec| spec.parameters.as_ref())
                        .as_ref()
                        .map(|params| format!("{}/{}", params.kind, params.name))
                        .unwrap_or_else(|| "-".into());

                    let is_default = ing_class
                        .metadata
                        .annotations
                        .as_ref()
                        .and_then(|annotations| annotations.get("ingressclass.kubernetes.io/is-default-class"))
                        .map(|value| value == "true")
                        .unwrap_or(false);

                    let age = ing_class
                        .metadata
                        .creation_timestamp
                        .as_ref()
                        .map(|t| t.0.to_rfc3339())
                        .unwrap_or_default();

                    IngressClassItem {
                        name,
                        controller,
                        is_default,
                        parameters,
                        age,
                    }
                })
                .collect();

            let total = items.len();
            (StatusCode::OK, Json(ApiResponse { data: items, total })).into_response()
        }
        Err(err) => {
            error!("Error listing ingress classes: {:?}", err);
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}

async fn list_networkpolicies(State(state): State<AppState>) -> impl IntoResponse {
    use k8s_openapi::api::networking::v1::NetworkPolicy;

    let api: Api<NetworkPolicy> = Api::all(state.client);
    match api.list(&ListParams::default()).await {
        Ok(list) => {
            let items: Vec<NetworkPolicyItem> = list
                .items
                .into_iter()
                .map(|policy| {
                    let name = policy.metadata.name.unwrap_or_default();
                    let namespace = policy.metadata.namespace.unwrap_or_else(|| "default".into());

                    let selector_labels = policy
                        .spec
                        .as_ref()
                        .and_then(|spec| spec.pod_selector.match_labels.as_ref())
                        .as_ref()
                        .map(|labels| {
                            let mut rendered: Vec<String> = labels
                                .iter()
                                .map(|(key, value)| format!("{}={}", key, value))
                                .collect();
                            rendered.sort();
                            if rendered.is_empty() {
                                "All pods".into()
                            } else {
                                rendered.join(", ")
                            }
                        })
                        .unwrap_or_else(|| "All pods".into());

                    let policy_types = policy
                        .spec
                        .as_ref()
                        .and_then(|spec| spec.policy_types.clone())
                        .unwrap_or_default()
                        .join(", ");

                    let ingress_rules = policy
                        .spec
                        .as_ref()
                        .and_then(|spec| spec.ingress.as_ref())
                        .map_or(0, |rules| rules.len());
                    let egress_rules = policy
                        .spec
                        .as_ref()
                        .and_then(|spec| spec.egress.as_ref())
                        .map_or(0, |rules| rules.len());

                    let age = policy
                        .metadata
                        .creation_timestamp
                        .as_ref()
                        .map(|t| t.0.to_rfc3339())
                        .unwrap_or_default();

                    NetworkPolicyItem {
                        name,
                        namespace,
                        pod_selector: selector_labels,
                        policy_types,
                        ingress_rules,
                        egress_rules,
                        age,
                    }
                })
                .collect();

            let total = items.len();
            (StatusCode::OK, Json(ApiResponse { data: items, total })).into_response()
        }
        Err(err) => {
            error!("Error listing network policies: {:?}", err);
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}

// Storage Resource Handlers
async fn list_persistent_volumes(State(state): State<AppState>) -> impl IntoResponse {
    use k8s_openapi::api::core::v1::PersistentVolume;

    let api: Api<PersistentVolume> = Api::all(state.client);
    match api.list(&ListParams::default()).await {
        Ok(list) => {
            let items: Vec<PersistentVolumeItem> = list
                .items
                .into_iter()
                .map(|pv| {
                    let name = pv.metadata.name.unwrap_or_default();
                    
                    let capacity = pv
                        .spec
                        .as_ref()
                        .and_then(|s| s.capacity.as_ref())
                        .and_then(|c| c.get("storage"))
                        .map(|q| q.0.clone())
                        .unwrap_or_else(|| "-".into());

                    let access_modes = pv
                        .spec
                        .as_ref()
                        .and_then(|s| s.access_modes.as_ref())
                        .map(|modes| modes.join(", "))
                        .unwrap_or_else(|| "-".into());

                    let reclaim_policy = pv
                        .spec
                        .as_ref()
                        .and_then(|s| s.persistent_volume_reclaim_policy.clone())
                        .unwrap_or_else(|| "-".into());

                    let status = pv
                        .status
                        .as_ref()
                        .and_then(|s| s.phase.clone())
                        .unwrap_or_else(|| "Unknown".into());

                    let claim = pv
                        .spec
                        .as_ref()
                        .and_then(|s| s.claim_ref.as_ref())
                        .map(|c| {
                            format!(
                                "{}/{}",
                                c.namespace.clone().unwrap_or_default(),
                                c.name.clone().unwrap_or_default()
                            )
                        })
                        .unwrap_or_else(|| "-".into());

                    let storage_class = pv
                        .spec
                        .as_ref()
                        .and_then(|s| s.storage_class_name.clone())
                        .unwrap_or_else(|| "-".into());

                    let age = pv
                        .metadata
                        .creation_timestamp
                        .as_ref()
                        .map(|t| t.0.to_rfc3339())
                        .unwrap_or_default();

                    PersistentVolumeItem {
                        name,
                        capacity,
                        access_modes,
                        reclaim_policy,
                        status,
                        claim,
                        storage_class,
                        age,
                    }
                })
                .collect();

            let total = items.len();
            (StatusCode::OK, Json(ApiResponse { data: items, total })).into_response()
        }
        Err(err) => {
            error!("Error listing persistent volumes: {:?}", err);
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}

async fn list_persistent_volume_claims(State(state): State<AppState>) -> impl IntoResponse {
    use k8s_openapi::api::core::v1::PersistentVolumeClaim;

    let api: Api<PersistentVolumeClaim> = Api::all(state.client);
    match api.list(&ListParams::default()).await {
        Ok(list) => {
            let items: Vec<PersistentVolumeClaimItem> = list
                .items
                .into_iter()
                .map(|pvc| {
                    let name = pvc.metadata.name.unwrap_or_default();
                    let namespace = pvc.metadata.namespace.unwrap_or_else(|| "default".into());

                    let status = pvc
                        .status
                        .as_ref()
                        .and_then(|s| s.phase.clone())
                        .unwrap_or_else(|| "Unknown".into());

                    let volume = pvc
                        .spec
                        .as_ref()
                        .and_then(|s| s.volume_name.clone())
                        .unwrap_or_else(|| "-".into());

                    let capacity = pvc
                        .status
                        .as_ref()
                        .and_then(|s| s.capacity.as_ref())
                        .and_then(|c| c.get("storage"))
                        .map(|q| q.0.clone())
                        .unwrap_or_else(|| "-".into());

                    let access_modes = pvc
                        .spec
                        .as_ref()
                        .and_then(|s| s.access_modes.as_ref())
                        .map(|modes| modes.join(", "))
                        .unwrap_or_else(|| "-".into());

                    let storage_class = pvc
                        .spec
                        .as_ref()
                        .and_then(|s| s.storage_class_name.clone())
                        .unwrap_or_else(|| "-".into());

                    let age = pvc
                        .metadata
                        .creation_timestamp
                        .as_ref()
                        .map(|t| t.0.to_rfc3339())
                        .unwrap_or_default();

                    PersistentVolumeClaimItem {
                        name,
                        namespace,
                        status,
                        volume,
                        capacity,
                        access_modes,
                        storage_class,
                        age,
                    }
                })
                .collect();

            let total = items.len();
            (StatusCode::OK, Json(ApiResponse { data: items, total })).into_response()
        }
        Err(err) => {
            error!("Error listing persistent volume claims: {:?}", err);
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}

async fn list_storage_classes(State(state): State<AppState>) -> impl IntoResponse {
    use k8s_openapi::api::storage::v1::StorageClass;

    let api: Api<StorageClass> = Api::all(state.client);
    match api.list(&ListParams::default()).await {
        Ok(list) => {
            let items: Vec<StorageClassItem> = list
                .items
                .into_iter()
                .map(|sc| {
                    let name = sc.metadata.name.unwrap_or_default();
                    let provisioner = sc.provisioner.clone();

                    let reclaim_policy = sc
                        .reclaim_policy
                        .clone()
                        .unwrap_or_else(|| "-".into());

                    let volume_binding_mode = sc
                        .volume_binding_mode
                        .clone()
                        .unwrap_or_else(|| "-".into());

                    let allow_volume_expansion = sc.allow_volume_expansion.unwrap_or(false);

                    let is_default = sc
                        .metadata
                        .annotations
                        .as_ref()
                        .map(|a| {
                            a.get("storageclass.kubernetes.io/is-default-class")
                                .map(|v| v == "true")
                                .unwrap_or(false)
                                || a.get("storageclass.beta.kubernetes.io/is-default-class")
                                    .map(|v| v == "true")
                                    .unwrap_or(false)
                        })
                        .unwrap_or(false);

                    let age = sc
                        .metadata
                        .creation_timestamp
                        .as_ref()
                        .map(|t| t.0.to_rfc3339())
                        .unwrap_or_default();

                    StorageClassItem {
                        name,
                        provisioner,
                        reclaim_policy,
                        volume_binding_mode,
                        allow_volume_expansion,
                        is_default,
                        age,
                    }
                })
                .collect();

            let total = items.len();
            (StatusCode::OK, Json(ApiResponse { data: items, total })).into_response()
        }
        Err(err) => {
            error!("Error listing storage classes: {:?}", err);
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}

// Access Control (RBAC) Resource Handlers
async fn list_service_accounts(State(state): State<AppState>) -> impl IntoResponse {
    use k8s_openapi::api::core::v1::ServiceAccount;

    let api: Api<ServiceAccount> = Api::all(state.client);
    match api.list(&ListParams::default()).await {
        Ok(list) => {
            let items: Vec<ServiceAccountItem> = list
                .items
                .into_iter()
                .map(|sa| {
                    let name = sa.metadata.name.unwrap_or_default();
                    let namespace = sa.metadata.namespace.unwrap_or_else(|| "default".into());

                    let secrets = sa
                        .secrets
                        .as_ref()
                        .map(|s| s.len())
                        .unwrap_or(0);

                    let age = sa
                        .metadata
                        .creation_timestamp
                        .as_ref()
                        .map(|t| t.0.to_rfc3339())
                        .unwrap_or_default();

                    ServiceAccountItem {
                        name,
                        namespace,
                        secrets,
                        age,
                    }
                })
                .collect();

            let total = items.len();
            (StatusCode::OK, Json(ApiResponse { data: items, total })).into_response()
        }
        Err(err) => {
            error!("Error listing service accounts: {:?}", err);
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}

async fn list_roles(State(state): State<AppState>) -> impl IntoResponse {
    use k8s_openapi::api::rbac::v1::Role;

    let api: Api<Role> = Api::all(state.client);
    match api.list(&ListParams::default()).await {
        Ok(list) => {
            let items: Vec<RoleItem> = list
                .items
                .into_iter()
                .map(|role| {
                    let name = role.metadata.name.unwrap_or_default();
                    let namespace = role.metadata.namespace.unwrap_or_else(|| "default".into());

                    let rules = role
                        .rules
                        .as_ref()
                        .map(|r| r.len())
                        .unwrap_or(0);

                    let age = role
                        .metadata
                        .creation_timestamp
                        .as_ref()
                        .map(|t| t.0.to_rfc3339())
                        .unwrap_or_default();

                    RoleItem {
                        name,
                        namespace,
                        rules,
                        age,
                    }
                })
                .collect();

            let total = items.len();
            (StatusCode::OK, Json(ApiResponse { data: items, total })).into_response()
        }
        Err(err) => {
            error!("Error listing roles: {:?}", err);
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}

async fn list_role_bindings(State(state): State<AppState>) -> impl IntoResponse {
    use k8s_openapi::api::rbac::v1::RoleBinding;

    let api: Api<RoleBinding> = Api::all(state.client);
    match api.list(&ListParams::default()).await {
        Ok(list) => {
            let items: Vec<RoleBindingItem> = list
                .items
                .into_iter()
                .map(|rb| {
                    let name = rb.metadata.name.unwrap_or_default();
                    let namespace = rb.metadata.namespace.unwrap_or_else(|| "default".into());

                    let role = format!("{}/{}", rb.role_ref.kind, rb.role_ref.name);

                    let subjects = rb
                        .subjects
                        .as_ref()
                        .map(|s| s.len())
                        .unwrap_or(0);

                    let age = rb
                        .metadata
                        .creation_timestamp
                        .as_ref()
                        .map(|t| t.0.to_rfc3339())
                        .unwrap_or_default();

                    RoleBindingItem {
                        name,
                        namespace,
                        role,
                        subjects,
                        age,
                    }
                })
                .collect();

            let total = items.len();
            (StatusCode::OK, Json(ApiResponse { data: items, total })).into_response()
        }
        Err(err) => {
            error!("Error listing role bindings: {:?}", err);
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}

async fn list_cluster_roles(State(state): State<AppState>) -> impl IntoResponse {
    use k8s_openapi::api::rbac::v1::ClusterRole;

    let api: Api<ClusterRole> = Api::all(state.client);
    match api.list(&ListParams::default()).await {
        Ok(list) => {
            let items: Vec<ClusterRoleItem> = list
                .items
                .into_iter()
                .map(|cr| {
                    let name = cr.metadata.name.unwrap_or_default();

                    let rules = cr
                        .rules
                        .as_ref()
                        .map(|r| r.len())
                        .unwrap_or(0);

                    let age = cr
                        .metadata
                        .creation_timestamp
                        .as_ref()
                        .map(|t| t.0.to_rfc3339())
                        .unwrap_or_default();

                    ClusterRoleItem {
                        name,
                        rules,
                        age,
                    }
                })
                .collect();

            let total = items.len();
            (StatusCode::OK, Json(ApiResponse { data: items, total })).into_response()
        }
        Err(err) => {
            error!("Error listing cluster roles: {:?}", err);
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}

async fn list_cluster_role_bindings(State(state): State<AppState>) -> impl IntoResponse {
    use k8s_openapi::api::rbac::v1::ClusterRoleBinding;

    let api: Api<ClusterRoleBinding> = Api::all(state.client);
    match api.list(&ListParams::default()).await {
        Ok(list) => {
            let items: Vec<ClusterRoleBindingItem> = list
                .items
                .into_iter()
                .map(|crb| {
                    let name = crb.metadata.name.unwrap_or_default();

                    let role = format!("{}/{}", crb.role_ref.kind, crb.role_ref.name);

                    let subjects = crb
                        .subjects
                        .as_ref()
                        .map(|s| s.len())
                        .unwrap_or(0);

                    let age = crb
                        .metadata
                        .creation_timestamp
                        .as_ref()
                        .map(|t| t.0.to_rfc3339())
                        .unwrap_or_default();

                    ClusterRoleBindingItem {
                        name,
                        role,
                        subjects,
                        age,
                    }
                })
                .collect();

            let total = items.len();
            (StatusCode::OK, Json(ApiResponse { data: items, total })).into_response()
        }
        Err(err) => {
            error!("Error listing cluster role bindings: {:?}", err);
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}

async fn delete_pod(
    Path((namespace, name)): Path<(String, String)>,
    State(state): State<AppState>,
) -> impl IntoResponse {
    use k8s_openapi::api::core::v1::Pod;
    let api: Api<Pod> = Api::namespaced(state.client, &namespace);
    match api.delete(&name, &DeleteParams::default()).await {
        Ok(_) => {
            info!("Deleted pod {}/{}", namespace, name);
            (StatusCode::OK, Json(serde_json::json!({ "success": true }))).into_response()
        }
        Err(err) => {
            error!("Error deleting pod {}/{}: {:?}", namespace, name, err);
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}

async fn delete_deployment(
    Path((namespace, name)): Path<(String, String)>,
    State(state): State<AppState>,
) -> impl IntoResponse {
    use k8s_openapi::api::apps::v1::Deployment;
    let api: Api<Deployment> = Api::namespaced(state.client, &namespace);
    match api.delete(&name, &DeleteParams::default()).await {
        Ok(_) => {
            info!("Deleted deployment {}/{}", namespace, name);
            (StatusCode::OK, Json(serde_json::json!({ "success": true }))).into_response()
        }
        Err(err) => {
            error!("Error deleting deployment {}/{}: {:?}", namespace, name, err);
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}

async fn delete_statefulset(
    Path((namespace, name)): Path<(String, String)>,
    State(state): State<AppState>,
) -> impl IntoResponse {
    use k8s_openapi::api::apps::v1::StatefulSet;
    let api: Api<StatefulSet> = Api::namespaced(state.client, &namespace);
    match api.delete(&name, &DeleteParams::default()).await {
        Ok(_) => {
            info!("Deleted statefulset {}/{}", namespace, name);
            (StatusCode::OK, Json(serde_json::json!({ "success": true }))).into_response()
        }
        Err(err) => {
            error!("Error deleting statefulset {}/{}: {:?}", namespace, name, err);
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}

async fn delete_daemonset(
    Path((namespace, name)): Path<(String, String)>,
    State(state): State<AppState>,
) -> impl IntoResponse {
    use k8s_openapi::api::apps::v1::DaemonSet;
    let api: Api<DaemonSet> = Api::namespaced(state.client, &namespace);
    match api.delete(&name, &DeleteParams::default()).await {
        Ok(_) => {
            info!("Deleted daemonset {}/{}", namespace, name);
            (StatusCode::OK, Json(serde_json::json!({ "success": true }))).into_response()
        }
        Err(err) => {
            error!("Error deleting daemonset {}/{}: {:?}", namespace, name, err);
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}

async fn delete_replicaset(
    Path((namespace, name)): Path<(String, String)>,
    State(state): State<AppState>,
) -> impl IntoResponse {
    use k8s_openapi::api::apps::v1::ReplicaSet;
    let api: Api<ReplicaSet> = Api::namespaced(state.client, &namespace);
    match api.delete(&name, &DeleteParams::default()).await {
        Ok(_) => {
            info!("Deleted replicaset {}/{}", namespace, name);
            (StatusCode::OK, Json(serde_json::json!({ "success": true }))).into_response()
        }
        Err(err) => {
            error!("Error deleting replicaset {}/{}: {:?}", namespace, name, err);
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}

async fn delete_job(
    Path((namespace, name)): Path<(String, String)>,
    State(state): State<AppState>,
) -> impl IntoResponse {
    use k8s_openapi::api::batch::v1::Job;
    let api: Api<Job> = Api::namespaced(state.client, &namespace);
    match api.delete(&name, &DeleteParams::default()).await {
        Ok(_) => {
            info!("Deleted job {}/{}", namespace, name);
            (StatusCode::OK, Json(serde_json::json!({ "success": true }))).into_response()
        }
        Err(err) => {
            error!("Error deleting job {}/{}: {:?}", namespace, name, err);
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}

async fn delete_cronjob(
    Path((namespace, name)): Path<(String, String)>,
    State(state): State<AppState>,
) -> impl IntoResponse {
    use k8s_openapi::api::batch::v1::CronJob;
    let api: Api<CronJob> = Api::namespaced(state.client, &namespace);
    match api.delete(&name, &DeleteParams::default()).await {
        Ok(_) => {
            info!("Deleted cronjob {}/{}", namespace, name);
            (StatusCode::OK, Json(serde_json::json!({ "success": true }))).into_response()
        }
        Err(err) => {
            error!("Error deleting cronjob {}/{}: {:?}", namespace, name, err);
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}

async fn delete_namespace(
    Path(name): Path<String>,
    State(state): State<AppState>,
) -> impl IntoResponse {
    use k8s_openapi::api::core::v1::Namespace;
    let api: Api<Namespace> = Api::all(state.client);
    match api.delete(&name, &DeleteParams::default()).await {
        Ok(_) => {
            info!("Deleted namespace {}", name);
            (StatusCode::OK, Json(serde_json::json!({ "success": true }))).into_response()
        }
        Err(err) => {
            error!("Error deleting namespace {}: {:?}", name, err);
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}

// ConfigMap YAML handlers
async fn get_configmap_yaml(
    Path((namespace, name)): Path<(String, String)>,
    State(state): State<AppState>,
) -> impl IntoResponse {
    use k8s_openapi::api::core::v1::ConfigMap;

    let api: Api<ConfigMap> = Api::namespaced(state.client, &namespace);
    match api.get(&name).await {
        Ok(configmap) => match serde_yaml::to_string(&configmap) {
            Ok(yaml) => (
                StatusCode::OK,
                [(header::CONTENT_TYPE, "application/yaml; charset=utf-8")],
                yaml,
            )
                .into_response(),
            Err(err) => {
                error!(
                    "Failed to serialize configmap to YAML {}/{}: {:?}",
                    namespace, name, err
                );
                StatusCode::INTERNAL_SERVER_ERROR.into_response()
            }
        },
        Err(err) => {
            error!("Error getting configmap YAML {}/{}: {:?}", namespace, name, err);
            StatusCode::NOT_FOUND.into_response()
        }
    }
}

async fn update_configmap_yaml(
    Path((namespace, name)): Path<(String, String)>,
    State(state): State<AppState>,
    body: String,
) -> impl IntoResponse {
    use k8s_openapi::api::core::v1::ConfigMap;

    let mut configmap: ConfigMap = match serde_yaml::from_str(&body) {
        Ok(configmap) => configmap,
        Err(err) => {
            return (
                StatusCode::BAD_REQUEST,
                Json(serde_json::json!({
                    "success": false,
                    "message": format!("Invalid YAML: {}", err),
                })),
            )
                .into_response();
        }
    };

    configmap.metadata.name = Some(name.clone());
    configmap.metadata.namespace = Some(namespace.clone());

    let api: Api<ConfigMap> = Api::namespaced(state.client, &namespace);
    let patch_value = match serde_json::to_value(&configmap) {
        Ok(value) => value,
        Err(err) => {
            error!(
                "Failed converting configmap YAML to JSON {}/{}: {:?}",
                namespace, name, err
            );
            return StatusCode::INTERNAL_SERVER_ERROR.into_response();
        }
    };

    let patch_params = PatchParams::apply("pertisk-kube-web").force();
    match api.patch(&name, &patch_params, &Patch::Apply(patch_value)).await {
        Ok(_) => (
            StatusCode::OK,
            Json(serde_json::json!({
                "success": true,
                "message": "ConfigMap updated successfully"
            })),
        )
            .into_response(),
        Err(err) => {
            error!("Error updating configmap YAML {}/{}: {:?}", namespace, name, err);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({
                    "success": false,
                    "message": format!("Failed to update configmap: {}", err),
                })),
            )
                .into_response()
        }
    }
}

async fn delete_configmap(
    Path((namespace, name)): Path<(String, String)>,
    State(state): State<AppState>,
) -> impl IntoResponse {
    use k8s_openapi::api::core::v1::ConfigMap;
    let api: Api<ConfigMap> = Api::namespaced(state.client, &namespace);
    match api.delete(&name, &DeleteParams::default()).await {
        Ok(_) => {
            info!("Deleted configmap {}/{}", namespace, name);
            (StatusCode::OK, Json(serde_json::json!({ "success": true }))).into_response()
        }
        Err(err) => {
            error!("Error deleting configmap {}/{}: {:?}", namespace, name, err);
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}

// Secret YAML handlers
async fn get_secret_yaml(
    Path((namespace, name)): Path<(String, String)>,
    State(state): State<AppState>,
) -> impl IntoResponse {
    use k8s_openapi::api::core::v1::Secret;

    let api: Api<Secret> = Api::namespaced(state.client, &namespace);
    match api.get(&name).await {
        Ok(secret) => match serde_yaml::to_string(&secret) {
            Ok(yaml) => (
                StatusCode::OK,
                [(header::CONTENT_TYPE, "application/yaml; charset=utf-8")],
                yaml,
            )
                .into_response(),
            Err(err) => {
                error!(
                    "Failed to serialize secret to YAML {}/{}: {:?}",
                    namespace, name, err
                );
                StatusCode::INTERNAL_SERVER_ERROR.into_response()
            }
        },
        Err(err) => {
            error!("Error getting secret YAML {}/{}: {:?}", namespace, name, err);
            StatusCode::NOT_FOUND.into_response()
        }
    }
}

async fn update_secret_yaml(
    Path((namespace, name)): Path<(String, String)>,
    State(state): State<AppState>,
    body: String,
) -> impl IntoResponse {
    use k8s_openapi::api::core::v1::Secret;

    let mut secret: Secret = match serde_yaml::from_str(&body) {
        Ok(secret) => secret,
        Err(err) => {
            return (
                StatusCode::BAD_REQUEST,
                Json(serde_json::json!({
                    "success": false,
                    "message": format!("Invalid YAML: {}", err),
                })),
            )
                .into_response();
        }
    };

    secret.metadata.name = Some(name.clone());
    secret.metadata.namespace = Some(namespace.clone());

    let api: Api<Secret> = Api::namespaced(state.client, &namespace);
    let patch_value = match serde_json::to_value(&secret) {
        Ok(value) => value,
        Err(err) => {
            error!(
                "Failed converting secret YAML to JSON {}/{}: {:?}",
                namespace, name, err
            );
            return StatusCode::INTERNAL_SERVER_ERROR.into_response();
        }
    };

    let patch_params = PatchParams::apply("pertisk-kube-web").force();
    match api.patch(&name, &patch_params, &Patch::Apply(patch_value)).await {
        Ok(_) => (
            StatusCode::OK,
            Json(serde_json::json!({
                "success": true,
                "message": "Secret updated successfully"
            })),
        )
            .into_response(),
        Err(err) => {
            error!("Error updating secret YAML {}/{}: {:?}", namespace, name, err);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({
                    "success": false,
                    "message": format!("Failed to update secret: {}", err),
                })),
            )
                .into_response()
        }
    }
}

async fn delete_secret(
    Path((namespace, name)): Path<(String, String)>,
    State(state): State<AppState>,
) -> impl IntoResponse {
    use k8s_openapi::api::core::v1::Secret;
    let api: Api<Secret> = Api::namespaced(state.client, &namespace);
    match api.delete(&name, &DeleteParams::default()).await {
        Ok(_) => {
            info!("Deleted secret {}/{}", namespace, name);
            (StatusCode::OK, Json(serde_json::json!({ "success": true }))).into_response()
        }
        Err(err) => {
            error!("Error deleting secret {}/{}: {:?}", namespace, name, err);
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}

// ResourceQuota YAML handlers
async fn get_resourcequota_yaml(
    Path((namespace, name)): Path<(String, String)>,
    State(state): State<AppState>,
) -> impl IntoResponse {
    use k8s_openapi::api::core::v1::ResourceQuota;

    let api: Api<ResourceQuota> = Api::namespaced(state.client, &namespace);
    match api.get(&name).await {
        Ok(resourcequota) => match serde_yaml::to_string(&resourcequota) {
            Ok(yaml) => (
                StatusCode::OK,
                [(header::CONTENT_TYPE, "application/yaml; charset=utf-8")],
                yaml,
            )
                .into_response(),
            Err(err) => {
                error!(
                    "Failed to serialize resourcequota to YAML {}/{}: {:?}",
                    namespace, name, err
                );
                StatusCode::INTERNAL_SERVER_ERROR.into_response()
            }
        },
        Err(err) => {
            error!("Error getting resourcequota YAML {}/{}: {:?}", namespace, name, err);
            StatusCode::NOT_FOUND.into_response()
        }
    }
}

async fn update_resourcequota_yaml(
    Path((namespace, name)): Path<(String, String)>,
    State(state): State<AppState>,
    body: String,
) -> impl IntoResponse {
    use k8s_openapi::api::core::v1::ResourceQuota;

    let mut resourcequota: ResourceQuota = match serde_yaml::from_str(&body) {
        Ok(resourcequota) => resourcequota,
        Err(err) => {
            return (
                StatusCode::BAD_REQUEST,
                Json(serde_json::json!({
                    "success": false,
                    "message": format!("Invalid YAML: {}", err),
                })),
            )
                .into_response();
        }
    };

    resourcequota.metadata.name = Some(name.clone());
    resourcequota.metadata.namespace = Some(namespace.clone());

    let api: Api<ResourceQuota> = Api::namespaced(state.client, &namespace);
    let patch_value = match serde_json::to_value(&resourcequota) {
        Ok(value) => value,
        Err(err) => {
            error!(
                "Failed converting resourcequota YAML to JSON {}/{}: {:?}",
                namespace, name, err
            );
            return StatusCode::INTERNAL_SERVER_ERROR.into_response();
        }
    };

    let patch_params = PatchParams::apply("pertisk-kube-web").force();
    match api.patch(&name, &patch_params, &Patch::Apply(patch_value)).await {
        Ok(_) => (
            StatusCode::OK,
            Json(serde_json::json!({
                "success": true,
                "message": "ResourceQuota updated successfully"
            })),
        )
            .into_response(),
        Err(err) => {
            error!("Error updating resourcequota YAML {}/{}: {:?}", namespace, name, err);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({
                    "success": false,
                    "message": format!("Failed to update resourcequota: {}", err),
                })),
            )
                .into_response()
        }
    }
}

async fn delete_resourcequota(
    Path((namespace, name)): Path<(String, String)>,
    State(state): State<AppState>,
) -> impl IntoResponse {
    use k8s_openapi::api::core::v1::ResourceQuota;
    let api: Api<ResourceQuota> = Api::namespaced(state.client, &namespace);
    match api.delete(&name, &DeleteParams::default()).await {
        Ok(_) => {
            info!("Deleted resourcequota {}/{}", namespace, name);
            (StatusCode::OK, Json(serde_json::json!({ "success": true }))).into_response()
        }
        Err(err) => {
            error!("Error deleting resourcequota {}/{}: {:?}", namespace, name, err);
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}

// LimitRange YAML handlers
async fn get_limitrange_yaml(
    Path((namespace, name)): Path<(String, String)>,
    State(state): State<AppState>,
) -> impl IntoResponse {
    use k8s_openapi::api::core::v1::LimitRange;

    let api: Api<LimitRange> = Api::namespaced(state.client, &namespace);
    match api.get(&name).await {
        Ok(limitrange) => match serde_yaml::to_string(&limitrange) {
            Ok(yaml) => (
                StatusCode::OK,
                [(header::CONTENT_TYPE, "application/yaml; charset=utf-8")],
                yaml,
            )
                .into_response(),
            Err(err) => {
                error!(
                    "Failed to serialize limitrange to YAML {}/{}: {:?}",
                    namespace, name, err
                );
                StatusCode::INTERNAL_SERVER_ERROR.into_response()
            }
        },
        Err(err) => {
            error!("Error getting limitrange YAML {}/{}: {:?}", namespace, name, err);
            StatusCode::NOT_FOUND.into_response()
        }
    }
}

async fn update_limitrange_yaml(
    Path((namespace, name)): Path<(String, String)>,
    State(state): State<AppState>,
    body: String,
) -> impl IntoResponse {
    use k8s_openapi::api::core::v1::LimitRange;

    let mut limitrange: LimitRange = match serde_yaml::from_str(&body) {
        Ok(limitrange) => limitrange,
        Err(err) => {
            return (
                StatusCode::BAD_REQUEST,
                Json(serde_json::json!({
                    "success": false,
                    "message": format!("Invalid YAML: {}", err),
                })),
            )
                .into_response();
        }
    };

    limitrange.metadata.name = Some(name.clone());
    limitrange.metadata.namespace = Some(namespace.clone());

    let api: Api<LimitRange> = Api::namespaced(state.client, &namespace);
    let patch_value = match serde_json::to_value(&limitrange) {
        Ok(value) => value,
        Err(err) => {
            error!(
                "Failed converting limitrange YAML to JSON {}/{}: {:?}",
                namespace, name, err
            );
            return StatusCode::INTERNAL_SERVER_ERROR.into_response();
        }
    };

    let patch_params = PatchParams::apply("pertisk-kube-web").force();
    match api.patch(&name, &patch_params, &Patch::Apply(patch_value)).await {
        Ok(_) => (
            StatusCode::OK,
            Json(serde_json::json!({
                "success": true,
                "message": "LimitRange updated successfully"
            })),
        )
            .into_response(),
        Err(err) => {
            error!("Error updating limitrange YAML {}/{}: {:?}", namespace, name, err);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({
                    "success": false,
                    "message": format!("Failed to update limitrange: {}", err),
                })),
            )
                .into_response()
        }
    }
}

async fn delete_limitrange(
    Path((namespace, name)): Path<(String, String)>,
    State(state): State<AppState>,
) -> impl IntoResponse {
    use k8s_openapi::api::core::v1::LimitRange;
    let api: Api<LimitRange> = Api::namespaced(state.client, &namespace);
    match api.delete(&name, &DeleteParams::default()).await {
        Ok(_) => {
            info!("Deleted limitrange {}/{}", namespace, name);
            (StatusCode::OK, Json(serde_json::json!({ "success": true }))).into_response()
        }
        Err(err) => {
            error!("Error deleting limitrange {}/{}: {:?}", namespace, name, err);
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}

// HPA YAML handlers
async fn get_hpa_yaml(
    Path((namespace, name)): Path<(String, String)>,
    State(state): State<AppState>,
) -> impl IntoResponse {
    use k8s_openapi::api::autoscaling::v2::HorizontalPodAutoscaler;

    let api: Api<HorizontalPodAutoscaler> = Api::namespaced(state.client, &namespace);
    match api.get(&name).await {
        Ok(hpa) => match serde_yaml::to_string(&hpa) {
            Ok(yaml) => (
                StatusCode::OK,
                [(header::CONTENT_TYPE, "application/yaml; charset=utf-8")],
                yaml,
            )
                .into_response(),
            Err(err) => {
                error!(
                    "Failed to serialize hpa to YAML {}/{}: {:?}",
                    namespace, name, err
                );
                StatusCode::INTERNAL_SERVER_ERROR.into_response()
            }
        },
        Err(err) => {
            error!("Error getting hpa YAML {}/{}: {:?}", namespace, name, err);
            StatusCode::NOT_FOUND.into_response()
        }
    }
}

async fn update_hpa_yaml(
    Path((namespace, name)): Path<(String, String)>,
    State(state): State<AppState>,
    body: String,
) -> impl IntoResponse {
    use k8s_openapi::api::autoscaling::v2::HorizontalPodAutoscaler;

    let mut hpa: HorizontalPodAutoscaler = match serde_yaml::from_str(&body) {
        Ok(hpa) => hpa,
        Err(err) => {
            return (
                StatusCode::BAD_REQUEST,
                Json(serde_json::json!({
                    "success": false,
                    "message": format!("Invalid YAML: {}", err),
                })),
            )
                .into_response();
        }
    };

    hpa.metadata.name = Some(name.clone());
    hpa.metadata.namespace = Some(namespace.clone());

    let api: Api<HorizontalPodAutoscaler> = Api::namespaced(state.client, &namespace);
    let patch_value = match serde_json::to_value(&hpa) {
        Ok(value) => value,
        Err(err) => {
            error!(
                "Failed converting hpa YAML to JSON {}/{}: {:?}",
                namespace, name, err
            );
            return StatusCode::INTERNAL_SERVER_ERROR.into_response();
        }
    };

    let patch_params = PatchParams::apply("pertisk-kube-web").force();
    match api.patch(&name, &patch_params, &Patch::Apply(patch_value)).await {
        Ok(_) => (
            StatusCode::OK,
            Json(serde_json::json!({
                "success": true,
                "message": "HorizontalPodAutoscaler updated successfully"
            })),
        )
            .into_response(),
        Err(err) => {
            error!("Error updating hpa YAML {}/{}: {:?}", namespace, name, err);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({
                    "success": false,
                    "message": format!("Failed to update hpa: {}", err),
                })),
            )
                .into_response()
        }
    }
}

async fn delete_hpa(
    Path((namespace, name)): Path<(String, String)>,
    State(state): State<AppState>,
) -> impl IntoResponse {
    use k8s_openapi::api::autoscaling::v2::HorizontalPodAutoscaler;
    let api: Api<HorizontalPodAutoscaler> = Api::namespaced(state.client, &namespace);
    match api.delete(&name, &DeleteParams::default()).await {
        Ok(_) => {
            info!("Deleted hpa {}/{}", namespace, name);
            (StatusCode::OK, Json(serde_json::json!({ "success": true }))).into_response()
        }
        Err(err) => {
            error!("Error deleting hpa {}/{}: {:?}", namespace, name, err);
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}

// PDB YAML handlers
async fn get_pdb_yaml(
    Path((namespace, name)): Path<(String, String)>,
    State(state): State<AppState>,
) -> impl IntoResponse {
    use k8s_openapi::api::policy::v1::PodDisruptionBudget;

    let api: Api<PodDisruptionBudget> = Api::namespaced(state.client, &namespace);
    match api.get(&name).await {
        Ok(pdb) => match serde_yaml::to_string(&pdb) {
            Ok(yaml) => (
                StatusCode::OK,
                [(header::CONTENT_TYPE, "application/yaml; charset=utf-8")],
                yaml,
            )
                .into_response(),
            Err(err) => {
                error!(
                    "Failed to serialize pdb to YAML {}/{}: {:?}",
                    namespace, name, err
                );
                StatusCode::INTERNAL_SERVER_ERROR.into_response()
            }
        },
        Err(err) => {
            error!("Error getting pdb YAML {}/{}: {:?}", namespace, name, err);
            StatusCode::NOT_FOUND.into_response()
        }
    }
}

async fn update_pdb_yaml(
    Path((namespace, name)): Path<(String, String)>,
    State(state): State<AppState>,
    body: String,
) -> impl IntoResponse {
    use k8s_openapi::api::policy::v1::PodDisruptionBudget;

    let mut pdb: PodDisruptionBudget = match serde_yaml::from_str(&body) {
        Ok(pdb) => pdb,
        Err(err) => {
            return (
                StatusCode::BAD_REQUEST,
                Json(serde_json::json!({
                    "success": false,
                    "message": format!("Invalid YAML: {}", err),
                })),
            )
                .into_response();
        }
    };

    pdb.metadata.name = Some(name.clone());
    pdb.metadata.namespace = Some(namespace.clone());

    let api: Api<PodDisruptionBudget> = Api::namespaced(state.client, &namespace);
    let patch_value = match serde_json::to_value(&pdb) {
        Ok(value) => value,
        Err(err) => {
            error!(
                "Failed converting pdb YAML to JSON {}/{}: {:?}",
                namespace, name, err
            );
            return StatusCode::INTERNAL_SERVER_ERROR.into_response();
        }
    };

    let patch_params = PatchParams::apply("pertisk-kube-web").force();
    match api.patch(&name, &patch_params, &Patch::Apply(patch_value)).await {
        Ok(_) => (
            StatusCode::OK,
            Json(serde_json::json!({
                "success": true,
                "message": "PodDisruptionBudget updated successfully"
            })),
        )
            .into_response(),
        Err(err) => {
            error!("Error updating pdb YAML {}/{}: {:?}", namespace, name, err);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({
                    "success": false,
                    "message": format!("Failed to update pdb: {}", err),
                })),
            )
                .into_response()
        }
    }
}

async fn delete_pdb(
    Path((namespace, name)): Path<(String, String)>,
    State(state): State<AppState>,
) -> impl IntoResponse {
    use k8s_openapi::api::policy::v1::PodDisruptionBudget;
    let api: Api<PodDisruptionBudget> = Api::namespaced(state.client, &namespace);
    match api.delete(&name, &DeleteParams::default()).await {
        Ok(_) => {
            info!("Deleted pdb {}/{}", namespace, name);
            (StatusCode::OK, Json(serde_json::json!({ "success": true }))).into_response()
        }
        Err(err) => {
            error!("Error deleting pdb {}/{}: {:?}", namespace, name, err);
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}

// PriorityClass YAML handlers (cluster-scoped)
async fn get_priorityclass_yaml(
    Path(name): Path<String>,
    State(state): State<AppState>,
) -> impl IntoResponse {
    use k8s_openapi::api::scheduling::v1::PriorityClass;

    let api: Api<PriorityClass> = Api::all(state.client);
    match api.get(&name).await {
        Ok(priorityclass) => match serde_yaml::to_string(&priorityclass) {
            Ok(yaml) => (
                StatusCode::OK,
                [(header::CONTENT_TYPE, "application/yaml; charset=utf-8")],
                yaml,
            )
                .into_response(),
            Err(err) => {
                error!(
                    "Failed to serialize priorityclass to YAML {}: {:?}",
                    name, err
                );
                StatusCode::INTERNAL_SERVER_ERROR.into_response()
            }
        },
        Err(err) => {
            error!("Error getting priorityclass YAML {}: {:?}", name, err);
            StatusCode::NOT_FOUND.into_response()
        }
    }
}

async fn update_priorityclass_yaml(
    Path(name): Path<String>,
    State(state): State<AppState>,
    body: String,
) -> impl IntoResponse {
    use k8s_openapi::api::scheduling::v1::PriorityClass;

    let mut priorityclass: PriorityClass = match serde_yaml::from_str(&body) {
        Ok(priorityclass) => priorityclass,
        Err(err) => {
            return (
                StatusCode::BAD_REQUEST,
                Json(serde_json::json!({
                    "success": false,
                    "message": format!("Invalid YAML: {}", err),
                })),
            )
                .into_response();
        }
    };

    priorityclass.metadata.name = Some(name.clone());

    let api: Api<PriorityClass> = Api::all(state.client);
    let patch_value = match serde_json::to_value(&priorityclass) {
        Ok(value) => value,
        Err(err) => {
            error!(
                "Failed converting priorityclass YAML to JSON {}: {:?}",
                name, err
            );
            return StatusCode::INTERNAL_SERVER_ERROR.into_response();
        }
    };

    let patch_params = PatchParams::apply("pertisk-kube-web").force();
    match api.patch(&name, &patch_params, &Patch::Apply(patch_value)).await {
        Ok(_) => (
            StatusCode::OK,
            Json(serde_json::json!({
                "success": true,
                "message": "PriorityClass updated successfully"
            })),
        )
            .into_response(),
        Err(err) => {
            error!("Error updating priorityclass YAML {}: {:?}", name, err);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({
                    "success": false,
                    "message": format!("Failed to update priorityclass: {}", err),
                })),
            )
                .into_response()
        }
    }
}

async fn delete_priorityclass(
    Path(name): Path<String>,
    State(state): State<AppState>,
) -> impl IntoResponse {
    use k8s_openapi::api::scheduling::v1::PriorityClass;
    let api: Api<PriorityClass> = Api::all(state.client);
    match api.delete(&name, &DeleteParams::default()).await {
        Ok(_) => {
            info!("Deleted priorityclass {}", name);
            (StatusCode::OK, Json(serde_json::json!({ "success": true }))).into_response()
        }
        Err(err) => {
            error!("Error deleting priorityclass {}: {:?}", name, err);
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}

// RuntimeClass YAML handlers (cluster-scoped)
async fn get_runtimeclass_yaml(
    Path(name): Path<String>,
    State(state): State<AppState>,
) -> impl IntoResponse {
    use k8s_openapi::api::node::v1::RuntimeClass;

    let api: Api<RuntimeClass> = Api::all(state.client);
    match api.get(&name).await {
        Ok(runtimeclass) => match serde_yaml::to_string(&runtimeclass) {
            Ok(yaml) => (
                StatusCode::OK,
                [(header::CONTENT_TYPE, "application/yaml; charset=utf-8")],
                yaml,
            )
                .into_response(),
            Err(err) => {
                error!(
                    "Failed to serialize runtimeclass to YAML {}: {:?}",
                    name, err
                );
                StatusCode::INTERNAL_SERVER_ERROR.into_response()
            }
        },
        Err(err) => {
            error!("Error getting runtimeclass YAML {}: {:?}", name, err);
            StatusCode::NOT_FOUND.into_response()
        }
    }
}

async fn update_runtimeclass_yaml(
    Path(name): Path<String>,
    State(state): State<AppState>,
    body: String,
) -> impl IntoResponse {
    use k8s_openapi::api::node::v1::RuntimeClass;

    let mut runtimeclass: RuntimeClass = match serde_yaml::from_str(&body) {
        Ok(runtimeclass) => runtimeclass,
        Err(err) => {
            return (
                StatusCode::BAD_REQUEST,
                Json(serde_json::json!({
                    "success": false,
                    "message": format!("Invalid YAML: {}", err),
                })),
            )
                .into_response();
        }
    };

    runtimeclass.metadata.name = Some(name.clone());

    let api: Api<RuntimeClass> = Api::all(state.client);
    let patch_value = match serde_json::to_value(&runtimeclass) {
        Ok(value) => value,
        Err(err) => {
            error!(
                "Failed converting runtimeclass YAML to JSON {}: {:?}",
                name, err
            );
            return StatusCode::INTERNAL_SERVER_ERROR.into_response();
        }
    };

    let patch_params = PatchParams::apply("pertisk-kube-web").force();
    match api.patch(&name, &patch_params, &Patch::Apply(patch_value)).await {
        Ok(_) => (
            StatusCode::OK,
            Json(serde_json::json!({
                "success": true,
                "message": "RuntimeClass updated successfully"
            })),
        )
            .into_response(),
        Err(err) => {
            error!("Error updating runtimeclass YAML {}: {:?}", name, err);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({
                    "success": false,
                    "message": format!("Failed to update runtimeclass: {}", err),
                })),
            )
                .into_response()
        }
    }
}

async fn delete_runtimeclass(
    Path(name): Path<String>,
    State(state): State<AppState>,
) -> impl IntoResponse {
    use k8s_openapi::api::node::v1::RuntimeClass;
    let api: Api<RuntimeClass> = Api::all(state.client);
    match api.delete(&name, &DeleteParams::default()).await {
        Ok(_) => {
            info!("Deleted runtimeclass {}", name);
            (StatusCode::OK, Json(serde_json::json!({ "success": true }))).into_response()
        }
        Err(err) => {
            error!("Error deleting runtimeclass {}: {:?}", name, err);
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}

// Lease YAML handlers
async fn get_lease_yaml(
    Path((namespace, name)): Path<(String, String)>,
    State(state): State<AppState>,
) -> impl IntoResponse {
    use k8s_openapi::api::coordination::v1::Lease;

    let api: Api<Lease> = Api::namespaced(state.client, &namespace);
    match api.get(&name).await {
        Ok(lease) => match serde_yaml::to_string(&lease) {
            Ok(yaml) => (
                StatusCode::OK,
                [(header::CONTENT_TYPE, "application/yaml; charset=utf-8")],
                yaml,
            )
                .into_response(),
            Err(err) => {
                error!(
                    "Failed to serialize lease to YAML {}/{}: {:?}",
                    namespace, name, err
                );
                StatusCode::INTERNAL_SERVER_ERROR.into_response()
            }
        },
        Err(err) => {
            error!("Error getting lease YAML {}/{}: {:?}", namespace, name, err);
            StatusCode::NOT_FOUND.into_response()
        }
    }
}

async fn update_lease_yaml(
    Path((namespace, name)): Path<(String, String)>,
    State(state): State<AppState>,
    body: String,
) -> impl IntoResponse {
    use k8s_openapi::api::coordination::v1::Lease;

    let mut lease: Lease = match serde_yaml::from_str(&body) {
        Ok(lease) => lease,
        Err(err) => {
            return (
                StatusCode::BAD_REQUEST,
                Json(serde_json::json!({
                    "success": false,
                    "message": format!("Invalid YAML: {}", err),
                })),
            )
                .into_response();
        }
    };

    lease.metadata.name = Some(name.clone());
    lease.metadata.namespace = Some(namespace.clone());

    let api: Api<Lease> = Api::namespaced(state.client, &namespace);
    let patch_value = match serde_json::to_value(&lease) {
        Ok(value) => value,
        Err(err) => {
            error!(
                "Failed converting lease YAML to JSON {}/{}: {:?}",
                namespace, name, err
            );
            return StatusCode::INTERNAL_SERVER_ERROR.into_response();
        }
    };

    let patch_params = PatchParams::apply("pertisk-kube-web").force();
    match api.patch(&name, &patch_params, &Patch::Apply(patch_value)).await {
        Ok(_) => (
            StatusCode::OK,
            Json(serde_json::json!({
                "success": true,
                "message": "Lease updated successfully"
            })),
        )
            .into_response(),
        Err(err) => {
            error!("Error updating lease YAML {}/{}: {:?}", namespace, name, err);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({
                    "success": false,
                    "message": format!("Failed to update lease: {}", err),
                })),
            )
                .into_response()
        }
    }
}

async fn delete_lease(
    Path((namespace, name)): Path<(String, String)>,
    State(state): State<AppState>,
) -> impl IntoResponse {
    use k8s_openapi::api::coordination::v1::Lease;
    let api: Api<Lease> = Api::namespaced(state.client, &namespace);
    match api.delete(&name, &DeleteParams::default()).await {
        Ok(_) => {
            info!("Deleted lease {}/{}", namespace, name);
            (StatusCode::OK, Json(serde_json::json!({ "success": true }))).into_response()
        }
        Err(err) => {
            error!("Error deleting lease {}/{}: {:?}", namespace, name, err);
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}
