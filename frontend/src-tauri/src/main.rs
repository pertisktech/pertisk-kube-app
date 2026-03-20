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

const DEFAULT_PORT: u16 = 8091;
const STARTUP_TIMEOUT: Duration = Duration::from_secs(20);
const RESTART_BACKOFF: Duration = Duration::from_secs(2);
const SHUTDOWN_GRACE: Duration = Duration::from_secs(2);

const SIDECAR_CONFIG_FILE: &str = "desktop-sidecar.json";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SidecarConfig {
    backend_bin: Option<String>,
    port: u16,
}

impl Default for SidecarConfig {
    fn default() -> Self {
        Self {
            backend_bin: None,
            port: DEFAULT_PORT,
        }
    }
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

    if let Ok(env_port) = std::env::var("PORT") {
        if let Ok(parsed) = env_port.parse::<u16>() {
            if parsed > 0 {
                cfg.port = parsed;
            }
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

    if let Some(explicit) = cfg.backend_bin.as_deref() {
        if !explicit.trim().is_empty() {
            paths.push(PathBuf::from(explicit));
        }
    }

    if let Ok(explicit) = std::env::var("PERTISK_BACKEND_BIN") {
        paths.push(PathBuf::from(explicit));
    }

    if cfg!(debug_assertions) {
        paths.push(PathBuf::from("../target/debug/pertisk-kube-backend"));
        paths.push(PathBuf::from("../../target/debug/pertisk-kube-backend"));
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

fn spawn_backend(app: &AppHandle, cfg: &SidecarConfig) -> anyhow::Result<Child> {
    let candidates = candidate_backend_paths(app, cfg);

    let backend_bin = first_existing_path(&candidates).ok_or_else(|| {
        anyhow::anyhow!(
            "Could not locate backend binary. Looked in: {}",
            candidates
                .iter()
                .map(|p| p.display().to_string())
                .collect::<Vec<_>>()
                .join(", ")
        )
    })?;

    let backend_dir = backend_bin
        .parent()
        .map(Path::to_path_buf)
        .unwrap_or_else(|| PathBuf::from("."));

    let child = Command::new(&backend_bin)
        .current_dir(backend_dir)
        .env("RUST_LOG", std::env::var("RUST_LOG").unwrap_or_else(|_| "info".to_string()))
        .env("PORT", cfg.port.to_string())
        .stdout(Stdio::inherit())
        .stderr(Stdio::inherit())
        .spawn()?;

    info!(
        "spawned backend sidecar from {} on {}",
        backend_bin.display(),
        backend_socket_addr(cfg.port)
    );

    Ok(child)
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
        warn!(
            "backend sidecar restarted but readiness probe timed out on {}",
            backend_socket_addr(cfg.port)
        );
    } else {
        info!("backend sidecar restarted and is healthy on {}", backend_socket_addr(cfg.port));
    }

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
    let config = validated_config(config);

    {
        let mut current = state
            .config
            .lock()
            .map_err(|e| format!("failed to lock sidecar config: {e}"))?;
        *current = config.clone();
    }

    save_sidecar_config(&app, &config)
        .map_err(|e| format!("failed to persist sidecar config: {e}"))?;

    restart_backend_sidecar(&app, &state)
        .map_err(|e| format!("failed to restart sidecar with new config: {e}"))
}

#[tauri::command]
fn restart_sidecar(app: AppHandle, state: State<'_, BackendState>) -> Result<(), String> {
    restart_backend_sidecar(&app, &state).map_err(|e| format!("failed to restart sidecar: {e}"))
}

fn main() {
    tracing_subscriber::fmt()
        .with_env_filter(tracing_subscriber::EnvFilter::from_default_env())
        .init();

    let app = tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            get_sidecar_config,
            set_sidecar_config,
            restart_sidecar
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
