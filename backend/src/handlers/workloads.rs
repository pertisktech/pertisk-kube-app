use axum::{
    extract::{Path, State},
    http::{header, StatusCode},
    response::IntoResponse,
    Json,
};
use chrono::Utc;
use cron::Schedule;
use kube::{api::{DeleteParams, ListParams, Patch, PatchParams}, Api};
use std::env;
use std::str::FromStr;
use tracing::{error, info};

use crate::models::*;
use crate::utils::*;
use crate::AppState;

pub async fn list_pods(State(state): State<AppState>) -> impl IntoResponse {
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

pub async fn list_nodes(State(state): State<AppState>) -> impl IntoResponse {
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

                    let unschedulable = node
                        .spec
                        .as_ref()
                        .and_then(|spec| spec.unschedulable)
                        .unwrap_or(false);

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
                        unschedulable,
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

pub async fn list_events(State(state): State<AppState>) -> impl IntoResponse {
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

pub async fn list_deployments(State(state): State<AppState>) -> impl IntoResponse {
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

pub async fn scale_deployment(
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

pub async fn restart_deployment(
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

pub async fn get_pod_yaml(
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

pub async fn get_pod_logs(
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

pub async fn update_pod_yaml(
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

pub async fn get_deployment_yaml(
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

pub async fn update_deployment_yaml(
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

pub async fn get_statefulset_yaml(
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

pub async fn update_statefulset_yaml(
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

pub async fn get_daemonset_yaml(
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

pub async fn update_daemonset_yaml(
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

pub async fn get_job_yaml(
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

pub async fn update_job_yaml(
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

pub async fn get_cronjob_yaml(
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

pub async fn update_cronjob_yaml(
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

pub async fn list_statefulsets(State(state): State<AppState>) -> impl IntoResponse {
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

pub async fn list_daemonsets(State(state): State<AppState>) -> impl IntoResponse {
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

pub async fn list_replicasets(State(state): State<AppState>) -> impl IntoResponse {
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

pub async fn get_replicaset_yaml(
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

pub async fn update_replicaset_yaml(
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

pub async fn list_jobs(State(state): State<AppState>) -> impl IntoResponse {
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

pub async fn list_cronjobs(State(state): State<AppState>) -> impl IntoResponse {
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

pub async fn get_dashboard_summary(State(state): State<AppState>) -> impl IntoResponse {
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

pub async fn delete_pod(
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

pub async fn delete_deployment(
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

pub async fn delete_statefulset(
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

pub async fn delete_daemonset(
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

pub async fn delete_replicaset(
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

pub async fn delete_job(
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

pub async fn delete_cronjob(
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

pub async fn get_node_yaml(
    Path(name): Path<String>,
    State(state): State<AppState>,
) -> impl IntoResponse {
    use k8s_openapi::api::core::v1::Node;
    let api: Api<Node> = Api::all(state.client);
    match api.get(&name).await {
        Ok(node) => match serde_yaml::to_string(&node) {
            Ok(yaml) => (
                StatusCode::OK,
                [(header::CONTENT_TYPE, "application/yaml; charset=utf-8")],
                yaml,
            )
                .into_response(),
            Err(err) => {
                error!("Failed to serialize node to YAML {}: {:?}", name, err);
                StatusCode::INTERNAL_SERVER_ERROR.into_response()
            }
        },
        Err(err) => {
            error!("Error getting node YAML {}: {:?}", name, err);
            StatusCode::NOT_FOUND.into_response()
        }
    }
}

pub async fn update_node_yaml(
    Path(name): Path<String>,
    State(state): State<AppState>,
    body: String,
) -> impl IntoResponse {
    use k8s_openapi::api::core::v1::Node;
    let api: Api<Node> = Api::all(state.client);
    let parsed: serde_json::Value = match serde_yaml::from_str(&body) {
        Ok(value) => value,
        Err(err) => {
            return (
                StatusCode::BAD_REQUEST,
                format!("Invalid YAML: {}", err),
            )
                .into_response();
        }
    };
    match api
        .patch(
            &name,
            &PatchParams::apply("pertisk-kube").force(),
            &Patch::Apply(parsed),
        )
        .await
    {
        Ok(_) => {
            info!("Updated node YAML {}", name);
            (StatusCode::OK, Json(serde_json::json!({ "success": true }))).into_response()
        }
        Err(err) => {
            error!("Error updating node YAML {}: {:?}", name, err);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("Failed to apply YAML: {}", err),
            )
                .into_response()
        }
    }
}

pub async fn delete_node(
    Path(name): Path<String>,
    State(state): State<AppState>,
) -> impl IntoResponse {
    use k8s_openapi::api::core::v1::Node;
    let api: Api<Node> = Api::all(state.client);
    match api.delete(&name, &DeleteParams::default()).await {
        Ok(_) => {
            info!("Deleted node {}", name);
            (StatusCode::OK, Json(serde_json::json!({ "success": true }))).into_response()
        }
        Err(err) => {
            error!("Error deleting node {}: {:?}", name, err);
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}

pub async fn cordon_node(
    Path(name): Path<String>,
    State(state): State<AppState>,
) -> impl IntoResponse {
    use k8s_openapi::api::core::v1::Node;
    let api: Api<Node> = Api::all(state.client);
    let patch = serde_json::json!({ "spec": { "unschedulable": true } });
    match api
        .patch(&name, &PatchParams::default(), &Patch::Merge(patch))
        .await
    {
        Ok(_) => {
            info!("Cordoned node {}", name);
            (StatusCode::OK, Json(serde_json::json!({ "success": true }))).into_response()
        }
        Err(err) => {
            error!("Error cordoning node {}: {:?}", name, err);
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}

pub async fn uncordon_node(
    Path(name): Path<String>,
    State(state): State<AppState>,
) -> impl IntoResponse {
    use k8s_openapi::api::core::v1::Node;
    let api: Api<Node> = Api::all(state.client);
    let patch = serde_json::json!({ "spec": { "unschedulable": false } });
    match api
        .patch(&name, &PatchParams::default(), &Patch::Merge(patch))
        .await
    {
        Ok(_) => {
            info!("Uncordoned node {}", name);
            (StatusCode::OK, Json(serde_json::json!({ "success": true }))).into_response()
        }
        Err(err) => {
            error!("Error uncordoning node {}: {:?}", name, err);
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}

pub async fn drain_node(
    Path(name): Path<String>,
    State(state): State<AppState>,
) -> impl IntoResponse {
    use k8s_openapi::api::core::v1::Node;
    use std::process::Command as SysCommand;

    // First cordon the node via the k8s API
    let api: Api<Node> = Api::all(state.client);
    let patch = serde_json::json!({ "spec": { "unschedulable": true } });
    if let Err(err) = api
        .patch(&name, &PatchParams::default(), &Patch::Merge(patch))
        .await
    {
        error!("Error cordoning node during drain {}: {:?}", name, err);
        return StatusCode::INTERNAL_SERVER_ERROR.into_response();
    }

    // Then drain via kubectl
    let output = SysCommand::new("kubectl")
        .arg("drain")
        .arg(&name)
        .arg("--ignore-daemonsets")
        .arg("--delete-emptydir-data")
        .arg("--force")
        .arg("--timeout=120s")
        .output();

    match output {
        Ok(out) => {
            if out.status.success() {
                info!("Drained node {}", name);
                (StatusCode::OK, Json(serde_json::json!({ "success": true }))).into_response()
            } else {
                let stderr = String::from_utf8_lossy(&out.stderr).to_string();
                error!("kubectl drain failed for {}: {}", name, stderr);
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(serde_json::json!({ "error": stderr })),
                )
                    .into_response()
            }
        }
        Err(err) => {
            error!("Failed to run kubectl drain for {}: {:?}", name, err);
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}

pub async fn apply_yaml(
    State(state): State<AppState>,
    body: String,
) -> impl IntoResponse {
    use kube::api::DynamicObject;
    use kube::discovery::{Discovery, Scope};
    use kube::core::GroupVersionKind;

    // Parse the YAML body into a JSON value to extract GVK and metadata
    let value: serde_json::Value = match serde_yaml::from_str(&body) {
        Ok(v) => v,
        Err(err) => {
            return (
                StatusCode::BAD_REQUEST,
                Json(serde_json::json!({
                    "success": false,
                    "message": format!("Invalid YAML: {}", err)
                })),
            )
                .into_response();
        }
    };

    let api_version = match value["apiVersion"].as_str() {
        Some(v) if !v.is_empty() => v.to_string(),
        _ => {
            return (
                StatusCode::BAD_REQUEST,
                Json(serde_json::json!({"success": false, "message": "Missing apiVersion"})),
            )
                .into_response();
        }
    };

    let kind = match value["kind"].as_str() {
        Some(k) if !k.is_empty() => k.to_string(),
        _ => {
            return (
                StatusCode::BAD_REQUEST,
                Json(serde_json::json!({"success": false, "message": "Missing kind"})),
            )
                .into_response();
        }
    };

    let name = match value["metadata"]["name"].as_str() {
        Some(n) if !n.is_empty() => n.to_string(),
        _ => {
            return (
                StatusCode::BAD_REQUEST,
                Json(serde_json::json!({"success": false, "message": "Missing metadata.name"})),
            )
                .into_response();
        }
    };

    let namespace = value["metadata"]["namespace"]
        .as_str()
        .map(|s| s.to_string());

    // Parse group/version from apiVersion (e.g. "apps/v1" -> group="apps", version="v1")
    let (group, version) = if let Some(slash) = api_version.find('/') {
        (
            api_version[..slash].to_string(),
            api_version[slash + 1..].to_string(),
        )
    } else {
        (String::new(), api_version.clone())
    };

    // Run API discovery to resolve the GroupVersionKind to an ApiResource
    let discovery = match Discovery::new(state.client.clone()).run().await {
        Ok(d) => d,
        Err(err) => {
            error!("API discovery failed: {:?}", err);
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({"success": false, "message": "API discovery failed"})),
            )
                .into_response();
        }
    };

    let gvk = GroupVersionKind {
        group,
        version,
        kind: kind.clone(),
    };

    let (ar, caps) = match discovery.resolve_gvk(&gvk) {
        Some(r) => r,
        None => {
            return (
                StatusCode::BAD_REQUEST,
                Json(serde_json::json!({
                    "success": false,
                    "message": format!("Unknown resource type: {}/{}", api_version, kind)
                })),
            )
                .into_response();
        }
    };

    let dynamic_obj: DynamicObject = match serde_json::from_value(value) {
        Ok(obj) => obj,
        Err(err) => {
            return (
                StatusCode::BAD_REQUEST,
                Json(serde_json::json!({
                    "success": false,
                    "message": format!("Invalid resource structure: {}", err)
                })),
            )
                .into_response();
        }
    };

    let patch_params = PatchParams::apply("pertisk-kube-web").force();

    if caps.scope == Scope::Namespaced {
        let ns = namespace.as_deref().unwrap_or("default");
        let api: Api<DynamicObject> = Api::namespaced_with(state.client.clone(), ns, &ar);
        match api
            .patch(&name, &patch_params, &Patch::Apply(dynamic_obj))
            .await
        {
            Ok(_) => (
                StatusCode::OK,
                Json(serde_json::json!({"success": true, "message": "Resource applied successfully"})),
            )
                .into_response(),
            Err(err) => {
                error!("Error applying resource {}/{}: {:?}", kind, name, err);
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(serde_json::json!({
                        "success": false,
                        "message": format!("Failed to apply resource: {}", err)
                    })),
                )
                    .into_response()
            }
        }
    } else {
        let api: Api<DynamicObject> = Api::all_with(state.client.clone(), &ar);
        match api
            .patch(&name, &patch_params, &Patch::Apply(dynamic_obj))
            .await
        {
            Ok(_) => (
                StatusCode::OK,
                Json(serde_json::json!({"success": true, "message": "Resource applied successfully"})),
            )
                .into_response(),
            Err(err) => {
                error!("Error applying cluster resource {}/{}: {:?}", kind, name, err);
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(serde_json::json!({
                        "success": false,
                        "message": format!("Failed to apply resource: {}", err)
                    })),
                )
                    .into_response()
            }
        }
    }
}
