use axum::{
    extract::{Query, State},
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use k8s_openapi::api::apps::v1::{DaemonSet, Deployment, ReplicaSet, StatefulSet};
use k8s_openapi::api::batch::v1::Job;
use k8s_openapi::api::core::v1::{Pod, Service};
use k8s_openapi::api::networking::v1::Ingress;
use kube::{api::ListParams, Api};
use serde::Deserialize;
use std::collections::HashMap;
use tracing::error;

use crate::{
    models::{ResourceMapData, ResourceMapEdge, ResourceMapNode},
    AppState,
};

#[derive(Deserialize)]
pub struct ResourceMapQuery {
    pub namespace: Option<String>,
}

pub async fn get_resource_map(
    State(state): State<AppState>,
    Query(params): Query<ResourceMapQuery>,
) -> impl IntoResponse {
    let client = state.client.clone();

    let pods_api: Api<Pod> = Api::all(client.clone());
    let deployments_api: Api<Deployment> = Api::all(client.clone());
    let rs_api: Api<ReplicaSet> = Api::all(client.clone());
    let ss_api: Api<StatefulSet> = Api::all(client.clone());
    let ds_api: Api<DaemonSet> = Api::all(client.clone());
    let svc_api: Api<Service> = Api::all(client.clone());
    let ing_api: Api<Ingress> = Api::all(client.clone());
    let job_api: Api<Job> = Api::all(client.clone());

    let lp = ListParams::default();

    let (pods_r, deps_r, rs_r, ss_r, ds_r, svc_r, ing_r, job_r) = tokio::join!(
        pods_api.list(&lp),
        deployments_api.list(&lp),
        rs_api.list(&lp),
        ss_api.list(&lp),
        ds_api.list(&lp),
        svc_api.list(&lp),
        ing_api.list(&lp),
        job_api.list(&lp),
    );

    macro_rules! unwrap_list {
        ($result:expr, $resource:literal) => {
            match $result {
                Ok(l) => l.items,
                Err(e) => {
                    error!("Failed to fetch {}: {e}", $resource);
                    return (
                        StatusCode::INTERNAL_SERVER_ERROR,
                        Json(serde_json::json!({"error": format!("Failed to fetch {}", $resource)})),
                    )
                        .into_response();
                }
            }
        };
    }

    let pods = unwrap_list!(pods_r, "pods");
    let deps = unwrap_list!(deps_r, "deployments");
    let rsets = unwrap_list!(rs_r, "replicasets");
    let ssets = unwrap_list!(ss_r, "statefulsets");
    let dsets = unwrap_list!(ds_r, "daemonsets");
    let services = unwrap_list!(svc_r, "services");
    let ingresses = unwrap_list!(ing_r, "ingresses");
    let jobs = unwrap_list!(job_r, "jobs");

    // Parse namespace filter: comma-separated list
    let ns_list: Option<Vec<&str>> = params
        .namespace
        .as_deref()
        .filter(|s| !s.is_empty())
        .map(|s| s.split(',').map(str::trim).filter(|s| !s.is_empty()).collect());

    let in_ns = |ns: &str| -> bool {
        match &ns_list {
            None => true,
            Some(filters) => filters.contains(&ns),
        }
    };

    let mut nodes: Vec<ResourceMapNode> = Vec::new();
    let mut edges: Vec<ResourceMapEdge> = Vec::new();

    // ── Pods ──────────────────────────────────────────────────────────────────
    for pod in &pods {
        let name = pod.metadata.name.as_deref().unwrap_or_default();
        let ns = pod.metadata.namespace.as_deref().unwrap_or("default");
        if !in_ns(ns) {
            continue;
        }

        let phase = pod
            .status
            .as_ref()
            .and_then(|s| s.phase.as_deref())
            .unwrap_or("Unknown")
            .to_string();

        nodes.push(ResourceMapNode {
            id: format!("pod/{ns}/{name}"),
            kind: "Pod".into(),
            name: name.into(),
            namespace: Some(ns.into()),
            status: phase,
        });

        // Pod ← ownerReference edges
        if let Some(owners) = pod.metadata.owner_references.as_ref() {
            for owner in owners {
                let owner_id = match owner.kind.as_str() {
                    "ReplicaSet" => format!("replicaset/{ns}/{}", owner.name),
                    "StatefulSet" => format!("statefulset/{ns}/{}", owner.name),
                    "DaemonSet" => format!("daemonset/{ns}/{}", owner.name),
                    "Job" => format!("job/{ns}/{}", owner.name),
                    _ => continue,
                };
                edges.push(ResourceMapEdge {
                    source: owner_id,
                    target: format!("pod/{ns}/{name}"),
                    edge_type: "owns".into(),
                });
            }
        }
    }

    // ── Deployments ───────────────────────────────────────────────────────────
    for dep in &deps {
        let name = dep.metadata.name.as_deref().unwrap_or_default();
        let ns = dep.metadata.namespace.as_deref().unwrap_or("default");
        if !in_ns(ns) {
            continue;
        }

        let available = dep
            .status
            .as_ref()
            .and_then(|s| s.available_replicas)
            .unwrap_or(0);
        let desired = dep.spec.as_ref().and_then(|s| s.replicas).unwrap_or(1);
        let status = if available >= desired { "ready" } else { "degraded" };

        nodes.push(ResourceMapNode {
            id: format!("deployment/{ns}/{name}"),
            kind: "Deployment".into(),
            name: name.into(),
            namespace: Some(ns.into()),
            status: status.into(),
        });
    }

    // ── ReplicaSets ───────────────────────────────────────────────────────────
    for rs in &rsets {
        let name = rs.metadata.name.as_deref().unwrap_or_default();
        let ns = rs.metadata.namespace.as_deref().unwrap_or("default");
        if !in_ns(ns) {
            continue;
        }

        let ready = rs
            .status
            .as_ref()
            .and_then(|s| s.ready_replicas)
            .unwrap_or(0);
        let desired = rs.spec.as_ref().and_then(|s| s.replicas).unwrap_or(0);
        // Skip old rollout revisions with 0 desired replicas
        if desired == 0 && ready == 0 {
            continue;
        }

        let status = if ready >= desired { "ready" } else { "degraded" };

        nodes.push(ResourceMapNode {
            id: format!("replicaset/{ns}/{name}"),
            kind: "ReplicaSet".into(),
            name: name.into(),
            namespace: Some(ns.into()),
            status: status.into(),
        });

        // ReplicaSet ← Deployment owner edge
        if let Some(owners) = rs.metadata.owner_references.as_ref() {
            for owner in owners {
                if owner.kind == "Deployment" {
                    edges.push(ResourceMapEdge {
                        source: format!("deployment/{ns}/{}", owner.name),
                        target: format!("replicaset/{ns}/{name}"),
                        edge_type: "owns".into(),
                    });
                }
            }
        }
    }

    // ── StatefulSets ──────────────────────────────────────────────────────────
    for ss in &ssets {
        let name = ss.metadata.name.as_deref().unwrap_or_default();
        let ns = ss.metadata.namespace.as_deref().unwrap_or("default");
        if !in_ns(ns) {
            continue;
        }

        let ready = ss
            .status
            .as_ref()
            .and_then(|s| s.ready_replicas)
            .unwrap_or(0);
        let desired = ss.spec.as_ref().and_then(|s| s.replicas).unwrap_or(1);
        let status = if ready >= desired { "ready" } else { "degraded" };

        nodes.push(ResourceMapNode {
            id: format!("statefulset/{ns}/{name}"),
            kind: "StatefulSet".into(),
            name: name.into(),
            namespace: Some(ns.into()),
            status: status.into(),
        });
    }

    // ── DaemonSets ────────────────────────────────────────────────────────────
    for ds in &dsets {
        let name = ds.metadata.name.as_deref().unwrap_or_default();
        let ns = ds.metadata.namespace.as_deref().unwrap_or("default");
        if !in_ns(ns) {
            continue;
        }

        let ready = ds.status.as_ref().map(|s| s.number_ready).unwrap_or(0);
        let desired = ds
            .status
            .as_ref()
            .map(|s| s.desired_number_scheduled)
            .unwrap_or(0);
        let status = if ready >= desired { "ready" } else { "degraded" };

        nodes.push(ResourceMapNode {
            id: format!("daemonset/{ns}/{name}"),
            kind: "DaemonSet".into(),
            name: name.into(),
            namespace: Some(ns.into()),
            status: status.into(),
        });
    }

    // ── Jobs ──────────────────────────────────────────────────────────────────
    for job in &jobs {
        let name = job.metadata.name.as_deref().unwrap_or_default();
        let ns = job.metadata.namespace.as_deref().unwrap_or("default");
        if !in_ns(ns) {
            continue;
        }

        // Skip CronJob-owned jobs to reduce graph clutter
        if job
            .metadata
            .owner_references
            .as_ref()
            .map(|owners| owners.iter().any(|o| o.kind == "CronJob"))
            .unwrap_or(false)
        {
            continue;
        }

        let succeeded = job
            .status
            .as_ref()
            .and_then(|s| s.succeeded)
            .unwrap_or(0);
        let failed = job.status.as_ref().and_then(|s| s.failed).unwrap_or(0);
        let active = job.status.as_ref().and_then(|s| s.active).unwrap_or(0);

        let status = if succeeded > 0 {
            "completed"
        } else if failed > 0 {
            "failed"
        } else if active > 0 {
            "running"
        } else {
            "pending"
        };

        nodes.push(ResourceMapNode {
            id: format!("job/{ns}/{name}"),
            kind: "Job".into(),
            name: name.into(),
            namespace: Some(ns.into()),
            status: status.into(),
        });
    }

    // ── Services ──────────────────────────────────────────────────────────────
    for svc in &services {
        let name = svc.metadata.name.as_deref().unwrap_or_default();
        let ns = svc.metadata.namespace.as_deref().unwrap_or("default");
        if !in_ns(ns) {
            continue;
        }
        // Skip the built-in kubernetes service
        if name == "kubernetes" && ns == "default" {
            continue;
        }

        let selector: HashMap<String, String> = svc
            .spec
            .as_ref()
            .and_then(|s| s.selector.as_ref())
            .map(|sel| sel.iter().map(|(k, v)| (k.clone(), v.clone())).collect())
            .unwrap_or_default();

        // Skip headless / externalName services without pod selectors
        if selector.is_empty() {
            continue;
        }

        nodes.push(ResourceMapNode {
            id: format!("service/{ns}/{name}"),
            kind: "Service".into(),
            name: name.into(),
            namespace: Some(ns.into()),
            status: "active".into(),
        });

        // Service → Pod selector-based edges
        for pod in &pods {
            let pod_ns = pod.metadata.namespace.as_deref().unwrap_or("default");
            if pod_ns != ns {
                continue;
            }
            let pod_name = pod.metadata.name.as_deref().unwrap_or_default();
            let pod_labels: HashMap<String, String> = pod
                .metadata
                .labels
                .as_ref()
                .map(|l| l.iter().map(|(k, v)| (k.clone(), v.clone())).collect())
                .unwrap_or_default();

            if selector.iter().all(|(k, v)| pod_labels.get(k) == Some(v)) {
                edges.push(ResourceMapEdge {
                    source: format!("service/{ns}/{name}"),
                    target: format!("pod/{pod_ns}/{pod_name}"),
                    edge_type: "selects".into(),
                });
            }
        }
    }

    // ── Ingresses ─────────────────────────────────────────────────────────────
    for ing in &ingresses {
        let name = ing.metadata.name.as_deref().unwrap_or_default();
        let ns = ing.metadata.namespace.as_deref().unwrap_or("default");
        if !in_ns(ns) {
            continue;
        }

        nodes.push(ResourceMapNode {
            id: format!("ingress/{ns}/{name}"),
            kind: "Ingress".into(),
            name: name.into(),
            namespace: Some(ns.into()),
            status: "active".into(),
        });

        // Ingress → Service edges (via backend service references)
        if let Some(spec) = &ing.spec {
            if let Some(rules) = &spec.rules {
                for rule in rules {
                    if let Some(http) = &rule.http {
                        for path in &http.paths {
                            if let Some(svc_backend) = &path.backend.service {
                                edges.push(ResourceMapEdge {
                                    source: format!("ingress/{ns}/{name}"),
                                    target: format!("service/{ns}/{}", svc_backend.name),
                                    edge_type: "routes".into(),
                                });
                            }
                        }
                    }
                }
            }
        }
    }

    // Deduplicate edges (same source→target may appear multiple times for Ingress path rules)
    edges.sort_by(|a, b| a.source.cmp(&b.source).then(a.target.cmp(&b.target)));
    edges.dedup_by(|a, b| a.source == b.source && a.target == b.target);

    Json(ResourceMapData { nodes, edges }).into_response()
}
