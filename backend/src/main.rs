use axum::{
    extract::Request,
    extract::State,
    http::StatusCode,
    middleware::{self, Next},
    response::IntoResponse,
    routing::{delete, get, post},
    Json, Router,
};
use kube::Client;
use std::{env, net::SocketAddr, path::PathBuf, sync::Arc, time::Instant};
use tokio::sync::RwLock;
use tower_http::{
    cors::{Any, CorsLayer},
    services::{ServeDir, ServeFile},
};
use tonic::transport::Server;
use tracing::{error, info, warn};
use tracing_subscriber::EnvFilter;

mod grpc_service;
mod proto;
mod ws_handler;

pub mod auth;
pub mod handlers;
pub mod models;
pub mod utils;

use auth::{login, refresh_token};
use handlers::{
    config::*,
    crd::*,
    helm::*,
    namespaces::*,
    network::*,
    portforward::*,
    rbac::*,
    resource_map::*,
    storage::*,
    workloads::*,
};
use models::*;

#[derive(Clone)]
pub struct AppState {
    pub client: Client,
    pub username: String,
    pub password: String,
    pub jwt_secret: String,
    pub port_forward_state: Option<Arc<handlers::portforward::PortForwardState>>,
    pub workload_metric_history: Arc<RwLock<Vec<WorkloadMetricSnapshot>>>,
    pub helm_charts_cache: Arc<RwLock<handlers::helm::HelmChartsCache>>,
    pub dashboard_summary_cache: Arc<RwLock<Option<DashboardSummary>>>,
    /// True when the kube client is a placeholder (exec credential failed at startup).
    /// Used by the frontend to surface a "Login Required" banner.
    pub auth_placeholder: bool,
    pub auth_message: Option<String>,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let env_filter = EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| EnvFilter::new("info,kube_client::client::builder=off"));
    tracing_subscriber::fmt()
        .json()
        .with_current_span(true)
        .with_span_list(true)
        .with_env_filter(env_filter)
        .init();

    let (client, kube_status) = utils::load_kube_client_with_status().await?;

    let username = env::var("USERNAME").unwrap_or_else(|_| "admin".to_string());
    let password = env::var("PASSWORD").unwrap_or_else(|_| "admin".to_string());
    let jwt_secret = env::var("JWT_SECRET").unwrap_or_else(|_| "your-secret-key-change-in-production".to_string());
    
    let cluster_key = handlers::portforward::cluster_key_from_env_or_default();
    let storage_path = handlers::portforward::build_storage_path_from_env();
    let port_forward_state = Some(Arc::new(handlers::portforward::PortForwardState::new(
        storage_path,
        cluster_key,
    )));

    // Clone the Arc before constructing state so port-forwards can be restored in the
    // background. Restoring forwards before the server starts delays the health-probe response
    // and causes cluster-switch failures when any forward takes several seconds to re-establish.
    let pf_state_for_restore = port_forward_state.as_ref().map(Arc::clone);

    let state = AppState {
        client,
        username,
        password,
        jwt_secret,
        port_forward_state,
        workload_metric_history: Arc::new(RwLock::new(Vec::new())),
        helm_charts_cache: Arc::new(RwLock::new(handlers::helm::HelmChartsCache::default())),
        dashboard_summary_cache: Arc::new(RwLock::new(None)),
        auth_placeholder: kube_status.is_placeholder,
        auth_message: kube_status.user_message,
    };

    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);
    let slow_request_threshold_ms: u64 = env::var("SLOW_REQUEST_MS")
        .ok()
        .and_then(|raw| raw.parse::<u64>().ok())
        .filter(|value| *value > 0)
        .unwrap_or(1000);
    info!(
        slow_request_threshold_ms,
        "Slow request logging enabled"
    );
    let static_dir: PathBuf = env::var("STATIC_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from("frontend/dist"));

    let public_api = Router::new()
        .route("/health", get(health))
        .route("/readiness", get(readiness))
        .route("/auth-status", get(auth_status))
        .route("/login", post(login));

    let refresh_api = Router::new().route("/refresh", post(refresh_token));

    let protected_api = Router::new()
        .route("/dashboard", get(get_dashboard_summary))
        .route("/resource-map", get(get_resource_map))
        .route("/nodes", get(list_nodes))
        .route(
            "/nodes/:name/yaml",
            get(get_node_yaml).put(update_node_yaml),
        )
        .route("/nodes/:name", delete(delete_node))
        .route("/nodes/:name/cordon", post(cordon_node))
        .route("/nodes/:name/uncordon", post(uncordon_node))
        .route("/nodes/:name/drain", post(drain_node))
        .route("/namespaces", get(list_namespaces))
        .route("/pods", get(list_pods))
        .route("/metrics/workloads/series", get(get_workload_metric_series))
        .route(
            "/pods/:namespace/:name/yaml",
            get(get_pod_yaml).put(update_pod_yaml),
        )
        .route("/pods/:namespace/:name", delete(delete_pod))
        .route("/pods/:namespace/:name/logs", get(get_pod_logs))
        .route("/pods/:namespace/:name/files", get(list_pod_files))
        .route("/pods/:namespace/:name/files/upload", post(upload_pod_files))
        .route("/pods/:namespace/:name/files/download", get(download_pod_path))
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
        .route("/workloads/restart-all", get(restart_all_workloads).post(restart_all_workloads))
        .route(
            "/deployments/:namespace/:name/image-tag",
            post(update_deployment_image_tag),
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
        .route(
            "/namespaces/:name/yaml",
            get(get_namespace_yaml).put(update_namespace_yaml),
        )
        .route("/configmaps", get(list_configmaps))
        .route(
            "/configmaps/:namespace/:name/yaml",
            get(get_configmap_yaml).put(update_configmap_yaml),
        )
        .route("/configmaps/:namespace/:name/data", get(get_configmap_data))
        .route("/configmaps/:namespace/:name", delete(delete_configmap))
        .route("/secrets", get(list_secrets))
        .route(
            "/secrets/:namespace/:name/yaml",
            get(get_secret_yaml).put(update_secret_yaml),
        )
        .route("/secrets/:namespace/:name/data", get(get_secret_data))
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
        .route("/mwcs", get(list_mwcs))
        .route("/mwcs/:name/yaml", get(get_mwc_yaml).put(update_mwc_yaml))
        .route("/mwcs/:name", delete(delete_mwc))
        .route("/vwcs", get(list_vwcs))
        .route("/vwcs/:name/yaml", get(get_vwc_yaml).put(update_vwc_yaml))
        .route("/vwcs/:name", delete(delete_vwc))
        .route("/services", get(list_services))
        .route(
            "/services/:namespace/:name/yaml",
            get(get_service_yaml).put(update_service_yaml),
        )
        .route("/services/:namespace/:name", delete(delete_service))
        .route("/endpoints", get(list_endpoints))
        .route(
            "/endpoints/:namespace/:name/yaml",
            get(get_endpoint_yaml).put(update_endpoint_yaml),
        )
        .route("/endpoints/:namespace/:name", delete(delete_endpoint))
        .route("/ingresses", get(list_ingresses))
        .route(
            "/ingresses/:namespace/:name/yaml",
            get(get_ingress_yaml).put(update_ingress_yaml),
        )
        .route("/ingresses/:namespace/:name", delete(delete_ingress))
        .route("/ingressclasses", get(list_ingressclasses))
        .route(
            "/ingressclasses/:name/yaml",
            get(get_ingressclass_yaml).put(update_ingressclass_yaml),
        )
        .route("/ingressclasses/:name", delete(delete_ingressclass))
        .route("/networkpolicies", get(list_networkpolicies))
        .route(
            "/networkpolicies/:namespace/:name/yaml",
            get(get_networkpolicy_yaml).put(update_networkpolicy_yaml),
        )
        .route(
            "/networkpolicies/:namespace/:name",
            delete(delete_networkpolicy),
        )
        .route("/persistentvolumes", get(list_persistent_volumes))
        .route("/persistentvolumeclaims", get(list_persistent_volume_claims))
        .route("/storageclasses", get(list_storage_classes))
        .route("/serviceaccounts/:namespace/:name/yaml",
            get(get_serviceaccount_yaml).put(update_serviceaccount_yaml),
        )
        .route("/serviceaccounts/:namespace/:name", delete(delete_serviceaccount))
        .route(
            "/roles/:namespace/:name/yaml",
            get(get_role_yaml).put(update_role_yaml),
        )
        .route("/roles/:namespace/:name", delete(delete_role))
        .route(
            "/rolebindings/:namespace/:name/yaml",
            get(get_rolebinding_yaml).put(update_rolebinding_yaml),
        )
        .route("/rolebindings/:namespace/:name", delete(delete_rolebinding))
        .route(
            "/clusterroles/:name/yaml",
            get(get_clusterrole_yaml).put(update_clusterrole_yaml),
        )
        .route("/clusterroles/:name", delete(delete_clusterrole))
        .route(
            "/clusterrolebindings/:name/yaml",
            get(get_clusterrolebinding_yaml).put(update_clusterrolebinding_yaml),
        )
        .route("/clusterrolebindings/:name", delete(delete_clusterrolebinding))
        .route("/port-forwards", get(list_port_forwards).post(create_port_forward))
        .route("/port-forwards/:id/stop", post(stop_port_forward))
        .route("/port-forwards/:id/restart", post(restart_port_forward))
        .route("/port-forwards/:id", delete(delete_port_forward))
        .route("/apply", post(apply_yaml))
        .route("/crds", get(list_crds))
        .route("/crds/:crd_name/resources", get(list_custom_resources))
        .route("/crds/:crd_name/resources/:name/yaml", get(get_custom_resource_yaml))
        .route("/crds/:crd_name/resources/:name", delete(delete_custom_resource))
        .route("/helm/releases", get(list_helm_releases))
        .route("/helmreleases", get(list_helm_releases))
        .route("/helm/charts", get(list_helm_charts))
        .route("/helm/repositories/check", get(check_helm_repository))
        .route("/helm/charts/versions", get(get_helm_chart_versions))
        .route("/helm/charts/values", get(get_helm_chart_values))
        .route("/helm/charts/readme", get(get_helm_chart_readme))
        .route("/helm/charts/install", post(install_helm_chart))
        .route("/helm/releases/:namespace/:name/yaml", get(get_helm_release_yaml))
        .route("/helm/releases/:namespace/:name/values", get(get_helm_release_values))
        .route("/helm/releases/:namespace/:name/history", get(get_helm_release_history))
        .route("/helm/releases/:namespace/:name/resources", get(get_helm_release_resources))
        .route("/helm/releases/:namespace/:name/rollback", post(rollback_helm_release))
        .route("/helm/releases/:namespace/:name/upgrade", post(upgrade_helm_release))
        .route("/helm/releases/:namespace/:name", delete(delete_helm_release))
        .route(
            "/persistentvolumes/:name/yaml",
            get(get_persistentvolume_yaml).put(update_persistentvolume_yaml),
        )
        .route("/persistentvolumes/:name", delete(delete_persistentvolume))
        .route(
            "/persistentvolumeclaims/:namespace/:name/yaml",
            get(get_persistentvolumeclaim_yaml).put(update_persistentvolumeclaim_yaml),
        )
        .route("/persistentvolumeclaims/:namespace/:name", delete(delete_persistentvolumeclaim))
        .route(
            "/storageclasses/:name/yaml",
            get(get_storageclass_yaml).put(update_storageclass_yaml),
        )
        .route("/storageclasses/:name", delete(delete_storageclass))
        .route("/serviceaccounts", get(list_service_accounts))
        .route("/roles", get(list_roles))
        .route("/rolebindings", get(list_role_bindings))
        .route("/clusterroles", get(list_cluster_roles))
        .route("/clusterrolebindings", get(list_cluster_role_bindings));

    // For desktop mode (localhost sidecar), all routes are public since login was removed
    let api = public_api.merge(refresh_api).merge(protected_api);

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
        .layer(middleware::from_fn_with_state(
            slow_request_threshold_ms,
            log_slow_requests,
        ))
        .layer(cors);

    let http_port: u16 = std::env::var("PORT")
        .ok()
        .or_else(|| std::env::var("APP_PORT").ok())
        .and_then(|v| v.parse().ok())
        .unwrap_or(15222);
    let addr: SocketAddr = ([0, 0, 0, 0], http_port).into();
    info!("Starting HTTP server on {}", addr);
    let listener = tokio::net::TcpListener::bind(addr).await?;
    let http_server = axum::serve(listener, app);

    // gRPC server
    let grpc_port: u16 = std::env::var("GRPC_PORT")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(50051);
    let grpc_addr: SocketAddr = ([0, 0, 0, 0], grpc_port).into();
    info!("Starting gRPC server on {}", grpc_addr);
    
    let grpc_service = grpc_service::KubernetesWatchService::new(grpc_client).into_server();
    let grpc_server = Server::builder()
        .accept_http1(true)  // Required for grpc-web
        .add_service(tonic_web::enable(grpc_service))
        .serve(grpc_addr);

    // Restore persisted port-forwards in the background so the server can start and respond
    // to health probes immediately. Each forward can take several seconds to re-establish, so
    // doing this synchronously before bind blocked the sidecar startup check.
    if let Some(pf_state) = pf_state_for_restore {
        tokio::spawn(async move {
            // Brief pause to ensure the HTTP server is already accepting connections.
            tokio::time::sleep(std::time::Duration::from_millis(500)).await;
            handlers::portforward::restore_port_forwards_from_storage(&pf_state).await;
        });
    }

    // Run both servers concurrently
    tokio::try_join!(
        async { http_server.await.map_err(|e| anyhow::anyhow!(e)) },
        async { grpc_server.await.map_err(|e| anyhow::anyhow!(e)) }
    )?;

    Ok(())
}

async fn log_slow_requests(
    State(threshold_ms): State<u64>,
    req: Request,
    next: Next,
) -> axum::response::Response {
    let method = req.method().clone();
    let path = req.uri().path().to_string();
    let started = Instant::now();
    let response = next.run(req).await;
    let elapsed_ms = started.elapsed().as_millis();

    if elapsed_ms >= threshold_ms as u128 {
        warn!(
            method = %method,
            path = %path,
            status = response.status().as_u16(),
            elapsed_ms,
            "Slow request"
        );
    }

    response
}

async fn health() -> impl IntoResponse {
    let body = HealthResponse {
        status: "ok".into(),
    };
    (StatusCode::OK, Json(body))
}

async fn auth_status(State(state): State<AppState>) -> impl IntoResponse {
    #[derive(serde::Serialize)]
    struct AuthStatusResponse {
        ok: bool,
        placeholder: bool,
        message: Option<String>,
    }
    let (ok, message) = if state.auth_placeholder {
        (
            false,
            Some(
                state
                    .auth_message
                    .clone()
                    .unwrap_or_else(|| {
                        "Kubernetes credentials are not available. Check kubeconfig/context and try again.".to_string()
                    }),
            ),
        )
    } else {
        (true, None)
    };
    (
        StatusCode::OK,
        Json(AuthStatusResponse {
            ok,
            placeholder: state.auth_placeholder,
            message,
        }),
    )
}

async fn readiness(State(state): State<AppState>) -> impl IntoResponse {
    if state.auth_placeholder {
        return (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(HealthResponse {
                status: "not ready".into(),
            }),
        )
            .into_response();
    }

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

