use axum::{
    http::{Request, StatusCode, Uri},
    response::{IntoResponse, Response},
    Json,
};
use futures_util::future::join_all;
use kube::{
    config::{KubeConfigOptions, Kubeconfig},
    api::ListParams,
    core::{ApiResource, DynamicObject, GroupVersionKind},
    Api, Client, Config,
};
use std::collections::HashMap;
use std::env;
use std::sync::atomic::{AtomicBool, Ordering};
use tokio::time::{timeout, Duration};
use tracing::warn;

static NODE_DISK_METRICS_SUPPORTED: AtomicBool = AtomicBool::new(true);

fn is_kubelet_stats_proxy_unavailable(err: &kube::Error) -> bool {
    match err {
        kube::Error::Api(api_err) => api_err.code == 403 || api_err.code == 404 || api_err.code == 503,
        _ => {
            // Some clusters/proxies return plain-text 404 responses ("404 page not found")
            // that kube-rs cannot parse into an API error payload.
            let normalized = err.to_string().to_lowercase();
            normalized.contains("404 page not found")
                || normalized.contains("status code 404")
                || normalized.contains("status code: 404")
                || normalized.contains("status code 403")
                || normalized.contains("status code: 403")
                || normalized.contains("status code 503")
                || normalized.contains("status code: 503")
                || normalized.contains("service unavailable")
        }
    }
}

#[derive(Clone, Debug, Default)]
pub struct KubeClientStatus {
    pub is_placeholder: bool,
    pub user_message: Option<String>,
}

fn has_accessible_kubeconfig() -> bool {
    let configured_paths = env::var("KUBECONFIG")
        .ok()
        .map(|raw| {
            raw.split(':')
                .map(str::trim)
                .filter(|segment| !segment.is_empty())
                .map(std::path::PathBuf::from)
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();

    if !configured_paths.is_empty() {
        return configured_paths.iter().any(|path| path.exists());
    }

    match env::var("HOME") {
        Ok(home) if !home.trim().is_empty() => {
            std::path::PathBuf::from(home).join(".kube/config").exists()
        }
        _ => false,
    }
}

fn default_placeholder_user_message() -> String {
    let has_incluster_env = env::var("KUBERNETES_SERVICE_HOST").is_ok()
        && env::var("KUBERNETES_SERVICE_PORT").is_ok();

    if !has_incluster_env && !has_accessible_kubeconfig() {
        return "No Kubernetes cluster configuration found. Add a kubeconfig at ~/.kube/config or set KUBECONFIG, then restart the app.".to_string();
    }

    "Kubernetes credentials are not available. Check your kubeconfig/context and re-authenticate, then restart the app.".to_string()
}

pub fn kube_list_warning_response(resource_name: &str, err: &kube::Error) -> Option<Response> {
    if let kube::Error::Api(api_err) = err {
        if api_err.code == 403 || api_err.code == 404 {
            let warning = if api_err.code == 403 {
                format!(
                    "Limited access: no permission to list {}. The app will continue without this resource.",
                    resource_name
                )
            } else {
                format!(
                    "{} is unavailable in this cluster. The app will continue without this resource.",
                    resource_name
                )
            };

            warn!(
                "{} API unavailable or forbidden (code {}): {}",
                resource_name,
                api_err.code,
                api_err.message
            );

            return Some(
                (
                    StatusCode::OK,
                    Json(serde_json::json!({
                        "data": [],
                        "total": 0,
                        "warnings": [warning],
                    })),
                )
                    .into_response(),
            );
        }
    }

    None
}

#[derive(Clone, Copy, Debug)]
pub struct NodeDiskMetrics {
    pub used_bytes: f64,
    pub capacity_bytes: f64,
}

/// Convenience wrapper for handlers/websocket code that only needs the client.
pub async fn load_kube_client() -> anyhow::Result<Client> {
    load_kube_client_with_status().await.map(|(c, _)| c)
}

/// Returns `(client, status)`.
/// `status.is_placeholder = true` means credentials/configuration were not available at startup.
pub async fn load_kube_client_with_status() -> anyhow::Result<(Client, KubeClientStatus)> {
    let context = env::var("KUBE_CONTEXT").ok().filter(|s| !s.trim().is_empty());

    if let Some(ref ctx) = context {
        let options = KubeConfigOptions {
            context: Some(ctx.clone()),
            ..Default::default()
        };
        // Exec-credential plugins (kubectl-oidc-login, omnictl, aws eks get-token,
        // kubelogin, gke-gcloud-auth-plugin, etc.) are invoked eagerly by kube-rs
        // during config loading. They may fail immediately (OIDC server down, 502,
        // connection refused) or hang. Either way we must NOT let the error propagate
        // to main() — the HTTP server must start so the Tauri sidecar health probe
        // passes and the cluster switch is not rolled back.
        match tokio::time::timeout(
            std::time::Duration::from_secs(8),
            Config::from_kubeconfig(&options),
        )
        .await
        {
            Ok(Ok(cfg)) => match Client::try_from(cfg) {
                Ok(c) => return Ok((c, KubeClientStatus::default())),
                Err(e) => warn!(
                    "Kubernetes client build failed for context '{}': {}. \
                     Starting with placeholder client.",
                    ctx, e
                ),
            },
            Ok(Err(e)) => warn!(
                "Kubeconfig load failed for context '{}': {}. \
                 Exec credential may be unavailable (OIDC server down, plugin missing, etc.). \
                 Starting with placeholder client — API calls will fail with auth errors \
                 until credentials are available.",
                ctx, e
            ),
            Err(_) => warn!(
                "Kubeconfig load timed out (>8 s) for context '{}'. \
                 Exec credential plugin is slow or unresponsive. \
                 Starting with placeholder client.",
                ctx
            ),
        }

        // Exec credential failed. Build a client from the same kubeconfig but with
        // the exec plugin stripped out. The server starts, health probes pass, and
        // API calls return 401/403 until the user's credentials are working.
        return build_placeholder_client(Some(ctx)).await.map(|c| {
            (
                c,
                KubeClientStatus {
                    is_placeholder: true,
                    user_message: Some(default_placeholder_user_message()),
                },
            )
        });
    }

    // No explicit KUBE_CONTEXT — use system default; fall back to placeholder on failure.
    match Client::try_default().await {
        Ok(c) => Ok((c, KubeClientStatus::default())),
        Err(e) => {
            warn!(
                "Default Kubernetes client init failed ({}). \
                 Starting with placeholder client.",
                e
            );
            build_placeholder_client(None).await.map(|c| {
                (
                    c,
                    KubeClientStatus {
                        is_placeholder: true,
                        user_message: Some(default_placeholder_user_message()),
                    },
                )
            })
        }
    }
}

/// Build a Kubernetes client that points at the correct API server but carries NO auth
/// credentials. All API calls will return 401/403 until credentials are available.
///
/// This function parses the kubeconfig file WITHOUT invoking exec-credential plugins,
/// strips the exec entry from the user auth info, and builds the client from that.
/// It exists solely to let the HTTP server start and respond to health probes even
/// when exec credential plugins are temporarily unavailable.
async fn build_placeholder_client(context_name: Option<&str>) -> anyhow::Result<Client> {
    let kubeconfig_path = env::var("KUBECONFIG")
        .ok()
        .map(|s| std::path::PathBuf::from(s.trim().to_string()))
        .filter(|p| p.exists());

    let mut kubeconfig = match kubeconfig_path {
        Some(ref path) => Kubeconfig::read_from(path)
            .or_else(|_| Kubeconfig::read()),
        None => Kubeconfig::read(),
    };

    if let Ok(ref mut kc) = kubeconfig {
        // Find the user entry for the target context and strip exec credentials
        // so Config::from_custom_kubeconfig won't invoke the plugin.
        let user_name: Option<String> = {
            let ctx_name = context_name
                .or_else(|| kc.current_context.as_deref());
            ctx_name.and_then(|n| {
                kc.contexts
                    .iter()
                    .find(|c| c.name == n)
                    .and_then(|c| c.context.as_ref())
                    .map(|c| c.user.clone())
            })
        };

        if let Some(ref uname) = user_name {
            for named_auth in &mut kc.auth_infos {
                if named_auth.name == *uname {
                    if let Some(ref mut ai) = named_auth.auth_info {
                        ai.exec = None;
                    }
                }
            }
        }

        let options = KubeConfigOptions {
            context: context_name.map(String::from),
            ..Default::default()
        };

        if let Ok(mut cfg) = Config::from_custom_kubeconfig(kc.clone(), &options).await {
            // Skip TLS validation on the placeholder — the real token is absent anyway.
            cfg.accept_invalid_certs = true;
            if let Ok(client) = Client::try_from(cfg) {
                warn!(
                    "Started backend with UNAUTHENTICATED placeholder client for context '{}'. \
                     All Kubernetes API calls will return auth errors until credentials are valid.",
                    context_name.unwrap_or("<default>")
                );
                return Ok(client);
            }
        }
    }

    // Absolute last resort: point at localhost. The server starts and health probes pass;
    // every API call will fail with a connection error shown in the UI.
    let uri = "http://127.0.0.1:6443"
        .parse::<Uri>()
        .expect("hardcoded valid URI");
    let cfg = Config::new(uri);
    let client = Client::try_from(cfg)
        .map_err(|e| anyhow::anyhow!("Fallback placeholder client creation failed: {}", e))?;
    warn!(
        "Started backend with minimal localhost placeholder client for context '{}'. \
         All API calls will fail.",
        context_name.unwrap_or("<default>")
    );
    Ok(client)
}

pub fn format_compact_duration(seconds: i64) -> String {
    if seconds < 60 {
        return format!("{}s", seconds);
    }

    if seconds < 3600 {
        return format!("{}m", seconds / 60);
    }

    if seconds < 86_400 {
        return format!("{}h", seconds / 3600);
    }

    format!("{}d", seconds / 86_400)
}

pub fn parse_cpu_millicores(value: &str) -> Option<f64> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return None;
    }

    // Handle millicore format: "5m" -> 5
    if let Some(number) = trimmed.strip_suffix('m') {
        return number.parse::<f64>().ok();
    }

    // Handle nanosecond format: "1063320n" -> 1.06332 millicores
    if let Some(number) = trimmed.strip_suffix('n') {
        return number.parse::<f64>().ok().map(|nanos| nanos / 1_000_000.0);
    }

    // Handle microsecond format: "1234u" -> 1.234 millicores
    if let Some(number) = trimmed.strip_suffix('u') {
        return number.parse::<f64>().ok().map(|micros| micros / 1000.0);
    }

    // Handle raw cores: "0.5" -> 500 millicores
    trimmed.parse::<f64>().ok().map(|cores| cores * 1000.0)
}

pub fn parse_memory_bytes(value: &str) -> Option<f64> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return None;
    }

    let unit_start = trimmed
        .find(|char: char| !char.is_ascii_digit() && char != '.')
        .unwrap_or(trimmed.len());

    let (number_part, unit_part) = trimmed.split_at(unit_start);
    let number = number_part.parse::<f64>().ok()?;

    let factor = match unit_part {
        "" => 1.0,
        "Ki" => 1024.0,
        "Mi" => 1024.0_f64.powi(2),
        "Gi" => 1024.0_f64.powi(3),
        "Ti" => 1024.0_f64.powi(4),
        "K" | "k" => 1000.0,
        "M" => 1000.0_f64.powi(2),
        "G" => 1000.0_f64.powi(3),
        "T" => 1000.0_f64.powi(4),
        "n" => 1.0 / 1_000_000_000.0,
        "u" => 1.0 / 1_000_000.0,
        "m" => 1.0 / 1000.0,
        _ => return None,
    };

    Some(number * factor)
}

pub fn format_millicores(value: f64) -> String {
    if value < 1000.0 {
        return format!("{}m", value.round() as i64);
    }

    let cores = value / 1000.0;
    if (cores.fract()).abs() < f64::EPSILON {
        format!("{}", cores as i64)
    } else {
        format!("{cores:.2}").trim_end_matches('0').trim_end_matches('.').to_string()
    }
}

pub fn format_binary_bytes(bytes: f64) -> String {
    let units = ["B", "Ki", "Mi", "Gi", "Ti"];
    let mut value = bytes;
    let mut index = 0;

    while value >= 1024.0 && index < units.len() - 1 {
        value /= 1024.0;
        index += 1;
    }

    if value >= 10.0 {
        format!("{value:.0}{}", units[index])
    } else {
        format!("{value:.1}{}", units[index]).replace(".0", "")
    }
}

pub async fn fetch_pod_metrics(client: Client) -> HashMap<(String, String), (String, String)> {
    let mut metrics_map: HashMap<(String, String), (String, String)> = HashMap::new();

    let pod_metrics_resource =
        ApiResource::from_gvk(&GroupVersionKind::gvk("metrics.k8s.io", "v1beta1", "PodMetrics"));
    let metrics_api: Api<DynamicObject> = Api::all_with(client, &pod_metrics_resource);

    let metrics_list = match metrics_api.list(&ListParams::default()).await {
        Ok(list) => list,
        Err(_) => return metrics_map,
    };

    for metric in metrics_list.items {
        let namespace = metric.metadata.namespace.clone().unwrap_or_default();
        let name = metric.metadata.name.clone().unwrap_or_default();
        if namespace.is_empty() || name.is_empty() {
            continue;
        }

        let metric_value = match serde_json::to_value(&metric) {
            Ok(value) => value,
            Err(_) => continue,
        };

        let containers = match metric_value.get("containers").and_then(|value| value.as_array()) {
            Some(containers) => containers,
            None => continue,
        };

        let mut cpu_millicores_total = 0.0;
        let mut memory_bytes_total = 0.0;
        let mut has_cpu = false;
        let mut has_memory = false;

        for container in containers {
            if let Some(cpu_value) = container
                .get("usage")
                .and_then(|value| value.get("cpu"))
                .and_then(|value| value.as_str())
                .and_then(parse_cpu_millicores)
            {
                has_cpu = true;
                cpu_millicores_total += cpu_value;
            }

            if let Some(memory_value) = container
                .get("usage")
                .and_then(|value| value.get("memory"))
                .and_then(|value| value.as_str())
                .and_then(parse_memory_bytes)
            {
                has_memory = true;
                memory_bytes_total += memory_value;
            }
        }

        let cpu = if has_cpu {
            format_millicores(cpu_millicores_total)
        } else {
            "-".to_string()
        };

        let memory = if has_memory {
            format_binary_bytes(memory_bytes_total)
        } else {
            "-".to_string()
        };

        metrics_map.insert((namespace, name), (cpu, memory));
    }

    metrics_map
}

pub async fn fetch_node_metrics(client: Client) -> HashMap<String, (String, String)> {
    let mut metrics_map: HashMap<String, (String, String)> = HashMap::new();

    let node_metrics_resource =
        ApiResource::from_gvk(&GroupVersionKind::gvk("metrics.k8s.io", "v1beta1", "NodeMetrics"));
    let metrics_api: Api<DynamicObject> = Api::all_with(client, &node_metrics_resource);

    let metrics_list = match metrics_api.list(&ListParams::default()).await {
        Ok(list) => list,
        Err(_) => return metrics_map,
    };

    for metric in metrics_list.items {
        let name = metric.metadata.name.clone().unwrap_or_default();
        if name.is_empty() {
            continue;
        }

        let metric_value = match serde_json::to_value(&metric) {
            Ok(value) => value,
            Err(_) => continue,
        };

        let cpu = metric_value
            .get("usage")
            .and_then(|value| value.get("cpu"))
            .and_then(|value| value.as_str())
            .and_then(parse_cpu_millicores)
            .map(format_millicores)
            .unwrap_or_else(|| "-".to_string());

        let memory = metric_value
            .get("usage")
            .and_then(|value| value.get("memory"))
            .and_then(|value| value.as_str())
            .and_then(parse_memory_bytes)
            .map(format_binary_bytes)
            .unwrap_or_else(|| "-".to_string());

        metrics_map.insert(name, (cpu, memory));
    }

    metrics_map
}

pub async fn fetch_node_disk_metrics(
    client: Client,
    node_names: &[String],
) -> HashMap<String, NodeDiskMetrics> {
    if node_names.is_empty() || !NODE_DISK_METRICS_SUPPORTED.load(Ordering::Relaxed) {
        return HashMap::new();
    }

    let Some(first_name) = node_names.first().cloned() else {
        return HashMap::new();
    };

    let fetch_summary = |client: Client, name: String| async move {
        let request = match Request::get(format!("/api/v1/nodes/{name}/proxy/stats/summary"))
            .body(Vec::new())
        {
            Ok(request) => request,
            Err(_) => return Ok(None),
        };

        // Timeout individual node requests to 2 seconds to prevent slow/unresponsive kubelets from blocking list
        let summary = match timeout(
            Duration::from_secs(2),
            client.request::<serde_json::Value>(request)
        ).await {
            Ok(Ok(summary)) => summary,
            Ok(Err(err)) if is_kubelet_stats_proxy_unavailable(&err) => {
                NODE_DISK_METRICS_SUPPORTED.store(false, Ordering::Relaxed);
                warn!(
                    "Disabling node disk metrics collection because kubelet stats proxy is unavailable: {}",
                    err
                );
                return Err(());
            }
            Ok(Err(_)) => return Ok(None),
            Err(_) => return Ok(None), // Timeout — skip this node's disk metrics
        };

        let fs = match summary.get("node").and_then(|node| node.get("fs")) {
            Some(fs) => fs,
            None => return Ok(None),
        };
        let used_bytes = match fs
            .get("usedBytes")
            .and_then(|value| value.as_f64().or_else(|| value.as_u64().map(|value| value as f64)))
        {
            Some(value) => value,
            None => return Ok(None),
        };
        let capacity_bytes = fs
            .get("capacityBytes")
            .and_then(|value| value.as_f64().or_else(|| value.as_u64().map(|value| value as f64)))
            .unwrap_or(0.0);

        Ok(Some((
            name,
            NodeDiskMetrics {
                used_bytes,
                capacity_bytes,
            },
        )))
    };

    let first_result = match fetch_summary(client.clone(), first_name).await {
        Ok(result) => result,
        Err(()) => return HashMap::new(),
    };

    let mut responses = Vec::new();
    if let Some(item) = first_result {
        responses.push(item);
    }

    let remaining_responses = join_all(node_names.iter().skip(1).cloned().map(|name| {
        let client = client.clone();
        async move { fetch_summary(client, name).await.ok().flatten() }
    }))
    .await;

    responses.extend(remaining_responses.into_iter().flatten());
    responses.into_iter().collect()
}
