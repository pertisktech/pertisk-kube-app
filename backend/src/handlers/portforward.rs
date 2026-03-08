//! Port-forward handlers: list, create, stop, delete (kubectl port-forward subprocesses).

use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use tokio::process::Child;
use tokio::sync::RwLock;
use tracing::{error, info};

use crate::AppState;

static PORT_FORWARD_ID: AtomicU64 = AtomicU64::new(1);

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PortForward {
    pub id: u64,
    pub namespace: String,
    pub resource_type: String,
    pub resource_name: String,
    pub local_port: u16,
    pub remote_port: u16,
    pub status: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreatePortForwardRequest {
    pub namespace: String,
    pub resource_type: String,
    pub resource_name: String,
    pub local_port: u16,
    pub remote_port: u16,
}

pub struct PortForwardState {
    pub forwards: RwLock<HashMap<u64, PortForward>>,
    pub processes: RwLock<HashMap<u64, Child>>,
}

impl PortForwardState {
    pub fn new() -> Self {
        Self {
            forwards: RwLock::new(HashMap::new()),
            processes: RwLock::new(HashMap::new()),
        }
    }
}

pub async fn list_port_forwards(
    State(state): State<AppState>,
) -> impl IntoResponse {
    let pf_state = match state.port_forward_state.as_ref() {
        Some(s) => s,
        None => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({"error": "Port forward state not initialized"})),
            )
                .into_response()
        }
    };
    let forwards = pf_state.forwards.read().await;
    let list: Vec<PortForward> = forwards.values().cloned().collect();
    (StatusCode::OK, Json(list)).into_response()
}

pub async fn create_port_forward(
    State(state): State<AppState>,
    Json(request): Json<CreatePortForwardRequest>,
) -> impl IntoResponse {
    let pf_state = match state.port_forward_state.as_ref() {
        Some(s) => s,
        None => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({"error": "Port forward state not initialized"})),
            )
                .into_response()
        }
    };

    if request.resource_type != "pod" && request.resource_type != "service" {
        return (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({"error": "resource_type must be 'pod' or 'service'"})),
        )
            .into_response();
    }

    let resource = format!("{}/{}", request.resource_type, request.resource_name);
    let port_mapping = format!("127.0.0.1:{}:{}", request.local_port, request.remote_port);

    let mut cmd = tokio::process::Command::new("kubectl");
    cmd.arg("-n")
        .arg(&request.namespace)
        .arg("port-forward")
        .arg(&resource)
        .arg(&port_mapping);
    cmd.stdout(std::process::Stdio::null());
    cmd.stderr(std::process::Stdio::piped());

    let child = match cmd.spawn() {
        Ok(c) => c,
        Err(e) => {
            error!("Failed to start port-forward: {}", e);
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({
                    "error": format!("Failed to start port-forward: {}", e)
                })),
            )
                .into_response();
        }
    };

    let id = PORT_FORWARD_ID.fetch_add(1, Ordering::SeqCst);
    let created_at = chrono::Utc::now().to_rfc3339();

    let port_forward = PortForward {
        id,
        namespace: request.namespace.clone(),
        resource_type: request.resource_type.clone(),
        resource_name: request.resource_name.clone(),
        local_port: request.local_port,
        remote_port: request.remote_port,
        status: "running".to_string(),
        created_at: created_at.clone(),
    };

    {
        let mut forwards = pf_state.forwards.write().await;
        forwards.insert(id, port_forward.clone());
    }
    {
        let mut processes = pf_state.processes.write().await;
        processes.insert(id, child);
    }

    info!(
        "Port forward created: {} {} -> 127.0.0.1:{}",
        resource, request.remote_port, request.local_port
    );
    (StatusCode::OK, Json(port_forward)).into_response()
}

#[derive(serde::Deserialize)]
pub struct IdPath {
    pub id: u64,
}

pub async fn stop_port_forward(
    State(state): State<AppState>,
    Path(IdPath { id }): Path<IdPath>,
) -> impl IntoResponse {
    let pf_state = match state.port_forward_state.as_ref() {
        Some(s) => s,
        None => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({"error": "Port forward state not initialized"})),
            )
                .into_response()
        }
    };

    {
        let mut processes = pf_state.processes.write().await;
        if let Some(mut child) = processes.remove(&id) {
            let _ = child.kill().await;
        }
    }
    {
        let mut forwards = pf_state.forwards.write().await;
        if let Some(forward) = forwards.get_mut(&id) {
            forward.status = "stopped".to_string();
        }
    }

    (StatusCode::OK, Json(serde_json::json!({"success": true}))).into_response()
}

pub async fn delete_port_forward(
    State(state): State<AppState>,
    Path(IdPath { id }): Path<IdPath>,
) -> impl IntoResponse {
    let pf_state = match state.port_forward_state.as_ref() {
        Some(s) => s,
        None => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({"error": "Port forward state not initialized"})),
            )
                .into_response()
        }
    };

    {
        let mut processes = pf_state.processes.write().await;
        if let Some(mut child) = processes.remove(&id) {
            let _ = child.kill().await;
        }
    }
    {
        let mut forwards = pf_state.forwards.write().await;
        forwards.remove(&id);
    }

    (StatusCode::OK, Json(serde_json::json!({"success": true}))).into_response()
}
