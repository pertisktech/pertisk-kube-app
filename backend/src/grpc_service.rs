use std::collections::HashMap;
use std::pin::Pin;
use std::sync::Arc;
use tokio::sync::{mpsc, RwLock};
use tokio_stream::{wrappers::ReceiverStream, Stream, StreamExt};
use tonic::{Request, Response, Status, Streaming};
use kube::{Api, runtime::{watcher, WatchStreamExt}, ResourceExt};
use tracing::{error, info, warn};

use crate::proto::kubernetes::{
    kubernetes_watch_server::{KubernetesWatch, KubernetesWatchServer},
    watch_request, watch_response, AckResponse, ErrorResponse, HealthRequest, HealthResponse,
    ListRequest, ListResponse, PongResponse, ResourceType, ResourceUpdate, WatchAction,
    WatchRequest, WatchResponse,
};

type WatcherHandle = tokio::task::JoinHandle<()>;

pub struct KubernetesWatchService {
    kube_client: kube::Client,
    active_connections: Arc<RwLock<HashMap<String, Vec<WatcherHandle>>>>,
}

impl KubernetesWatchService {
    pub fn new(kube_client: kube::Client) -> Self {
        Self {
            kube_client,
            active_connections: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    pub fn into_server(self) -> KubernetesWatchServer<Self> {
        KubernetesWatchServer::new(self)
    }
}

#[tonic::async_trait]
impl KubernetesWatch for KubernetesWatchService {
    type WatchResourcesStream =
        Pin<Box<dyn Stream<Item = Result<WatchResponse, Status>> + Send + 'static>>;

    async fn watch_resources(
        &self,
        request: Request<Streaming<WatchRequest>>,
    ) -> Result<Response<Self::WatchResourcesStream>, Status> {
        let mut in_stream = request.into_inner();
        let (tx, rx) = mpsc::channel(256);
        let kube_client = self.kube_client.clone();
        let connection_id = uuid::Uuid::new_v4().to_string();
        let active_connections = self.active_connections.clone();

        info!("New gRPC connection: {}", connection_id);

        // Store connection
        active_connections
            .write()
            .await
            .insert(connection_id.clone(), Vec::new());

        tokio::spawn(async move {
            let mut watchers: HashMap<i32, WatcherHandle> = HashMap::new();

            while let Some(result) = in_stream.next().await {
                match result {
                    Ok(watch_req) => {
                        if let Some(action) = watch_req.action {
                            match action {
                                watch_request::Action::Subscribe(sub) => {
                                    let resource_type = sub.resource_type;
                                    info!(
                                        "Subscribe request: {:?}, namespace: {:?}",
                                        ResourceType::try_from(resource_type),
                                        sub.namespace
                                    );

                                    // Cancel existing watcher for this resource type
                                    if let Some(handle) = watchers.remove(&resource_type) {
                                        handle.abort();
                                    }

                                    let tx_clone = tx.clone();
                                    let client_clone = kube_client.clone();

                                    // Spawn new watcher
                                    let handle = tokio::spawn(async move {
                                        let result = watch_resource(
                                            client_clone,
                                            resource_type,
                                            sub.namespace,
                                            tx_clone.clone(),
                                        )
                                        .await;
                                        
                                        if let Err(e) = result {
                                            let error_response = {
                                                // Extract strings from error in this block
                                                let error_msg = format!("Watch failed: {}", e);
                                                let error_details = e.to_string();
                                                // e goes out of scope here
                                                WatchResponse {
                                                    message: Some(watch_response::Message::Error(
                                                        ErrorResponse {
                                                            message: error_msg,
                                                            code: 500,
                                                            details: error_details,
                                                        },
                                                    )),
                                                }
                                            };
                                            error!("Watch error sent to client");
                                            let _ = tx_clone.send(Ok(error_response)).await;
                                        }
                                    });

                                    watchers.insert(resource_type, handle);

                                    // Send acknowledgment
                                    let _ = tx
                                        .send(Ok(WatchResponse {
                                            message: Some(watch_response::Message::Ack(AckResponse {
                                                resource_type,
                                                subscribed: true,
                                                message: "Subscribed successfully".to_string(),
                                            })),
                                        }))
                                        .await;
                                }
                                watch_request::Action::Unsubscribe(unsub) => {
                                    info!("Unsubscribe request: {:?}", unsub.resource_type);

                                    if let Some(handle) = watchers.remove(&unsub.resource_type) {
                                        handle.abort();
                                    }

                                    let _ = tx
                                        .send(Ok(WatchResponse {
                                            message: Some(watch_response::Message::Ack(AckResponse {
                                                resource_type: unsub.resource_type,
                                                subscribed: false,
                                                message: "Unsubscribed successfully".to_string(),
                                            })),
                                        }))
                                        .await;
                                }
                                watch_request::Action::Ping(ping) => {
                                    let _ = tx
                                        .send(Ok(WatchResponse {
                                            message: Some(watch_response::Message::Pong(
                                                PongResponse {
                                                    timestamp: ping.timestamp,
                                                },
                                            )),
                                        }))
                                        .await;
                                }
                            }
                        }
                    }
                    Err(e) => {
                        warn!("Stream error: {}", e);
                        break;
                    }
                }
            }

            // Cleanup
            info!("Connection closing: {}", connection_id);
            for (_, handle) in watchers {
                handle.abort();
            }
            active_connections.write().await.remove(&connection_id);
        });

        let out_stream = ReceiverStream::new(rx);
        Ok(Response::new(Box::pin(out_stream)))
    }

    async fn list_resources(
        &self,
        request: Request<ListRequest>,
    ) -> Result<Response<ListResponse>, Status> {
        let req = request.into_inner();
        let resource_type = ResourceType::try_from(req.resource_type)
            .map_err(|_| Status::invalid_argument("Invalid resource type"))?;

        info!("List request: {:?}", resource_type);

        match resource_type {
            ResourceType::Pods => list_pods(&self.kube_client, req.namespace).await,
            _ => Err(Status::unimplemented("Resource type not yet supported")),
        }
    }

    async fn health(
        &self,
        _request: Request<HealthRequest>,
    ) -> Result<Response<HealthResponse>, Status> {
        // Check K8s API connectivity
        match self.kube_client.apiserver_version().await {
            Ok(_) => Ok(Response::new(HealthResponse {
                healthy: true,
                status: "OK".to_string(),
            })),
            Err(e) => Ok(Response::new(HealthResponse {
                healthy: false,
                status: format!("K8s API error: {}", e),
            })),
        }
    }
}

async fn watch_resource(
    client: kube::Client,
    resource_type: i32,
    namespace: Option<String>,
    tx: mpsc::Sender<Result<WatchResponse, Status>>,
) -> anyhow::Result<()> {
    match ResourceType::try_from(resource_type) {
        Ok(ResourceType::Pods) => watch_pods(client, namespace, tx).await,
        _ => {
            warn!("Unsupported resource type: {}", resource_type);
            Ok(())
        }
    }
}

async fn watch_pods(
    client: kube::Client,
    namespace: Option<String>,
    tx: mpsc::Sender<Result<WatchResponse, Status>>,
) -> anyhow::Result<()> {
    use k8s_openapi::api::core::v1::Pod;

    let api: Api<Pod> = if let Some(ns) = namespace {
        Api::namespaced(client, &ns)
    } else {
        Api::all(client)
    };

    let stream = watcher(api, Default::default()).applied_objects();
    tokio::pin!(stream);

    while let Some(result) = stream.next().await {
        match result {
            Ok(pod) => {
                let data = serde_json::to_vec(&pod)?;
                let resource_version = pod.resource_version().unwrap_or_default();

                let response = WatchResponse {
                    message: Some(watch_response::Message::ResourceUpdate(ResourceUpdate {
                        resource_type: ResourceType::Pods as i32,
                        action: WatchAction::Modified as i32,
                        data,
                        resource_version,
                        timestamp: chrono::Utc::now().timestamp(),
                    })),
                };

                if tx.send(Ok(response)).await.is_err() {
                    break; // Client disconnected
                }
            }
            Err(e) => {
                error!("Pod watch error: {}", e);
                break;
            }
        }
    }

    Ok(())
}

async fn list_pods(
    client: &kube::Client,
    namespace: Option<String>,
) -> Result<Response<ListResponse>, Status> {
    use k8s_openapi::api::core::v1::Pod;

    let api: Api<Pod> = if let Some(ns) = namespace {
        Api::namespaced(client.clone(), &ns)
    } else {
        Api::all(client.clone())
    };

    let pods = api
        .list(&Default::default())
        .await
        .map_err(|e| Status::internal(format!("Failed to list pods: {}", e)))?;

    let items: Vec<Vec<u8>> = pods
        .items
        .iter()
        .filter_map(|pod| serde_json::to_vec(pod).ok())
        .collect();

    let count = items.len() as i32;

    Ok(Response::new(ListResponse {
        items,
        resource_version: pods.metadata.resource_version.unwrap_or_default(),
        count,
    }))
}
