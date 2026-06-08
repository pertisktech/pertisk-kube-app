use axum::{
    extract::{Multipart, Path, Query, State},
    http::{header, StatusCode},
    response::IntoResponse,
    Json,
};
use serde::Deserialize;
use chrono::Utc;
use cron::Schedule;
use kube::{
    api::{DeleteParams, ListParams, Patch, PatchParams},
    core::{ApiResource, DynamicObject, GroupVersionKind},
    Api,
};
use std::collections::{HashMap, HashSet};
use std::env;
use std::path::{Component, Path as StdPath, PathBuf};
use std::process::Stdio;
use tokio::io::AsyncWriteExt;
use std::str::FromStr;
use tokio::fs;
use tokio::process::Command;
use tracing::{error, info, warn};

use crate::models::*;
use crate::utils::*;
use crate::AppState;

// 1 month at 15s intervals = 172,800 samples (~8.8 MB)
const WORKLOAD_METRIC_HISTORY_LIMIT: usize = 172_800;

/// Returns the Kubernetes context configured for this backend process, if any.
/// The sidecar passes the user-selected context via the KUBE_CONTEXT env var.
fn active_kube_context() -> Option<String> {
    env::var("KUBE_CONTEXT")
        .ok()
        .filter(|value| !value.trim().is_empty())
}

/// Prepend --context <ctx> to a kubectl Command if KUBE_CONTEXT is set.
fn apply_kube_context(cmd: &mut Command) {
    if let Some(ctx) = active_kube_context() {
        cmd.arg("--context").arg(ctx);
    }
}
const WORKLOAD_METRIC_SAMPLE_INTERVAL_SECS: i64 = 15;
const WORKLOAD_METRIC_DEFAULT_DURATION_SECS: i64 = 3600; // 1 hour

#[derive(Deserialize)]
pub struct MetricSeriesQuery {
    /// Duration window in hours. Defaults to 1h.
    pub duration_hours: Option<f64>,
}

#[derive(Deserialize)]
pub struct RestartAllWorkloadsQuery {
    /// Optional comma-separated namespace filter. When omitted, all namespaces are targeted.
    pub namespaces: Option<String>,
}

#[derive(Default)]
struct WorkloadMetricTotals {
    cpu_millicores: f64,
    memory_bytes: f64,
    network_bytes: f64,
    filesystem_bytes: f64,
    network_available: bool,
    filesystem_available: bool,
}

fn parse_optional_quantity(value: &serde_json::Value) -> Option<f64> {
    value
        .as_str()
        .and_then(parse_memory_bytes)
        .or_else(|| value.as_f64())
        .or_else(|| value.as_u64().map(|v| v as f64))
}

fn map_apply_error(err: &kube::Error) -> (StatusCode, String) {
    if let kube::Error::Api(api_err) = err {
        let status = StatusCode::from_u16(api_err.code).unwrap_or(StatusCode::INTERNAL_SERVER_ERROR);
        return (status, api_err.message.clone());
    }

    (StatusCode::INTERNAL_SERVER_ERROR, err.to_string())
}

async fn collect_workload_metric_totals(state: &AppState) -> WorkloadMetricTotals {
    let pod_metrics_resource =
        ApiResource::from_gvk(&GroupVersionKind::gvk("metrics.k8s.io", "v1beta1", "PodMetrics"));
    let metrics_api: Api<DynamicObject> = Api::all_with(state.kube_client().await, &pod_metrics_resource);

    let metrics_list = match metrics_api.list(&ListParams::default()).await {
        Ok(list) => list,
        Err(_) => return WorkloadMetricTotals::default(),
    };

    let mut totals = WorkloadMetricTotals::default();

    for metric in metrics_list.items {
        let metric_value = match serde_json::to_value(&metric) {
            Ok(value) => value,
            Err(_) => continue,
        };

        let containers = match metric_value.get("containers").and_then(|value| value.as_array()) {
            Some(containers) => containers,
            None => continue,
        };

        for container in containers {
            let usage = match container.get("usage") {
                Some(usage) => usage,
                None => continue,
            };

            if let Some(cpu) = usage
                .get("cpu")
                .and_then(|value| value.as_str())
                .and_then(parse_cpu_millicores)
            {
                totals.cpu_millicores += cpu;
            }

            if let Some(memory) = usage
                .get("memory")
                .and_then(|value| value.as_str())
                .and_then(parse_memory_bytes)
            {
                totals.memory_bytes += memory;
            }

            if let Some(filesystem) = usage
                .get("ephemeral-storage")
                .and_then(|value| value.as_str())
                .and_then(parse_memory_bytes)
            {
                totals.filesystem_bytes += filesystem;
                totals.filesystem_available = true;
            }

            let direct_network = usage
                .get("network-rx")
                .and_then(parse_optional_quantity)
                .unwrap_or(0.0)
                + usage
                    .get("network-tx")
                    .and_then(parse_optional_quantity)
                    .unwrap_or(0.0)
                + usage
                    .get("network_receive_bytes")
                    .and_then(parse_optional_quantity)
                    .unwrap_or(0.0)
                + usage
                    .get("network_transmit_bytes")
                    .and_then(parse_optional_quantity)
                    .unwrap_or(0.0);

            if direct_network > 0.0 {
                totals.network_bytes += direct_network;
                totals.network_available = true;
            }

            if let Some(network) = usage.get("network") {
                let nested = network
                    .get("rxBytes")
                    .and_then(parse_optional_quantity)
                    .unwrap_or(0.0)
                    + network
                        .get("txBytes")
                        .and_then(parse_optional_quantity)
                        .unwrap_or(0.0);

                if nested > 0.0 {
                    totals.network_bytes += nested;
                    totals.network_available = true;
                }
            }
        }
    }

    totals
}

pub async fn get_workload_metric_series(
    State(state): State<AppState>,
    Query(params): Query<MetricSeriesQuery>,
) -> impl IntoResponse {
    let now = Utc::now().timestamp();

    let should_sample = {
        let history = state.workload_metric_history.read().await;
        match history.last() {
            Some(last) => now.saturating_sub(last.timestamp) >= WORKLOAD_METRIC_SAMPLE_INTERVAL_SECS,
            None => true,
        }
    };

    if should_sample {
        let totals = collect_workload_metric_totals(&state).await;
        let snapshot = WorkloadMetricSnapshot {
            timestamp: now,
            cpu: totals.cpu_millicores,
            memory: totals.memory_bytes,
            network: totals.network_bytes,
            filesystem: totals.filesystem_bytes,
            network_available: totals.network_available,
            filesystem_available: totals.filesystem_available,
        };

        let mut history = state.workload_metric_history.write().await;
        history.push(snapshot);
        if history.len() > WORKLOAD_METRIC_HISTORY_LIMIT {
            let overflow = history.len() - WORKLOAD_METRIC_HISTORY_LIMIT;
            history.drain(0..overflow);
        }
    }

    let history = state.workload_metric_history.read().await;

    let duration_secs = params
        .duration_hours
        .map(|h| (h * 3600.0) as i64)
        .unwrap_or(WORKLOAD_METRIC_DEFAULT_DURATION_SECS);
    let cutoff = now.saturating_sub(duration_secs);

    let windowed: Vec<_> = history.iter().filter(|s| s.timestamp >= cutoff).collect();

    let response = WorkloadMetricSeriesResponse {
        cpu: windowed
            .iter()
            .map(|sample| MetricSeriesPoint {
                timestamp: sample.timestamp,
                value: sample.cpu,
            })
            .collect(),
        memory: windowed
            .iter()
            .map(|sample| MetricSeriesPoint {
                timestamp: sample.timestamp,
                value: sample.memory,
            })
            .collect(),
        network: windowed
            .iter()
            .map(|sample| MetricSeriesPoint {
                timestamp: sample.timestamp,
                value: sample.network,
            })
            .collect(),
        filesystem: windowed
            .iter()
            .map(|sample| MetricSeriesPoint {
                timestamp: sample.timestamp,
                value: sample.filesystem,
            })
            .collect(),
        network_available: windowed.iter().any(|sample| sample.network_available),
        filesystem_available: windowed.iter().any(|sample| sample.filesystem_available),
    };

    (StatusCode::OK, Json(response)).into_response()
}

pub async fn list_pods(State(state): State<AppState>) -> impl IntoResponse {
    use k8s_openapi::api::core::v1::Pod;

    let client = state.kube_client().await;
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

                    let labels = pod
                        .metadata
                        .labels
                        .as_ref()
                        .and_then(|l| serde_json::to_value(l).ok())
                        .and_then(|v| v.as_object().cloned());
                    let annotations = pod
                        .metadata
                        .annotations
                        .as_ref()
                        .and_then(|a| serde_json::to_value(a).ok())
                        .and_then(|v| v.as_object().cloned());

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
                        labels,
                        annotations,
                    }
                })
                .collect();
            let total = items.len();
            (StatusCode::OK, Json(ApiResponse { data: items, total })).into_response()
        }
        Err(err) => {
            if let Some(response) = kube_list_warning_response("pods", &err) {
                return response;
            }
            error!("Error listing pods: {:?}", err);
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}

pub async fn list_nodes(State(state): State<AppState>) -> impl IntoResponse {
    use k8s_openapi::api::core::v1::Node;

    if state.is_auth_placeholder() {
        error!(
            "Cannot list nodes: {}",
            state
                .auth_user_message()
                .await
                .unwrap_or_else(|| "Kubernetes cluster configuration is not available.".to_string())
        );
        return StatusCode::SERVICE_UNAVAILABLE.into_response();
    }

    let client = state.kube_client().await;
    let api: Api<Node> = Api::all(client.clone());
    match api.list(&ListParams::default()).await {
        Ok(list) => {
            let active_nodes: Vec<Node> = list
                .items
                .into_iter()
                .filter(|node| node.metadata.deletion_timestamp.is_none())
                .collect();

            let node_names: Vec<String> = active_nodes
                .iter()
                .filter_map(|node| node.metadata.name.clone())
                .collect();
            let (node_metrics_map, node_disk_metrics_map) = tokio::join!(
                fetch_node_metrics(client.clone()),
                fetch_node_disk_metrics(client, &node_names),
            );
            let items: Vec<NodeItem> = active_nodes
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

                            sort_node_roles(&mut collected);
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

                    let architecture = node
                        .status
                        .as_ref()
                        .and_then(|status| status.node_info.as_ref())
                        .map(|info| info.architecture.clone());

                    let operating_system = node
                        .status
                        .as_ref()
                        .and_then(|status| status.node_info.as_ref())
                        .map(|info| info.operating_system.clone());

                    let kernel_version = node
                        .status
                        .as_ref()
                        .and_then(|status| status.node_info.as_ref())
                        .map(|info| info.kernel_version.clone());

                    let age = node
                        .metadata
                        .creation_timestamp
                        .as_ref()
                        .map(|t| t.0.to_rfc3339())
                        .unwrap_or_default();

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

                    let ephemeral_storage = node
                        .status
                        .as_ref()
                        .and_then(|status| status.allocatable.as_ref())
                        .and_then(|allocatable| allocatable.get("ephemeral-storage"))
                        .map(|storage_value| storage_value.0.clone());

                    let pods = node
                        .status
                        .as_ref()
                        .and_then(|status| status.allocatable.as_ref())
                        .and_then(|allocatable| allocatable.get("pods"))
                        .map(|pods_value| pods_value.0.clone());

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

                    let node_disk_metrics = node_disk_metrics_map.get(&name).copied();

                    let ephemeral_storage_used =
                        node_disk_metrics.map(|metrics| format_binary_bytes(metrics.used_bytes));

                    let ephemeral_storage_usage_percent = node_disk_metrics.and_then(|metrics| {
                        let capacity_bytes = ephemeral_storage
                            .as_deref()
                            .and_then(parse_memory_bytes)
                            .or_else(|| (metrics.capacity_bytes > 0.0).then_some(metrics.capacity_bytes));

                        match capacity_bytes {
                            Some(capacity) if capacity > 0.0 => {
                                Some((metrics.used_bytes / capacity * 100.0).min(100.0))
                            }
                            _ => None,
                        }
                    });

                    let unschedulable = node
                        .spec
                        .as_ref()
                        .and_then(|spec| spec.unschedulable)
                        .unwrap_or(false);

                    let labels = node
                        .metadata
                        .labels
                        .as_ref()
                        .and_then(|labels| serde_json::to_value(labels).ok())
                        .and_then(|value| value.as_object().cloned());

                    let annotations = node
                        .metadata
                        .annotations
                        .as_ref()
                        .and_then(|annotations| serde_json::to_value(annotations).ok())
                        .and_then(|value| value.as_object().cloned());

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
                        labels,
                        annotations,
                        runtime,
                        architecture,
                        operating_system,
                        kernel_version,
                        age: Some(age),
                        cpu,
                        memory,
                        ephemeral_storage,
                        pods,
                        cpu_used,
                        memory_used,
                        ephemeral_storage_used,
                        cpu_usage_percent,
                        memory_usage_percent,
                        ephemeral_storage_usage_percent,
                        unschedulable,
                    }
                })
                .collect();
            let total = items.len();
            (StatusCode::OK, Json(ApiResponse { data: items, total })).into_response()
        }
        Err(err) => {
            if let Some(response) = kube_list_warning_response("nodes", &err) {
                return response;
            }
            error!("Error listing nodes: {:?}", err);
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}

fn sort_node_roles(roles: &mut Vec<String>) {
    fn role_rank(role: &str) -> usize {
        match role {
            "control-plane" => 0,
            "master" => 1,
            "worker" => 2,
            "node" => 3,
            _ => 4,
        }
    }

    roles.sort_by(|first, second| {
        role_rank(first.as_str())
            .cmp(&role_rank(second.as_str()))
            .then_with(|| first.to_lowercase().cmp(&second.to_lowercase()))
    });
    roles.dedup();
}

pub async fn list_events(State(state): State<AppState>) -> impl IntoResponse {
    use k8s_openapi::api::core::v1::Event;

    let api: Api<Event> = Api::all(state.kube_client().await);
    match api.list(&ListParams::default()).await {
        Ok(list) => {
            let items: Vec<EventItem> = list
                .items
                .into_iter()
                .map(|event| {
                    let name = event.metadata.name.unwrap_or_default();
                    let namespace = event.metadata.namespace.unwrap_or_else(|| "default".into());
                    let involved_kind = event.involved_object.kind.unwrap_or_default();
                    let involved_name = event.involved_object.name.unwrap_or_default();
                    let involved_object = if involved_kind.is_empty() || involved_name.is_empty() {
                        String::new()
                    } else {
                        format!("{}/{}", involved_kind, involved_name)
                    };

                    let reason = event.reason.unwrap_or_default();
                    let message = event.message.unwrap_or_default();
                    let count = event.count.unwrap_or(1);
                    let first_timestamp = event
                        .first_timestamp
                        .as_ref()
                        .map(|t| t.0.to_rfc3339())
                        .or_else(|| event.metadata.creation_timestamp.as_ref().map(|t| t.0.to_rfc3339()))
                        .unwrap_or_default();
                    let last_timestamp = event
                        .last_timestamp
                        .as_ref()
                        .map(|t| t.0.to_rfc3339())
                        .or_else(|| event.event_time.as_ref().map(|mt| mt.0.to_rfc3339()))
                        .or_else(|| event.metadata.creation_timestamp.as_ref().map(|t| t.0.to_rfc3339()))
                        .unwrap_or_default();
                    let type_ = event.type_;
                    EventItem {
                        name,
                        namespace,
                        involved_object,
                        reason,
                        message,
                        count,
                        first_timestamp,
                        last_timestamp,
                        type_,
                    }
                })
                .collect();
            let total = items.len();
            (StatusCode::OK, Json(ApiResponse { data: items, total })).into_response()
        }
        Err(err) => {
            if let Some(response) = kube_list_warning_response("events", &err) {
                return response;
            }
            error!("Error listing events: {:?}", err);
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}

pub async fn list_deployments(State(state): State<AppState>) -> impl IntoResponse {
    use k8s_openapi::api::{apps::v1::Deployment, core::v1::Pod};

    let deployment_api: Api<Deployment> = Api::all(state.kube_client().await);
    let pod_api: Api<Pod> = Api::all(state.kube_client().await);

    let deployment_list = match deployment_api.list(&ListParams::default()).await {
        Ok(list) => list,
        Err(err) => {
            if let Some(response) = kube_list_warning_response("deployments", &err) {
                return response;
            }
            error!("Error listing deployments: {:?}", err);
            return StatusCode::INTERNAL_SERVER_ERROR.into_response();
        }
    };

    let pod_list = match pod_api.list(&ListParams::default()).await {
        Ok(list) => list,
        Err(err) => {
            error!("Error listing pods for deployment image digests: {:?}", err);
            return StatusCode::INTERNAL_SERVER_ERROR.into_response();
        }
    };
    let pods = pod_list.items;

    let items: Vec<DeploymentItem> = deployment_list
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

            let selector_for_digest = item
                .spec
                .as_ref()
                .and_then(|spec| spec.selector.match_labels.as_ref());

            let mut deployment_image_digests: HashMap<String, String> = HashMap::new();
            let mut deployment_repo_digests: HashMap<String, String> = HashMap::new();

            if let Some(selector_labels) = selector_for_digest {
                for pod in pods
                    .iter()
                    .filter(|pod| pod_matches_selector(pod, &namespace, selector_labels))
                {
                    let Some(status) = pod.status.as_ref() else {
                        continue;
                    };

                    if let Some(container_statuses) = status.container_statuses.as_ref() {
                        for container_status in container_statuses {
                            let image = container_status.image.as_str();
                            let image_id = container_status.image_id.as_str();
                            if image.is_empty() || image_id.is_empty() {
                                continue;
                            }

                            if let Some(digest) = extract_sha256_digest(image_id) {
                                let normalized_image = image_without_digest(image);
                                let image_repo = image_repository(normalized_image);

                                deployment_image_digests
                                    .entry(normalized_image.to_string())
                                    .or_insert_with(|| digest.clone());

                                deployment_repo_digests
                                    .entry(image_repo.to_string())
                                    .or_insert(digest);
                            }
                        }
                    }
                }
            }

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
                        .map(|image| {
                            if image.contains("@sha256:") {
                                return image;
                            }

                            let normalized = image_without_digest(&image);

                            deployment_image_digests
                                .get(normalized)
                                .map(|digest| format!("{}@{}", normalized, digest))
                                .or_else(|| {
                                    deployment_repo_digests
                                        .get(image_repository(normalized))
                                        .map(|digest| format!("{}@{}", normalized, digest))
                                })
                                .unwrap_or(image)
                        })
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

            let labels = item
                .metadata
                .labels
                .as_ref()
                .and_then(|l| serde_json::to_value(l).ok())
                .and_then(|v| v.as_object().cloned());
            let selector_labels = item
                .spec
                .as_ref()
                .and_then(|spec| spec.selector.match_labels.as_ref())
                .and_then(|labels| serde_json::to_value(labels).ok())
                .and_then(|v| v.as_object().cloned());
            let annotations = item
                .metadata
                .annotations
                .as_ref()
                .and_then(|a| serde_json::to_value(a).ok())
                .and_then(|v| v.as_object().cloned());

            DeploymentItem {
                name,
                namespace,
                status,
                ready: format!("{}/{}", ready, desired),
                updated,
                available,
                images,
                age,
                selector_labels,
                labels,
                annotations,
            }
        })
        .collect();
    let total = items.len();
    (StatusCode::OK, Json(ApiResponse { data: items, total })).into_response()
}

pub async fn scale_deployment(
    Path((namespace, name)): Path<(String, String)>,
    State(state): State<AppState>,
    Json(payload): Json<ScaleRequest>,
) -> impl IntoResponse {
    use k8s_openapi::api::apps::v1::Deployment;

    let api: Api<Deployment> = Api::namespaced(state.kube_client().await, &namespace);
    
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

    let api: Api<Deployment> = Api::namespaced(state.kube_client().await, &namespace);
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

pub async fn restart_all_workloads(
    Query(query): Query<RestartAllWorkloadsQuery>,
    State(state): State<AppState>,
) -> impl IntoResponse {
    use k8s_openapi::api::apps::v1::{DaemonSet, Deployment, StatefulSet};

    let namespace_filter: Option<HashSet<String>> = query.namespaces.as_ref().map(|raw| {
        raw.split(',')
            .map(str::trim)
            .filter(|ns| !ns.is_empty())
            .map(ToString::to_string)
            .collect()
    });
    let restarted_at = Utc::now().to_rfc3339();
    let patch_params = PatchParams::default();

    let should_restart = |namespace: &str| {
        namespace_filter
            .as_ref()
            .map(|set| set.contains(namespace))
            .unwrap_or(true)
    };

    let restart_patch = || {
        serde_json::json!({
            "spec": {
                "template": {
                    "metadata": {
                        "annotations": {
                            "kubectl.kubernetes.io/restartedAt": restarted_at
                        }
                    }
                }
            }
        })
    };

    let client = state.kube_client().await;

    let mut restarted_deployments = 0usize;
    let mut restarted_statefulsets = 0usize;
    let mut restarted_daemonsets = 0usize;
    let mut failed: Vec<serde_json::Value> = Vec::new();

    let selected_namespace_list = namespace_filter
        .as_ref()
        .map(|set| set.iter().cloned().collect::<Vec<String>>())
        .unwrap_or_default();

    if selected_namespace_list.is_empty() {
        let deployments_api: Api<Deployment> = Api::all(client.clone());
        let statefulsets_api: Api<StatefulSet> = Api::all(client.clone());
        let daemonsets_api: Api<DaemonSet> = Api::all(client.clone());

        match deployments_api.list(&ListParams::default()).await {
            Ok(list) => {
                for deployment in list.items {
                    let namespace = deployment
                        .metadata
                        .namespace
                        .clone()
                        .unwrap_or_else(|| "default".to_string());
                    let Some(name) = deployment.metadata.name.clone() else {
                        continue;
                    };

                    if !should_restart(&namespace) {
                        continue;
                    }

                    let ns_api: Api<Deployment> = Api::namespaced(client.clone(), &namespace);
                    let patch = restart_patch();
                    match ns_api
                        .patch(&name, &patch_params, &Patch::Merge(&patch))
                        .await
                    {
                        Ok(_) => restarted_deployments += 1,
                        Err(err) => failed.push(serde_json::json!({
                            "kind": "Deployment",
                            "namespace": namespace,
                            "name": name,
                            "error": err.to_string()
                        })),
                    }
                }
            }
            Err(err) => {
                error!("Error listing deployments for bulk restart: {:?}", err);
                failed.push(serde_json::json!({
                    "kind": "Deployment",
                    "namespace": "*",
                    "name": "*",
                    "error": format!("Failed to list deployments: {}", err)
                }));
            }
        }

        match statefulsets_api.list(&ListParams::default()).await {
            Ok(list) => {
                for statefulset in list.items {
                    let namespace = statefulset
                        .metadata
                        .namespace
                        .clone()
                        .unwrap_or_else(|| "default".to_string());
                    let Some(name) = statefulset.metadata.name.clone() else {
                        continue;
                    };

                    if !should_restart(&namespace) {
                        continue;
                    }

                    let ns_api: Api<StatefulSet> = Api::namespaced(client.clone(), &namespace);
                    let patch = restart_patch();
                    match ns_api
                        .patch(&name, &patch_params, &Patch::Merge(&patch))
                        .await
                    {
                        Ok(_) => restarted_statefulsets += 1,
                        Err(err) => failed.push(serde_json::json!({
                            "kind": "StatefulSet",
                            "namespace": namespace,
                            "name": name,
                            "error": err.to_string()
                        })),
                    }
                }
            }
            Err(err) => {
                error!("Error listing statefulsets for bulk restart: {:?}", err);
                failed.push(serde_json::json!({
                    "kind": "StatefulSet",
                    "namespace": "*",
                    "name": "*",
                    "error": format!("Failed to list statefulsets: {}", err)
                }));
            }
        }

        match daemonsets_api.list(&ListParams::default()).await {
            Ok(list) => {
                for daemonset in list.items {
                    let namespace = daemonset
                        .metadata
                        .namespace
                        .clone()
                        .unwrap_or_else(|| "default".to_string());
                    let Some(name) = daemonset.metadata.name.clone() else {
                        continue;
                    };

                    if !should_restart(&namespace) {
                        continue;
                    }

                    let ns_api: Api<DaemonSet> = Api::namespaced(client.clone(), &namespace);
                    let patch = restart_patch();
                    match ns_api
                        .patch(&name, &patch_params, &Patch::Merge(&patch))
                        .await
                    {
                        Ok(_) => restarted_daemonsets += 1,
                        Err(err) => failed.push(serde_json::json!({
                            "kind": "DaemonSet",
                            "namespace": namespace,
                            "name": name,
                            "error": err.to_string()
                        })),
                    }
                }
            }
            Err(err) => {
                error!("Error listing daemonsets for bulk restart: {:?}", err);
                failed.push(serde_json::json!({
                    "kind": "DaemonSet",
                    "namespace": "*",
                    "name": "*",
                    "error": format!("Failed to list daemonsets: {}", err)
                }));
            }
        }
    } else {
        for namespace in &selected_namespace_list {
            let deployments_api: Api<Deployment> = Api::namespaced(client.clone(), namespace);
            match deployments_api.list(&ListParams::default()).await {
                Ok(list) => {
                    for deployment in list.items {
                        let Some(name) = deployment.metadata.name.clone() else {
                            continue;
                        };
                        let patch = restart_patch();
                        match deployments_api
                            .patch(&name, &patch_params, &Patch::Merge(&patch))
                            .await
                        {
                            Ok(_) => restarted_deployments += 1,
                            Err(err) => failed.push(serde_json::json!({
                                "kind": "Deployment",
                                "namespace": namespace,
                                "name": name,
                                "error": err.to_string()
                            })),
                        }
                    }
                }
                Err(err) => {
                    error!("Error listing deployments in namespace {}: {:?}", namespace, err);
                    failed.push(serde_json::json!({
                        "kind": "Deployment",
                        "namespace": namespace,
                        "name": "*",
                        "error": format!("Failed to list deployments: {}", err)
                    }));
                }
            }

            let statefulsets_api: Api<StatefulSet> = Api::namespaced(client.clone(), namespace);
            match statefulsets_api.list(&ListParams::default()).await {
                Ok(list) => {
                    for statefulset in list.items {
                        let Some(name) = statefulset.metadata.name.clone() else {
                            continue;
                        };
                        let patch = restart_patch();
                        match statefulsets_api
                            .patch(&name, &patch_params, &Patch::Merge(&patch))
                            .await
                        {
                            Ok(_) => restarted_statefulsets += 1,
                            Err(err) => failed.push(serde_json::json!({
                                "kind": "StatefulSet",
                                "namespace": namespace,
                                "name": name,
                                "error": err.to_string()
                            })),
                        }
                    }
                }
                Err(err) => {
                    error!("Error listing statefulsets in namespace {}: {:?}", namespace, err);
                    failed.push(serde_json::json!({
                        "kind": "StatefulSet",
                        "namespace": namespace,
                        "name": "*",
                        "error": format!("Failed to list statefulsets: {}", err)
                    }));
                }
            }

            let daemonsets_api: Api<DaemonSet> = Api::namespaced(client.clone(), namespace);
            match daemonsets_api.list(&ListParams::default()).await {
                Ok(list) => {
                    for daemonset in list.items {
                        let Some(name) = daemonset.metadata.name.clone() else {
                            continue;
                        };
                        let patch = restart_patch();
                        match daemonsets_api
                            .patch(&name, &patch_params, &Patch::Merge(&patch))
                            .await
                        {
                            Ok(_) => restarted_daemonsets += 1,
                            Err(err) => failed.push(serde_json::json!({
                                "kind": "DaemonSet",
                                "namespace": namespace,
                                "name": name,
                                "error": err.to_string()
                            })),
                        }
                    }
                }
                Err(err) => {
                    error!("Error listing daemonsets in namespace {}: {:?}", namespace, err);
                    failed.push(serde_json::json!({
                        "kind": "DaemonSet",
                        "namespace": namespace,
                        "name": "*",
                        "error": format!("Failed to list daemonsets: {}", err)
                    }));
                }
            }
        }
    }

    let total_restarted = restarted_deployments + restarted_statefulsets + restarted_daemonsets;
    let selected_namespaces = selected_namespace_list;

    info!(
        restarted_deployments,
        restarted_statefulsets,
        restarted_daemonsets,
        failed = failed.len(),
        "Completed bulk restart for workloads"
    );

    (
        StatusCode::OK,
        Json(serde_json::json!({
            "success": failed.is_empty(),
            "selectedNamespaces": selected_namespaces,
            "restarted": {
                "deployments": restarted_deployments,
                "statefulsets": restarted_statefulsets,
                "daemonsets": restarted_daemonsets,
                "total": total_restarted
            },
            "failed": failed
        })),
    )
        .into_response()
}

fn replace_image_tag(image: &str, new_tag: &str) -> String {
    let image_without_digest = image.split('@').next().unwrap_or(image);
    let last_slash = image_without_digest.rfind('/');
    let last_colon = image_without_digest.rfind(':');

    let base = match (last_slash, last_colon) {
        (Some(slash), Some(colon)) if colon > slash => &image_without_digest[..colon],
        (None, Some(colon)) => &image_without_digest[..colon],
        _ => image_without_digest,
    };

    format!("{}:{}", base, new_tag)
}

fn image_without_digest(image: &str) -> &str {
    image.split('@').next().unwrap_or(image)
}

fn image_repository(image: &str) -> &str {
    let image_without_digest = image_without_digest(image);
    let last_slash = image_without_digest.rfind('/');
    let last_colon = image_without_digest.rfind(':');

    match (last_slash, last_colon) {
        (Some(slash), Some(colon)) if colon > slash => &image_without_digest[..colon],
        (None, Some(colon)) => &image_without_digest[..colon],
        _ => image_without_digest,
    }
}

fn pod_matches_selector(
    pod: &k8s_openapi::api::core::v1::Pod,
    namespace: &str,
    selector_labels: &std::collections::BTreeMap<String, String>,
) -> bool {
    let pod_namespace = pod.metadata.namespace.as_deref().unwrap_or("default");
    if pod_namespace != namespace {
        return false;
    }

    let Some(labels) = pod.metadata.labels.as_ref() else {
        return false;
    };

    selector_labels
        .iter()
        .all(|(key, value)| labels.get(key).is_some_and(|pod_value| pod_value == value))
}

fn extract_sha256_digest(image_id: &str) -> Option<String> {
    let marker = "sha256:";
    let digest_start = image_id.find(marker)?;
    let digest_section = &image_id[digest_start..];

    let mut digest_end = marker.len();
    for ch in digest_section[marker.len()..].chars() {
        if ch.is_ascii_hexdigit() {
            digest_end += ch.len_utf8();
        } else {
            break;
        }
    }

    if digest_end == marker.len() {
        return None;
    }

    Some(digest_section[..digest_end].to_string())
}

pub async fn update_deployment_image_tag(
    Path((namespace, name)): Path<(String, String)>,
    State(state): State<AppState>,
    Json(payload): Json<UpdateDeploymentImageTagRequest>,
) -> impl IntoResponse {
    use k8s_openapi::api::apps::v1::Deployment;

    let requested_tag = payload.tag.trim();
    let target_image = payload.image.as_deref().map(str::trim).filter(|image| !image.is_empty());

    if requested_tag.is_empty() {
        return (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({
                "success": false,
                "message": "tag is required",
            })),
        )
            .into_response();
    }

    let api: Api<Deployment> = Api::namespaced(state.kube_client().await, &namespace);
    let mut deployment = match api.get(&name).await {
        Ok(deployment) => deployment,
        Err(err) => {
            error!("Error getting deployment {}/{} for image tag update: {:?}", namespace, name, err);
            return StatusCode::NOT_FOUND.into_response();
        }
    };

    let mut updated = 0usize;
    if let Some(spec) = deployment.spec.as_mut() {
        if let Some(template_spec) = spec.template.spec.as_mut() {
            for container in &mut template_spec.containers {
                let old_image = container.image.clone().unwrap_or_default();
                if old_image.is_empty() {
                    continue;
                }

                if let Some(target) = target_image {
                    let old_without_digest = image_without_digest(&old_image);
                    let target_without_digest = image_without_digest(target);

                    // Match by exact image-without-digest first, then by repository.
                    let should_update = old_without_digest == target_without_digest
                        || image_repository(old_without_digest)
                            == image_repository(target_without_digest);

                    if !should_update {
                        continue;
                    }
                }

                container.image = Some(replace_image_tag(&old_image, requested_tag));
                updated += 1;
            }
        }
    }

    if updated == 0 {
        return (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({
                "success": false,
                "message": "Deployment has no containers to update",
            })),
        )
            .into_response();
    }

    match api.replace(&name, &Default::default(), &deployment).await {
        Ok(_) => {
            info!(
                "Updated deployment image tags {}/{} to '{}' for {} containers (target_image={:?})",
                namespace, name, requested_tag, updated, target_image
            );
            (
                StatusCode::OK,
                Json(serde_json::json!({
                    "success": true,
                    "updated_containers": updated,
                    "tag": requested_tag,
                    "image": target_image,
                })),
            )
                .into_response()
        }
        Err(err) => {
            error!("Error updating deployment image tags {}/{}: {:?}", namespace, name, err);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({
                    "success": false,
                    "message": format!("Failed to update deployment image tag: {}", err),
                })),
            )
                .into_response()
        }
    }
}

pub async fn get_pod_yaml(
    Path((namespace, name)): Path<(String, String)>,
    State(state): State<AppState>,
) -> impl IntoResponse {
    use k8s_openapi::api::core::v1::Pod;

    let api: Api<Pod> = Api::namespaced(state.kube_client().await, &namespace);
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

    let api: Api<Pod> = Api::namespaced(state.kube_client().await, &namespace);
    
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

#[derive(Deserialize)]
pub struct PodFilesQuery {
    pub path: Option<String>,
    pub container: Option<String>,
}

#[derive(Deserialize)]
pub struct PodUploadQuery {
    pub dest: Option<String>,
    pub container: Option<String>,
}

#[derive(Deserialize)]
pub struct PodDownloadQuery {
    pub path: Option<String>,
    pub container: Option<String>,
}

#[derive(serde::Serialize)]
pub struct PodFileItem {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub size: u64,
    pub modified_unix: i64,
}

fn shell_escape_single_quoted(input: &str) -> String {
    input.replace('\'', "'\"'\"'")
}

fn normalize_remote_path(path: Option<&str>) -> String {
    let raw = path.unwrap_or("/").trim();
    if raw.is_empty() {
        "/".to_string()
    } else {
        raw.to_string()
    }
}

fn join_remote_path(base: &str, name: &str) -> String {
    if base == "/" {
        format!("/{}", name)
    } else if base.ends_with('/') {
        format!("{}{}", base, name)
    } else {
        format!("{}/{}", base, name)
    }
}

fn sanitize_relative_path(raw: &str) -> Option<PathBuf> {
    let candidate = raw.trim().replace('\\', "/");
    if candidate.is_empty() {
        return None;
    }

    let mut out = PathBuf::new();
    for comp in StdPath::new(&candidate).components() {
        match comp {
            Component::Normal(seg) => out.push(seg),
            Component::CurDir => {}
            Component::ParentDir | Component::RootDir | Component::Prefix(_) => return None,
        }
    }

    if out.as_os_str().is_empty() {
        None
    } else {
        Some(out)
    }
}

fn destination_segments(dest: &str) -> Vec<String> {
    StdPath::new(dest)
        .components()
        .filter_map(|comp| match comp {
            Component::Normal(seg) => Some(seg.to_string_lossy().to_string()),
            _ => None,
        })
        .collect()
}

fn strip_destination_prefix(path: PathBuf, dest_segments: &[String]) -> PathBuf {
    if dest_segments.is_empty() {
        return path;
    }

    let path_segments: Vec<String> = path
        .components()
        .filter_map(|comp| match comp {
            Component::Normal(seg) => Some(seg.to_string_lossy().to_string()),
            _ => None,
        })
        .collect();

    if path_segments.len() <= dest_segments.len() {
        return path;
    }

    let has_prefix = path_segments
        .iter()
        .zip(dest_segments.iter())
        .all(|(a, b)| a == b);

    if !has_prefix {
        return path;
    }

    let mut out = PathBuf::new();
    for seg in path_segments.iter().skip(dest_segments.len()) {
        out.push(seg);
    }
    out
}

fn basename_for_download(path: &str) -> String {
    StdPath::new(path)
        .file_name()
        .map(|v| v.to_string_lossy().to_string())
        .filter(|v| !v.is_empty())
        .unwrap_or_else(|| "root".to_string())
}

async fn collect_upload_diagnostics(
    namespace: &str,
    pod_name: &str,
    container: Option<&str>,
    remote_path: &str,
) -> String {
    let escaped_remote = shell_escape_single_quoted(remote_path);
    let script = format!(
        "p='{}'; d=$(dirname \"$p\"); echo \"target=$p\"; echo \"dir=$d\"; if [ -e \"$d\" ]; then echo \"dir_exists=yes\"; else echo \"dir_exists=no\"; fi; ls -ld \"$d\" 2>&1 || true; mkdir -p \"$d\" 2>&1 || true; if [ -w \"$d\" ]; then echo \"dir_writable=yes\"; else echo \"dir_writable=no\"; fi; id 2>/dev/null || true",
        escaped_remote
    );

    let mut cmd = Command::new("kubectl");
    apply_kube_context(&mut cmd);
    cmd.arg("exec").arg("-n").arg(namespace).arg(pod_name);
    if let Some(c) = container.filter(|v| !v.is_empty()) {
        cmd.arg("-c").arg(c);
    }
    cmd.arg("--").arg("sh").arg("-c").arg(script);

    match cmd.output().await {
        Ok(out) => {
            let stdout = String::from_utf8_lossy(&out.stdout).trim().to_string();
            let stderr = String::from_utf8_lossy(&out.stderr).trim().to_string();
            let mut parts = Vec::new();
            if !stdout.is_empty() {
                parts.push(stdout);
            }
            if !stderr.is_empty() {
                parts.push(stderr);
            }
            if parts.is_empty() {
                "no diagnostics output".to_string()
            } else {
                parts.join(" | ")
            }
        }
        Err(err) => format!("failed to collect diagnostics: {}", err),
    }
}

pub async fn list_pod_files(
    Path((namespace, name)): Path<(String, String)>,
    Query(query): Query<PodFilesQuery>,
) -> impl IntoResponse {
    let target_path = normalize_remote_path(query.path.as_deref());
    let escaped_path = shell_escape_single_quoted(&target_path);

    let script = format!(
        "TARGET='{}'; if [ ! -d \"$TARGET\" ]; then echo '__NOT_DIR__'; exit 0; fi; for p in \"$TARGET\"/* \"$TARGET\"/.[!.]* \"$TARGET\"/..?*; do [ -e \"$p\" ] || continue; b=$(basename \"$p\"); if [ -d \"$p\" ]; then t=d; s=0; else t=f; s=$(wc -c < \"$p\" 2>/dev/null || echo 0); fi; m=$(date -r \"$p\" +%s 2>/dev/null || stat -c %Y \"$p\" 2>/dev/null || stat -f %m \"$p\" 2>/dev/null || echo 0); printf '%s\\t%s\\t%s\\t%s\\n' \"$b\" \"$t\" \"$s\" \"$m\"; done",
        escaped_path
    );

    let mut cmd = Command::new("kubectl");
    apply_kube_context(&mut cmd);
    cmd.arg("exec")
        .arg("-n")
        .arg(&namespace)
        .arg(&name);
    if let Some(container) = query.container.as_deref().filter(|v| !v.is_empty()) {
        cmd.arg("-c").arg(container);
    }
    cmd.arg("--").arg("sh").arg("-c").arg(script);

    let output = match cmd.output().await {
        Ok(out) => out,
        Err(err) => {
            error!("Failed to execute kubectl for pod files {}/{}: {:?}", namespace, name, err);
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({ "message": format!("Failed to execute kubectl: {}", err) })),
            )
                .into_response();
        }
    };

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({ "message": if stderr.is_empty() { "Failed to list pod files" } else { &stderr } })),
        )
            .into_response();
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    if stdout.lines().any(|line| line.trim() == "__NOT_DIR__") {
        return (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({ "message": format!("Path is not a directory: {}", target_path) })),
        )
            .into_response();
    }

    let mut items: Vec<PodFileItem> = stdout
        .lines()
        .filter_map(|line| {
            let mut parts = line.split('\t');
            let name = parts.next()?.to_string();
            let typ = parts.next().unwrap_or("f");
            let size = parts
                .next()
                .and_then(|v| v.parse::<u64>().ok())
                .unwrap_or(0);
            let modified_unix = parts
                .next()
                .and_then(|v| v.parse::<i64>().ok())
                .unwrap_or(0);

            Some(PodFileItem {
                path: join_remote_path(&target_path, &name),
                name,
                is_dir: typ == "d",
                size,
                modified_unix,
            })
        })
        .collect();

    items.sort_by(|a, b| {
        b.is_dir
            .cmp(&a.is_dir)
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });

    (StatusCode::OK, Json(ApiResponse { total: items.len(), data: items })).into_response()
}

pub async fn upload_pod_files(
    Path((namespace, name)): Path<(String, String)>,
    Query(query): Query<PodUploadQuery>,
    mut multipart: Multipart,
) -> impl IntoResponse {
    let destination = normalize_remote_path(query.dest.as_deref());
    let dest_segments = destination_segments(&destination);
    let upload_root = std::env::temp_dir().join(format!("pertisk-upload-{}", uuid::Uuid::new_v4()));

    if let Err(err) = fs::create_dir_all(&upload_root).await {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "message": format!("Failed to prepare upload directory: {}", err) })),
        )
            .into_response();
    }

    let mut pending_relative_path: Option<String> = None;
    let mut uploaded_files = 0usize;
    let mut relative_files: Vec<String> = Vec::new();

    loop {
        let next = match multipart.next_field().await {
            Ok(field) => field,
            Err(err) => {
                let _ = fs::remove_dir_all(&upload_root).await;
                return (
                    StatusCode::BAD_REQUEST,
                    Json(serde_json::json!({ "message": format!("Invalid multipart payload: {}", err) })),
                )
                    .into_response();
            }
        };

        let Some(field) = next else {
            break;
        };

        let field_name = field.name().unwrap_or("").to_string();

        if field_name == "relative_path" {
            pending_relative_path = field.text().await.ok();
            continue;
        }

        if field_name != "file" {
            continue;
        }

        let fallback_name = field
            .file_name()
            .map(|s| s.to_string())
            .unwrap_or_else(|| format!("file-{}", uploaded_files + 1));
        let relative = pending_relative_path
            .take()
            .unwrap_or_else(|| fallback_name.clone());

        let safe_relative = match sanitize_relative_path(&relative) {
            Some(path) => path,
            None => {
                let _ = fs::remove_dir_all(&upload_root).await;
                return (
                    StatusCode::BAD_REQUEST,
                    Json(serde_json::json!({ "message": format!("Invalid relative path: {}", relative) })),
                )
                    .into_response();
            }
        };

        let normalized_relative = {
            let stripped = strip_destination_prefix(safe_relative.clone(), &dest_segments);
            if stripped.as_os_str().is_empty() {
                safe_relative
            } else {
                stripped
            }
        };

        let destination_path = upload_root.join(&normalized_relative);
        if let Some(parent) = destination_path.parent() {
            if let Err(err) = fs::create_dir_all(parent).await {
                let _ = fs::remove_dir_all(&upload_root).await;
                return (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(serde_json::json!({ "message": format!("Failed to create directory: {}", err) })),
                )
                    .into_response();
            }
        }

        let bytes = match field.bytes().await {
            Ok(data) => data,
            Err(err) => {
                let _ = fs::remove_dir_all(&upload_root).await;
                return (
                    StatusCode::BAD_REQUEST,
                    Json(serde_json::json!({ "message": format!("Failed to read upload bytes: {}", err) })),
                )
                    .into_response();
            }
        };

        if let Err(err) = fs::write(&destination_path, &bytes).await {
            let _ = fs::remove_dir_all(&upload_root).await;
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({ "message": format!("Failed to write upload file: {}", err) })),
            )
                .into_response();
        }

            relative_files.push(normalized_relative.to_string_lossy().replace('\\', "/"));
        uploaded_files += 1;
    }

    if uploaded_files == 0 {
        let _ = fs::remove_dir_all(&upload_root).await;
        return (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({ "message": "No files uploaded" })),
        )
            .into_response();
    }

    let escaped_dest = shell_escape_single_quoted(&destination);
    let mut preflight_cmd = Command::new("kubectl");
    apply_kube_context(&mut preflight_cmd);
    preflight_cmd
        .arg("exec")
        .arg("-n")
        .arg(&namespace)
        .arg(&name);
    if let Some(container) = query.container.as_deref().filter(|v| !v.is_empty()) {
        preflight_cmd.arg("-c").arg(container);
    }
    preflight_cmd
        .arg("--")
        .arg("sh")
        .arg("-c")
        .arg(format!(
            "DEST='{}'; if [ ! -d \"$DEST\" ]; then mkdir -p \"$DEST\"; fi; if [ ! -w \"$DEST\" ]; then echo 'Destination is not writable'; exit 1; fi",
            escaped_dest
        ));

    let preflight_out = match preflight_cmd.output().await {
        Ok(out) => out,
        Err(err) => {
            let _ = fs::remove_dir_all(&upload_root).await;
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({ "message": format!("Failed to verify destination in pod: {}", err) })),
            )
                .into_response();
        }
    };

    if !preflight_out.status.success() {
        let _ = fs::remove_dir_all(&upload_root).await;
        let stderr = String::from_utf8_lossy(&preflight_out.stderr).trim().to_string();
        let stdout = String::from_utf8_lossy(&preflight_out.stdout).trim().to_string();
        let mut msg = if !stderr.is_empty() {
            stderr
        } else if !stdout.is_empty() {
            stdout
        } else {
            format!("Destination path is not writable: {}", destination)
        };

        let generic_failure = msg == "command terminated with exit code 1"
            || msg.ends_with("command terminated with exit code 1");
        if generic_failure {
            let diag = collect_upload_diagnostics(
                &namespace,
                &name,
                query.container.as_deref(),
                &destination,
            )
            .await;
            if diag.contains("dir_writable=no") {
                msg = format!(
                    "Destination '{}' is not writable for the container user. Use a writable path like '/tmp' or a writable mounted volume. diagnostics: {}",
                    destination, diag
                );
            } else {
                msg = format!("{}; diagnostics: {}", msg, diag);
            }
        }

        return (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({ "message": msg })),
        )
            .into_response();
    }

    for rel in &relative_files {
        let local_path = upload_root.join(rel);
        let file_bytes = match fs::read(&local_path).await {
            Ok(bytes) => bytes,
            Err(err) => {
                let _ = fs::remove_dir_all(&upload_root).await;
                return (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(serde_json::json!({ "message": format!("Failed reading temporary upload file {}: {}", rel, err) })),
                )
                    .into_response();
            }
        };

        let remote_path = if destination == "/" {
            format!("/{}", rel)
        } else {
            format!("{}/{}", destination.trim_end_matches('/'), rel)
        };
        let escaped_remote = shell_escape_single_quoted(&remote_path);

        let mut write_cmd = Command::new("kubectl");
        apply_kube_context(&mut write_cmd);
        write_cmd
            .arg("exec")
            .arg("-i")
            .arg("-n")
            .arg(&namespace)
            .arg(&name);
        if let Some(container) = query.container.as_deref().filter(|v| !v.is_empty()) {
            write_cmd.arg("-c").arg(container);
        }
        write_cmd
            .arg("--")
            .arg("sh")
            .arg("-c")
            .arg(format!(
                "p='{}'; d=$(dirname \"$p\"); mkdir -p \"$d\" || {{ echo \"mkdir failed: $d\" 1>&2; exit 1; }}; cat > \"$p\" || {{ echo \"write failed: $p\" 1>&2; exit 1; }}",
                escaped_remote
            ))
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());

        let mut child = match write_cmd.spawn() {
            Ok(c) => c,
            Err(err) => {
                let _ = fs::remove_dir_all(&upload_root).await;
                return (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(serde_json::json!({ "message": format!("Failed to start pod upload command for {}: {}", rel, err) })),
                )
                    .into_response();
            }
        };

        if let Some(mut stdin) = child.stdin.take() {
            if let Err(err) = stdin.write_all(&file_bytes).await {
                let _ = fs::remove_dir_all(&upload_root).await;
                return (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(serde_json::json!({ "message": format!("Failed streaming file {} to pod: {}", rel, err) })),
                )
                    .into_response();
            }
        }

        let write_out = match child.wait_with_output().await {
            Ok(out) => out,
            Err(err) => {
                let _ = fs::remove_dir_all(&upload_root).await;
                return (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(serde_json::json!({ "message": format!("Upload command failed for {}: {}", rel, err) })),
                )
                    .into_response();
            }
        };

        if !write_out.status.success() {
            let stderr = String::from_utf8_lossy(&write_out.stderr).trim().to_string();
            let stdout = String::from_utf8_lossy(&write_out.stdout).trim().to_string();
            let generic_failure = stderr.is_empty()
                || stderr == "command terminated with exit code 1"
                || stderr.ends_with("command terminated with exit code 1");

            let diagnostics = if generic_failure {
                Some(
                    collect_upload_diagnostics(
                        &namespace,
                        &name,
                        query.container.as_deref(),
                        &remote_path,
                    )
                    .await,
                )
            } else {
                None
            };

            // Fallback: if nested path upload fails, retry by flattening to destination root.
            if rel.contains('/') {
                if let Some(file_name) = StdPath::new(rel)
                    .file_name()
                    .map(|v| v.to_string_lossy().to_string())
                    .filter(|v| !v.is_empty())
                {
                    let flat_remote_path = if destination == "/" {
                        format!("/{}", file_name)
                    } else {
                        format!("{}/{}", destination.trim_end_matches('/'), file_name)
                    };
                    let escaped_flat = shell_escape_single_quoted(&flat_remote_path);

                    let mut fallback_cmd = Command::new("kubectl");
                    apply_kube_context(&mut fallback_cmd);
                    fallback_cmd
                        .arg("exec")
                        .arg("-i")
                        .arg("-n")
                        .arg(&namespace)
                        .arg(&name);
                    if let Some(container) = query.container.as_deref().filter(|v| !v.is_empty()) {
                        fallback_cmd.arg("-c").arg(container);
                    }
                    fallback_cmd
                        .arg("--")
                        .arg("sh")
                        .arg("-c")
                        .arg(format!(
                            "p='{}'; cat > \"$p\" || {{ echo \"write failed: $p\" 1>&2; exit 1; }}",
                            escaped_flat
                        ))
                        .stdin(Stdio::piped())
                        .stdout(Stdio::null())
                        .stderr(Stdio::piped());

                    let mut fallback_child = match fallback_cmd.spawn() {
                        Ok(c) => c,
                        Err(err) => {
                            let _ = fs::remove_dir_all(&upload_root).await;
                            return (
                                StatusCode::INTERNAL_SERVER_ERROR,
                                Json(serde_json::json!({
                                    "message": format!(
                                        "Failed to start fallback upload command for {}: {}",
                                        rel, err
                                    )
                                })),
                            )
                                .into_response();
                        }
                    };

                    if let Some(mut stdin) = fallback_child.stdin.take() {
                        if let Err(err) = stdin.write_all(&file_bytes).await {
                            let _ = fs::remove_dir_all(&upload_root).await;
                            return (
                                StatusCode::INTERNAL_SERVER_ERROR,
                                Json(serde_json::json!({
                                    "message": format!(
                                        "Failed streaming fallback file {} to pod: {}",
                                        rel, err
                                    )
                                })),
                            )
                                .into_response();
                        }
                    }

                    let fallback_out = match fallback_child.wait_with_output().await {
                        Ok(out) => out,
                        Err(err) => {
                            let _ = fs::remove_dir_all(&upload_root).await;
                            return (
                                StatusCode::INTERNAL_SERVER_ERROR,
                                Json(serde_json::json!({
                                    "message": format!(
                                        "Fallback upload command failed for {}: {}",
                                        rel, err
                                    )
                                })),
                            )
                                .into_response();
                        }
                    };

                    if fallback_out.status.success() {
                        continue;
                    }

                    let fallback_stderr = String::from_utf8_lossy(&fallback_out.stderr).trim().to_string();
                    let fallback_stdout = String::from_utf8_lossy(&fallback_out.stdout).trim().to_string();
                    let _ = fs::remove_dir_all(&upload_root).await;
                    return (
                        StatusCode::BAD_REQUEST,
                        Json(serde_json::json!({
                            "message": if fallback_stderr.is_empty() && fallback_stdout.is_empty() {
                                if let Some(diag) = diagnostics {
                                    format!(
                                        "Failed nested upload {} to {} and flat fallback to {}. Diagnostics: {}",
                                        rel, remote_path, flat_remote_path, diag
                                    )
                                } else {
                                    format!(
                                        "Failed nested upload {} to {} and flat fallback to {}",
                                        rel, remote_path, flat_remote_path
                                    )
                                }
                            } else {
                                format!(
                                    "Failed nested upload {} to {} and flat fallback to {}: {}{}",
                                    rel,
                                    remote_path,
                                    flat_remote_path,
                                    if !fallback_stderr.is_empty() { fallback_stderr } else { "".to_string() },
                                    if !fallback_stdout.is_empty() {
                                        format!(" {}", fallback_stdout)
                                    } else {
                                        "".to_string()
                                    }
                                )
                            }
                        })),
                    )
                        .into_response();
                }
            }

            let _ = fs::remove_dir_all(&upload_root).await;
            return (
                StatusCode::BAD_REQUEST,
                Json(serde_json::json!({
                    "message": if stderr.is_empty() && stdout.is_empty() {
                        if let Some(diag) = diagnostics {
                            format!("Failed to upload {} to {}. Diagnostics: {}", rel, remote_path, diag)
                        } else {
                            format!("Failed to upload {} to {}", rel, remote_path)
                        }
                    } else {
                        format!(
                            "Failed to upload {} to {}: {}{}",
                            rel,
                            remote_path,
                            if !stderr.is_empty() { stderr } else { "".to_string() },
                            if !stdout.is_empty() {
                                format!(" {}", stdout)
                            } else {
                                "".to_string()
                            }
                        )
                    }
                })),
            )
                .into_response();
        }
    }

    let _ = fs::remove_dir_all(&upload_root).await;

    (
        StatusCode::OK,
        Json(serde_json::json!({
            "success": true,
            "uploaded_files": uploaded_files,
            "destination": destination,
        })),
    )
        .into_response()
}

pub async fn download_pod_path(
    Path((namespace, name)): Path<(String, String)>,
    Query(query): Query<PodDownloadQuery>,
) -> impl IntoResponse {
    let target_path = normalize_remote_path(query.path.as_deref());
    let escaped_path = shell_escape_single_quoted(&target_path);

    let mut kind_cmd = Command::new("kubectl");
    apply_kube_context(&mut kind_cmd);
    kind_cmd
        .arg("exec")
        .arg("-n")
        .arg(&namespace)
        .arg(&name);
    if let Some(container) = query.container.as_deref().filter(|v| !v.is_empty()) {
        kind_cmd.arg("-c").arg(container);
    }
    kind_cmd
        .arg("--")
        .arg("sh")
        .arg("-c")
        .arg(format!(
            "TARGET='{}'; if [ -d \"$TARGET\" ]; then echo dir; elif [ -f \"$TARGET\" ]; then echo file; else echo missing; fi",
            escaped_path
        ));

    let kind_output = match kind_cmd.output().await {
        Ok(out) => out,
        Err(err) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({ "message": format!("Failed to execute kubectl: {}", err) })),
            )
                .into_response();
        }
    };

    if !kind_output.status.success() {
        let stderr = String::from_utf8_lossy(&kind_output.stderr).trim().to_string();
        return (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({ "message": if stderr.is_empty() { "Failed to inspect pod path" } else { &stderr } })),
        )
            .into_response();
    }

    let kind = String::from_utf8_lossy(&kind_output.stdout).trim().to_string();
    if kind == "missing" {
        return (
            StatusCode::NOT_FOUND,
            Json(serde_json::json!({ "message": format!("Path not found: {}", target_path) })),
        )
            .into_response();
    }

    let mut content_cmd = Command::new("kubectl");
    apply_kube_context(&mut content_cmd);
    content_cmd
        .arg("exec")
        .arg("-n")
        .arg(&namespace)
        .arg(&name);
    if let Some(container) = query.container.as_deref().filter(|v| !v.is_empty()) {
        content_cmd.arg("-c").arg(container);
    }

    if kind == "dir" {
        content_cmd
            .arg("--")
            .arg("sh")
            .arg("-c")
            .arg(format!(
                "TARGET='{}'; tar -C \"$(dirname \"$TARGET\")\" -czf - \"$(basename \"$TARGET\")\"",
                escaped_path
            ));
    } else {
        content_cmd.arg("--").arg("cat").arg(&target_path);
    }

    let output = match content_cmd.output().await {
        Ok(out) => out,
        Err(err) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({ "message": format!("Failed to stream pod file: {}", err) })),
            )
                .into_response();
        }
    };

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({ "message": if stderr.is_empty() { "Failed to download pod path" } else { &stderr } })),
        )
            .into_response();
    }

    let base_name = basename_for_download(&target_path);
    let download_name = if kind == "dir" {
        format!("{}.tar.gz", base_name)
    } else {
        base_name
    };
    let content_type = if kind == "dir" {
        "application/gzip"
    } else {
        "application/octet-stream"
    };

    (
        StatusCode::OK,
        [
            (header::CONTENT_TYPE, content_type.to_string()),
            (
                header::CONTENT_DISPOSITION,
                format!("attachment; filename=\"{}\"", download_name),
            ),
        ],
        output.stdout,
    )
        .into_response()
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

    let api: Api<Pod> = Api::namespaced(state.kube_client().await, &namespace);
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

    let api: Api<Deployment> = Api::namespaced(state.kube_client().await, &namespace);
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

    let api: Api<Deployment> = Api::namespaced(state.kube_client().await, &namespace);
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

    let api: Api<StatefulSet> = Api::namespaced(state.kube_client().await, &namespace);
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

    let api: Api<StatefulSet> = Api::namespaced(state.kube_client().await, &namespace);
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

    let api: Api<DaemonSet> = Api::namespaced(state.kube_client().await, &namespace);
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

    let api: Api<DaemonSet> = Api::namespaced(state.kube_client().await, &namespace);
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

    let api: Api<Job> = Api::namespaced(state.kube_client().await, &namespace);
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

    let api: Api<Job> = Api::namespaced(state.kube_client().await, &namespace);
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

    let api: Api<CronJob> = Api::namespaced(state.kube_client().await, &namespace);
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

    let api: Api<CronJob> = Api::namespaced(state.kube_client().await, &namespace);
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

    let api: Api<StatefulSet> = Api::all(state.kube_client().await);
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

                    let labels = item
                        .metadata
                        .labels
                        .as_ref()
                        .and_then(|l| serde_json::to_value(l).ok())
                        .and_then(|v| v.as_object().cloned());
                    let annotations = item
                        .metadata
                        .annotations
                        .as_ref()
                        .and_then(|a| serde_json::to_value(a).ok())
                        .and_then(|v| v.as_object().cloned());

                    StatefulSetItem {
                        name,
                        namespace,
                        status,
                        ready: format!("{}/{}", ready, desired),
                        current,
                        updated,
                        age,
                        images,
                        labels,
                        annotations,
                    }
                })
                .collect();
            let total = items.len();
            (StatusCode::OK, Json(ApiResponse { data: items, total })).into_response()
        }
        Err(err) => {
            if let Some(response) = kube_list_warning_response("statefulsets", &err) {
                return response;
            }
            error!("Error listing statefulsets: {:?}", err);
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}

pub async fn list_daemonsets(State(state): State<AppState>) -> impl IntoResponse {
    use k8s_openapi::api::apps::v1::DaemonSet;

    let api: Api<DaemonSet> = Api::all(state.kube_client().await);
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

                    let labels = item
                        .metadata
                        .labels
                        .as_ref()
                        .and_then(|l| serde_json::to_value(l).ok())
                        .and_then(|v| v.as_object().cloned());
                    let annotations = item
                        .metadata
                        .annotations
                        .as_ref()
                        .and_then(|a| serde_json::to_value(a).ok())
                        .and_then(|v| v.as_object().cloned());

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
                        labels,
                        annotations,
                    }
                })
                .collect();
            let total = items.len();
            (StatusCode::OK, Json(ApiResponse { data: items, total })).into_response()
        }
        Err(err) => {
            if let Some(response) = kube_list_warning_response("daemonsets", &err) {
                return response;
            }
            error!("Error listing daemonsets: {:?}", err);
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}

pub async fn list_replicasets(State(state): State<AppState>) -> impl IntoResponse {
    use k8s_openapi::api::apps::v1::ReplicaSet;

    let api: Api<ReplicaSet> = Api::all(state.kube_client().await);
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

                    let labels = item
                        .metadata
                        .labels
                        .as_ref()
                        .and_then(|l| serde_json::to_value(l).ok())
                        .and_then(|v| v.as_object().cloned());
                    let annotations = item
                        .metadata
                        .annotations
                        .as_ref()
                        .and_then(|a| serde_json::to_value(a).ok())
                        .and_then(|v| v.as_object().cloned());

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
                        labels,
                        annotations,
                    }
                })
                .collect();
            let total = items.len();
            (StatusCode::OK, Json(ApiResponse { data: items, total })).into_response()
        }
        Err(err) => {
            if let Some(response) = kube_list_warning_response("replicasets", &err) {
                return response;
            }
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

    let api: Api<ReplicaSet> = Api::namespaced(state.kube_client().await, &namespace);
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

    let api: Api<ReplicaSet> = Api::namespaced(state.kube_client().await, &namespace);
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

    let api: Api<Job> = Api::all(state.kube_client().await);
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

                    let labels = item
                        .metadata
                        .labels
                        .as_ref()
                        .and_then(|l| serde_json::to_value(l).ok())
                        .and_then(|v| v.as_object().cloned());
                    let annotations = item
                        .metadata
                        .annotations
                        .as_ref()
                        .and_then(|a| serde_json::to_value(a).ok())
                        .and_then(|v| v.as_object().cloned());

                    JobItem {
                        name,
                        namespace,
                        status: status_text,
                        completions,
                        duration,
                        age,
                        labels,
                        annotations,
                    }
                })
                .collect();
            let total = items.len();
            (StatusCode::OK, Json(ApiResponse { data: items, total })).into_response()
        }
        Err(err) => {
            if let Some(response) = kube_list_warning_response("jobs", &err) {
                return response;
            }
            error!("Error listing jobs: {:?}", err);
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}

pub async fn list_cronjobs(State(state): State<AppState>) -> impl IntoResponse {
    use k8s_openapi::api::batch::v1::CronJob;

    let api: Api<CronJob> = Api::all(state.kube_client().await);
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

                    let labels = item
                        .metadata
                        .labels
                        .as_ref()
                        .and_then(|l| serde_json::to_value(l).ok())
                        .and_then(|v| v.as_object().cloned());
                    let annotations = item
                        .metadata
                        .annotations
                        .as_ref()
                        .and_then(|a| serde_json::to_value(a).ok())
                        .and_then(|v| v.as_object().cloned());

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
                        labels,
                        annotations,
                    }
                })
                .collect();
            let total = items.len();
            (StatusCode::OK, Json(ApiResponse { data: items, total })).into_response()
        }
        Err(err) => {
            if let Some(response) = kube_list_warning_response("cronjobs", &err) {
                return response;
            }
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

    if state.is_auth_placeholder() {
        error!(
            "Cannot build dashboard summary: {}",
            state
                .auth_user_message()
                .await
                .unwrap_or_else(|| "Kubernetes cluster configuration is not available.".to_string())
        );
        return StatusCode::SERVICE_UNAVAILABLE.into_response();
    }

    let client = state.kube_client().await;

    let namespaces_api: Api<Namespace> = Api::all(client.clone());
    let pods_api: Api<Pod> = Api::all(client.clone());
    let deployments_api: Api<Deployment> = Api::all(client.clone());
    let statefulsets_api: Api<StatefulSet> = Api::all(client.clone());
    let daemonsets_api: Api<DaemonSet> = Api::all(client.clone());
    let replicasets_api: Api<ReplicaSet> = Api::all(client.clone());
    let jobs_api: Api<Job> = Api::all(client.clone());
    let cronjobs_api: Api<CronJob> = Api::all(client.clone());
    let events_api: Api<Event> = Api::all(client.clone());

    let dashboard_list_timeout_ms: u64 = env::var("DASHBOARD_LIST_TIMEOUT_MS")
        .ok()
        .and_then(|raw| raw.parse::<u64>().ok())
        .filter(|value| *value > 0)
        .unwrap_or(4500);
    let timeout = std::time::Duration::from_millis(dashboard_list_timeout_ms);
    let cached_summary = state.dashboard_summary_cache.read().await.clone();

    macro_rules! count_list_with_timeout {
        ($resource:literal, $api:expr, $fallback:expr) => {
            async {
                match tokio::time::timeout(timeout, $api.list(&ListParams::default())).await {
                    Ok(Ok(list)) => list.items.len(),
                    Ok(Err(err)) => {
                        warn!(resource = $resource, error = %err, "Dashboard summary list failed; falling back to 0");
                        $fallback
                    }
                    Err(_) => {
                        warn!(resource = $resource, timeout_ms = dashboard_list_timeout_ms, "Dashboard summary list timed out; falling back to 0");
                        $fallback
                    }
                }
            }
        };
    }

    let (
        namespaces,
        pods,
        deployments,
        statefulsets,
        daemonsets,
        replicasets,
        jobs,
        cronjobs,
        events,
        kube_version,
    ) = tokio::join!(
        count_list_with_timeout!("namespaces", namespaces_api, cached_summary.as_ref().map(|s| s.namespaces).unwrap_or(0)),
        count_list_with_timeout!("pods", pods_api, cached_summary.as_ref().map(|s| s.pods).unwrap_or(0)),
        count_list_with_timeout!("deployments", deployments_api, cached_summary.as_ref().map(|s| s.deployments).unwrap_or(0)),
        count_list_with_timeout!("statefulsets", statefulsets_api, cached_summary.as_ref().map(|s| s.statefulsets).unwrap_or(0)),
        count_list_with_timeout!("daemonsets", daemonsets_api, cached_summary.as_ref().map(|s| s.daemonsets).unwrap_or(0)),
        count_list_with_timeout!("replicasets", replicasets_api, cached_summary.as_ref().map(|s| s.replicasets).unwrap_or(0)),
        count_list_with_timeout!("jobs", jobs_api, cached_summary.as_ref().map(|s| s.jobs).unwrap_or(0)),
        count_list_with_timeout!("cronjobs", cronjobs_api, cached_summary.as_ref().map(|s| s.cronjobs).unwrap_or(0)),
        count_list_with_timeout!("events", events_api, cached_summary.as_ref().map(|s| s.events).unwrap_or(0)),
        async {
            match tokio::time::timeout(timeout, client.apiserver_version()).await {
                Ok(Ok(version)) => Some(version.git_version),
                Ok(Err(err)) => {
                    warn!(error = %err, "Failed to fetch API server version for dashboard summary");
                    cached_summary.as_ref().and_then(|s| s.kube_version.clone())
                }
                Err(_) => {
                    warn!(timeout_ms = dashboard_list_timeout_ms, "API server version request timed out for dashboard summary");
                    cached_summary.as_ref().and_then(|s| s.kube_version.clone())
                }
            }
        }
    );

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
    let api_endpoint = Some(
        env::var("KUBERNETES_SERVICE_HOST")
            .unwrap_or_else(|_| "kubernetes.default.svc.cluster.local".to_string()),
    );

    let summary = DashboardSummary {
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
    };

    {
        let mut cache = state.dashboard_summary_cache.write().await;
        *cache = Some(summary.clone());
    }

    (StatusCode::OK, Json(summary)).into_response()
}

pub async fn delete_pod(
    Path((namespace, name)): Path<(String, String)>,
    State(state): State<AppState>,
) -> impl IntoResponse {
    use k8s_openapi::api::core::v1::Pod;
    let api: Api<Pod> = Api::namespaced(state.kube_client().await, &namespace);
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
    let api: Api<Deployment> = Api::namespaced(state.kube_client().await, &namespace);
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
    let api: Api<StatefulSet> = Api::namespaced(state.kube_client().await, &namespace);
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
    let api: Api<DaemonSet> = Api::namespaced(state.kube_client().await, &namespace);
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
    let api: Api<ReplicaSet> = Api::namespaced(state.kube_client().await, &namespace);
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
    let api: Api<Job> = Api::namespaced(state.kube_client().await, &namespace);
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
    let api: Api<CronJob> = Api::namespaced(state.kube_client().await, &namespace);
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
    let api: Api<Node> = Api::all(state.kube_client().await);
    match api.get(&name).await {
        Ok(node) => {
            // Convert node to JSON value for filtering
            let mut json = match serde_json::to_value(&node) {
                Ok(v) => v,
                Err(err) => {
                    error!("Failed to serialize node to JSON {}: {:?}", name, err);
                    return StatusCode::INTERNAL_SERVER_ERROR.into_response();
                }
            };

            // Remove status and managedFields from the object
            if let Some(obj) = json.as_object_mut() {
                obj.remove("status");
                // Remove managedFields from metadata
                if let Some(metadata) = obj.get_mut("metadata").and_then(|m| m.as_object_mut()) {
                    metadata.remove("managedFields");
                }
            }

            match serde_yaml::to_string(&json) {
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
            }
        }
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
    let api: Api<Node> = Api::all(state.kube_client().await);
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
    let api: Api<Node> = Api::all(state.kube_client().await);
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
    let api: Api<Node> = Api::all(state.kube_client().await);
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
    let api: Api<Node> = Api::all(state.kube_client().await);
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
    let api: Api<Node> = Api::all(state.kube_client().await);
    let patch = serde_json::json!({ "spec": { "unschedulable": true } });
    if let Err(err) = api
        .patch(&name, &PatchParams::default(), &Patch::Merge(patch))
        .await
    {
        error!("Error cordoning node during drain {}: {:?}", name, err);
        return StatusCode::INTERNAL_SERVER_ERROR.into_response();
    }

    // Then drain via kubectl
    let mut drain_cmd = SysCommand::new("kubectl");
    if let Some(ctx) = active_kube_context() {
        drain_cmd.arg("--context").arg(ctx);
    }
    let output = drain_cmd
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
    let discovery = match Discovery::new(state.kube_client().await).run().await {
        Ok(d) => d,
        Err(err) => {
            let is_transient_discovery_failure = match &err {
                kube::Error::Api(api_err) => api_err.code == 503,
                _ => {
                    let normalized = err.to_string().to_lowercase();
                    normalized.contains("service unavailable")
                        || normalized.contains("status code 503")
                        || normalized.contains("status code: 503")
                }
            };

            if is_transient_discovery_failure {
                warn!("API discovery temporarily unavailable: {:?}", err);
                return (
                    StatusCode::SERVICE_UNAVAILABLE,
                    Json(serde_json::json!({
                        "success": false,
                        "message": "Kubernetes API temporarily unavailable (503). Please retry."
                    })),
                )
                    .into_response();
            }

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
        let api: Api<DynamicObject> = Api::namespaced_with(state.kube_client().await, ns, &ar);
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
                let (status, message) = map_apply_error(&err);
                (
                    status,
                    Json(serde_json::json!({
                        "success": false,
                        "message": format!("Failed to apply resource: {}", message)
                    })),
                )
                    .into_response()
            }
        }
    } else {
        let api: Api<DynamicObject> = Api::all_with(state.kube_client().await, &ar);
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
                let (status, message) = map_apply_error(&err);
                (
                    status,
                    Json(serde_json::json!({
                        "success": false,
                        "message": format!("Failed to apply resource: {}", message)
                    })),
                )
                    .into_response()
            }
        }
    }
}
