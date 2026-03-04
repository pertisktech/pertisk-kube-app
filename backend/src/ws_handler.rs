use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        State,
    },
    response::Response,
};
use futures_util::{sink::SinkExt, stream::StreamExt};
use kube::{Api, runtime::watcher};
use serde::{Deserialize, Serialize};
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

pub async fn ws_handler(
    ws: WebSocketUpgrade,
    State(state): State<AppState>,
) -> Response {
    info!("New WebSocket connection request");
    ws.on_upgrade(|socket| handle_socket(socket, state))
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

