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
use std::fs;
use std::collections::HashMap;
use std::env;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};
use tokio::time::{timeout, Duration};
use tracing::warn;

/// Unix timestamp (secs) until which metrics probes are skipped. 0 = allowed.
static POD_METRICS_RETRY_AFTER: AtomicU64 = AtomicU64::new(0);
static NODE_METRICS_RETRY_AFTER: AtomicU64 = AtomicU64::new(0);
static NODE_DISK_METRICS_RETRY_AFTER: AtomicU64 = AtomicU64::new(0);
const METRICS_RETRY_COOLDOWN_SECS: u64 = 30;
/// RBAC denials rarely change without a context/credential switch — avoid log spam.
const METRICS_FORBIDDEN_COOLDOWN_SECS: u64 = 600;
const EXEC_PROVIDER_LOAD_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(25);
const EXEC_PROVIDER_RESOLVE_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(8);
const EXEC_PROVIDER_BACKGROUND_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(60);

fn now_unix_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or(0)
}

fn metrics_probe_allowed(retry_after: &AtomicU64) -> bool {
    let until = retry_after.load(Ordering::Relaxed);
    until == 0 || now_unix_secs() >= until
}

fn disable_metrics_temporarily(retry_after: &AtomicU64, kind: &str, err: &kube::Error) {
    disable_metrics_for(retry_after, kind, err, METRICS_RETRY_COOLDOWN_SECS);
}

fn disable_metrics_for(retry_after: &AtomicU64, kind: &str, err: &kube::Error, cooldown_secs: u64) {
    let now = now_unix_secs();
    let until = now.saturating_add(cooldown_secs);
    let previous = retry_after.swap(until, Ordering::Relaxed);
    if previous == 0 || previous <= now {
        warn!(
            "Temporarily disabling {} metrics for {}s: {}",
            kind, cooldown_secs, err
        );
    }
}

fn clear_metrics_disable(retry_after: &AtomicU64) {
    retry_after.store(0, Ordering::Relaxed);
}

fn is_api_forbidden(err: &kube::Error) -> bool {
    match err {
        kube::Error::Api(api_err) => api_err.code == 403,
        _ => {
            let normalized = err.to_string().to_lowercase();
            normalized.contains("forbidden")
                || normalized.contains("status code 403")
                || normalized.contains("status code: 403")
        }
    }
}

fn is_metrics_api_unavailable(err: &kube::Error) -> bool {
    match err {
        kube::Error::Api(api_err) => api_err.code == 404 || api_err.code == 403,
        _ => {
            let normalized = err.to_string().to_lowercase();
            normalized.contains("404 page not found")
                || normalized.contains("status code 404")
                || normalized.contains("status code: 404")
                || normalized.contains("status code 403")
                || normalized.contains("status code: 403")
                || normalized.contains("forbidden")
        }
    }
}

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

fn kubeconfig_file_exists_in_dir(dir: &std::path::Path, remaining_depth: usize) -> bool {
    if remaining_depth == 0 || !dir.is_dir() {
        return false;
    }
    let Ok(entries) = std::fs::read_dir(dir) else {
        return false;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            let name = path
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or_default()
                .to_ascii_lowercase();
            if name.starts_with('.') || matches!(name.as_str(), "cache" | "http-cache" | "discovery") {
                continue;
            }
            if kubeconfig_file_exists_in_dir(&path, remaining_depth - 1) {
                return true;
            }
            continue;
        }
        let file_name = path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or_default()
            .to_ascii_lowercase();
        let ext = path
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("")
            .to_ascii_lowercase();
        if file_name == "config"
            || ext == "yaml"
            || ext == "yml"
            || ext == "kubeconfig"
            || file_name.contains("kubeconfig")
        {
            return true;
        }
    }
    false
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
        return configured_paths.iter().any(|path| {
            path.is_file() || (path.is_dir() && kubeconfig_file_exists_in_dir(path, 3))
        });
    }

    match env::var("HOME") {
        Ok(home) if !home.trim().is_empty() => {
            kubeconfig_file_exists_in_dir(&std::path::PathBuf::from(home).join(".kube"), 4)
        }
        _ => false,
    }
}

fn default_placeholder_user_message() -> String {
    let has_incluster_env = env::var("KUBERNETES_SERVICE_HOST").is_ok()
        && env::var("KUBERNETES_SERVICE_PORT").is_ok();

    if !has_incluster_env && !has_accessible_kubeconfig() {
        return "No Kubernetes cluster configuration found. Add a kubeconfig under ~/.kube (including subfolders) or set KUBECONFIG, then restart the app.".to_string();
    }

    "Kubernetes credentials are not available. Check your kubeconfig/context and re-authenticate, then restart the app.".to_string()
}

fn is_executable_file(path: &Path) -> bool {
    let Ok(metadata) = fs::metadata(path) else {
        return false;
    };
    if !metadata.is_file() {
        return false;
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        metadata.permissions().mode() & 0o111 != 0
    }
    #[cfg(not(unix))]
    {
        true
    }
}

fn resolve_exec_command_path(command: &str) -> Option<String> {
    let cmd = command.trim();
    if cmd.is_empty() {
        return None;
    }

    if cmd.contains('/') {
        let p = PathBuf::from(cmd);
        return is_executable_file(&p).then(|| p.to_string_lossy().to_string());
    }

    let mut search_paths: Vec<PathBuf> = env::var_os("PATH")
        .map(|raw| env::split_paths(&raw).collect())
        .unwrap_or_default();

    for candidate in [
        "/opt/homebrew/bin",
        "/usr/local/bin",
        "/usr/bin",
        "/bin",
        "/usr/sbin",
        "/sbin",
    ] {
        let p = PathBuf::from(candidate);
        if !search_paths.iter().any(|existing| existing == &p) {
            search_paths.push(p);
        }
    }

    if let Ok(home) = env::var("HOME") {
        let local = PathBuf::from(&home).join(".local/bin");
        if !search_paths.iter().any(|existing| existing == &local) {
            search_paths.push(local);
        }
        let gcloud = PathBuf::from(home).join("google-cloud-sdk/bin");
        if !search_paths.iter().any(|existing| existing == &gcloud) {
            search_paths.push(gcloud);
        }
    }

    for dir in search_paths {
        let candidate = dir.join(cmd);
        if is_executable_file(&candidate) {
            return Some(candidate.to_string_lossy().to_string());
        }
    }

    if cmd == "kubectl" {
        for candidate in [
            "/usr/local/bin/kubectl",
            "/opt/homebrew/bin/kubectl",
            "/Applications/OrbStack.app/Contents/MacOS/xbin/kubectl",
            "/Applications/Rancher Desktop.app/Contents/Resources/resources/darwin/bin/kubectl",
            "/Applications/Docker.app/Contents/Resources/bin/kubectl",
        ] {
            let p = PathBuf::from(candidate);
            if is_executable_file(&p) {
                return Some(p.to_string_lossy().to_string());
            }
        }
    }

    None
}

fn read_effective_kubeconfig() -> anyhow::Result<Kubeconfig> {
    let configured_paths = env::var_os("KUBECONFIG")
        .map(|raw| {
            env::split_paths(&raw)
                .filter(|p| p.exists())
                .collect::<Vec<PathBuf>>()
        })
        .unwrap_or_default();

    if let Some(path) = configured_paths.first() {
        return Kubeconfig::read_from(path)
            .or_else(|_| Kubeconfig::read())
            .map_err(|e| anyhow::anyhow!("failed to read kubeconfig: {e}"));
    }

    Kubeconfig::read().map_err(|e| anyhow::anyhow!("failed to read default kubeconfig: {e}"))
}

fn rewrite_exec_command_to_absolute(kc: &mut Kubeconfig, context_name: Option<&str>) {
    let user_name = {
        let ctx_name = context_name.or_else(|| kc.current_context.as_deref());
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
                    if let Some(ref mut exec) = ai.exec {
                        if let Some(command) = exec.command.as_deref() {
                            if let Some(resolved) = resolve_exec_command_path(command) {
                                exec.command = Some(resolved);
                            }
                        }
                    }
                }
            }
        }
    }
}

async fn try_load_kube_config_with_resolved_exec(
    options: &KubeConfigOptions,
) -> anyhow::Result<Config> {
    let mut kc = read_effective_kubeconfig()?;
    rewrite_exec_command_to_absolute(&mut kc, options.context.as_deref());
    Config::from_custom_kubeconfig(kc, options)
        .await
        .map_err(|e| anyhow::anyhow!("failed to load kubeconfig with resolved exec command: {e}"))
}

    fn is_missing_exec_error(message: &str) -> bool {
        let err_text = message.to_lowercase();
        err_text.contains("unable to run auth exec")
        || err_text.contains("no such file or directory")
        || (err_text.contains("auth exec") && err_text.contains("os error 2"))
    }

pub fn kube_list_warning_response(resource_name: &str, err: &kube::Error) -> Option<Response> {
    if let kube::Error::Api(api_err) = err {
        let message_lower = api_err.message.to_lowercase();
        let is_storage_reinitializing = message_lower.contains("storage is (re)initializing")
            || message_lower.contains("toomanyrequests");

        if api_err.code == 403
            || api_err.code == 404
            || api_err.code == 429
            || api_err.code == 503
            || is_storage_reinitializing
        {
            let warning = if api_err.code == 403 {
                format!(
                    "Limited access: no permission to list {}. The app will continue without this resource.",
                    resource_name
                )
            } else if api_err.code == 429 || is_storage_reinitializing {
                format!(
                    "{} is temporarily unavailable (API server busy). Retrying in background.",
                    resource_name
                )
            } else if api_err.code == 503 {
                format!(
                    "{} is temporarily unavailable (503). Retrying in background.",
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

fn resolve_effective_kube_context() -> Option<String> {
    if let Some(ctx) = env::var("KUBE_CONTEXT").ok().filter(|s| !s.trim().is_empty()) {
        return Some(ctx);
    }

    read_effective_kubeconfig()
        .ok()
        .and_then(|kc| kc.current_context.clone())
        .filter(|s| !s.trim().is_empty())
}

fn placeholder_status_for_context(_context_name: Option<&str>) -> KubeClientStatus {
    KubeClientStatus {
        is_placeholder: true,
        user_message: Some(default_placeholder_user_message()),
    }
}

async fn try_build_client_from_config(cfg: Config) -> Result<Client, String> {
    tokio::task::spawn_blocking(move || Client::try_from(cfg).map_err(|e| e.to_string()))
        .await
        .map_err(|e| format!("client build task failed: {e}"))?
}

async fn try_build_client_from_options(options: &KubeConfigOptions) -> Result<Client, String> {
    let cfg = Config::from_kubeconfig(options)
        .await
        .map_err(|e| e.to_string())?;
    try_build_client_from_config(cfg).await
}

async fn try_build_client_with_resolved_exec(options: &KubeConfigOptions) -> Result<Client, String> {
    let cfg = try_load_kube_config_with_resolved_exec(options)
        .await
        .map_err(|e| e.to_string())?;
    try_build_client_from_config(cfg).await
}

async fn try_load_client_for_context_with_timeout(
    ctx: &str,
    load_timeout: std::time::Duration,
    resolve_timeout: std::time::Duration,
) -> Option<Client> {
    let options = KubeConfigOptions {
        context: Some(ctx.to_string()),
        ..Default::default()
    };

    // Config::from_kubeconfig and Client::try_from can both invoke exec-credential plugins.
    // Keep the entire build inside one timeout so startup cannot hang past the sidecar probe.
    match timeout(load_timeout, try_build_client_from_options(&options)).await {
        Ok(Ok(client)) => return Some(client),
        Ok(Err(e)) => {
            if !is_missing_exec_error(&e) {
                warn!(
                    "Kubernetes client init failed for context '{}': {}. \
                     Exec credential may be unavailable.",
                    ctx, e
                );
                return None;
            }
        }
        Err(_) => {
            warn!(
                "Kubernetes client init timed out (>{} s) for context '{}'. \
                 Exec credential plugin is slow or unresponsive.",
                EXEC_PROVIDER_LOAD_TIMEOUT.as_secs(),
                ctx
            );
            return None;
        }
    }

    match timeout(resolve_timeout, try_build_client_with_resolved_exec(&options)).await {
        Ok(Ok(client)) => Some(client),
        Ok(Err(e)) => {
            warn!(
                "Resolved exec command for context '{}' failed: {}.",
                ctx, e
            );
            None
        }
        Err(_) => {
            warn!(
                "Resolved exec command timed out for context '{}'.",
                ctx
            );
            None
        }
    }
}

async fn try_load_client_for_context(ctx: &str) -> Option<Client> {
    try_load_client_for_context_with_timeout(
        ctx,
        EXEC_PROVIDER_LOAD_TIMEOUT,
        EXEC_PROVIDER_RESOLVE_TIMEOUT,
    )
    .await
}

pub async fn upgrade_kube_client_in_background(
    client: std::sync::Arc<tokio::sync::RwLock<Client>>,
    auth_placeholder: std::sync::Arc<std::sync::atomic::AtomicBool>,
    auth_message: std::sync::Arc<tokio::sync::RwLock<Option<String>>>,
) {
    use std::sync::atomic::Ordering;
    use tracing::info;

    const MAX_ATTEMPTS: u32 = 18;
    const RETRY_INTERVAL: std::time::Duration = std::time::Duration::from_secs(10);

    for attempt in 1..=MAX_ATTEMPTS {
        if !auth_placeholder.load(Ordering::Relaxed) {
            return;
        }

        tokio::time::sleep(RETRY_INTERVAL).await;

        let Some(ctx) = resolve_effective_kube_context() else {
            continue;
        };

        if let Some(upgraded) = try_load_client_for_context_with_timeout(
            &ctx,
            EXEC_PROVIDER_BACKGROUND_TIMEOUT,
            EXEC_PROVIDER_RESOLVE_TIMEOUT,
        )
        .await
        {
            *client.write().await = upgraded;
            auth_placeholder.store(false, Ordering::Relaxed);
            *auth_message.write().await = None;
            info!(
                "Kubernetes client upgraded from placeholder to authenticated credentials for context '{}'",
                ctx
            );
            return;
        }

        warn!(
            "Background Kubernetes credential upgrade attempt {}/{} failed for context '{}'",
            attempt, MAX_ATTEMPTS, ctx
        );
    }
}

/// Returns `(client, status)`.
/// `status.is_placeholder = true` means credentials/configuration were not available at startup.
pub async fn load_kube_client_with_status() -> anyhow::Result<(Client, KubeClientStatus)> {
    let context = resolve_effective_kube_context();

    if let Some(ref ctx) = context {
        // Exec-credential plugins are invoked eagerly by kube-rs during config loading.
        // They may hang for a long time; cap startup wait and fall back to a placeholder
        // client so the HTTP server can bind and sidecar health probes pass.
        if let Some(client) = try_load_client_for_context(ctx).await {
            return Ok((client, KubeClientStatus::default()));
        }

        return build_placeholder_client(Some(ctx)).await.map(|client| {
            (client, placeholder_status_for_context(Some(ctx)))
        });
    }

    // No kube context in env/kubeconfig — skip Client::try_default() because it can block on
    // exec-credential plugins without yielding, which prevents startup timeouts from firing.
    warn!("No Kubernetes context configured; starting with placeholder client.");

    build_placeholder_client(None)
        .await
        .map(|client| (client, placeholder_status_for_context(None)))
}

/// Build a Kubernetes client that points at the correct API server but carries NO auth
/// credentials. All API calls will return 401/403 until credentials are available.
///
/// This function parses the kubeconfig file WITHOUT invoking exec-credential plugins,
/// strips the exec entry from the user auth info, and builds the client from that.
/// It exists solely to let the HTTP server start and respond to health probes even
/// when exec credential plugins are temporarily unavailable.
async fn build_placeholder_client(context_name: Option<&str>) -> anyhow::Result<Client> {
    let mut kubeconfig = read_effective_kubeconfig();

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

    if !metrics_probe_allowed(&POD_METRICS_RETRY_AFTER) {
        return metrics_map;
    }

    let pod_metrics_resource =
        ApiResource::from_gvk(&GroupVersionKind::gvk("metrics.k8s.io", "v1beta1", "PodMetrics"));
    let metrics_api: Api<DynamicObject> = Api::all_with(client, &pod_metrics_resource);

    let metrics_list = match metrics_api.list(&ListParams::default()).await {
        Ok(list) => {
            clear_metrics_disable(&POD_METRICS_RETRY_AFTER);
            list
        }
        Err(err) => {
            if is_metrics_api_unavailable(&err) {
                disable_metrics_temporarily(&POD_METRICS_RETRY_AFTER, "pod", &err);
            }
            return metrics_map;
        }
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

    if !metrics_probe_allowed(&NODE_METRICS_RETRY_AFTER) {
        return metrics_map;
    }

    let node_metrics_resource =
        ApiResource::from_gvk(&GroupVersionKind::gvk("metrics.k8s.io", "v1beta1", "NodeMetrics"));
    let metrics_api: Api<DynamicObject> = Api::all_with(client, &node_metrics_resource);

    let metrics_list = match metrics_api.list(&ListParams::default()).await {
        Ok(list) => {
            clear_metrics_disable(&NODE_METRICS_RETRY_AFTER);
            list
        }
        Err(err) => {
            if is_metrics_api_unavailable(&err) {
                disable_metrics_temporarily(&NODE_METRICS_RETRY_AFTER, "node", &err);
            }
            return metrics_map;
        }
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
    if node_names.is_empty() || !metrics_probe_allowed(&NODE_DISK_METRICS_RETRY_AFTER) {
        return HashMap::new();
    }

    let fetch_summary = |client: Client, name: String| async move {
        let request = match Request::get(format!("/api/v1/nodes/{name}/proxy/stats/summary"))
            .body(Vec::new())
        {
            Ok(request) => request,
            Err(_) => return Ok::<Option<(String, NodeDiskMetrics)>, kube::Error>(None),
        };

        // Timeout individual node requests to 2 seconds to prevent slow/unresponsive kubelets from blocking list
        let summary = match timeout(
            Duration::from_secs(2),
            client.request::<serde_json::Value>(request)
        ).await {
            Ok(Ok(summary)) => summary,
            Ok(Err(err)) => return Err(err),
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

    let results = join_all(node_names.iter().cloned().map(|name| {
        let client = client.clone();
        async move { (name.clone(), fetch_summary(client, name).await) }
    }))
    .await;

    let mut responses = HashMap::new();
    let mut saw_forbidden = false;
    let mut saw_unavailable = false;
    let mut saw_success = false;

    for (_name, result) in results {
        match result {
            Ok(Some(item)) => {
                saw_success = true;
                responses.insert(item.0, item.1);
            }
            Ok(None) => {}
            Err(err) if is_api_forbidden(&err) => {
                saw_forbidden = true;
                saw_unavailable = true;
            }
            Err(err) if is_kubelet_stats_proxy_unavailable(&err) => {
                saw_unavailable = true;
            }
            Err(_) => {}
        }
    }

    if saw_success {
        clear_metrics_disable(&NODE_DISK_METRICS_RETRY_AFTER);
        return responses;
    }

    // Only cool down when every node failed and at least one failure was "unavailable".
    if saw_unavailable {
        let cooldown = if saw_forbidden {
            METRICS_FORBIDDEN_COOLDOWN_SECS
        } else {
            METRICS_RETRY_COOLDOWN_SECS
        };
        let kind = if saw_forbidden {
            "node disk (RBAC/kubelet denied nodes/stats proxy)"
        } else {
            "node disk"
        };
        let err_msg = kube::Error::Api(kube::error::ErrorResponse {
            status: "Failure".into(),
            message: "kubelet stats proxy unavailable for all probed nodes".into(),
            reason: "Unavailable".into(),
            code: if saw_forbidden { 403 } else { 503 },
        });
        disable_metrics_for(&NODE_DISK_METRICS_RETRY_AFTER, kind, &err_msg, cooldown);
    }

    responses
}
