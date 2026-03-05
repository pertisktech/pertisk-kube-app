use axum::{
    extract::{Path, Request, State},
    http::{header, StatusCode},
    middleware::{self, Next},
    response::{IntoResponse, Response},
    routing::{get, post},
    Json, Router,
};
use base64::{engine::general_purpose::STANDARD, Engine as _};
use chrono::Utc;
use cron::Schedule;
use kube::core::{ApiResource, DynamicObject, GroupVersionKind};
use kube::{api::{ListParams, Patch, PatchParams}, Api, Client};
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
}

#[derive(Deserialize)]
struct LoginRequest {
    username: String,
    password: String,
}

#[derive(Serialize)]
struct LoginResponse {
    success: bool,
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
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt().with_env_filter("info").init();

    // In-cluster config (works in Kubernetes) or falls back to local kubeconfig.
    let client = Client::try_default().await?;

    let username = env::var("USERNAME").unwrap_or_else(|_| "admin".to_string());
    let password = env::var("PASSWORD").unwrap_or_else(|_| "admin".to_string());
    let state = AppState {
        client,
        username,
        password,
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
        .route("/events", get(list_events))
        .route("/deployments", get(list_deployments))
        .route(
            "/deployments/:namespace/:name/yaml",
            get(get_deployment_yaml).put(update_deployment_yaml),
        )
        .route("/statefulsets", get(list_statefulsets))
        .route("/daemonsets", get(list_daemonsets))
        .route("/replicasets", get(list_replicasets))
        .route("/jobs", get(list_jobs))
        .route("/cronjobs", get(list_cronjobs))
        .route("/configmaps", get(list_configmaps))
        .route("/secrets", get(list_secrets))
        .route("/resourcequotas", get(list_resourcequotas))
        .route("/limitranges", get(list_limitranges))
        .route("/hpa", get(list_hpa))
        .route("/pdb", get(list_pdb))
        .route("/priorityclasses", get(list_priorityclasses))
        .route("/runtimeclasses", get(list_runtimeclasses))
        .route("/leases", get(list_leases))
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
        return (StatusCode::OK, Json(LoginResponse { success: true })).into_response();
    }

    StatusCode::UNAUTHORIZED.into_response()
}

async fn require_basic_auth(
    State(state): State<AppState>,
    request: Request,
    next: Next,
) -> Response {
    let credentials = request
        .headers()
        .get(header::AUTHORIZATION)
        .and_then(|value| value.to_str().ok())
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
                    let controlled_by = pod
                        .metadata
                        .owner_references
                        .as_ref()
                        .and_then(|owners| owners.first())
                        .map(|owner| owner.kind.clone())
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

    let api: Api<Node> = Api::all(state.client);
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
    let events_api: Api<Event> = Api::all(state.client);

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
            error!("Error listing leases: {:?}", err);
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}
