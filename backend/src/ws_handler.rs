use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        Query,
        State,
    },
    response::Response,
};
use futures_util::{sink::SinkExt, stream::StreamExt};
use kube::{Api, runtime::watcher};
use serde::{Deserialize, Serialize};
use std::process::Stdio;
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    process::Command,
};
use tracing::{error, info, warn};

use crate::AppState;

#[derive(Debug, Clone, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
enum ClientMessage {
    Subscribe { resource: String },
    Unsubscribe { resource: String },
    Ping,
}

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
enum ServerMessage {
    ResourceUpdate {
        resource: String,
        action: String,
        data: serde_json::Value,
    },
    Error {
        message: String,
    },
    Subscribed {
        resource: String,
    },
    Unsubscribed {
        resource: String,
    },
    Pong,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ExecQuery {
    pub namespace: String,
    pub pod: String,
    pub container: Option<String>,
}

pub async fn ws_handler(
    ws: WebSocketUpgrade,
    State(state): State<AppState>,
) -> Response {
    info!("New WebSocket connection request");
    ws.on_upgrade(|socket| handle_socket(socket, state))
}

pub async fn exec_ws_handler(
    ws: WebSocketUpgrade,
    Query(query): Query<ExecQuery>,
) -> Response {
    info!(
        "New exec websocket request: namespace={}, pod={}, container={:?}",
        query.namespace, query.pod, query.container
    );

    ws.on_upgrade(move |socket| handle_exec_socket(socket, query))
}

async fn handle_exec_socket(socket: WebSocket, query: ExecQuery) {
    let (mut ws_sender, mut ws_receiver) = socket.split();
    let (tx, mut rx) = tokio::sync::mpsc::channel::<String>(256);

    let ws_send_task = tokio::spawn(async move {
        while let Some(msg) = rx.recv().await {
            if ws_sender.send(Message::Text(msg)).await.is_err() {
                break;
            }
        }
    });

    // Build kubectl exec command
    info!("Starting exec shell: namespace={}, pod={}, container={:?}", query.namespace, query.pod, query.container);
    let mut cmd = Command::new("kubectl");
    cmd.arg("exec")
        .arg("-i")
        .arg("-n")
        .arg(&query.namespace)
        .arg(&query.pod);

    // Add container argument if specified
    if let Some(container) = &query.container {
        cmd.arg("-c").arg(container);
    }

    // Execute shell in non-interactive mode
    // This avoids prompt/output buffering issues over pipes
    cmd.arg("--")
        .arg("sh")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    let mut child = match cmd.spawn() {
        Ok(child) => {
            info!("kubectl exec process spawned successfully");
            child
        }
        Err(err) => {
            error!("Failed to spawn kubectl exec: {}", err);
            let _ = tx
                .send(format!(
                    "\r\n\u{1b}[1;31mFailed to start shell: {}\u{1b}[0m\r\n",
                    err
                ))
                .await;
            ws_send_task.abort();
            return;
        }
    };

    let mut child_stdin = match child.stdin.take() {
        Some(stdin) => stdin,
        None => {
            let _ = tx
                .send("\r\n\u{1b}[1;31mFailed to open stdin for shell\u{1b}[0m\r\n".to_string())
                .await;
            let _ = child.kill().await;
            ws_send_task.abort();
            return;
        }
    };

    let mut child_stdout = match child.stdout.take() {
        Some(stdout) => stdout,
        None => {
            let _ = tx
                .send("\r\n\u{1b}[1;31mFailed to open stdout for shell\u{1b}[0m\r\n".to_string())
                .await;
            let _ = child.kill().await;
            ws_send_task.abort();
            return;
        }
    };

    let mut child_stderr = match child.stderr.take() {
        Some(stderr) => stderr,
        None => {
            let _ = tx
                .send("\r\n\u{1b}[1;31mFailed to open stderr for shell\u{1b}[0m\r\n".to_string())
                .await;
            let _ = child.kill().await;
            ws_send_task.abort();
            return;
        }
    };

    let _ = tx
        .send(format!(
            "\u{1b}[1;32mConnected shell: {}/{}\u{1b}[0m\r\n",
            query.namespace, query.pod
        ))
        .await;

    // In non-interactive mode, send initial marker to prime the connection
    if let Err(err) = child_stdin.write_all(b":\n").await {
        error!("Failed to prime shell stdin: {}", err);
        let _ = child.kill().await;
        ws_send_task.abort();
        return;
    }
    let _ = child_stdin.flush().await;

    let tx_stdout = tx.clone();
    let stdout_task = tokio::spawn(async move {
        let mut buffer = [0_u8; 4096];
        loop {
            match child_stdout.read(&mut buffer).await {
                Ok(0) => break,
                Ok(n) => {
                    let output = String::from_utf8_lossy(&buffer[..n]).to_string();
                    if tx_stdout.send(output).await.is_err() {
                        break;
                    }
                }
                Err(err) => {
                    let _ = tx_stdout
                        .send(format!("\r\n\u{1b}[1;31mstdout error: {}\u{1b}[0m\r\n", err))
                        .await;
                    break;
                }
            }
        }
    });

    let tx_stderr = tx.clone();
    let stderr_task = tokio::spawn(async move {
        let mut buffer = [0_u8; 4096];
        loop {
            match child_stderr.read(&mut buffer).await {
                Ok(0) => break,
                Ok(n) => {
                    let output = String::from_utf8_lossy(&buffer[..n]).to_string();
                    if tx_stderr.send(output).await.is_err() {
                        break;
                    }
                }
                Err(err) => {
                    let _ = tx_stderr
                        .send(format!("\r\n\u{1b}[1;31mstderr error: {}\u{1b}[0m\r\n", err))
                        .await;
                    break;
                }
            }
        }
    });

    while let Some(message) = ws_receiver.next().await {
        match message {
            Ok(Message::Text(text)) => {
                if let Ok(json) = serde_json::from_str::<serde_json::Value>(&text) {
                    if json
                        .get("type")
                        .and_then(|value| value.as_str())
                        .is_some_and(|value| value == "resize")
                    {
                        continue;
                    }
                }

                // xterm sends Enter as "\r"; shell over pipes expects "\n".
                let normalized = text.replace('\r', "\n");

                if child_stdin.write_all(normalized.as_bytes()).await.is_err() {
                    error!("Failed to write to shell stdin");
                    break;
                }

                if let Err(e) = child_stdin.flush().await {
                    error!("Failed to flush stdin: {}", e);
                    break;
                }
            }
            Ok(Message::Binary(data)) => {
                if child_stdin.write_all(&data).await.is_err() {
                    break;
                }
            }
            Ok(Message::Close(_)) => break,
            Ok(Message::Ping(_)) => {}
            Ok(Message::Pong(_)) => {}
            Err(err) => {
                warn!("Exec websocket receive error: {}", err);
                break;
            }
        }
    }

    let _ = child.kill().await;
    stdout_task.abort();
    stderr_task.abort();
    ws_send_task.abort();

    info!(
        "Exec websocket closed: namespace={}, pod={}, container={:?}",
        query.namespace, query.pod, query.container
    );
}

async fn handle_socket(socket: WebSocket, state: AppState) {
    let (mut sender, mut receiver) = socket.split();
    let connection_id = uuid::Uuid::new_v4().to_string();
    
    info!("WebSocket connection established: {}", connection_id);

    let (tx, mut rx) = tokio::sync::mpsc::channel::<ServerMessage>(100);

    // Spawn task to send messages from channel to WebSocket
    let send_task = tokio::spawn(async move {
        while let Some(msg) = rx.recv().await {
            if let Ok(json) = serde_json::to_string(&msg) {
                if sender.send(Message::Text(json)).await.is_err() {
                    break;
                }
            }
        }
    });

    // Handle incoming messages from client
    while let Some(msg) = receiver.next().await {
        match msg {
            Ok(Message::Text(text)) => {
                if let Ok(client_msg) = serde_json::from_str::<ClientMessage>(&text) {
                    match client_msg {
                        ClientMessage::Subscribe { resource } => {
                            info!("Client subscribing to {}", resource);
                            
                            // Send confirmation
                            let response = ServerMessage::Subscribed { resource: resource.clone() };
                            let _ = tx.send(response).await;

                            // Start watching resource based on type
                            let state_clone = state.clone();
                            let tx_clone = tx.clone();
                            let resource_clone = resource.clone();
                            
                            tokio::spawn(async move {
                                match resource_clone.as_str() {
                                    "pods" => watch_pods(state_clone, tx_clone).await,
                                    "namespaces" => watch_namespaces(state_clone, tx_clone).await,
                                    "deployments" => watch_deployments(state_clone, tx_clone).await,
                                    "statefulsets" => watch_statefulsets(state_clone, tx_clone).await,
                                    "daemonsets" => watch_daemonsets(state_clone, tx_clone).await,
                                    "replicasets" => watch_replicasets(state_clone, tx_clone).await,
                                    "jobs" => watch_jobs(state_clone, tx_clone).await,
                                    "cronjobs" => watch_cronjobs(state_clone, tx_clone).await,
                                    "events" => watch_events(state_clone, tx_clone).await,
                                    _ => {
                                        error!("Unknown resource type: {}", resource_clone);
                                        let msg = ServerMessage::Error {
                                            message: format!("Unknown resource type: {}", resource_clone),
                                        };
                                        let _ = tx_clone.send(msg).await;
                                    }
                                }
                            });
                        }
                        ClientMessage::Unsubscribe { resource } => {
                            info!("Client unsubscribing from {}", resource);
                            let response = ServerMessage::Unsubscribed { resource };
                            let _ = tx.send(response).await;
                        }
                        ClientMessage::Ping => {
                            let response = ServerMessage::Pong;
                            let _ = tx.send(response).await;
                        }
                    }
                }
            }
            Ok(Message::Close(_)) => {
                info!("WebSocket connection closed: {}", connection_id);
                break;
            }
            Ok(Message::Ping(_)) => {
                // Echo pong - this is handled automatically by axum
                let _ = tx.send(ServerMessage::Pong).await;
            }
            Err(e) => {
                warn!("WebSocket error: {}", e);
                break;
            }
            _ => {}
        }
    }

    send_task.abort();
    info!("WebSocket handler completed: {}", connection_id);
}

async fn watch_pods(
    state: AppState,
    tx: tokio::sync::mpsc::Sender<ServerMessage>,
) {
    use k8s_openapi::api::core::v1::Pod;
    use kube::api::ListParams;

    let api: Api<Pod> = Api::all(state.client.clone());
    
    // First, send all existing pods (excluding those marked for deletion)
    info!("Fetching initial pod list...");
    match api.list(&ListParams::default()).await {
        Ok(pod_list) => {
            let total_pods = pod_list.items.len();
            let active_pods: Vec<_> = pod_list.items.into_iter()
                .filter(|pod| pod.metadata.deletion_timestamp.is_none())
                .collect();
            
            info!("Sending {} active pods (excluded {} terminating pods)", 
                  active_pods.len(), 
                  total_pods - active_pods.len());
            
            for pod in active_pods {
                let pod_data = serde_json::to_value(&pod).unwrap_or_default();
                
                let msg = ServerMessage::ResourceUpdate {
                    resource: "pods".to_string(),
                    action: "ADDED".to_string(),
                    data: pod_data,
                };

                if tx.send(msg).await.is_err() {
                    return; // Client disconnected
                }
            }
        }
        Err(e) => {
            error!("Failed to fetch initial pod list: {}", e);
            let msg = ServerMessage::Error {
                message: format!("Failed to fetch initial pods: {}", e),
            };
            let _ = tx.send(msg).await;
            return;
        }
    }

    // Now watch for changes
    info!("Starting pod watch stream...");
    let stream = watcher(api, Default::default());
    tokio::pin!(stream);

    while let Some(result) = stream.next().await {
        match result {
            Ok(event) => {
                use kube::runtime::watcher::Event;
                
                let (action, pod_opt) = match event {
                    Event::Applied(pod) => {
                        // Send terminating pods as MODIFIED so they show "Terminating" status
                        // They'll be removed by the DELETED event
                        ("MODIFIED", Some(pod))
                    },
                    Event::Deleted(pod) => ("DELETED", Some(pod)),
                    Event::Restarted(pods) => {
                        // Watcher restarted, send all active pods (skip terminating ones)
                        for pod in pods {
                            // Skip pods marked for deletion
                            if pod.metadata.deletion_timestamp.is_some() {
                                continue;
                            }
                            let pod_data = serde_json::to_value(&pod).unwrap_or_default();
                            let msg = ServerMessage::ResourceUpdate {
                                resource: "pods".to_string(),
                                action: "MODIFIED".to_string(),
                                data: pod_data,
                            };
                            if tx.send(msg).await.is_err() {
                                return;
                            }
                        }
                        continue;
                    }
                };

                if let Some(pod) = pod_opt {
                    let pod_data = serde_json::to_value(&pod).unwrap_or_default();
                    
                    // Log deletions for debugging
                    if action == "DELETED" {
                        if let Some(metadata) = pod_data.get("metadata") {
                            let name = metadata.get("name").and_then(|v| v.as_str()).unwrap_or("unknown");
                            let namespace = metadata.get("namespace").and_then(|v| v.as_str()).unwrap_or("unknown");
                            info!("Sending DELETED event for pod: {}/{}", namespace, name);
                        }
                    }
                    
                    let msg = ServerMessage::ResourceUpdate {
                        resource: "pods".to_string(),
                        action: action.to_string(),
                        data: pod_data,
                    };

                    if tx.send(msg).await.is_err() {
                        break; // Client disconnected
                    }
                }
            }
            Err(e) => {
                error!("Watch error: {}", e);
                let msg = ServerMessage::Error {
                    message: format!("Watch error: {}", e),
                };
                let _ = tx.send(msg).await;
                break;
            }
        }
    }
}

// Generic macro to create watch functions for any K8s resource type
macro_rules! create_watch_fn {
    ($fn_name:ident, $resource_type:ty, $resource_name:expr) => {
        async fn $fn_name(
            state: AppState,
            tx: tokio::sync::mpsc::Sender<ServerMessage>,
        ) {
            use kube::api::ListParams;

            let api: Api<$resource_type> = Api::all(state.client.clone());
            
            // First, send all existing resources
            info!("Fetching initial {} list...", $resource_name);
            match api.list(&ListParams::default()).await {
                Ok(list) => {
                    let total_items = list.items.len();
                    
                    info!("Sending {} {}", total_items, $resource_name);
                    
                    for item in list.items {
                        let item_data = serde_json::to_value(&item).unwrap_or_default();
                        
                        let msg = ServerMessage::ResourceUpdate {
                            resource: $resource_name.to_string(),
                            action: "ADDED".to_string(),
                            data: item_data,
                        };

                        if tx.send(msg).await.is_err() {
                            return; // Client disconnected
                        }
                    }
                }
                Err(e) => {
                    error!("Failed to fetch initial {} list: {}", $resource_name, e);
                    let msg = ServerMessage::Error {
                        message: format!("Failed to fetch initial {}: {}", $resource_name, e),
                    };
                    let _ = tx.send(msg).await;
                    return;
                }
            }

            // Now watch for changes
            info!("Starting {} watch stream...", $resource_name);
            let stream = watcher(api, Default::default());
            tokio::pin!(stream);

            while let Some(result) = stream.next().await {
                match result {
                    Ok(event) => {
                        use kube::runtime::watcher::Event;
                        
                        let (action, item_opt) = match event {
                            Event::Applied(item) => ("MODIFIED", Some(item)),
                            Event::Deleted(item) => ("DELETED", Some(item)),
                            Event::Restarted(items) => {
                                for item in items {
                                    let item_data = serde_json::to_value(&item).unwrap_or_default();
                                    let msg = ServerMessage::ResourceUpdate {
                                        resource: $resource_name.to_string(),
                                        action: "MODIFIED".to_string(),
                                        data: item_data,
                                    };
                                    if tx.send(msg).await.is_err() {
                                        return;
                                    }
                                }
                                continue;
                            }
                        };

                        if let Some(item) = item_opt {
                            let item_data = serde_json::to_value(&item).unwrap_or_default();
                            
                            let msg = ServerMessage::ResourceUpdate {
                                resource: $resource_name.to_string(),
                                action: action.to_string(),
                                data: item_data,
                            };

                            if tx.send(msg).await.is_err() {
                                break; // Client disconnected
                            }
                        }
                    }
                    Err(e) => {
                        error!("Watch error for {}: {}", $resource_name, e);
                        let msg = ServerMessage::Error {
                            message: format!("Watch error: {}", e),
                        };
                        let _ = tx.send(msg).await;
                        break;
                    }
                }
            }
        }
    };
}

// Create watch functions for each resource type
create_watch_fn!(watch_deployments, k8s_openapi::api::apps::v1::Deployment, "deployments");
create_watch_fn!(watch_statefulsets, k8s_openapi::api::apps::v1::StatefulSet, "statefulsets");
create_watch_fn!(watch_daemonsets, k8s_openapi::api::apps::v1::DaemonSet, "daemonsets");
create_watch_fn!(watch_replicasets, k8s_openapi::api::apps::v1::ReplicaSet, "replicasets");
create_watch_fn!(watch_jobs, k8s_openapi::api::batch::v1::Job, "jobs");
create_watch_fn!(watch_cronjobs, k8s_openapi::api::batch::v1::CronJob, "cronjobs");
create_watch_fn!(watch_events, k8s_openapi::api::core::v1::Event, "events");
create_watch_fn!(watch_namespaces, k8s_openapi::api::core::v1::Namespace, "namespaces");

