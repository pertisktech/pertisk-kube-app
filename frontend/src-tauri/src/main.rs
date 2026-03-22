use std::fs;
use std::io::{Read, Write};
use std::net::{SocketAddr, TcpStream};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, RunEvent, State};
use tracing::{error, info, warn};

struct BackendState {
    child: Arc<Mutex<Option<Child>>>,
    shutting_down: Arc<Mutex<bool>>,
    config: Arc<Mutex<SidecarConfig>>,
}

const DEFAULT_PORT: u16 = 15222;
const STARTUP_TIMEOUT: Duration = Duration::from_secs(20);
const CLUSTER_VERIFY_TIMEOUT: Duration = Duration::from_secs(20);
const RESTART_BACKOFF: Duration = Duration::from_secs(2);
const SHUTDOWN_GRACE: Duration = Duration::from_secs(2);

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

fn validated_config(mut cfg: SidecarConfig) -> SidecarConfig {
    if cfg.port == 0 {
        cfg.port = DEFAULT_PORT;
    }

    if let Ok(env_bin) = std::env::var("PERTISK_BACKEND_BIN") {
        if !env_bin.trim().is_empty() {
            cfg.backend_bin = Some(env_bin);
        }
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

    if let Some(explicit) = cfg.backend_bin.as_deref() {
        if !explicit.trim().is_empty() {
            paths.push(PathBuf::from(explicit));
        }
    }

    paths.push(PathBuf::from("../target/release/pertisk-kube-backend"));
    paths.push(PathBuf::from("../../target/release/pertisk-kube-backend"));

    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            paths.push(dir.join("pertisk-kube-backend"));
            paths.push(dir.join("../Resources/pertisk-kube-backend"));
        }
    }

    if let Ok(resource_dir) = app.path().resource_dir() {
        paths.push(resource_dir.join("pertisk-kube-backend"));
        paths.push(resource_dir.join("bundle-resources/pertisk-kube-backend"));
    }

    // Check workspace backend binary from user's home
    if let Ok(home) = std::env::var("HOME") {
        let workspace_candidates = vec![
            "projects/pertisktech/pertisk-kube-app/backend/target/release/pertisk-kube-backend",
            ".pertisk-kube-app-backend/pertisk-kube-backend",
        ];
        for candidate in workspace_candidates {
            paths.push(PathBuf::from(&home).join(candidate));
        }
    }

    paths
}

fn first_existing_path(paths: &[PathBuf]) -> Option<PathBuf> {
    paths.iter().find(|p| p.exists()).cloned()
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
    let mut stream = TcpStream::connect_timeout(&addr, Duration::from_millis(600)).ok()?;

    let _ = stream.set_read_timeout(Some(Duration::from_millis(900)));
    let _ = stream.set_write_timeout(Some(Duration::from_millis(900)));

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
        if let Some(status) = probe_backend_status(port, "/api/namespaces") {
            // Consider any non-5xx response as "cluster reachable enough".
            // This avoids rejecting valid contexts that have restricted RBAC (e.g., 403).
            if status < 500 {
                return true;
            }
        }
        thread::sleep(Duration::from_millis(300));
    }

    false
}

fn terminate_processes_on_port(port: u16) {
    let output = Command::new("lsof")
        .arg("-ti")
        .arg(format!(":{port}"))
        .output();

    let Ok(output) = output else {
        return;
    };

    if !output.status.success() {
        return;
    }

    let pid_list = String::from_utf8_lossy(&output.stdout);
    for pid in pid_list.lines().map(str::trim).filter(|line| !line.is_empty()) {
        let _ = Command::new("kill").arg("-TERM").arg(pid).status();
    }

    thread::sleep(Duration::from_millis(250));

    for pid in pid_list.lines().map(str::trim).filter(|line| !line.is_empty()) {
        let _ = Command::new("kill").arg("-KILL").arg(pid).status();
    }
}

fn spawn_backend(app: &AppHandle, cfg: &SidecarConfig) -> anyhow::Result<Child> {
    if probe_backend_health(cfg.port) {
        warn!(
            "detected an existing process on {}; terminating stale listener before sidecar spawn",
            backend_socket_addr(cfg.port)
        );
        terminate_processes_on_port(cfg.port);
    }

    let candidates = candidate_backend_paths(app, cfg);

    let backend_bin = first_existing_path(&candidates).ok_or_else(|| {
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
        anyhow::anyhow!(error_msg)
    })?;

    let backend_dir = backend_bin
        .parent()
        .map(Path::to_path_buf)
        .unwrap_or_else(|| PathBuf::from("."));

    let mut command = Command::new(&backend_bin);
    command
        .current_dir(backend_dir.clone())
        .env("RUST_LOG", std::env::var("RUST_LOG").unwrap_or_else(|_| "info".to_string()))
        .env("PORT", cfg.port.to_string())
        .stdout(Stdio::inherit())
        .stderr(Stdio::inherit());

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

    let mut child = command.spawn()?;

    // If the process exits immediately (common when port is already occupied), fail fast.
    thread::sleep(Duration::from_millis(250));
    if let Some(status) = child.try_wait()? {
        return Err(anyhow::anyhow!(
            "backend sidecar exited immediately with status {status}; check port {} and backend binary path",
            cfg.port
        ));
    }

    info!(
        "spawned backend sidecar from {} on {} (cwd: {})",
        backend_bin.display(),
        backend_socket_addr(cfg.port),
        backend_dir.display()
    );

    Ok(child)
}

fn discover_kubeconfig_candidates() -> Vec<String> {
    let mut candidates = Vec::<String>::new();

    if let Ok(from_env) = std::env::var("KUBECONFIG") {
        for item in from_env.split(':') {
            let path = item.trim();
            if !path.is_empty() {
                candidates.push(path.to_string());
            }
        }
    }

    if let Ok(home) = std::env::var("HOME") {
        let kube_dir = PathBuf::from(home).join(".kube");
        let default_config = kube_dir.join("config");
        candidates.push(default_config.to_string_lossy().to_string());

        if let Ok(entries) = fs::read_dir(kube_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
                    if ext.eq_ignore_ascii_case("yaml") || ext.eq_ignore_ascii_case("yml") {
                        candidates.push(path.to_string_lossy().to_string());
                    }
                }
            }
        }
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

fn restart_backend_sidecar(app: &AppHandle, state: &BackendState) -> anyhow::Result<()> {
    let cfg = state
        .config
        .lock()
        .map_err(|e| anyhow::anyhow!("sidecar config lock poisoned: {e}"))?
        .clone();

    {
        let mut guard = state
            .child
            .lock()
            .map_err(|e| anyhow::anyhow!("sidecar child lock poisoned: {e}"))?;
        if let Some(mut child) = guard.take() {
            graceful_stop_child(&mut child);
        }
    }

    let child = spawn_backend(app, &cfg)?;
    if !wait_for_backend_ready(cfg.port, STARTUP_TIMEOUT) {
        let mut child_to_stop = child;
        graceful_stop_child(&mut child_to_stop);
        return Err(anyhow::anyhow!(
            "sidecar failed to start for selected cluster/context on {}",
            backend_socket_addr(cfg.port)
        ));
    }

    if !wait_for_cluster_verification(cfg.port, CLUSTER_VERIFY_TIMEOUT) {
        let mut child_to_stop = child;
        graceful_stop_child(&mut child_to_stop);
        return Err(anyhow::anyhow!(
            "cluster verification failed for selected context: backend is up but Kubernetes API check failed"
        ));
    }

    info!(
        "backend sidecar restarted and cluster verification passed on {}",
        backend_socket_addr(cfg.port)
    );

    let mut guard = state
        .child
        .lock()
        .map_err(|e| anyhow::anyhow!("sidecar child lock poisoned after restart: {e}"))?;
    *guard = Some(child);
    Ok(())
}

fn start_backend_monitor(
    app_handle: AppHandle,
    child_ref: Arc<Mutex<Option<Child>>>,
    shutting_down: Arc<Mutex<bool>>,
    config_ref: Arc<Mutex<SidecarConfig>>,
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
            let cfg = match config_ref.lock() {
                Ok(c) => c.clone(),
                Err(e) => {
                    error!("sidecar config mutex poisoned: {e}");
                    return;
                }
            };

            match spawn_backend(&app_handle, &cfg) {
                Ok(new_child) => {
                    let ready = wait_for_backend_ready(cfg.port, STARTUP_TIMEOUT);
                    let mut guard = match child_ref.lock() {
                        Ok(g) => g,
                        Err(e) => {
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

    if let Err(e) = restart_backend_sidecar(&app, &state) {
        // Roll back to the last known-good configuration on failure.
        if let Ok(mut current) = state.config.lock() {
            *current = previous_config.clone();
        }

        let _ = save_sidecar_config(&app, &previous_config);
        let _ = restart_backend_sidecar(&app, &state);

        return Err(format!(
            "failed to switch cluster: {e}. restored previous cluster configuration"
        ));
    }

    Ok(())
}

#[tauri::command]
fn restart_sidecar(app: AppHandle, state: State<'_, BackendState>) -> Result<(), String> {
    restart_backend_sidecar(&app, &state).map_err(|e| format!("failed to restart sidecar: {e}"))
}

#[tauri::command]
fn list_kubeconfig_candidates() -> Vec<String> {
    discover_kubeconfig_candidates()
}

#[tauri::command]
fn list_kubeconfig_clusters(kubeconfig_path: Option<String>) -> Result<Vec<KubeconfigCluster>, String> {
    let path = resolve_kubeconfig_path(kubeconfig_path)
        .ok_or_else(|| "No kubeconfig file found.".to_string())?;

    parse_kubeconfig_clusters(&path).map_err(|e| format!("failed to parse kubeconfig clusters: {e}"))
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
        Ok(s) => Err(format!("failed to open url, exit status: {}", s)),
        Err(e) => Err(format!("failed to open url: {}", e)),
    }
}

fn main() {
    tracing_subscriber::fmt()
        .with_env_filter(tracing_subscriber::EnvFilter::from_default_env())
        .init();

    let app = tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            get_sidecar_config,
            set_sidecar_config,
            restart_sidecar,
            list_kubeconfig_candidates,
            list_kubeconfig_clusters,
            open_external_url
        ])
        .setup(|app| {
            let initial_config = load_sidecar_config(app.handle());
            let _ = save_sidecar_config(app.handle(), &initial_config);

            let child = spawn_backend(app.handle(), &initial_config)?;

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
            }

            let child_ref = Arc::new(Mutex::new(Some(child)));
            let shutting_down = Arc::new(Mutex::new(false));
            let config_ref = Arc::new(Mutex::new(initial_config));

            start_backend_monitor(
                app.handle().clone(),
                Arc::clone(&child_ref),
                Arc::clone(&shutting_down),
                Arc::clone(&config_ref),
            );

            app.manage(BackendState {
                child: child_ref,
                shutting_down,
                config: config_ref,
            });
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|app_handle, event| {
        if matches!(event, RunEvent::Exit | RunEvent::ExitRequested { .. }) {
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
    });
}
