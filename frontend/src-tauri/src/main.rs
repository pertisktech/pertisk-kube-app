use std::collections::BTreeSet;
use std::collections::HashMap;
use std::collections::VecDeque;
use std::fs;
use std::io::{BufRead, BufReader, Read, Write};
use std::net::{SocketAddr, TcpListener, TcpStream};
use std::path::{Path, PathBuf};
use std::env;
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex, OnceLock};
use std::thread;
use std::time::{Duration, Instant};

use base64::{engine::general_purpose::STANDARD, Engine as _};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, RunEvent, State};
use tracing::{error, info, warn};

#[cfg(target_os = "macos")]
use tauri::menu::{AboutMetadata, Menu, MenuItem, PredefinedMenuItem};

const SIDECAR_LOG_CAPACITY: usize = 2000;

type SidecarLogs = Arc<Mutex<VecDeque<String>>>;

static APP_LOG_BUF: OnceLock<Mutex<VecDeque<String>>> = OnceLock::new();

fn app_log(msg: impl Into<String>) {
    let buf = APP_LOG_BUF.get_or_init(|| Mutex::new(VecDeque::new()));
    if let Ok(mut guard) = buf.lock() {
        guard.push_back(msg.into());
        while guard.len() > SIDECAR_LOG_CAPACITY {
            guard.pop_front();
        }
    }
}

struct BackendState {
    child: Arc<Mutex<Option<Child>>>,
    shutting_down: Arc<Mutex<bool>>,
    config: Arc<Mutex<SidecarConfig>>,
    switch_status: Arc<Mutex<ClusterSwitchStatus>>,
    restart_in_progress: Arc<Mutex<bool>>,
    logs: SidecarLogs,
}

const DEFAULT_PORT: u16 = 15222;
const DEFAULT_GRPC_PORT: u16 = 50051;
// Keep startup timeout above backend exec-provider kubeconfig timeout (25s)
// so slow credential plugins do not trigger false sidecar-start failures.
const STARTUP_TIMEOUT: Duration = Duration::from_secs(60);
const CLUSTER_VERIFY_TIMEOUT: Duration = Duration::from_secs(45);
const RESTART_BACKOFF: Duration = Duration::from_secs(2);
const SHUTDOWN_GRACE: Duration = Duration::from_secs(2);
const PORT_SCAN_LIMIT: u16 = 200;

const SIDECAR_CONFIG_FILE: &str = "desktop-sidecar.json";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SidecarConfig {
    backend_bin: Option<String>,
    kubeconfig_path: Option<String>,
    kube_context: Option<String>,
    port: u16,
}

impl Default for SidecarConfig {
    fn default() -> Self {
        Self {
            backend_bin: None,
            kubeconfig_path: None,
            kube_context: None,
            port: DEFAULT_PORT,
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct KubeconfigCluster {
    context: String,
    cluster: Option<String>,
    namespace: Option<String>,
    is_current: bool,
    kubeconfig_path: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ClusterSwitchStatus {
    in_progress: bool,
    last_success: Option<bool>,
    message: Option<String>,
    requested_context: Option<String>,
}

impl Default for ClusterSwitchStatus {
    fn default() -> Self {
        Self {
            in_progress: false,
            last_success: None,
            message: None,
            requested_context: None,
        }
    }
}

fn is_packaged_app() -> bool {
    std::env::current_exe()
        .ok()
        .map(|exe| exe.to_string_lossy().contains(".app/Contents/MacOS"))
        .unwrap_or(false)
}

fn validated_config(mut cfg: SidecarConfig) -> SidecarConfig {
    if cfg.port == 0 {
        cfg.port = DEFAULT_PORT;
    }

    if let Ok(env_bin) = std::env::var("PERTISK_BACKEND_BIN") {
        if !env_bin.trim().is_empty() {
            cfg.backend_bin = Some(env_bin);
        }
    }

    // Packaged installs must ignore workspace paths saved by `make run-desktop`.
    // Hardened runtime often cannot exec binaries outside the .app bundle.
    if is_packaged_app() && std::env::var("PERTISK_BACKEND_BIN").is_err() {
        cfg.backend_bin = None;
    }

    if let Ok(env_port) = std::env::var("PORT").or_else(|_| std::env::var("APP_PORT")) {
        if let Ok(parsed) = env_port.parse::<u16>() {
            if parsed > 0 {
                cfg.port = parsed;
            }
        }
    }

    if let Ok(env_kubeconfig) = std::env::var("KUBECONFIG") {
        if !env_kubeconfig.trim().is_empty() {
            cfg.kubeconfig_path = Some(env_kubeconfig);
        }
    }

    if let Ok(env_context) = std::env::var("KUBE_CONTEXT") {
        if !env_context.trim().is_empty() {
            cfg.kube_context = Some(env_context);
        }
    }

    cfg
}

fn config_file_path(app: &AppHandle) -> anyhow::Result<PathBuf> {
    let dir = app.path().app_config_dir()?;
    fs::create_dir_all(&dir)?;
    Ok(dir.join(SIDECAR_CONFIG_FILE))
}

fn load_sidecar_config(app: &AppHandle) -> SidecarConfig {
    let path = match config_file_path(app) {
        Ok(p) => p,
        Err(e) => {
            warn!("failed to resolve sidecar config directory: {e}");
            return validated_config(SidecarConfig::default());
        }
    };

    match fs::read_to_string(&path) {
        Ok(raw) => match serde_json::from_str::<SidecarConfig>(&raw) {
            Ok(cfg) => validated_config(cfg),
            Err(e) => {
                warn!("failed to parse sidecar config at {}: {e}", path.display());
                validated_config(SidecarConfig::default())
            }
        },
        Err(_) => validated_config(SidecarConfig::default()),
    }
}

fn save_sidecar_config(app: &AppHandle, cfg: &SidecarConfig) -> anyhow::Result<()> {
    let path = config_file_path(app)?;
    let serialized = serde_json::to_string_pretty(cfg)?;
    fs::write(path, serialized)?;
    Ok(())
}

fn append_unique_path(paths: &mut Vec<PathBuf>, candidate: PathBuf) {
    if !paths.iter().any(|existing| existing == &candidate) {
        paths.push(candidate);
    }
}

fn ensure_executable(path: &Path) {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        if let Ok(metadata) = fs::metadata(path) {
            let mut perms = metadata.permissions();
            perms.set_mode(0o755);
            let _ = fs::set_permissions(path, perms);
        }
    }
}

fn bundled_bin_dirs(app: &AppHandle) -> Vec<PathBuf> {
    let mut dirs = Vec::<PathBuf>::new();

    append_unique_path(
        &mut dirs,
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("bundle-resources"),
    );

    if let Ok(resource_dir) = app.path().resource_dir() {
        append_unique_path(&mut dirs, resource_dir.clone());
        append_unique_path(&mut dirs, resource_dir.join("bundle-resources"));
    }

    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            append_unique_path(&mut dirs, dir.to_path_buf());
            append_unique_path(&mut dirs, dir.join("../Resources"));
            append_unique_path(&mut dirs, dir.join("../Resources/bundle-resources"));
        }
    }

    dirs
}

fn prepare_embedded_ktail(app: &AppHandle) -> Option<PathBuf> {
    let source = bundled_bin_dirs(app)
        .into_iter()
        .flat_map(|dir| [dir.join("ktail"), dir.join("pertisk-ktail")])
        .find(|path| path.exists())?;

    let app_config_dir = app.path().app_config_dir().ok()?;
    let tool_dir = app_config_dir.join("embedded-tools");
    if fs::create_dir_all(&tool_dir).is_err() {
        return None;
    }

    let dst = tool_dir.join("ktail");
    if fs::copy(&source, &dst).is_err() {
        return None;
    }
    ensure_executable(&dst);

    Some(tool_dir)
}

fn login_shell_env_cache() -> &'static HashMap<String, String> {
    static CACHE: OnceLock<HashMap<String, String>> = OnceLock::new();
    CACHE.get_or_init(read_login_shell_env)
}

fn read_login_shell_env() -> HashMap<String, String> {
    let shell = env::var("SHELL")
        .ok()
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| "/bin/zsh".to_string());

    let output = Command::new(&shell)
        .arg("-ilc")
        .arg("env -0")
        .stdin(Stdio::null())
        .output();

    let Ok(output) = output else {
        return HashMap::new();
    };

    if !output.status.success() {
        return HashMap::new();
    }

    let mut vars = HashMap::new();
    for entry in output.stdout.split(|byte| *byte == 0).filter(|entry| !entry.is_empty()) {
        if let Ok(line) = std::str::from_utf8(entry) {
            if let Some((key, value)) = line.split_once('=') {
                vars.insert(key.to_string(), value.to_string());
            }
        }
    }

    vars
}

fn env_value(key: &str) -> Option<String> {
    login_shell_env_cache()
        .get(key)
        .cloned()
        .or_else(|| env::var(key).ok())
        .filter(|value| !value.trim().is_empty())
}

fn sidecar_path() -> Option<String> {
    let mut paths: Vec<PathBuf> = env_value("PATH")
        .and_then(|value| env::split_paths(&value).next().map(|_| value))
        .map(|value| env::split_paths(&value).collect())
        .unwrap_or_default();

    for candidate in [
        "/opt/homebrew/bin",
        "/usr/local/bin",
        "/usr/bin",
        "/bin",
        "/usr/sbin",
        "/sbin",
    ] {
        append_unique_path(&mut paths, PathBuf::from(candidate));
    }

    if let Some(home) = env_value("HOME") {
        let home_path = PathBuf::from(&home);
        append_unique_path(&mut paths, home_path.join(".local/bin"));
        // Manual gcloud SDK installs are often at ~/google-cloud-sdk/bin.
        append_unique_path(&mut paths, PathBuf::from(home).join("google-cloud-sdk/bin"));
    }

    env::join_paths(paths)
        .ok()
        .and_then(|value| value.into_string().ok())
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

fn resolve_executable_command(command: &str) -> Option<PathBuf> {
    let cmd = command.trim();
    if cmd.is_empty() {
        return None;
    }

    if cmd.contains('/') {
        let path = PathBuf::from(cmd);
        return is_executable_file(&path).then_some(path);
    }

    let mut search_paths = Vec::<PathBuf>::new();
    if let Some(path) = sidecar_path() {
        search_paths.extend(env::split_paths(&path));
    }

    for candidate in [
        "/opt/homebrew/bin",
        "/usr/local/bin",
        "/usr/bin",
        "/bin",
        "/usr/sbin",
        "/sbin",
    ] {
        append_unique_path(&mut search_paths, PathBuf::from(candidate));
    }

    if let Some(home) = env_value("HOME") {
        append_unique_path(&mut search_paths, PathBuf::from(&home).join(".local/bin"));
        append_unique_path(&mut search_paths, PathBuf::from(&home).join("google-cloud-sdk/bin"));
    }

    for dir in search_paths {
        let candidate = dir.join(cmd);
        if is_executable_file(&candidate) {
            return Some(candidate);
        }
    }

    // Common kubectl locations used by desktop runtimes (OrbStack/Rancher Desktop/Docker Desktop)
    if cmd == "kubectl" {
        for candidate in [
            "/usr/local/bin/kubectl",
            "/opt/homebrew/bin/kubectl",
            "/Applications/OrbStack.app/Contents/MacOS/xbin/kubectl",
            "/Applications/Rancher Desktop.app/Contents/Resources/resources/darwin/bin/kubectl",
            "/Applications/Docker.app/Contents/Resources/bin/kubectl",
        ] {
            let path = PathBuf::from(candidate);
            if is_executable_file(&path) {
                return Some(path);
            }
        }
    }

    None
}

fn shell_quote(value: &str) -> String {
    if value.is_empty() {
        return "''".to_string();
    }
    format!("'{}'", value.replace('\'', "'\"'\"'"))
}

fn build_shell_command(command: &str, args: &[String]) -> String {
    let mut parts = Vec::with_capacity(args.len() + 1);
    parts.push(shell_quote(command));
    for arg in args {
        parts.push(shell_quote(arg));
    }
    parts.join(" ")
}

fn forward_env_if_present(command: &mut Command, key: &str) {
    if let Some(value) = env_value(key) {
        command.env(key, value);
    }
}

fn configure_sidecar_environment(command: &mut Command) {
    if let Some(path) = sidecar_path() {
        command.env("PATH", path);
    }

    for key in [
        "HOME",
        "USER",
        "LOGNAME",
        "SHELL",
        "AWS_PROFILE",
        "AWS_REGION",
        "AWS_DEFAULT_REGION",
        "AWS_CONFIG_FILE",
        "AWS_SHARED_CREDENTIALS_FILE",
        "AWS_SDK_LOAD_CONFIG",
        "AWS_ACCESS_KEY_ID",
        "AWS_SECRET_ACCESS_KEY",
        "AWS_SESSION_TOKEN",
        "AWS_ROLE_ARN",
        "AWS_ROLE_SESSION_NAME",
        "AWS_WEB_IDENTITY_TOKEN_FILE",
        "AWS_CA_BUNDLE",
        "AWS_EC2_METADATA_DISABLED",
    ] {
        forward_env_if_present(command, key);
    }

    // Azure / kubelogin – needed for service-principal and workload-identity auth modes.
    for key in [
        "AZURE_CLIENT_ID",
        "AZURE_CLIENT_SECRET",
        "AZURE_CLIENT_CERTIFICATE_PATH",
        "AZURE_TENANT_ID",
        "AZURE_AUTHORITY_HOST",
        "AZURE_FEDERATED_TOKEN_FILE",
    ] {
        forward_env_if_present(command, key);
    }

    // GCP / GKE – GOOGLE_APPLICATION_CREDENTIALS is required for service-account auth;
    // USE_GKE_GCLOUD_AUTH_PLUGIN tells kubectl/kube-rs to use the gke plugin.
    for key in [
        "GOOGLE_APPLICATION_CREDENTIALS",
        "GOOGLE_CLOUD_PROJECT",
        "CLOUDSDK_CORE_PROJECT",
        "USE_GKE_GCLOUD_AUTH_PLUGIN",
    ] {
        forward_env_if_present(command, key);
    }

    // Talos Linux / Talos Omni – omnictl reads OMNICONFIG; talosctl reads TALOSCONFIG.
    // Both tools fall back to XDG config dirs when these env vars are absent.
    for key in [
        "OMNICONFIG",
        "TALOSCONFIG",
        "OMNI_ENDPOINT",
        "SIDEROV1_KEYS_DIR",
        "XDG_CONFIG_HOME",
        "XDG_DATA_HOME",
        "XDG_CACHE_HOME",
    ] {
        forward_env_if_present(command, key);
    }

    command.env("AWS_PAGER", "");
}

fn warmup_local_network_access(cfg: &SidecarConfig) {
    // macOS Local Network privacy (Sequoia+): GUI-launched apps are blocked from LAN
    // until the user grants permission. Trigger Bonjour browse + TCP from the app
    // process itself so the system prompt is attributed to PTKublet (not only the sidecar).
    #[cfg(target_os = "macos")]
    {
        // Bonjour browsing is the most reliable Local Network prompt trigger on Sequoia.
        let _ = Command::new("/usr/bin/dns-sd")
            .args(["-B", "_https._tcp", "local."])
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .ok()
            .and_then(|mut child| {
                thread::sleep(Duration::from_millis(800));
                let _ = child.kill();
                let _ = child.wait();
                Some(())
            });
        let _ = Command::new("/usr/bin/dns-sd")
            .args(["-B", "_http._tcp", "local."])
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .ok()
            .and_then(|mut child| {
                thread::sleep(Duration::from_millis(800));
                let _ = child.kill();
                let _ = child.wait();
                Some(())
            });
    }

    let mut hosts = Vec::<String>::new();
    let mut log_lines = Vec::<String>::new();

    if let Some(path) = cfg
        .kubeconfig_path
        .as_deref()
        .map(str::trim)
        .filter(|p| !p.is_empty())
        .map(PathBuf::from)
        .filter(|p| p.exists())
    {
        if let Ok(raw) = fs::read_to_string(&path) {
            for line in raw.lines() {
                let trimmed = line.trim();
                if let Some(rest) = trimmed.strip_prefix("server:") {
                    let value = rest.trim().trim_matches('"').trim_matches('\'');
                    if let Some(host_port) = parse_host_port_from_server_url(value) {
                        hosts.push(host_port);
                    }
                }
            }
        }
    }

    // Always probe a common LAN-ish target so the permission prompt can appear even
    // before a kubeconfig is selected.
    hosts.push("10.0.0.1:80".to_string());
    hosts.push("192.168.0.1:80".to_string());

    for target in hosts.into_iter().take(6) {
        let addr = match target.parse::<SocketAddr>() {
            Ok(addr) => addr,
            Err(_) => match std::net::ToSocketAddrs::to_socket_addrs(&target) {
                Ok(mut iter) => match iter.next() {
                    Some(addr) => addr,
                    None => continue,
                },
                Err(_) => continue,
            },
        };
        let result = TcpStream::connect_timeout(&addr, Duration::from_millis(1200));
        log_lines.push(format!(
            "{} -> {}",
            addr,
            if result.is_ok() { "ok" } else { "fail" }
        ));
    }

    if let Some(home) = resolve_home_dir() {
        let log_path = home
            .join("Library/Application Support/com.pertisk.ptkublet/lan-warmup.log");
        if let Some(parent) = log_path.parent() {
            let _ = fs::create_dir_all(parent);
        }
        let body = format!(
            "ts={}\npackaged={}\n{}\n",
            chrono_like_timestamp(),
            is_packaged_app(),
            log_lines.join("\n")
        );
        let _ = fs::write(log_path, body);
    }
}

fn chrono_like_timestamp() -> String {
    use std::time::SystemTime;
    let secs = SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    secs.to_string()
}

fn parse_host_port_from_server_url(value: &str) -> Option<String> {
    let without_scheme = value
        .strip_prefix("https://")
        .or_else(|| value.strip_prefix("http://"))
        .unwrap_or(value);
    let host_port = without_scheme.split('/').next()?.trim();
    if host_port.is_empty() {
        return None;
    }
    if host_port.contains(':') {
        Some(host_port.to_string())
    } else {
        let default_port = if value.starts_with("http://") { 80 } else { 6443 };
        Some(format!("{host_port}:{default_port}"))
    }
}

fn backend_socket_addr(port: u16) -> SocketAddr {
    SocketAddr::from(([127, 0, 0, 1], port))
}

fn candidate_backend_paths(app: &AppHandle, cfg: &SidecarConfig) -> Vec<PathBuf> {
    let mut paths = Vec::new();

    if let Ok(explicit) = std::env::var("PERTISK_BACKEND_BIN") {
        paths.push(PathBuf::from(explicit));
    }

    if cfg!(debug_assertions) {
        paths.push(PathBuf::from("../target/debug/pertisk-kube-backend"));
        paths.push(PathBuf::from("../../target/debug/pertisk-kube-backend"));
    }

    // Packaged .app must use its bundled sidecar. Ignore stale absolute paths
    // saved during `make run-desktop` (…/target/debug/pertisk-kube-backend).
    let packaged_app = is_packaged_app();

    let push_bundled_paths = |paths: &mut Vec<PathBuf>| {
        if let Ok(exe) = std::env::current_exe() {
            if let Some(dir) = exe.parent() {
                append_unique_path(paths, dir.join("pertisk-kube-backend"));
                append_unique_path(paths, dir.join("../Resources/pertisk-kube-backend"));
            }
        }
        if let Ok(resource_dir) = app.path().resource_dir() {
            append_unique_path(paths, resource_dir.join("pertisk-kube-backend"));
            append_unique_path(
                paths,
                resource_dir.join("bundle-resources/pertisk-kube-backend"),
            );
        }
        append_unique_path(
            paths,
            PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("bundle-resources/pertisk-kube-backend"),
        );
    };

    if packaged_app {
        push_bundled_paths(&mut paths);
        // Never consult cfg.backend_bin for packaged apps — it commonly points at
        // a developer debug binary and breaks DMG installs.
        return paths;
    }

    if let Some(explicit) = cfg.backend_bin.as_deref() {
        let trimmed = explicit.trim();
        if !trimmed.is_empty() {
            append_unique_path(&mut paths, PathBuf::from(trimmed));
        }
    }

    paths.push(PathBuf::from("../target/release/pertisk-kube-backend"));
    paths.push(PathBuf::from("../../target/release/pertisk-kube-backend"));
    push_bundled_paths(&mut paths);

    if let Ok(home) = std::env::var("HOME") {
        // Optional user-local install location (not a personal workspace path).
        paths.push(PathBuf::from(&home).join(".pertisk-kube-app-backend/pertisk-kube-backend"));
    }

    paths
}

fn probe_backend_health(port: u16) -> bool {
    let addr = backend_socket_addr(port);
    let mut stream = match TcpStream::connect_timeout(&addr, Duration::from_millis(400)) {
        Ok(s) => s,
        Err(_) => return false,
    };

    let _ = stream.set_read_timeout(Some(Duration::from_millis(600)));
    let _ = stream.set_write_timeout(Some(Duration::from_millis(600)));

    let request = format!(
        "GET /api/health HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nConnection: close\r\n\r\n"
    );
    if stream.write_all(request.as_bytes()).is_err() {
        return false;
    }

    let mut response = String::new();
    if stream.read_to_string(&mut response).is_err() {
        return false;
    }

    response.starts_with("HTTP/1.1 200") || response.starts_with("HTTP/1.0 200")
}

fn probe_backend_status(port: u16, path: &str) -> Option<u16> {
    let addr = backend_socket_addr(port);
    let mut stream = TcpStream::connect_timeout(&addr, Duration::from_millis(1500)).ok()?;

    // Use a long read timeout: exec-credential plugins (omnictl, aws eks get-token,
    // kubelogin, gke-gcloud-auth-plugin) are invoked lazily on the first request and
    // can take 5–20 s on the first call or when the cached token has expired.
    let _ = stream.set_read_timeout(Some(Duration::from_secs(22)));
    let _ = stream.set_write_timeout(Some(Duration::from_millis(1500)));

    let request = format!(
        "GET {path} HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nConnection: close\r\n\r\n"
    );
    stream.write_all(request.as_bytes()).ok()?;

    let mut response = String::new();
    stream.read_to_string(&mut response).ok()?;
    let status = response
        .lines()
        .next()
        .and_then(|line| line.split_whitespace().nth(1))
        .and_then(|code| code.parse::<u16>().ok());

    status
}

fn wait_for_backend_ready(port: u16, timeout: Duration) -> bool {
    let start = Instant::now();

    while start.elapsed() < timeout {
        if probe_backend_health(port) {
            return true;
        }
        thread::sleep(Duration::from_millis(200));
    }

    false
}

fn wait_for_cluster_verification(port: u16, timeout: Duration) -> bool {
    let start = Instant::now();

    while start.elapsed() < timeout {
        // Use /api/auth-status instead of /api/namespaces. During Omni/AWS/GCP cluster
        // switches the backend may start with a placeholder kube client while exec
        // credentials load; protected list endpoints return 503 in that window, which
        // caused false "cluster not reachable" rollbacks even though the sidecar was healthy.
        if let Some(status) = probe_backend_status(port, "/api/auth-status") {
            if status == 200 {
                return true;
            }
        }

        // Fallback for older backends: treat auth/RBAC/unavailable responses as reachable.
        if let Some(status) = probe_backend_status(port, "/api/namespaces") {
            if status == 401 || status == 403 || status == 503 {
                return true;
            }
            if status < 500 {
                return true;
            }
        }

        thread::sleep(Duration::from_millis(300));
    }

    false
}

fn is_port_bindable(port: u16) -> bool {
    TcpListener::bind(("0.0.0.0", port)).is_ok()
}

fn wait_for_port_bindable(port: u16, timeout: Duration) -> bool {
    let start = Instant::now();
    while start.elapsed() < timeout {
        if is_port_bindable(port) {
            return true;
        }
        thread::sleep(Duration::from_millis(100));
    }
    false
}

fn try_begin_restart(restart_in_progress: &Arc<Mutex<bool>>) -> bool {
    let mut restarting = match restart_in_progress.lock() {
        Ok(guard) => guard,
        Err(_) => return false,
    };

    if *restarting {
        return false;
    }

    *restarting = true;
    true
}

fn wait_and_begin_restart(restart_in_progress: &Arc<Mutex<bool>>, timeout: Duration) -> bool {
    let start = Instant::now();
    while start.elapsed() < timeout {
        if try_begin_restart(restart_in_progress) {
            return true;
        }
        thread::sleep(Duration::from_millis(120));
    }
    false
}

fn end_restart(restart_in_progress: &Arc<Mutex<bool>>) {
    if let Ok(mut restarting) = restart_in_progress.lock() {
        *restarting = false;
    }
}

fn find_available_port(preferred: u16) -> Option<u16> {
    if is_port_bindable(preferred) {
        return Some(preferred);
    }

    for offset in 1..=PORT_SCAN_LIMIT {
        if let Some(candidate) = preferred.checked_add(offset) {
            if is_port_bindable(candidate) {
                return Some(candidate);
            }
        }
    }

    for offset in 1..=PORT_SCAN_LIMIT {
        if let Some(candidate) = preferred.checked_sub(offset) {
            if candidate > 0 && is_port_bindable(candidate) {
                return Some(candidate);
            }
        }
    }

    None
}

fn ensure_sidecar_port_available(cfg: &mut SidecarConfig) -> anyhow::Result<Option<(u16, u16)>> {
    // Prefer the default desktop port whenever it is free so UI/localStorage do not
    // drift to a fallback port across restarts.
    if cfg.port != DEFAULT_PORT && is_port_bindable(DEFAULT_PORT) {
        let previous = cfg.port;
        cfg.port = DEFAULT_PORT;
        return Ok(Some((previous, DEFAULT_PORT)));
    }

    if is_port_bindable(cfg.port) {
        return Ok(None);
    }

    let previous = cfg.port;
    let next = find_available_port(previous).ok_or_else(|| {
        anyhow::anyhow!(
            "sidecar port {} is busy and no free fallback port was found nearby",
            previous
        )
    })?;

    cfg.port = next;
    Ok(Some((previous, next)))
}

fn is_bad_cpu_type_error(error: &std::io::Error) -> bool {
    error.raw_os_error() == Some(86)
        || error
            .to_string()
            .to_ascii_lowercase()
            .contains("bad cpu type in executable")
}

fn push_log(logs: &SidecarLogs, line: String) {
    if let Ok(mut buf) = logs.lock() {
        buf.push_back(line);
        while buf.len() > SIDECAR_LOG_CAPACITY {
            buf.pop_front();
        }
    }
}

fn spawn_log_reader(reader: impl Read + Send + 'static, logs: SidecarLogs, prefix: &'static str) {
    thread::spawn(move || {
        let reader = BufReader::new(reader);
        for line in reader.lines() {
            match line {
                Ok(l) => {
                    let entry = format!("[{}] {}", prefix, l);
                    info!("{}", entry);
                    push_log(&logs, entry);
                }
                Err(_) => break,
            }
        }
    });
}

fn spawn_backend(app: &AppHandle, cfg: &SidecarConfig, logs: &SidecarLogs) -> anyhow::Result<Child> {
    if !is_port_bindable(cfg.port) {
        return Err(anyhow::anyhow!(
            "sidecar port {} is already in use; choose a different port in Desktop Settings",
            cfg.port
        ));
    }

    let preferred_grpc_port = std::env::var("GRPC_PORT")
        .ok()
        .and_then(|raw| raw.parse::<u16>().ok())
        .filter(|value| *value > 0)
        .unwrap_or(DEFAULT_GRPC_PORT);
    let grpc_port = find_available_port(preferred_grpc_port).ok_or_else(|| {
        anyhow::anyhow!(
            "gRPC port {} is busy and no free fallback port was found nearby",
            preferred_grpc_port
        )
    })?;
    if grpc_port != preferred_grpc_port {
        warn!(
            "gRPC port {} was busy; using {} for sidecar startup",
            preferred_grpc_port, grpc_port
        );
    }

    let candidates = candidate_backend_paths(app, cfg);
    let existing_candidates = candidates
        .iter()
        .filter(|path| path.exists())
        .cloned()
        .collect::<Vec<_>>();

    if existing_candidates.is_empty() {
        let error_msg = format!(
            "Could not locate backend binary. Looked in: {}",
            candidates
                .iter()
                .map(|p| p.display().to_string())
                .collect::<Vec<_>>()
                .join(", ")
        );
        eprintln!("{}", error_msg);
        warn!("{}", error_msg);
        return Err(anyhow::anyhow!(error_msg));
    }

    let bundled_dirs = bundled_bin_dirs(app)
        .into_iter()
        .filter(|path| path.exists())
        .filter_map(|path| path.to_str().map(str::to_string))
        .collect::<Vec<_>>();

    let embedded_tool_dir = prepare_embedded_ktail(app)
        .and_then(|tool_dir| tool_dir.to_str().map(str::to_string));

    let mut startup_errors = Vec::<String>::new();

    for backend_bin in existing_candidates {
        let backend_dir = backend_bin
            .parent()
            .map(Path::to_path_buf)
            .unwrap_or_else(|| PathBuf::from("."));

        let mut command = Command::new(&backend_bin);
        command
            .current_dir(backend_dir.clone())
            .env("RUST_LOG", std::env::var("RUST_LOG").unwrap_or_else(|_| "info".to_string()))
            .env("PORT", cfg.port.to_string())
            .env("GRPC_PORT", grpc_port.to_string())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());

        configure_sidecar_environment(&mut command);

        if !bundled_dirs.is_empty() {
            command.env("PERTISK_BUNDLED_BIN_DIRS", bundled_dirs.join(":"));
        }

        if let Some(tool_dir_str) = embedded_tool_dir.as_deref() {
            command.env("PERTISK_TOOL_BIN_DIR", tool_dir_str);
        }

        if let Some(kubeconfig_path) = cfg.kubeconfig_path.as_deref() {
            if !kubeconfig_path.trim().is_empty() {
                command.env("KUBECONFIG", kubeconfig_path);
            }
        }

        if let Some(kube_context) = cfg.kube_context.as_deref() {
            if !kube_context.trim().is_empty() {
                command.env("KUBE_CONTEXT", kube_context);
            }
        }

        match command.spawn() {
            Ok(mut child) => {
                // Attach log readers for stdout/stderr before the exit check.
                if let Some(stdout) = child.stdout.take() {
                    spawn_log_reader(stdout, Arc::clone(logs), "out");
                }
                if let Some(stderr) = child.stderr.take() {
                    spawn_log_reader(stderr, Arc::clone(logs), "err");
                }

                // If the process exits immediately (common when port is already occupied), fail fast.
                thread::sleep(Duration::from_millis(250));
                if let Some(status) = child.try_wait()? {
                    let message = format!(
                        "{} exited immediately with status {status}",
                        backend_bin.display()
                    );
                    warn!("{message}");
                    startup_errors.push(message);
                    continue;
                }

                info!(
                    "spawned backend sidecar from {} on {} (grpc: {}) (cwd: {})",
                    backend_bin.display(),
                    backend_socket_addr(cfg.port),
                    grpc_port,
                    backend_dir.display()
                );
                return Ok(child);
            }
            Err(error) => {
                if is_bad_cpu_type_error(&error) {
                    let message = format!(
                        "skipping backend binary {} due to architecture mismatch ({error})",
                        backend_bin.display()
                    );
                    warn!("{message}");
                    startup_errors.push(message);
                    continue;
                }

                return Err(anyhow::anyhow!(
                    "failed to spawn backend sidecar from {}: {}",
                    backend_bin.display(),
                    error
                ));
            }
        }
    }

    Err(anyhow::anyhow!(
        "no compatible backend binary could be started. checked {} candidate(s). details: {}",
        startup_errors.len(),
        startup_errors.join(" | ")
    ))
}

fn looks_like_kubeconfig_file(path: &Path) -> bool {
    if !path.is_file() {
        return false;
    }

    let file_name = path
        .file_name()
        .and_then(|name| name.to_str())
        .map(|name| name.to_lowercase())
        .unwrap_or_default();

    if file_name.is_empty() || file_name.starts_with('.') {
        return false;
    }

    let extension = path
        .extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| ext.to_ascii_lowercase())
        .unwrap_or_default();

    if matches!(
        extension.as_str(),
        "crt" | "key" | "pem" | "pub" | "csr" | "json" | "lock" | "log" | "txt"
    ) {
        return false;
    }

    let has_kubeconfig_ext =
        extension == "yaml" || extension == "yml" || extension == "kubeconfig";

    let is_likely_kubeconfig = file_name == "config"
        || file_name.contains("kubeconfig")
        || file_name.contains("kube-config")
        || file_name.contains("omni")
        || file_name.contains("talos");

    has_kubeconfig_ext || is_likely_kubeconfig
}

fn should_skip_kube_subdir(name: &str) -> bool {
    let lower = name.to_ascii_lowercase();
    lower.starts_with('.')
        || matches!(
            lower.as_str(),
            "cache" | "http-cache" | "discovery" | "plugins" | "tmp" | "temp"
        )
}

fn collect_kubeconfig_files(dir: &Path, remaining_depth: usize, out: &mut Vec<String>) {
    if remaining_depth == 0 || !dir.is_dir() {
        return;
    }

    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };

    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            let dir_name = path
                .file_name()
                .and_then(|name| name.to_str())
                .unwrap_or_default();
            if should_skip_kube_subdir(dir_name) {
                continue;
            }
            collect_kubeconfig_files(&path, remaining_depth - 1, out);
            continue;
        }

        if looks_like_kubeconfig_file(&path) {
            out.push(path.to_string_lossy().to_string());
        }
    }
}

fn discover_kubeconfig_candidates() -> Vec<String> {
    let mut candidates = Vec::<String>::new();

    if let Some(from_env) = env_value("KUBECONFIG") {
        for item in from_env.split(':') {
            let path = item.trim();
            if path.is_empty() {
                continue;
            }
            let candidate = PathBuf::from(path);
            if candidate.is_dir() {
                collect_kubeconfig_files(&candidate, 3, &mut candidates);
            } else if candidate.exists() {
                candidates.push(candidate.to_string_lossy().to_string());
            }
        }
    }

    // Prefer resolve_home_dir() over process HOME: Finder-launched DMG apps often
    // have a minimal env, while dirs::home_dir()/login-shell HOME still resolve.
    if let Some(home) = resolve_home_dir() {
        // Recurse into ~/.kube and nested folders (e.g. ~/.kube/clusters/*.yaml).
        collect_kubeconfig_files(&home.join(".kube"), 4, &mut candidates);
        collect_kubeconfig_files(&home.join(".talos"), 2, &mut candidates);
    }

    candidates.sort();
    candidates.dedup();
    candidates
}

fn parse_kubeconfig_clusters(path: &Path) -> anyhow::Result<Vec<KubeconfigCluster>> {
    let raw = fs::read_to_string(path)?;
    let yaml: serde_yaml::Value = serde_yaml::from_str(&raw)?;

    let root = yaml
        .as_mapping()
        .ok_or_else(|| anyhow::anyhow!("invalid kubeconfig format"))?;

    let current_context = root
        .get(serde_yaml::Value::String("current-context".to_string()))
        .and_then(|v| v.as_str())
        .unwrap_or_default()
        .to_string();

    let contexts = root
        .get(serde_yaml::Value::String("contexts".to_string()))
        .and_then(|v| v.as_sequence())
        .cloned()
        .unwrap_or_default();

    let mut out = Vec::<KubeconfigCluster>::new();
    for item in contexts {
        let Some(item_map) = item.as_mapping() else {
            continue;
        };

        let context_name = item_map
            .get(serde_yaml::Value::String("name".to_string()))
            .and_then(|v| v.as_str())
            .unwrap_or_default()
            .to_string();

        if context_name.is_empty() {
            continue;
        }

        let inner = item_map
            .get(serde_yaml::Value::String("context".to_string()))
            .and_then(|v| v.as_mapping());

        let cluster = inner
            .and_then(|m| m.get(serde_yaml::Value::String("cluster".to_string())))
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());

        let namespace = inner
            .and_then(|m| m.get(serde_yaml::Value::String("namespace".to_string())))
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());

        out.push(KubeconfigCluster {
            context: context_name.clone(),
            cluster,
            namespace,
            is_current: !current_context.is_empty() && context_name == current_context,
            kubeconfig_path: path.to_string_lossy().to_string(),
        });
    }

    Ok(out)
}

fn resolve_kubeconfig_path(path: Option<String>) -> Option<PathBuf> {
    if let Some(explicit) = path {
        let trimmed = explicit.trim();
        if !trimmed.is_empty() {
            return Some(PathBuf::from(trimmed));
        }
    }

    discover_kubeconfig_candidates()
        .into_iter()
        .map(PathBuf::from)
        .find(|p| p.exists())
}

fn graceful_stop_child(child: &mut Child) {
    let start = Instant::now();
    while start.elapsed() < SHUTDOWN_GRACE {
        match child.try_wait() {
            Ok(Some(_)) => return,
            Ok(None) => thread::sleep(Duration::from_millis(100)),
            Err(e) => {
                warn!("failed checking backend child status during shutdown: {e}");
                break;
            }
        }
    }

    if let Err(e) = child.kill() {
        warn!("failed to force kill backend child: {e}");
    }
    if let Err(e) = child.wait() {
        warn!("failed waiting for backend child after kill: {e}");
    }
}

fn restart_backend_sidecar_with_options(
    app: &AppHandle,
    state: &BackendState,
    require_cluster_verification: bool,
) -> anyhow::Result<()> {
    if !wait_and_begin_restart(&state.restart_in_progress, Duration::from_secs(20)) {
        return Err(anyhow::anyhow!(
            "sidecar restart already in progress for too long; retry in a moment"
        ));
    }

    let result = (|| -> anyhow::Result<()> {
        let mut cfg = state
            .config
            .lock()
            .map_err(|e| anyhow::anyhow!("sidecar config lock poisoned: {e}"))?
            .clone();

        if let Some((previous, next)) = ensure_sidecar_port_available(&mut cfg)? {
            warn!(
                "sidecar port {} was busy; switched to available port {} to avoid conflicts",
                previous, next
            );
            save_sidecar_config(app, &cfg)?;
            if let Ok(mut current) = state.config.lock() {
                *current = cfg.clone();
            }
        }

        {
            let mut guard = state
                .child
                .lock()
                .map_err(|e| anyhow::anyhow!("sidecar child lock poisoned: {e}"))?;
            if let Some(mut child) = guard.take() {
                graceful_stop_child(&mut child);
            }
        }

        if !wait_for_port_bindable(cfg.port, Duration::from_secs(3)) {
            if let Some((previous, next)) = ensure_sidecar_port_available(&mut cfg)? {
                warn!(
                    "sidecar port {} remained busy after shutdown; switched to {}",
                    previous, next
                );
                save_sidecar_config(app, &cfg)?;
                if let Ok(mut current) = state.config.lock() {
                    *current = cfg.clone();
                }
            }
        }

        let child = spawn_backend(app, &cfg, &state.logs)?;
        if !wait_for_backend_ready(cfg.port, STARTUP_TIMEOUT) {
            let mut child_to_stop = child;
            graceful_stop_child(&mut child_to_stop);
            return Err(anyhow::anyhow!(
                "sidecar failed to start for selected cluster/context on {}",
                backend_socket_addr(cfg.port)
            ));
        }

        let verified = wait_for_cluster_verification(cfg.port, CLUSTER_VERIFY_TIMEOUT);
        if verified {
            info!(
                "backend sidecar restarted and cluster verification passed on {}",
                backend_socket_addr(cfg.port)
            );
        } else {
            let mut child_to_stop = child;
            if require_cluster_verification {
                graceful_stop_child(&mut child_to_stop);
                return Err(anyhow::anyhow!(
                    "selected cluster/context did not become reachable on {} within {:?}",
                    backend_socket_addr(cfg.port),
                    CLUSTER_VERIFY_TIMEOUT
                ));
            }

            warn!(
                "cluster verification timed out on {} — exec-credential plugin may still be initialising; \
                 keeping sidecar running",
                backend_socket_addr(cfg.port)
            );

            let mut guard = state
                .child
                .lock()
                .map_err(|e| anyhow::anyhow!("sidecar child lock poisoned after restart: {e}"))?;
            *guard = Some(child_to_stop);
            return Ok(());
        }

        let mut guard = state
            .child
            .lock()
            .map_err(|e| anyhow::anyhow!("sidecar child lock poisoned after restart: {e}"))?;
        *guard = Some(child);
        Ok(())
    })();

    end_restart(&state.restart_in_progress);

    result
}

fn restart_backend_sidecar(app: &AppHandle, state: &BackendState) -> anyhow::Result<()> {
    restart_backend_sidecar_with_options(app, state, false)
}

fn start_backend_monitor(
    app_handle: AppHandle,
    child_ref: Arc<Mutex<Option<Child>>>,
    shutting_down: Arc<Mutex<bool>>,
    config_ref: Arc<Mutex<SidecarConfig>>,
    restart_in_progress: Arc<Mutex<bool>>,
    logs: SidecarLogs,
) {
    thread::spawn(move || loop {
        thread::sleep(Duration::from_secs(2));

        let should_stop = shutting_down
            .lock()
            .map(|v| *v)
            .unwrap_or(true);
        if should_stop {
            return;
        }

        let is_restarting = restart_in_progress
            .lock()
            .map(|v| *v)
            .unwrap_or(false);
        if is_restarting {
            continue;
        }

        let exited = {
            let mut guard = match child_ref.lock() {
                Ok(g) => g,
                Err(e) => {
                    error!("backend child mutex poisoned: {e}");
                    return;
                }
            };

            if let Some(child) = guard.as_mut() {
                match child.try_wait() {
                    Ok(Some(status)) => {
                        warn!("backend sidecar exited with status: {status}");
                        *guard = None;
                        true
                    }
                    Ok(None) => false,
                    Err(e) => {
                        warn!("failed checking backend sidecar status: {e}");
                        false
                    }
                }
            } else {
                true
            }
        };

        if exited {
            thread::sleep(RESTART_BACKOFF);

            if !try_begin_restart(&restart_in_progress) {
                continue;
            }

            let cfg = match config_ref.lock() {
                Ok(c) => c.clone(),
                Err(e) => {
                    end_restart(&restart_in_progress);
                    error!("sidecar config mutex poisoned: {e}");
                    return;
                }
            };

            let mut cfg = cfg;
            if let Ok(Some((previous, next))) = ensure_sidecar_port_available(&mut cfg) {
                warn!(
                    "monitor restart moved sidecar port from {} to {} because the original port was occupied",
                    previous, next
                );
                if let Ok(mut locked) = config_ref.lock() {
                    *locked = cfg.clone();
                }
                if let Err(e) = save_sidecar_config(&app_handle, &cfg) {
                    warn!("failed to persist auto-selected sidecar port: {e}");
                }
            }

            match spawn_backend(&app_handle, &cfg, &logs) {
                Ok(new_child) => {
                    let ready = wait_for_backend_ready(cfg.port, STARTUP_TIMEOUT);
                    let mut guard = match child_ref.lock() {
                        Ok(g) => g,
                        Err(e) => {
                            end_restart(&restart_in_progress);
                            error!("backend child mutex poisoned after restart: {e}");
                            return;
                        }
                    };
                    *guard = Some(new_child);

                    if ready {
                        info!(
                            "backend sidecar restarted and is healthy on {}",
                            backend_socket_addr(cfg.port)
                        );
                    } else {
                        warn!(
                            "backend sidecar restarted but readiness probe timed out on {}",
                            backend_socket_addr(cfg.port)
                        );
                    }
                }
                Err(e) => {
                    warn!("failed to restart backend sidecar: {e}");
                }
            }

            end_restart(&restart_in_progress);
        }
    });
}

#[tauri::command]
fn get_sidecar_config(state: State<'_, BackendState>) -> Result<SidecarConfig, String> {
    state
        .config
        .lock()
        .map(|cfg| cfg.clone())
        .map_err(|e| format!("failed to read sidecar config: {e}"))
}

#[tauri::command]
fn get_sidecar_logs(state: State<'_, BackendState>) -> Vec<String> {
    let mut lines: Vec<String> = Vec::new();

    // App-level events (AWS calls, kubeconfig ops, errors from Tauri commands)
    if let Some(buf) = APP_LOG_BUF.get() {
        if let Ok(guard) = buf.lock() {
            lines.extend(guard.iter().cloned());
        }
    }

    // Backend sidecar stdout/stderr
    if let Ok(guard) = state.logs.lock() {
        lines.extend(guard.iter().cloned());
    }

    lines
}

#[tauri::command]
fn set_sidecar_config(
    app: AppHandle,
    state: State<'_, BackendState>,
    config: SidecarConfig,
) -> Result<(), String> {
    let next_config = validated_config(config);

    let previous_config = state
        .config
        .lock()
        .map_err(|e| format!("failed to lock sidecar config: {e}"))?
        .clone();

    {
        let mut current = state
            .config
            .lock()
            .map_err(|e| format!("failed to lock sidecar config: {e}"))?;
        *current = next_config.clone();
    }

    save_sidecar_config(&app, &next_config)
        .map_err(|e| format!("failed to persist sidecar config: {e}"))?;

    {
        let mut status = state
            .switch_status
            .lock()
            .map_err(|e| format!("failed to lock switch status: {e}"))?;
        status.in_progress = true;
        status.last_success = None;
        status.message = None;
        status.requested_context = next_config.kube_context.clone();
    }

    let app_handle = app.clone();
    let child_ref = Arc::clone(&state.child);
    let config_ref = Arc::clone(&state.config);
    let shutting_down = Arc::clone(&state.shutting_down);
    let switch_status_ref = Arc::clone(&state.switch_status);
    let restart_in_progress_ref = Arc::clone(&state.restart_in_progress);
    let logs_ref = Arc::clone(&state.logs);

    // Restart sidecar in background so the command returns immediately and UI stays responsive.
    tauri::async_runtime::spawn(async move {
        let restart_state = BackendState {
            child: child_ref,
            shutting_down,
            config: config_ref,
            switch_status: switch_status_ref,
            restart_in_progress: restart_in_progress_ref,
            logs: logs_ref,
        };

        match restart_backend_sidecar_with_options(&app_handle, &restart_state, true) {
            Ok(()) => {
                if let Ok(mut status) = restart_state.switch_status.lock() {
                    status.in_progress = false;
                    status.last_success = Some(true);
                    status.message = None;
                }
            }
            Err(e) => {
                // Roll back to previous known-good config and restart old cluster.
                if let Ok(mut current) = restart_state.config.lock() {
                    *current = previous_config.clone();
                }
                let _ = save_sidecar_config(&app_handle, &previous_config);
                let _ = restart_backend_sidecar(&app_handle, &restart_state);

                let message = format!(
                    "failed to switch cluster: {e}. restored previous cluster configuration"
                );
                error!("{message}");
                if let Ok(mut status) = restart_state.switch_status.lock() {
                    status.in_progress = false;
                    status.last_success = Some(false);
                    status.message = Some(message);
                }
            }
        }
    });

    Ok(())
}

#[tauri::command]
fn get_cluster_switch_status(state: State<'_, BackendState>) -> Result<ClusterSwitchStatus, String> {
    state
        .switch_status
        .lock()
        .map(|status| status.clone())
        .map_err(|e| format!("failed to read switch status: {e}"))
}

#[tauri::command]
fn restart_sidecar(app: AppHandle, state: State<'_, BackendState>) -> Result<(), String> {
    restart_backend_sidecar(&app, &state).map_err(|e| format!("failed to restart sidecar: {e}"))
}

/// Run the exec-credential plugin for the currently selected kubeconfig context
/// interactively. For OIDC contexts (e.g. kubectl-oidc-login / kubelogin) this
/// opens the system browser for the user to complete authentication. After the
/// command exits successfully the sidecar is restarted so the backend picks up
/// the freshly cached credentials.
#[tauri::command]
async fn trigger_kube_browser_login(app: AppHandle, state: State<'_, BackendState>) -> Result<(), String> {
    let login_state = BackendState {
        child: Arc::clone(&state.child),
        shutting_down: Arc::clone(&state.shutting_down),
        config: Arc::clone(&state.config),
        switch_status: Arc::clone(&state.switch_status),
        restart_in_progress: Arc::clone(&state.restart_in_progress),
        logs: Arc::clone(&state.logs),
    };
    let app_handle = app.clone();

    tauri::async_runtime::spawn_blocking(move || {
        let guarded = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            trigger_kube_browser_login_impl(&app_handle, &login_state)
        }));

        match guarded {
            Ok(result) => result,
            Err(_) => Err("browser login workflow crashed unexpectedly".to_string()),
        }
    })
    .await
    .map_err(|e| format!("browser login task failed: {e}"))?
}

fn trigger_kube_browser_login_impl(app: &AppHandle, state: &BackendState) -> Result<(), String> {
    let cfg = state
        .config
        .lock()
        .map_err(|e| format!("lock error: {e}"))?
        .clone();

    // Resolve kubeconfig file.
    let kubeconfig_path = resolve_kubeconfig_path(cfg.kubeconfig_path.clone());
    let raw = match &kubeconfig_path {
        Some(p) => fs::read_to_string(p).map_err(|e| format!("cannot read kubeconfig: {e}"))?,
        None => return Err("no kubeconfig file found".to_string()),
    };

    let yaml: serde_yaml::Value =
        serde_yaml::from_str(&raw).map_err(|e| format!("invalid kubeconfig yaml: {e}"))?;
    let root = yaml.as_mapping().ok_or("kubeconfig is not a mapping")?;

    // Determine the context name.
    let context_name = cfg
        .kube_context
        .as_deref()
        .filter(|s| !s.trim().is_empty())
        .or_else(|| {
            root.get(serde_yaml::Value::String("current-context".into()))
                .and_then(|v| v.as_str())
        })
        .ok_or("no context specified")?
        .to_string();

    // Find user name for this context.
    let user_name = root
        .get(serde_yaml::Value::String("contexts".into()))
        .and_then(|v| v.as_sequence())
        .and_then(|ctxs| {
            ctxs.iter().find(|c| {
                c.as_mapping()
                    .and_then(|m| m.get(serde_yaml::Value::String("name".into())))
                    .and_then(|v| v.as_str())
                    == Some(&context_name)
            })
        })
        .and_then(|c| c.as_mapping())
        .and_then(|m| m.get(serde_yaml::Value::String("context".into())))
        .and_then(|v| v.as_mapping())
        .and_then(|m| m.get(serde_yaml::Value::String("user".into())))
        .and_then(|v| v.as_str())
        .map(str::to_string)
        .ok_or_else(|| format!("context '{context_name}' not found or has no user"))?;

    // Find exec credential for this user.
    let auth_info = root
        .get(serde_yaml::Value::String("users".into()))
        .and_then(|v| v.as_sequence())
        .and_then(|users| {
            users.iter().find(|u| {
                u.as_mapping()
                    .and_then(|m| m.get(serde_yaml::Value::String("name".into())))
                    .and_then(|v| v.as_str())
                    == Some(&user_name)
            })
        })
        .and_then(|u| u.as_mapping())
        .and_then(|m| m.get(serde_yaml::Value::String("user".into())))
        .and_then(|v| v.as_mapping())
        .ok_or_else(|| format!("user '{user_name}' not found in kubeconfig"))?;

    let exec = auth_info
        .get(serde_yaml::Value::String("exec".into()))
        .and_then(|v| v.as_mapping())
        .ok_or_else(|| format!("no exec credential configured for user '{user_name}'"))?;

    let command_str = exec
        .get(serde_yaml::Value::String("command".into()))
        .and_then(|v| v.as_str())
        .ok_or("exec credential has no 'command' field")?;

    let args: Vec<String> = exec
        .get(serde_yaml::Value::String("args".into()))
        .and_then(|v| v.as_sequence())
        .map(|seq| {
            seq.iter()
                .filter_map(|a| a.as_str().map(str::to_string))
                .collect()
        })
        .unwrap_or_default();

    let exec_env: Vec<(String, String)> = exec
        .get(serde_yaml::Value::String("env".into()))
        .and_then(|v| v.as_sequence())
        .map(|seq| {
            seq.iter()
                .filter_map(|entry| {
                    let map = entry.as_mapping()?;
                    let name = map
                        .get(serde_yaml::Value::String("name".into()))
                        .and_then(|v| v.as_str())?
                        .to_string();
                    let value = map
                        .get(serde_yaml::Value::String("value".into()))
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .to_string();
                    Some((name, value))
                })
                .collect()
        })
        .unwrap_or_default();

    info!(
        "Launching exec credential browser login: {} {:?}",
        command_str, args
    );

    let resolved_command = resolve_executable_command(command_str).ok_or_else(|| {
        format!(
            "failed to resolve exec credential command '{command_str}' on PATH. \
             Ensure the tool is installed and available in your login shell PATH."
        )
    })?;

    let shell = env_value("SHELL")
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| "/bin/zsh".to_string());

    let command_line = build_shell_command(&resolved_command.to_string_lossy(), &args);

    let mut cmd = Command::new(&shell);
    cmd.args(["-ilc", &command_line])
        .stdin(Stdio::null());

    // Provide a full PATH and all required env vars so the plugin can find its
    // dependencies and open the system browser.
    if let Some(path) = sidecar_path() {
        cmd.env("PATH", path);
    }
    for key in [
        "HOME", "USER", "LOGNAME", "SHELL",
        "DISPLAY", "XDG_RUNTIME_DIR", "DBUS_SESSION_BUS_ADDRESS",
        "BROWSER",
        "OMNICONFIG", "TALOSCONFIG",
        "AWS_PROFILE", "AWS_CONFIG_FILE",
        "AZURE_CLIENT_ID", "AZURE_TENANT_ID",
        "GOOGLE_APPLICATION_CREDENTIALS",
        "USE_GKE_GCLOUD_AUTH_PLUGIN",
    ] {
        forward_env_if_present(&mut cmd, key);
    }
    if let Some(ref p) = kubeconfig_path {
        cmd.env("KUBECONFIG", p);
    }
    for (key, value) in exec_env {
        cmd.env(key, value);
    }

    // Run synchronously — the plugin opens a browser and blocks until the user
    // finishes logging in or the operation is cancelled.
    let status = cmd
        .status()
        .map_err(|e| format!("failed to launch '{shell} -ilc {command_line}': {e}"))?;

    if !status.success() {
        return Err(format!(
            "Exec credential command exited with {status}. \
             Check that the OIDC provider is reachable and try again."
        ));
    }

    info!("Exec credential login succeeded; restarting sidecar to pick up new token.");

    // Restart the sidecar so the backend builds a fresh Kubernetes client using
    // the credentials that were just written to the credential cache.
    restart_backend_sidecar(app, state)
        .map_err(|e| format!("login succeeded but sidecar restart failed: {e}"))
}

#[tauri::command]
fn list_kubeconfig_candidates() -> Vec<String> {
    discover_kubeconfig_candidates()
}

#[tauri::command]
fn list_kubeconfig_clusters(kubeconfig_path: Option<String>) -> Result<Vec<KubeconfigCluster>, String> {
    let explicit_path = kubeconfig_path
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(PathBuf::from);

    if let Some(path) = explicit_path {
        return parse_kubeconfig_clusters(&path)
            .map_err(|e| format!("failed to parse kubeconfig clusters from {}: {e}", path.display()));
    }

    let mut all_clusters = Vec::<KubeconfigCluster>::new();
    let mut parse_errors = Vec::<String>::new();

    for candidate in discover_kubeconfig_candidates() {
        let path = PathBuf::from(&candidate);
        match parse_kubeconfig_clusters(&path) {
            Ok(clusters) => all_clusters.extend(clusters),
            Err(err) => parse_errors.push(format!("{}: {err}", path.display())),
        }
    }

    if all_clusters.is_empty() && !parse_errors.is_empty() {
        warn!(
            "no cluster contexts discovered; failed to parse {} kubeconfig candidate(s): {}",
            parse_errors.len(),
            parse_errors.join(" | ")
        );
    }

    Ok(all_clusters)
}

#[tauri::command]
fn open_external_url(url: String) -> Result<(), String> {
    if url.trim().is_empty() {
        return Err("url is empty".to_string());
    }
    #[cfg(target_os = "macos")]
    let status = Command::new("open").arg(&url).status();
    #[cfg(target_os = "linux")]
    let status = Command::new("xdg-open").arg(&url).status();
    #[cfg(target_os = "windows")]
    let status = Command::new("cmd").args(["/C", "start", "", &url]).status();
    match status {
        Ok(s) if s.success() => Ok(()),
        Ok(s) => Err(format!("failed to open url, exit status: {s}")),
        Err(e) => Err(format!("failed to open url: {e}")),
    }
}

#[tauri::command]
fn get_home_directory() -> Result<String, String> {
    dirs::home_dir()
        .map(|p| p.to_string_lossy().to_string())
        .ok_or_else(|| "Could not determine home directory".to_string())
}

#[derive(serde::Serialize)]
struct LocalFileEntry {
    name: String,
    path: String,
    is_dir: bool,
    size: u64,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct LocalFilePayload {
    name: String,
    path: String,
    content_base64: String,
}

#[tauri::command]
fn list_local_directory(path: String) -> Result<Vec<LocalFileEntry>, String> {
    let dir_path = if path.is_empty() {
        dirs::home_dir().unwrap_or_else(|| PathBuf::from("/"))
    } else {
        PathBuf::from(&path)
    };
    let entries = fs::read_dir(&dir_path)
        .map_err(|e| format!("Failed to read directory: {e}"))?;
    let mut files: Vec<LocalFileEntry> = Vec::new();
    for entry in entries.flatten() {
        let meta = entry.metadata().ok();
        let name = entry.file_name().to_string_lossy().to_string();
        if name.starts_with('.') { continue; }
        let is_dir = meta.as_ref().map(|m| m.is_dir()).unwrap_or(false);
        let size = meta.as_ref().map(|m| m.len()).unwrap_or(0);
        let path = entry.path().to_string_lossy().to_string();
        files.push(LocalFileEntry { name, path, is_dir, size });
    }
    files.sort_by(|a, b| match (a.is_dir, b.is_dir) {
        (true, false) => std::cmp::Ordering::Less,
        (false, true) => std::cmp::Ordering::Greater,
        _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
    });
    Ok(files)
}

#[tauri::command]
fn read_local_files(paths: Vec<String>) -> Result<Vec<LocalFilePayload>, String> {
    let mut out: Vec<LocalFilePayload> = Vec::new();
    for p in paths {
        let path = PathBuf::from(&p);
        let meta = fs::metadata(&path).map_err(|e| format!("Failed to read metadata for {}: {e}", p))?;
        if !meta.is_file() {
            continue;
        }
        let bytes = fs::read(&path).map_err(|e| format!("Failed to read file {}: {e}", p))?;
        let name = path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("file.bin")
            .to_string();
        out.push(LocalFilePayload {
            name,
            path: p,
            content_base64: STANDARD.encode(bytes),
        });
    }
    Ok(out)
}

/// Save a file from the local backend API to an absolute local path.
/// URL must point to 127.0.0.1 to prevent SSRF.
#[tauri::command]
fn save_pod_file(url: String, local_path: String) -> Result<String, String> {
    if url.trim().is_empty() { return Err("url is empty".to_string()); }
    if !url.starts_with("http://127.0.0.1:") && !url.starts_with("http://localhost:") {
        return Err("download is only allowed from the local backend".to_string());
    }
    if local_path.trim().is_empty() { return Err("local_path is empty".to_string()); }
    let dest = PathBuf::from(&local_path);
    if let Some(parent) = dest.parent() { let _ = fs::create_dir_all(parent); }
    let status = Command::new("curl")
        .arg("-sL").arg("--output").arg(&dest).arg("--max-time").arg("120").arg(&url)
        .status()
        .map_err(|e| format!("failed to run curl: {e}"))?;
    if !status.success() { return Err(format!("curl failed with status: {status}")); }
    Ok(dest.display().to_string())
}

#[tauri::command]
fn save_base64_file(default_file_name: String, base64_data: String) -> Result<Option<String>, String> {
    let suggested_name = if default_file_name.trim().is_empty() {
        "resource-map.png".to_string()
    } else {
        default_file_name.trim().to_string()
    };

    let ext = Path::new(&suggested_name)
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_ascii_lowercase())
        .unwrap_or_default();

    let dialog = rfd::FileDialog::new().set_file_name(&suggested_name);
    let dialog = match ext.as_str() {
        "png" => dialog.add_filter("PNG image", &["png"]),
        "jpg" | "jpeg" => dialog.add_filter("JPEG image", &["jpg", "jpeg"]),
        "yaml" | "yml" => dialog.add_filter("YAML file", &["yaml", "yml"]),
        "json" => dialog.add_filter("JSON file", &["json"]),
        "txt" => dialog.add_filter("Text file", &["txt"]),
        _ => dialog,
    };

    let dest = dialog.save_file();

    let Some(dest) = dest else {
        return Ok(None);
    };

    let encoded = base64_data
        .split_once(',')
        .map(|(_, value)| value)
        .unwrap_or(base64_data.as_str());

    let bytes = STANDARD
        .decode(encoded)
        .map_err(|e| format!("failed to decode file data: {e}"))?;

    if let Some(parent) = dest.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("failed to create destination directory: {e}"))?;
    }

    fs::write(&dest, bytes).map_err(|e| format!("failed to save file: {e}"))?;
    Ok(Some(dest.display().to_string()))
}

#[derive(Debug, serde::Serialize)]
struct EksClusterEntry {
    name: String,
    region: String,
    arn: String,
}

#[tauri::command]
fn list_eks_clusters(
    access_key: String,
    secret_key: String,
    session_token: String,
    region: String,
) -> Result<Vec<EksClusterEntry>, String> {
    let access_key = access_key.trim().to_string();
    let secret_key = secret_key.trim().to_string();
    let session_token = session_token.trim().to_string();

    if access_key.is_empty() || secret_key.is_empty() {
        let msg = "AWS access key and secret key are required".to_string();
        app_log(format!("[aws] ERROR: {msg}"));
        return Err(msg);
    }

    if access_key.starts_with("ASIA") && session_token.is_empty() {
        let msg = "AWS session token is required for temporary STS credentials".to_string();
        app_log(format!("[aws] ERROR: {msg}"));
        return Err(msg);
    }

    let region = if region.trim().is_empty() {
        "us-east-1".to_string()
    } else {
        region.trim().to_string()
    };

    app_log(format!("[aws] list-clusters region={region} key={}...", &access_key[..access_key.len().min(8)]));

    let aws_bin = match resolve_executable_command("aws") {
        Some(b) => { app_log(format!("[aws] binary={}", b.display())); b }
        None => {
            let msg = "failed to resolve 'aws' command on PATH".to_string();
            app_log(format!("[aws] ERROR: {msg}"));
            return Err(msg);
        }
    };

    let mut cmd = Command::new(aws_bin);
    cmd.args(["eks", "list-clusters", "--output", "json", "--region", &region])
        .stdin(Stdio::null());

    if let Some(path) = sidecar_path() {
        cmd.env("PATH", path);
    }

    for key in ["HOME", "USER", "LOGNAME", "SHELL", "AWS_PROFILE", "AWS_CONFIG_FILE"] {
        forward_env_if_present(&mut cmd, key);
    }

    cmd.env("AWS_ACCESS_KEY_ID", &access_key)
        .env("AWS_SECRET_ACCESS_KEY", &secret_key)
        .env("AWS_REGION", &region)
        .env("AWS_DEFAULT_REGION", &region);

    if !session_token.is_empty() {
        cmd.env("AWS_SESSION_TOKEN", &session_token);
    }

    let output = cmd
        .output()
        .map_err(|e| format!("failed to run aws eks list-clusters: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        let msg = if stderr.is_empty() {
            format!("aws eks list-clusters failed with status {}", output.status)
        } else {
            format!("aws eks list-clusters failed: {stderr}")
        };
        app_log(format!("[aws] ERROR: {msg}"));
        return Err(msg);
    }

    let stdout_preview = String::from_utf8_lossy(&output.stdout);
    app_log(format!("[aws] list-clusters stdout: {}", stdout_preview.trim()));

    let stdout = String::from_utf8_lossy(&output.stdout);
    let json: serde_json::Value =
        serde_json::from_str(&stdout).map_err(|e| format!("failed to parse aws output: {e}"))?;

    let cluster_names = json["clusters"]
        .as_array()
        .ok_or_else(|| "unexpected aws output format".to_string())?;

    // Fetch real ARNs by calling describe-cluster for each. Fall back to name-only if it fails.
    let mut entries: Vec<EksClusterEntry> = Vec::new();
    for name in cluster_names.iter().filter_map(|v| v.as_str()) {
        let arn = describe_eks_cluster_arn(&access_key, &secret_key, &session_token, &region, name)
            .unwrap_or_else(|| format!("arn:aws:eks:{region}:unknown:cluster/{name}"));
        entries.push(EksClusterEntry {
            name: name.to_string(),
            region: region.clone(),
            arn,
        });
    }

    Ok(entries)
}

fn describe_eks_cluster_arn(access_key: &str, secret_key: &str, session_token: &str, region: &str, cluster_name: &str) -> Option<String> {
    let aws_bin = resolve_executable_command("aws")?;
    let mut cmd = Command::new(aws_bin);
    cmd.args([
        "eks", "describe-cluster",
        "--name", cluster_name,
        "--region", region,
        "--query", "cluster.arn",
        "--output", "text",
    ])
    .stdin(Stdio::null());

    if let Some(path) = sidecar_path() {
        cmd.env("PATH", path);
    }
    cmd.env("AWS_ACCESS_KEY_ID", access_key)
        .env("AWS_SECRET_ACCESS_KEY", secret_key)
        .env("AWS_REGION", region)
        .env("AWS_DEFAULT_REGION", region);
    if !session_token.is_empty() {
        cmd.env("AWS_SESSION_TOKEN", session_token);
    }
    if let Some(home) = env_value("HOME") { cmd.env("HOME", home); }

    let output = cmd.output().ok()?;
    if !output.status.success() {
        return None;
    }
    let arn = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if arn.starts_with("arn:aws:eks:") {
        Some(arn)
    } else {
        None
    }
}

#[tauri::command]
fn aws_eks_update_kubeconfig(
    access_key: String,
    secret_key: String,
    session_token: String,
    region: String,
    cluster_name: String,
) -> Result<String, String> {
    let region = region.trim().to_string();
    let cluster_name = cluster_name.trim().to_string();
    let session_token = session_token.trim().to_string();

    if access_key.trim().starts_with("ASIA") && session_token.is_empty() {
        let msg = "AWS session token is required for temporary STS credentials".to_string();
        app_log(format!("[aws] ERROR: {msg}"));
        return Err(msg);
    }

    app_log(format!("[aws] update-kubeconfig cluster={cluster_name} region={region}"));

    let aws_bin = match resolve_executable_command("aws") {
        Some(b) => b,
        None => {
            let msg = "failed to resolve 'aws' command on PATH".to_string();
            app_log(format!("[aws] ERROR: {msg}"));
            return Err(msg);
        }
    };

    let mut cmd = Command::new(aws_bin);
    cmd.args([
        "eks", "update-kubeconfig",
        "--name", &cluster_name,
        "--region", &region,
    ])
    .stdin(Stdio::null());

    if let Some(path) = sidecar_path() {
        cmd.env("PATH", path);
    }

    for key in ["HOME", "USER", "LOGNAME", "SHELL", "AWS_PROFILE", "AWS_CONFIG_FILE", "KUBECONFIG"] {
        forward_env_if_present(&mut cmd, key);
    }

    cmd.env("AWS_ACCESS_KEY_ID", &access_key)
        .env("AWS_SECRET_ACCESS_KEY", &secret_key)
        .env("AWS_REGION", &region)
        .env("AWS_DEFAULT_REGION", &region);

    if !session_token.is_empty() {
        cmd.env("AWS_SESSION_TOKEN", &session_token);
    }

    let output = cmd
        .output()
        .map_err(|e| format!("failed to run aws eks update-kubeconfig: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(if stderr.is_empty() {
            format!("aws eks update-kubeconfig failed with status {}", output.status)
        } else {
            format!("aws eks update-kubeconfig failed: {stderr}")
        });
    }

    let stdout_str = String::from_utf8_lossy(&output.stdout);
    app_log(format!("[aws] update-kubeconfig stdout: {}", stdout_str.trim()));

    // Parse context name from stdout:
    // "Updated context arn:aws:eks:<region>:<account>:cluster/<name> in /path/kubeconfig"
    let stdout = String::from_utf8_lossy(&output.stdout);
    let context = stdout
        .split_whitespace()
        .find(|w| w.starts_with("arn:aws:eks:"))
        .map(|w| w.trim_end_matches(['.', ',', ';']).to_string())
        .unwrap_or_else(|| cluster_name.clone());

    Ok(context)
}

#[tauri::command]
fn log_omni_connection_attempt(
    omni_url: String,
    email: String,
) -> Result<(), String> {
    let omni_url = omni_url.trim().to_string();
    let email = email.trim().to_string();
    app_log(format!("[omni] connection-attempt url={} email={}", omni_url, email));
    Ok(())
}

/// Resolve the omniconfig file path and the best-matching context name for the
/// given Omni endpoint URL. Returns `(omniconfig_path, context_name)` when
/// found so callers can pass `--omniconfig` and `--context` explicitly to
/// omnictl, avoiding "context not found" errors in release builds where env
/// vars may not be inherited from the user's interactive shell.
fn find_omni_context(omni_url: &str) -> Option<(PathBuf, String)> {
    let config_path = if let Some(p) = env_value("OMNICONFIG") {
        PathBuf::from(p)
    } else if let Some(home) = resolve_home_dir() {
        PathBuf::from(home).join(".talos/omni/config")
    } else {
        app_log("[omni] find_omni_context: HOME not set, cannot locate omniconfig".to_string());
        return None;
    };

    if !config_path.exists() {
        app_log(format!("[omni] omniconfig not found at {}", config_path.display()));
        return None;
    }

    let content = match fs::read_to_string(&config_path) {
        Ok(c) => c,
        Err(e) => {
            app_log(format!("[omni] failed to read omniconfig {}: {e}", config_path.display()));
            return None;
        }
    };

    let yaml: serde_yaml::Value = match serde_yaml::from_str(&content) {
        Ok(v) => v,
        Err(e) => {
            app_log(format!("[omni] failed to parse omniconfig: {e}"));
            return None;
        }
    };

    let contexts = yaml.get("contexts").and_then(|v| v.as_mapping());
    if let Some(contexts) = contexts {
        let normalized_url = omni_url.trim_end_matches('/').to_lowercase();

        // First pass: find a context whose URL matches the provided endpoint.
        for (key, ctx) in contexts {
            let ctx_url = ctx
                .get("url")
                .and_then(|v| v.as_str())
                .map(|u| u.trim_end_matches('/').to_lowercase());
            if let (Some(name), Some(url)) = (key.as_str(), ctx_url) {
                if url == normalized_url {
                    app_log(format!("[omni] matched context={name} for url={omni_url}"));
                    return Some((config_path, name.to_string()));
                }
            }
        }

        // Second pass: current-context.
        if let Some(current) = yaml.get("current-context").and_then(|v| v.as_str()) {
            if !current.is_empty() && contexts.get(current).is_some() {
                app_log(format!("[omni] using current-context={current}"));
                return Some((config_path, current.to_string()));
            }
        }

        // Third pass: first available context.
        if let Some((key, _)) = contexts.iter().next() {
            if let Some(name) = key.as_str() {
                app_log(format!("[omni] falling back to first context={name}"));
                return Some((config_path, name.to_string()));
            }
        }
    }

    app_log(format!("[omni] no usable context found in omniconfig at {}", config_path.display()));
    None
}

fn resolve_home_dir() -> Option<PathBuf> {
    if let Some(home) = env_value("HOME") {
        let p = PathBuf::from(home);
        if !p.as_os_str().is_empty() {
            return Some(p);
        }
    }
    dirs::home_dir()
}

fn resolve_siderov1_keys_dir() -> Option<PathBuf> {
    if let Some(explicit) = env_value("SIDEROV1_KEYS_DIR") {
        let p = PathBuf::from(explicit);
        if p.exists() {
            return Some(p);
        }
    }

    if let Some(home) = resolve_home_dir() {
        let p = home.join(".talos/keys");
        if p.exists() {
            return Some(p);
        }
    }

    None
}

#[tauri::command]
fn omni_update_kubeconfig(
    cluster_name: String,
    omni_url: String,
) -> Result<String, String> {
    let cluster_name = cluster_name.trim().to_string();
    let omni_url = omni_url.trim().to_string();

    if cluster_name.is_empty() {
        let msg = "Omni cluster name is required".to_string();
        app_log(format!("[omni] ERROR: {msg}"));
        return Err(msg);
    }
    if omni_url.is_empty() {
        let msg = "Omni URL is required".to_string();
        app_log(format!("[omni] ERROR: {msg}"));
        return Err(msg);
    }

    let context_name = format!("omni-{}", cluster_name);
    app_log(format!(
        "[omni] update-kubeconfig cluster={} endpoint={} context={}",
        cluster_name, omni_url, context_name
    ));

    let omnictl_bin = match resolve_executable_command("omnictl") {
        Some(b) => {
            app_log(format!("[omni] binary={}", b.display()));
            b
        }
        None => {
            let msg = "failed to resolve 'omnictl' command on PATH".to_string();
            app_log(format!("[omni] ERROR: {msg}"));
            return Err(msg);
        }
    };

    let omni_context = find_omni_context(&omni_url);
    let resolved_home = resolve_home_dir();
    let siderov1_keys_dir = resolve_siderov1_keys_dir();

    if let Some(home) = &resolved_home {
        app_log(format!("[omni] resolved HOME={}", home.display()));
    }

    // Build omnictl command arguments
    let mut omnictl_args = Vec::new();
    
    // --omniconfig and --context are global flags; they must come before the subcommand.
    // When no valid context is found (e.g. empty default config), point --omniconfig at a
    // nonexistent path so omnictl skips the empty ~/.talos/omni/config and falls back to
    // using OMNI_ENDPOINT (which we always set below).
    match &omni_context {
        Some((cfg_path, ctx_name)) => {
            app_log(format!("[omni] kubeconfig using --omniconfig={} --context={}", cfg_path.display(), ctx_name));
            omnictl_args.push("--omniconfig".to_string());
            omnictl_args.push(cfg_path.to_string_lossy().to_string());
            omnictl_args.push("--context".to_string());
            omnictl_args.push(ctx_name.clone());
        }
        None => {
            app_log("[omni] kubeconfig: no valid context, using OMNI_ENDPOINT with placeholder omniconfig".to_string());
            omnictl_args.push("--omniconfig".to_string());
            omnictl_args.push("/tmp/.pertisk-omni-no-context-placeholder".to_string());
        }
    }
    if let Some(keys_dir) = &siderov1_keys_dir {
        app_log(format!("[omni] kubeconfig using --siderov1-keys-dir={}", keys_dir.display()));
        omnictl_args.push("--siderov1-keys-dir".to_string());
        omnictl_args.push(keys_dir.to_string_lossy().to_string());
    }
    
    omnictl_args.extend(vec![
        "kubeconfig".to_string(),
        "--cluster".to_string(),
        cluster_name.clone(),
        "--merge".to_string(),
        "--force".to_string(),
        "--force-context-name".to_string(),
        context_name.clone(),
    ]);

    // Build the shell command with environment variables
    let omnictl_cmd = build_shell_command(&omnictl_bin.to_string_lossy(), &omnictl_args);
    let shell_cmd = format!(
        "OMNI_ENDPOINT={} {}",
        shell_quote(&omni_url),
        omnictl_cmd
    );
    
    let shell = env_value("SHELL").unwrap_or_else(|| "/bin/zsh".to_string());
    
    app_log(format!("[omni] running via shell: {} -ilc [command]", shell));

    let mut cmd = Command::new(&shell);
    cmd.args(["-ilc", &shell_cmd]).stdin(Stdio::null());

    if let Some(path) = sidecar_path() {
        cmd.env("PATH", path);
    }

    if let Some(home) = &resolved_home {
        cmd.env("HOME", home);
    }
    if let Some(keys_dir) = &siderov1_keys_dir {
        cmd.env("SIDEROV1_KEYS_DIR", keys_dir);
    }

    for key in ["HOME", "USER", "LOGNAME", "SHELL", "OMNICONFIG", "TALOSCONFIG", "KUBECONFIG", "SIDEROV1_KEYS_DIR"] {
        forward_env_if_present(&mut cmd, key);
    }

    let output = cmd
        .output()
        .map_err(|e| format!("failed to run omnictl kubeconfig: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
        
        // Log stdout for debugging
        if !stdout.is_empty() {
            app_log(format!("[omni] kubeconfig stdout: {}", stdout));
        }
        
        let msg = if stderr.is_empty() {
            format!("omnictl kubeconfig failed with status {}", output.status)
        } else {
            format!("omnictl kubeconfig failed: {stderr}")
        };
        app_log(format!("[omni] ERROR: {msg}"));
        return Err(msg);
    }

    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if !stdout.is_empty() {
        app_log(format!("[omni] update-kubeconfig stdout: {stdout}"));
    }

    Ok(context_name)
}

#[tauri::command]
fn list_omni_clusters(
    omni_url: String,
) -> Result<Vec<serde_json::Value>, String> {
    fn preview(s: &str, max: usize) -> String {
        let trimmed = s.trim();
        if trimmed.chars().count() <= max {
            return trimmed.to_string();
        }
        let mut out = String::new();
        for (i, ch) in trimmed.chars().enumerate() {
            if i >= max {
                break;
            }
            out.push(ch);
        }
        out.push_str("...<truncated>");
        out
    }

    let omni_url = omni_url.trim().to_string();

    if omni_url.is_empty() {
        let msg = "Omni URL is required".to_string();
        app_log(format!("[omni] ERROR: {msg}"));
        return Err(msg);
    }

    app_log(format!("[omni] list-clusters endpoint={omni_url}"));

    let omniconfig_env = env_value("OMNICONFIG").unwrap_or_else(|| "<unset>".to_string());
    let default_omni_cfg_exists = env_value("HOME")
        .map(|h| PathBuf::from(h).join(".talos/omni/config").exists())
        .unwrap_or(false);
    app_log(format!(
        "[omni] runtime env OMNICONFIG={} default_config_exists={} HOME={}",
        omniconfig_env,
        default_omni_cfg_exists,
        env_value("HOME").unwrap_or_else(|| "<unset>".to_string())
    ));

    let omnictl_bin = match resolve_executable_command("omnictl") {
        Some(b) => {
            app_log(format!("[omni] binary={}", b.display()));
            b
        }
        None => {
            let msg = "failed to resolve 'omnictl' command on PATH".to_string();
            app_log(format!("[omni] ERROR: {msg}"));
            return Err(msg);
        }
    };

    fn looks_like_real_omni_cluster_name(name: &str) -> bool {
        let n = name.trim();
        if n.is_empty() {
            return false;
        }

        // Keep this permissive enough to avoid false negatives across naming schemes.
        // We only block obvious non-cluster/control-plane artifacts below.
        if n.len() > 200 {
            return false;
        }

        // Filter known non-cluster/control-plane artifact names.
        if n.ends_with("Controller") || n.contains("Controller") {
            return false;
        }

        let lower = n.to_ascii_lowercase();
        if lower.contains("controllerversion")
            || lower.contains("resource definition")
            || lower.contains("resourcedefinition")
            || lower.contains("clusterconfigversioncontroller")
            || lower.contains("backupdatacontroller")
            || lower.contains("clusterdestroystatuscontroller")
        {
            return false;
        }

        true
    }

    fn omni_name_from_item(item: &serde_json::Value) -> Option<String> {
        let candidates = [
            item.pointer("/name").and_then(|v| v.as_str()),
            item.pointer("/metadata/name").and_then(|v| v.as_str()),
            item.pointer("/metadata/id").and_then(|v| v.as_str()),
            item.pointer("/id").and_then(|v| v.as_str()),
            item.pointer("/spec/name").and_then(|v| v.as_str()),
        ];

        for c in candidates.into_iter().flatten() {
            let t = c.trim();
            if !t.is_empty() && looks_like_real_omni_cluster_name(t) {
                return Some(t.to_string());
            }
        }
        None
    }

    fn omni_extract_names(json: &serde_json::Value) -> Vec<serde_json::Value> {
        let mut names = BTreeSet::<String>::new();

        let items: Vec<&serde_json::Value> = if let Some(arr) = json.as_array() {
            arr.iter().collect()
        } else if let Some(arr) = json.get("items").and_then(|v| v.as_array()) {
            arr.iter().collect()
        } else {
            vec![json]
        };

        for item in items {
            if let Some(name) = omni_name_from_item(item) {
                names.insert(name);
            }
        }

        names
            .into_iter()
            .map(|name| serde_json::json!({ "name": name }))
            .collect()
    }

    let arg_variants: Vec<Vec<String>> = vec![
        vec!["get".to_string(), "clusters".to_string()],
    ];

    let resolved_home = resolve_home_dir();
    let omni_context = find_omni_context(&omni_url);
    let siderov1_keys_dir = resolve_siderov1_keys_dir();

    if let Some(home) = &resolved_home {
        app_log(format!("[omni] list-clusters resolved HOME={}", home.display()));
    }
    if let Some((cfg_path, ctx_name)) = &omni_context {
        app_log(format!(
            "[omni] list-clusters using --omniconfig={} --context={}",
            cfg_path.display(),
            ctx_name
        ));
    } else {
        app_log("[omni] list-clusters: no matching context found, using OMNI_ENDPOINT fallback".to_string());
    }
    if let Some(keys_dir) = &siderov1_keys_dir {
        app_log(format!("[omni] list-clusters using --siderov1-keys-dir={}", keys_dir.display()));
    }

    let mut last_error = String::new();
    let mut had_successful_output = false;

    let mut first_successful_empty: Option<Vec<serde_json::Value>> = None;

    #[derive(Clone)]
    struct OmniAuthAttempt {
        use_context: bool,
        use_keys_dir: bool,
        label: &'static str,
    }

    let mut auth_attempts: Vec<OmniAuthAttempt> = Vec::new();
    if omni_context.is_some() {
        if siderov1_keys_dir.is_some() {
            auth_attempts.push(OmniAuthAttempt {
                use_context: true,
                use_keys_dir: true,
                label: "context+keys",
            });
        }
        auth_attempts.push(OmniAuthAttempt {
            use_context: true,
            use_keys_dir: false,
            label: "context-only",
        });
    }

    // Always try endpoint-only mode as a fallback. This avoids stale or mismatched
    // local context/keys causing invalid-signature auth failures.
    auth_attempts.push(OmniAuthAttempt {
        use_context: false,
        use_keys_dir: false,
        label: "endpoint-only",
    });

    for args in arg_variants {
        for auth_attempt in &auth_attempts {
        let cmd_label = format!("omnictl {}", args.join(" "));
        let mut omnictl_args = Vec::new();
        if auth_attempt.use_context {
            if let Some((cfg_path, ctx_name)) = &omni_context {
                omnictl_args.push("--omniconfig".to_string());
                omnictl_args.push(cfg_path.to_string_lossy().to_string());
                omnictl_args.push("--context".to_string());
                omnictl_args.push(ctx_name.clone());
            }
        } else {
            // Keep fallback behavior when no usable omniconfig/context exists.
            omnictl_args.push("--omniconfig".to_string());
            omnictl_args.push("/tmp/.pertisk-omni-no-context-placeholder".to_string());
        }

        if auth_attempt.use_keys_dir {
            if let Some(keys_dir) = &siderov1_keys_dir {
            omnictl_args.push("--siderov1-keys-dir".to_string());
            omnictl_args.push(keys_dir.to_string_lossy().to_string());
            }
        }
        omnictl_args.extend(args.clone());

        let omnictl_cmd = build_shell_command(&omnictl_bin.to_string_lossy(), &omnictl_args);
        let shell_cmd = format!(
            "OMNI_ENDPOINT={} {}",
            shell_quote(&omni_url),
            omnictl_cmd
        );
        let shell = env_value("SHELL").unwrap_or_else(|| "/bin/zsh".to_string());

        app_log(format!(
            "[omni] list-clusters auth-attempt={} cmd={} -ilc {}",
            auth_attempt.label, shell, shell_cmd
        ));

        let mut cmd = Command::new(&shell);
        cmd.args(["-ilc", &shell_cmd]).stdin(Stdio::null());

        if let Some(path) = sidecar_path() {
            cmd.env("PATH", path);
        }

        if let Some(home) = &resolved_home {
            cmd.env("HOME", home);
        }
        if auth_attempt.use_keys_dir {
            if let Some(keys_dir) = &siderov1_keys_dir {
            cmd.env("SIDEROV1_KEYS_DIR", keys_dir);
            }
        }

        for key in ["HOME", "USER", "LOGNAME", "SHELL", "OMNICONFIG", "TALOSCONFIG", "KUBECONFIG", "SIDEROV1_KEYS_DIR"] {
            forward_env_if_present(&mut cmd, key);
        }

        let output = match cmd.output() {
            Ok(v) => v,
            Err(e) => {
                last_error = format!("failed to run omnictl cluster list via '{shell} -ilc': {e}");
                continue;
            }
        };

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
            let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
            let msg = if stderr.is_empty() {
                format!("omnictl cluster list failed with status {}", output.status)
            } else {
                format!("omnictl cluster list failed: {stderr}")
            };
            app_log(format!("[omni] WARN: {msg}"));
            if !stdout.is_empty() {
                app_log(format!("[omni] WARN stdout-preview: {}", preview(&stdout, 400)));
            }
            last_error = msg;
            continue;
        }

        had_successful_output = true;

        let stdout = String::from_utf8_lossy(&output.stdout).to_string();
        app_log(format!("[omni] list-clusters stdout: {}", stdout.trim()));

        if let Ok(json) = serde_json::from_str::<serde_json::Value>(&stdout) {
            app_log(format!("[omni] list-clusters json-preview={}", preview(&stdout, 800)));
            let clusters = omni_extract_names(&json);
            app_log(format!("[omni] list-clusters count={}", clusters.len()));
            if !clusters.is_empty() {
                let names: Vec<String> = clusters
                    .iter()
                    .filter_map(|v| v.get("name").and_then(|n| n.as_str()).map(|s| s.to_string()))
                    .collect();
                app_log(format!("[omni] list-clusters source={cmd_label} names={}", names.join(",")));
                return Ok(clusters);
            }
            if first_successful_empty.is_none() {
                first_successful_empty = Some(clusters);
                continue;
            }
        }

        // Table fallback specifically for: `omnictl get clusters`
        // Example:
        // NAMESPACE   TYPE      ID                            VERSION ...
        // default     Cluster   talos-orangepi-prod-cluster   14      ...
        if args.len() >= 2 && args[0] == "get" && args[1] == "clusters" {
            let mut names = BTreeSet::<String>::new();
            for line in stdout.lines() {
                let t = line.trim();
                if t.is_empty() {
                    continue;
                }
                let upper = t.to_ascii_uppercase();
                if upper.starts_with("NAMESPACE") {
                    continue;
                }

                let cols: Vec<&str> = t.split_whitespace().collect();
                if cols.len() < 3 {
                    continue;
                }

                // Expect TYPE column to be Cluster and ID column to be name.
                if !cols[1].eq_ignore_ascii_case("cluster") {
                    continue;
                }

                let cluster_id = cols[2].trim();
                if looks_like_real_omni_cluster_name(cluster_id) {
                    names.insert(cluster_id.to_string());
                }
            }

            if !names.is_empty() {
                let clusters: Vec<serde_json::Value> = names
                    .into_iter()
                    .map(|name| serde_json::json!({ "name": name }))
                    .collect();
                app_log(format!("[omni] list-clusters count={} (table)", clusters.len()));
                let names: Vec<String> = clusters
                    .iter()
                    .filter_map(|v| v.get("name").and_then(|n| n.as_str()).map(|s| s.to_string()))
                    .collect();
                app_log(format!("[omni] list-clusters source={cmd_label} names={}", names.join(",")));
                return Ok(clusters);
            }
        }

        last_error = "omnictl returned non-JSON output for JSON request".to_string();
        app_log(format!(
            "[omni] non-json output for {} stdout-preview={}",
            cmd_label,
            preview(&stdout, 400)
        ));
        }
    }

    let msg = if last_error.is_empty() {
        "omnictl cluster list failed for all supported output formats".to_string()
    } else {
        last_error
    };
    if let Some(clusters) = first_successful_empty {
        app_log("[omni] list-clusters count=0 (json parsed but no valid cluster names found)");
        return Ok(clusters);
    }
    if had_successful_output {
        app_log("[omni] ERROR: successful command returned non-json output for all attempts");
    }
    app_log(format!("[omni] ERROR: {msg}"));
    Err(msg)
}

#[tauri::command]
fn list_gcp_clusters(
    project_id: String,
) -> Result<Vec<serde_json::Value>, String> {
    let project_id = project_id.trim().to_string();
    
    if project_id.is_empty() {
        let msg = "GCP project ID is required".to_string();
        app_log(format!("[gcp] ERROR: {msg}"));
        return Err(msg);
    }

    app_log(format!("[gcp] list-clusters project_id={project_id}"));

    let gcloud_bin = match resolve_executable_command("gcloud") {
        Some(b) => { app_log(format!("[gcp] binary={}", b.display())); b }
        None => {
            let msg = "failed to resolve 'gcloud' command on PATH".to_string();
            app_log(format!("[gcp] ERROR: {msg}"));
            return Err(msg);
        }
    };

    let mut cmd = Command::new(gcloud_bin);
    cmd.args(["container", "clusters", "list", "--project", &project_id, "--format", "json"])
        .stdin(Stdio::null());

    if let Some(path) = sidecar_path() {
        cmd.env("PATH", path);
    }

    for key in ["HOME", "USER", "LOGNAME", "SHELL", "GOOGLE_APPLICATION_CREDENTIALS"] {
        forward_env_if_present(&mut cmd, key);
    }

    let output = cmd
        .output()
        .map_err(|e| format!("failed to run gcloud container clusters list: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        let msg = if stderr.is_empty() {
            format!("gcloud container clusters list failed with status {}", output.status)
        } else {
            format!("gcloud container clusters list failed: {stderr}")
        };
        app_log(format!("[gcp] ERROR: {msg}"));
        return Err(msg);
    }

    let stdout_preview = String::from_utf8_lossy(&output.stdout);
    app_log(format!("[gcp] list-clusters stdout: {}", stdout_preview.trim()));

    let stdout = String::from_utf8_lossy(&output.stdout);
    let json: serde_json::Value =
        serde_json::from_str(&stdout).map_err(|e| format!("failed to parse gcloud output: {e}"))?;

    let clusters = json.as_array()
        .cloned()
        .ok_or_else(|| "unexpected gcloud output format".to_string())?;

    Ok(clusters)
}

#[tauri::command]
fn list_azure_clusters(
    subscription_id: String,
) -> Result<Vec<serde_json::Value>, String> {
    let subscription_id = subscription_id.trim().to_string();
    
    if subscription_id.is_empty() {
        let msg = "Azure subscription ID is required".to_string();
        app_log(format!("[azure] ERROR: {msg}"));
        return Err(msg);
    }

    app_log(format!("[azure] list-clusters subscription_id={}", &subscription_id[..subscription_id.len().min(8)]));

    let az_bin = match resolve_executable_command("az") {
        Some(b) => { app_log(format!("[azure] binary={}", b.display())); b }
        None => {
            let msg = "failed to resolve 'az' command on PATH".to_string();
            app_log(format!("[azure] ERROR: {msg}"));
            return Err(msg);
        }
    };

    let mut cmd = Command::new(az_bin);
    cmd.args(["aks", "list", "--subscription", &subscription_id, "--output", "json"])
        .stdin(Stdio::null());

    if let Some(path) = sidecar_path() {
        cmd.env("PATH", path);
    }

    for key in ["HOME", "USER", "LOGNAME", "SHELL", "AZURE_SUBSCRIPTION_ID", "AZURE_TENANT_ID"] {
        forward_env_if_present(&mut cmd, key);
    }

    let output = cmd
        .output()
        .map_err(|e| format!("failed to run az aks list: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        let msg = if stderr.is_empty() {
            format!("az aks list failed with status {}", output.status)
        } else {
            format!("az aks list failed: {stderr}")
        };
        app_log(format!("[azure] ERROR: {msg}"));
        return Err(msg);
    }

    let stdout_preview = String::from_utf8_lossy(&output.stdout);
    app_log(format!("[azure] list-clusters stdout: {}", stdout_preview.trim()));

    let stdout = String::from_utf8_lossy(&output.stdout);
    let json: serde_json::Value =
        serde_json::from_str(&stdout).map_err(|e| format!("failed to parse az output: {e}"))?;

    let clusters = json.as_array()
        .cloned()
        .ok_or_else(|| "unexpected az output format".to_string())?;

    Ok(clusters)
}

fn ensure_process_home_env() {
    // Finder/launchd-started DMG apps can miss HOME in the process environment.
    // Seed it early so kubeconfig discovery and sidecar children behave like debug runs.
    if env::var_os("HOME").filter(|v| !v.is_empty()).is_some() {
        return;
    }
    if let Some(home) = resolve_home_dir() {
        env::set_var("HOME", home);
    }
}

fn main() {
    tracing_subscriber::fmt()
        .with_env_filter(tracing_subscriber::EnvFilter::from_default_env())
        .init();

    ensure_process_home_env();
    app_log("[app] PTKublet startup");

    let app = tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            get_sidecar_config,
            set_sidecar_config,
            get_sidecar_logs,
            get_cluster_switch_status,
            restart_sidecar,
            trigger_kube_browser_login,
            list_kubeconfig_candidates,
            list_kubeconfig_clusters,
            open_external_url,
            get_home_directory,
            list_local_directory,
            read_local_files,
            save_pod_file,
            save_base64_file,
            list_eks_clusters,
            aws_eks_update_kubeconfig,
            log_omni_connection_attempt,
            omni_update_kubeconfig,
            list_omni_clusters,
            list_gcp_clusters,
            list_azure_clusters
        ])
        .setup(|app| {
            #[cfg(target_os = "macos")]
            {
                let menu = Menu::default(app.handle())?;
                let settings_item = MenuItem::with_id(app, "open_settings", "Settings...", true, Some("CmdOrCtrl+,"))?;
                if let Some(app_submenu) = menu.items()?.into_iter().find_map(|item| item.as_submenu().cloned()) {
                    let pkg_info = app.package_info();
                    let config = app.config();
                    let about_metadata = AboutMetadata {
                        name: Some(pkg_info.name.clone()),
                        version: Some(pkg_info.version.to_string()),
                        copyright: config.bundle.copyright.clone(),
                        authors: config.bundle.publisher.clone().map(|p| vec![p]),
                        icon: app.default_window_icon().cloned(),
                        ..Default::default()
                    };
                    let about_item = PredefinedMenuItem::about(app, None, Some(about_metadata))?;

                    let _ = app_submenu.remove_at(0);
                    let _ = app_submenu.insert(&about_item, 0);
                    let _ = app_submenu.insert(&settings_item, 1);
                }
                app.set_menu(menu)?;

                if let Some(icon) = app.default_window_icon().cloned() {
                    if let Some(window) = app.get_webview_window("main") {
                        let _ = window.set_icon(icon);
                    }
                }
            }

            let mut initial_config = load_sidecar_config(app.handle());
            if let Ok(Some((previous, next))) = ensure_sidecar_port_available(&mut initial_config) {
                warn!(
                    "startup moved sidecar port from {} to {} because the original port was occupied",
                    previous, next
                );
            }
            let _ = save_sidecar_config(app.handle(), &initial_config);

            let logs: SidecarLogs = Arc::new(Mutex::new(VecDeque::new()));

            let initial_child = match spawn_backend(app.handle(), &initial_config, &logs) {
                Ok(child) => {
                    if !wait_for_backend_ready(initial_config.port, STARTUP_TIMEOUT) {
                        warn!(
                            "backend sidecar did not become reachable on {} within {:?}",
                            backend_socket_addr(initial_config.port),
                            STARTUP_TIMEOUT
                        );
                    } else {
                        info!(
                            "backend sidecar is healthy on {}",
                            backend_socket_addr(initial_config.port)
                        );
                        // Re-trigger Local Network TCC from the GUI process after the
                        // sidecar is up. Finder-launched DMG installs often block the
                        // helper from reaching LAN kube APIs until the parent prompts.
                        #[cfg(target_os = "macos")]
                        {
                            let warmup_config = initial_config.clone();
                            thread::spawn(move || warmup_local_network_access(&warmup_config));
                        }
                    }

                    Some(child)
                }
                Err(e) => {
                    error!(
                        "failed to start backend sidecar during app setup: {e}. continuing without backend and allowing monitor retries"
                    );
                    None
                }
            };

            let child_ref = Arc::new(Mutex::new(initial_child));
            let shutting_down = Arc::new(Mutex::new(false));
            let config_ref = Arc::new(Mutex::new(initial_config));
            let restart_in_progress = Arc::new(Mutex::new(false));

            start_backend_monitor(
                app.handle().clone(),
                Arc::clone(&child_ref),
                Arc::clone(&shutting_down),
                Arc::clone(&config_ref),
                Arc::clone(&restart_in_progress),
                Arc::clone(&logs),
            );

            app.manage(BackendState {
                child: child_ref,
                shutting_down,
                config: config_ref,
                switch_status: Arc::new(Mutex::new(ClusterSwitchStatus::default())),
                restart_in_progress,
                logs,
            });
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|app_handle, event| {
        match event {
            RunEvent::MenuEvent(menu_event) => {
                if menu_event.id().as_ref() == "open_settings" {
                    if let Some(window) = app_handle.get_webview_window("main") {
                        let _ = window.eval("window.dispatchEvent(new CustomEvent('ptkublet-open-settings'));");
                        let _ = window.set_focus();
                    }
                }
            }
            RunEvent::Exit | RunEvent::ExitRequested { .. } => {
                if let Some(state) = app_handle.try_state::<BackendState>() {
                    if let Ok(mut shutting_down) = state.shutting_down.lock() {
                        *shutting_down = true;
                    }

                    if let Ok(mut guard) = state.child.lock() {
                        if let Some(mut child) = guard.take() {
                            graceful_stop_child(&mut child);
                        }
                    }
                }
            }
            _ => {}
        }
    });
}
