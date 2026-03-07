use axum::{
    extract::State,
    http::StatusCode,
    middleware,
    response::IntoResponse,
    routing::{delete, get, post},
    Json, Router,
};
use kube::Client;
use std::{env, net::SocketAddr, path::PathBuf};
use tower_http::{
    cors::{Any, CorsLayer},
    services::{ServeDir, ServeFile},
};
use tonic::transport::Server;
use tracing::{error, info};

mod grpc_service;
mod proto;
mod ws_handler;

pub mod auth;
pub mod handlers;
pub mod models;
pub mod utils;

use auth::{login, require_basic_auth};
use handlers::{
    config::*,
    namespaces::*,
    network::*,
    rbac::*,
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

