//! Port-forward handlers: list, create, stop, delete (kubectl port-forward subprocesses).

use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use tokio::fs;
use tokio::io::AsyncReadExt;
use tokio::net::{TcpListener, TcpStream};
use tokio::process::Child;
use tokio::sync::RwLock;
use tokio::time::{sleep, Duration};
use tracing::{error, info, warn};

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
    pub storage_path: PathBuf,
    pub cluster_key: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct PersistedPortForwardState {
    pub cluster_key: String,
    pub next_id: u64,
    pub items: Vec<PortForward>,
}

impl PortForwardState {
    pub fn new(storage_path: PathBuf, cluster_key: String) -> Self {
        Self {
            forwards: RwLock::new(HashMap::new()),
            processes: RwLock::new(HashMap::new()),
            storage_path,
            cluster_key,
        }
    }
}

fn build_port_forward_command(request: &CreatePortForwardRequest) -> tokio::process::Command {
    let resource = format!("{}/{}", request.resource_type, request.resource_name);
    let port_mapping = format!("{}:{}", request.local_port, request.remote_port);

    let mut cmd = tokio::process::Command::new("kubectl");
    cmd.arg("-n")
        .arg(&request.namespace)
        .arg("--address")
        .arg("127.0.0.1")
        .arg("port-forward")
        .arg(&resource)
        .arg(&port_mapping);
    cmd.stdout(std::process::Stdio::null());
    cmd.stderr(std::process::Stdio::piped());
    cmd
}

async fn collect_child_stderr(child: &mut Child) -> String {
    let mut stderr_text = String::new();
    if let Some(mut stderr) = child.stderr.take() {
        let mut buf = Vec::new();
        let _ = stderr.read_to_end(&mut buf).await;
        stderr_text = String::from_utf8_lossy(&buf).trim().to_string();
    }
    stderr_text
}

async fn ensure_local_port_available(local_port: u16) -> Result<(), String> {
    match TcpListener::bind(("127.0.0.1", local_port)).await {
        Ok(listener) => {
            drop(listener);
            Ok(())
        }
        Err(e) => Err(format!(
            "Local port 127.0.0.1:{} is not available: {}",
            local_port, e
        )),
    }
}

async fn spawn_validated_port_forward(request: &CreatePortForwardRequest) -> Result<Child, String> {
    ensure_local_port_available(request.local_port).await?;

    let mut cmd = build_port_forward_command(request);

    let mut child = cmd
        .spawn()
        .map_err(|e| format!("Failed to start port-forward process: {}", e))?;

    // Give kubectl a short window to fail fast (invalid resource, auth, local port in use, etc.).
    for _ in 0..10u8 {
        sleep(Duration::from_millis(150)).await;
        match child.try_wait() {
            Ok(Some(status)) => {
                let stderr_text = collect_child_stderr(&mut child).await;
                let msg = if stderr_text.is_empty() {
                    format!("port-forward exited immediately with status {}", status)
                } else {
                    format!("port-forward failed: {}", stderr_text)
                };
                return Err(msg);
            }
            Ok(None) => {
                // Still running.
            }
            Err(e) => {
                return Err(format!("Failed to check port-forward process status: {}", e));
            }
        }
    }

    // Ensure local listener is actually available before reporting success.
    for _ in 0..20u8 {
        if TcpStream::connect(("127.0.0.1", request.local_port)).await.is_ok() {
            return Ok(child);
        }

        match child.try_wait() {
            Ok(Some(status)) => {
                let stderr_text = collect_child_stderr(&mut child).await;
                let msg = if stderr_text.is_empty() {
                    format!("port-forward stopped before opening local port (status {})", status)
                } else {
                    format!("port-forward stopped: {}", stderr_text)
                };
                return Err(msg);
            }
            Ok(None) => sleep(Duration::from_millis(150)).await,
            Err(e) => return Err(format!("Failed to check port-forward process status: {}", e)),
        }
    }

    let _ = child.kill().await;
    Err(format!(
        "Timed out waiting for local listener on 127.0.0.1:{}",
        request.local_port
    ))
}

async fn save_port_forward_state(pf_state: &PortForwardState) {
    let forwards = pf_state.forwards.read().await;
    let running_items: Vec<PortForward> = forwards
        .values()
        .filter(|pf| pf.status == "running")
        .cloned()
        .collect();
    drop(forwards);

    let payload = PersistedPortForwardState {
        cluster_key: pf_state.cluster_key.clone(),
        next_id: PORT_FORWARD_ID.load(Ordering::SeqCst),
        items: running_items,
    };

    if let Some(parent) = pf_state.storage_path.parent() {
        if let Err(e) = fs::create_dir_all(parent).await {
            warn!("Failed to create port-forward storage dir {:?}: {}", parent, e);
            return;
        }
    }

    let json = match serde_json::to_string_pretty(&payload) {
        Ok(s) => s,
        Err(e) => {
            warn!("Failed to serialize port-forward state: {}", e);
            return;
        }
    };

    if let Err(e) = fs::write(&pf_state.storage_path, json).await {
        warn!(
            "Failed to persist port-forward state at {:?}: {}",
            pf_state.storage_path, e
        );
    }
}

async fn reconcile_port_forward_processes(pf_state: &PortForwardState) {
    let mut exited_ids: Vec<u64> = Vec::new();

    {
        let mut processes = pf_state.processes.write().await;
        let ids: Vec<u64> = processes.keys().copied().collect();
        for id in ids {
            if let Some(child) = processes.get_mut(&id) {
                match child.try_wait() {
                    Ok(Some(status)) => {
                        info!("Port-forward process {} exited with status {}", id, status);
                        exited_ids.push(id);
                    }
                    Ok(None) => {
                        // Still running.
                    }
                    Err(e) => {
                        warn!("Failed to check port-forward process {}: {}", id, e);
                    }
                }
            }
        }

        for id in &exited_ids {
            processes.remove(id);
        }
    }

    if exited_ids.is_empty() {
        return;
    }

    {
        let mut forwards = pf_state.forwards.write().await;
        for id in &exited_ids {
            if let Some(forward) = forwards.get_mut(id) {
                if forward.status == "running" {
                    forward.status = "paused".to_string();
                }
            }
        }
    }

    save_port_forward_state(pf_state).await;
}

pub async fn restore_port_forwards_from_storage(pf_state: &PortForwardState) {
    let raw = match fs::read_to_string(&pf_state.storage_path).await {
        Ok(data) => data,
        Err(_) => return,
    };

    let saved: PersistedPortForwardState = match serde_json::from_str(&raw) {
        Ok(v) => v,
        Err(e) => {
            warn!(
                "Failed to parse persisted port-forward state at {:?}: {}",
                pf_state.storage_path, e
            );
            return;
        }
    };

    if saved.cluster_key != pf_state.cluster_key {
        info!(
            "Skipping port-forward restore because cluster key changed (saved='{}', current='{}')",
            saved.cluster_key,
            pf_state.cluster_key
        );
        return;
    }

    let mut restored_count = 0u64;
    let mut max_id = saved.next_id;

    for item in saved.items {
        let request = CreatePortForwardRequest {
            namespace: item.namespace.clone(),
            resource_type: item.resource_type.clone(),
            resource_name: item.resource_name.clone(),
            local_port: item.local_port,
            remote_port: item.remote_port,
        };

        match spawn_validated_port_forward(&request).await {
            Ok(child) => {
                {
                    let mut forwards = pf_state.forwards.write().await;
                    forwards.insert(item.id, PortForward { status: "running".to_string(), ..item.clone() });
                }
                {
                    let mut processes = pf_state.processes.write().await;
                    processes.insert(item.id, child);
                }
                restored_count += 1;
                if item.id >= max_id {
                    max_id = item.id + 1;
                }
            }
            Err(e) => {
                warn!(
                    "Failed to restore port-forward {}/{} {}:{}->{}: {}",
                    item.resource_type,
                    item.resource_name,
                    item.namespace,
                    item.remote_port,
                    item.local_port,
                    e
                );
            }
        }
    }

    PORT_FORWARD_ID.store(max_id.max(1), Ordering::SeqCst);

    if restored_count > 0 {
        info!("Restored {} persisted port-forward(s)", restored_count);
    }

    save_port_forward_state(pf_state).await;
}

pub fn build_storage_path_from_env() -> PathBuf {
    if let Ok(explicit) = std::env::var("PORT_FORWARD_STORAGE_PATH") {
        let trimmed = explicit.trim();
        if !trimmed.is_empty() {
            return PathBuf::from(trimmed);
        }
    }

    if let Ok(home) = std::env::var("HOME") {
        let mut path = PathBuf::from(home);
        path.push(".pertisk");
        path.push("port-forwards.json");
        return path;
    }

    PathBuf::from("port-forwards.json")
}

pub fn cluster_key_from_env_or_default() -> String {
    if let Ok(context) = std::env::var("KUBE_CONTEXT") {
        let trimmed = context.trim();
        if !trimmed.is_empty() {
            return trimmed.to_string();
        }
    }

    if let Ok(output) = std::process::Command::new("kubectl")
        .arg("config")
        .arg("current-context")
        .output()
    {
        if output.status.success() {
            if let Ok(raw) = String::from_utf8(output.stdout) {
                let context = raw.trim();
                if !context.is_empty() {
                    return context.to_string();
                }
            }
        }
    }

    "default".to_string()
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

    reconcile_port_forward_processes(pf_state).await;

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

    let child = match spawn_validated_port_forward(&request).await {
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

    save_port_forward_state(pf_state).await;

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
            forward.status = "paused".to_string();
        }
    }

    save_port_forward_state(pf_state).await;

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

    save_port_forward_state(pf_state).await;

    (StatusCode::OK, Json(serde_json::json!({"success": true}))).into_response()
}

pub async fn restart_port_forward(
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

    let target = {
        let forwards = pf_state.forwards.read().await;
        forwards.get(&id).cloned()
    };

    let Some(existing) = target else {
        return (
            StatusCode::NOT_FOUND,
            Json(serde_json::json!({"error": "Port forward not found"})),
        )
            .into_response();
    };

    if existing.status == "running" {
        return (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({"error": "Port forward is already running"})),
        )
            .into_response();
    }

    {
        let mut processes = pf_state.processes.write().await;
        if let Some(mut child) = processes.remove(&id) {
            let _ = child.kill().await;
        }
    }

    let request = CreatePortForwardRequest {
        namespace: existing.namespace.clone(),
        resource_type: existing.resource_type.clone(),
        resource_name: existing.resource_name.clone(),
        local_port: existing.local_port,
        remote_port: existing.remote_port,
    };

    let child = match spawn_validated_port_forward(&request).await {
        Ok(c) => c,
        Err(e) => {
            error!("Failed to restart port-forward: {}", e);
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({
                    "error": format!("Failed to restart port-forward: {}", e)
                })),
            )
                .into_response();
        }
    };

    let restarted = PortForward {
        status: "running".to_string(),
        ..existing
    };

    {
        let mut forwards = pf_state.forwards.write().await;
        forwards.insert(id, restarted.clone());
    }
    {
        let mut processes = pf_state.processes.write().await;
        processes.insert(id, child);
    }

    save_port_forward_state(pf_state).await;
    (StatusCode::OK, Json(restarted)).into_response()
}
