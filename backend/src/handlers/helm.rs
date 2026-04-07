use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use base64::{engine::general_purpose::STANDARD, Engine};
use futures_util::stream::{FuturesUnordered, StreamExt};
use flate2::read::GzDecoder;
use k8s_openapi::api::core::v1::Secret;
use kube::{api::ListParams, Api};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::{HashMap, HashSet};
use std::io::Read;
use std::path::Path as FsPath;
use std::process::Stdio;
use std::time::{Duration, Instant};
use tokio::io::AsyncWriteExt;
use tokio::process::Command;
use tracing::error;

use crate::AppState;

// ── Response models ────────────────────────────────────────────────────────────

#[derive(Serialize, Clone)]
pub struct HelmReleaseItem {
    pub name: String,
    pub namespace: String,
    pub chart: String,
    pub revision: i64,
    pub chart_version: String,
    pub app_version: String,
    pub status: String,
    pub updated: String,
}

#[derive(Serialize, Clone)]
pub struct HelmChartItem {
    pub name: String,
    pub description: String,
    pub version: String,
    pub app_version: String,
    pub repository: String,
    pub repository_url: String,
    pub stars: u64,
}

#[derive(Clone, Default)]
pub struct HelmChartsCacheEntry {
    pub data: Vec<HelmChartItem>,
    pub warnings: Vec<String>,
    pub last_updated: Option<Instant>,
    pub refreshing: bool,
}

#[derive(Default)]
pub struct HelmChartsCache {
    pub entries: HashMap<String, HelmChartsCacheEntry>,
}

// ── Artifact Hub API deserialization ──────────────────────────────────────────

#[derive(Deserialize)]
struct ArtifactHubSearchResponse {
    packages: Option<Vec<ArtifactHubPackage>>,
}

#[derive(Deserialize)]
struct ArtifactHubPackage {
    name: Option<String>,
    description: Option<String>,
    version: Option<String>,
    app_version: Option<String>,
    stars: Option<u64>,
    repository: Option<ArtifactHubRepo>,
}

#[derive(Deserialize)]
struct ArtifactHubRepo {
    display_name: Option<String>,
    name: Option<String>,
    url: Option<String>,
}

#[derive(Deserialize)]
pub struct HelmChartsQuery {
    pub repo_urls: Option<String>,
}

#[derive(Deserialize)]
struct HelmRepositoryIndex {
    entries: Option<HashMap<String, Vec<HelmRepositoryIndexEntry>>>,
}

#[derive(Deserialize)]
struct HelmRepositoryIndexEntry {
    version: Option<String>,
    #[serde(rename = "appVersion")]
    appVersion: Option<String>,
    description: Option<String>,
}

const HELM_CHART_CACHE_TTL: Duration = Duration::from_secs(30);

fn parse_repo_urls(csv: &str) -> Vec<String> {
    let mut seen = HashSet::new();
    csv.split(',')
        .filter_map(|raw| {
            let trimmed = raw.trim();
            if trimmed.is_empty() {
                return None;
            }
            if seen.insert(trimmed.to_string()) {
                Some(trimmed.to_string())
            } else {
                None
            }
        })
        .collect()
}

fn repo_alias_from_url(url: &str) -> String {
    let mut out = String::new();
    for c in url.chars() {
        if c.is_ascii_alphanumeric() {
            out.push(c.to_ascii_lowercase());
        } else if c == '-' || c == '_' {
            out.push(c);
        }
        if out.len() >= 24 {
            break;
        }
    }
    if out.is_empty() {
        "repo".to_string()
    } else {
        out
    }
}

fn cache_key_for_repo_urls(repo_urls: &[String]) -> String {
    let mut parts = repo_urls.to_vec();
    parts.sort();
    parts.join(",")
}

fn cache_is_fresh(entry: &HelmChartsCacheEntry) -> bool {
    entry
        .last_updated
        .map(|instant| instant.elapsed() <= HELM_CHART_CACHE_TTL)
        .unwrap_or(false)
}

fn helm_chart_response(data: Vec<HelmChartItem>, warnings: Vec<String>, refreshing: bool) -> axum::response::Response {
    let warnings = if warnings.is_empty() { None } else { Some(warnings) };
    let total = data.len();
    (
        StatusCode::OK,
        Json(serde_json::json!({
            "data": data,
            "total": total,
            "warnings": warnings,
            "refreshing": refreshing
        })),
    )
        .into_response()
}

// ── Helm Releases ─────────────────────────────────────────────────────────────

pub async fn list_helm_releases(State(state): State<AppState>) -> impl IntoResponse {
    let client = state.client.clone();
    let api: Api<Secret> = Api::all(client);
    let lp = ListParams::default().labels("owner=helm");

    match api.list(&lp).await {
        Ok(list) => {
            // Group by (release-name, namespace) and keep only the highest revision
            let mut releases: HashMap<(String, String), HelmReleaseItem> = HashMap::new();

            for secret in list.items {
                let labels = secret.metadata.labels.as_ref();

                let name = labels
                    .and_then(|l| l.get("name"))
                    .cloned()
                    .unwrap_or_default();
                let status = labels
                    .and_then(|l| l.get("status"))
                    .cloned()
                    .unwrap_or_else(|| "unknown".to_string());
                let revision: i64 = labels
                    .and_then(|l| l.get("version"))
                    .and_then(|v| v.parse().ok())
                    .unwrap_or(0);
                let namespace = secret
                    .metadata
                    .namespace
                    .clone()
                    .unwrap_or_else(|| "default".to_string());

                // Try to decode the Helm release JSON from the secret data
                let (chart, chart_version, app_version, updated) =
                    decode_helm_release_data(&secret).unwrap_or_else(|| {
                        let ts = secret
                            .metadata
                            .creation_timestamp
                            .as_ref()
                            .map(|t| t.0.to_rfc3339())
                            .unwrap_or_default();
                        (name.clone(), "-".to_string(), "-".to_string(), ts)
                    });

                let item = HelmReleaseItem {
                    name: name.clone(),
                    namespace: namespace.clone(),
                    chart,
                    revision,
                    chart_version,
                    app_version,
                    status,
                    updated,
                };

                let key = (name, namespace);
                releases
                    .entry(key)
                    .and_modify(|existing| {
                        if revision > existing.revision {
                            *existing = item.clone();
                        }
                    })
                    .or_insert(item);
            }

            let mut items: Vec<HelmReleaseItem> = releases.into_values().collect();
            items.sort_by(|a, b| a.namespace.cmp(&b.namespace).then(a.name.cmp(&b.name)));
            let total = items.len();

            (
                StatusCode::OK,
                Json(serde_json::json!({ "data": items, "total": total })),
            )
                .into_response()
        }
        Err(err) => {
            error!("Failed to list helm releases: {}", err);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({ "error": err.to_string() })),
            )
                .into_response()
        }
    }
}

/// Decodes a Helm 3 release secret.
///
/// Helm 3 stores releases as: base64( gzip( json(Release) ) )  
/// The kube-rs client already removes the Kubernetes-layer base64, giving us  
/// the UTF-8 bytes of Helm's own base64 string. We then decode that base64,  
/// gunzip, and parse JSON.
fn decode_helm_release_data(secret: &Secret) -> Option<(String, String, String, String)> {
    let data = secret.data.as_ref()?;
    let release_bytes = data.get("release")?;

    // ByteString.0 is already k8s-base64-decoded → contains Helm's base64 string as UTF-8 bytes
    let b64_str = String::from_utf8(release_bytes.0.clone()).ok()?;
    let gzip_bytes = STANDARD.decode(b64_str.trim()).ok()?;

    let mut decoder = GzDecoder::new(&gzip_bytes[..]);
    let mut json_str = String::new();
    decoder.read_to_string(&mut json_str).ok()?;

    let v: Value = serde_json::from_str(&json_str).ok()?;

    let chart_name = v["chart"]["metadata"]["name"]
        .as_str()
        .unwrap_or("-")
        .to_string();
    let chart_version = v["chart"]["metadata"]["version"]
        .as_str()
        .unwrap_or("-")
        .to_string();
    let app_version = v["chart"]["metadata"]["appVersion"]
        .as_str()
        .unwrap_or("-")
        .to_string();
    let updated = v["info"]["last_deployed"]
        .as_str()
        .unwrap_or("")
        .to_string();

    Some((chart_name, chart_version, app_version, updated))
}

// ── Helm Charts — proxy to Artifact Hub ───────────────────────────────────────

pub async fn list_helm_charts(
    Query(q): Query<HelmChartsQuery>,
    State(state): State<AppState>,
) -> impl IntoResponse {
    let configured_repo_urls = q
        .repo_urls
        .as_deref()
        .map(parse_repo_urls)
        .unwrap_or_default();

    if !configured_repo_urls.is_empty() {
        let cache_key = cache_key_for_repo_urls(&configured_repo_urls);

        {
            let cache = state.helm_charts_cache.read().await;
            if let Some(entry) = cache.entries.get(&cache_key) {
                if cache_is_fresh(entry) || entry.refreshing {
                    return helm_chart_response(entry.data.clone(), entry.warnings.clone(), entry.refreshing);
                }
            }
        }

        let mut should_spawn_refresh = false;
        let response = {
            let mut cache = state.helm_charts_cache.write().await;
            let entry = cache.entries.entry(cache_key.clone()).or_default();
            if !entry.refreshing {
                entry.refreshing = true;
                should_spawn_refresh = true;
            }
            helm_chart_response(entry.data.clone(), entry.warnings.clone(), true)
        };

        if should_spawn_refresh {
            let app_state = state.clone();
            let refresh_key = cache_key.clone();
            let refresh_urls = configured_repo_urls.clone();
            tokio::spawn(async move {
                refresh_helm_chart_cache(app_state, refresh_key, refresh_urls).await;
            });
        }

        return response;
    }

    let http = match reqwest::Client::builder()
        .timeout(Duration::from_secs(10))
        .user_agent("pertisk-kube-dashboard/1.0")
        .build()
    {
        Ok(c) => c,
        Err(err) => {
            error!("Failed to build HTTP client: {}", err);
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({ "data": [], "total": 0 })),
            )
                .into_response();
        }
    };

    let url =
        "https://artifacthub.io/api/v1/packages/search?kind=0&limit=30&sort=relevance&page=0";

    let result = http
        .get(url)
        .header("Accept", "application/json")
        .send()
        .await;

    match result {
        Ok(resp) if resp.status().is_success() => {
            match resp.json::<ArtifactHubSearchResponse>().await {
                Ok(hub) => {
                    let items: Vec<HelmChartItem> = hub
                        .packages
                        .unwrap_or_default()
                        .into_iter()
                        .map(|p| {
                            let repo = p.repository;
                            HelmChartItem {
                                name: p.name.unwrap_or_else(|| "-".to_string()),
                                description: p.description.unwrap_or_default(),
                                version: p.version.unwrap_or_else(|| "-".to_string()),
                                app_version: p.app_version.unwrap_or_else(|| "-".to_string()),
                                repository: repo
                                    .as_ref()
                                    .and_then(|r| r.display_name.clone().or_else(|| r.name.clone()))
                                    .unwrap_or_else(|| "-".to_string()),
                                repository_url: repo
                                    .as_ref()
                                    .and_then(|r| r.url.clone())
                                    .unwrap_or_default(),
                                stars: p.stars.unwrap_or(0),
                            }
                        })
                        .collect();
                    let total = items.len();
                    (
                        StatusCode::OK,
                        Json(serde_json::json!({ "data": items, "total": total })),
                    )
                        .into_response()
                }
                Err(err) => {
                    error!("Failed to parse Artifact Hub response: {}", err);
                    (
                        StatusCode::OK,
                        Json(serde_json::json!({ "data": [], "total": 0 })),
                    )
                        .into_response()
                }
            }
        }
        Ok(resp) => {
            error!("Artifact Hub returned non-success status: {}", resp.status());
            (
                StatusCode::OK,
                Json(serde_json::json!({ "data": [], "total": 0 })),
            )
                .into_response()
        }
        Err(err) => {
            error!("Failed to reach Artifact Hub: {}", err);
            (
                StatusCode::OK,
                Json(serde_json::json!({ "data": [], "total": 0 })),
            )
                .into_response()
        }
    }
}

async fn fetch_helm_charts_from_repositories(repo_urls: Vec<String>) -> (Vec<HelmChartItem>, Vec<String>) {
    let mut all_items: Vec<HelmChartItem> = Vec::new();
    let mut warnings: Vec<String> = Vec::new();
    let http = match reqwest::Client::builder()
        .timeout(Duration::from_secs(8))
        .user_agent("pertisk-kube-dashboard/1.0")
        .build()
    {
        Ok(c) => c,
        Err(err) => {
            error!("Failed to build HTTP client for repository indexes: {}", err);
            return (Vec::new(), vec![err.to_string()]);
        }
    };

    let mut tasks = FuturesUnordered::new();
    for repo_url in repo_urls {
        let client = http.clone();
        tasks.push(async move {
            let display_repo_name = repo_alias_from_url(&repo_url);
            let index_url = if repo_url.ends_with('/') {
                format!("{}index.yaml", repo_url)
            } else {
                format!("{}/index.yaml", repo_url)
            };

            let response = client
                .get(&index_url)
                .header("Accept", "application/x-yaml,text/yaml,text/plain,application/octet-stream")
                .send()
                .await;

            match response {
                Ok(resp) if resp.status().is_success() => {
                    let body = match resp.text().await {
                        Ok(text) => text,
                        Err(err) => return Err(format!("{}: {}", repo_url, err)),
                    };

                    let index = match serde_yaml::from_str::<HelmRepositoryIndex>(&body) {
                        Ok(index) => index,
                        Err(err) => return Err(format!("{}: failed to parse index.yaml ({})", repo_url, err)),
                    };

                    let items = index
                        .entries
                        .unwrap_or_default()
                        .into_iter()
                        .filter_map(|(chart_name, versions)| {
                            let latest = versions.into_iter().next()?;
                            Some(HelmChartItem {
                                name: chart_name,
                                description: latest.description.unwrap_or_default(),
                                version: latest.version.unwrap_or_else(|| "-".to_string()),
                                app_version: latest.appVersion.unwrap_or_else(|| "-".to_string()),
                                repository: display_repo_name.clone(),
                                repository_url: repo_url.clone(),
                                stars: 0,
                            })
                        })
                        .collect::<Vec<_>>();

                    Ok(items)
                }
                Ok(resp) => Err(format!("{}: returned HTTP {}", repo_url, resp.status())),
                Err(err) => Err(format!("{}: {}", repo_url, err)),
            }
        });
    }

    while let Some(result) = tasks.next().await {
        match result {
            Ok(mut items) => all_items.append(&mut items),
            Err(warning) => warnings.push(warning),
        }
    }

    all_items.sort_by(|a, b| a.repository.cmp(&b.repository).then(a.name.cmp(&b.name)));

    if all_items.is_empty() {
        warnings.push("Configured repositories returned no charts. Falling back to Artifact Hub.".to_string());

        let http = match reqwest::Client::builder()
            .timeout(Duration::from_secs(10))
            .user_agent("pertisk-kube-dashboard/1.0")
            .build()
        {
            Ok(c) => c,
            Err(err) => {
                error!("Failed to build HTTP client for fallback: {}", err);
                return (Vec::new(), warnings);
            }
        };

        let url =
            "https://artifacthub.io/api/v1/packages/search?kind=0&limit=30&sort=relevance&page=0";

        let result = http
            .get(url)
            .header("Accept", "application/json")
            .send()
            .await;

        if let Ok(resp) = result {
            if resp.status().is_success() {
                if let Ok(hub) = resp.json::<ArtifactHubSearchResponse>().await {
                    all_items = hub
                        .packages
                        .unwrap_or_default()
                        .into_iter()
                        .map(|p| {
                            let repo = p.repository;
                            HelmChartItem {
                                name: p.name.unwrap_or_else(|| "-".to_string()),
                                description: p.description.unwrap_or_default(),
                                version: p.version.unwrap_or_else(|| "-".to_string()),
                                app_version: p.app_version.unwrap_or_else(|| "-".to_string()),
                                repository: repo
                                    .as_ref()
                                    .and_then(|r| r.display_name.clone().or_else(|| r.name.clone()))
                                    .unwrap_or_else(|| "artifact-hub".to_string()),
                                repository_url: repo
                                    .as_ref()
                                    .and_then(|r| r.url.clone())
                                    .unwrap_or_default(),
                                stars: p.stars.unwrap_or(0),
                            }
                        })
                        .collect();
                }
            }
        }
    }

    (all_items, warnings)
}

async fn refresh_helm_chart_cache(state: AppState, cache_key: String, repo_urls: Vec<String>) {
    let (data, warnings) = fetch_helm_charts_from_repositories(repo_urls).await;

    let mut cache = state.helm_charts_cache.write().await;
    cache.entries.insert(
        cache_key,
        HelmChartsCacheEntry {
            data,
            warnings,
            last_updated: Some(Instant::now()),
            refreshing: false,
        },
    );
}

// ── Helm Release YAML (values + metadata) ────────────────────────────────────

pub async fn get_helm_release_yaml(
    Path((namespace, name)): Path<(String, String)>,
    State(state): State<AppState>,
) -> impl IntoResponse {
    let client = state.client.clone();
    let api: Api<Secret> = Api::namespaced(client, &namespace);
    let lp = ListParams::default().labels(&format!("owner=helm,name={}", name));

    match api.list(&lp).await {
        Ok(list) => {
            // Find highest-revision deployed secret
            let best = list
                .items
                .iter()
                .filter_map(|s| {
                    let rev: i64 = s
                        .metadata
                        .labels
                        .as_ref()
                        .and_then(|l| l.get("version"))
                        .and_then(|v| v.parse().ok())
                        .unwrap_or(0);
                    Some((rev, s))
                })
                .max_by_key(|(rev, _)| *rev)
                .map(|(_, s)| s);

            match best {
                Some(secret) => {
                    if let Some((chart_name, chart_version, app_version, _)) = decode_helm_release_data(secret) {
                        // Extract raw JSON from the secret for the YAML view
                        let release_json = decode_helm_release_json(secret).unwrap_or_else(|| {
                            serde_json::json!({
                                "name": name,
                                "namespace": namespace,
                                "chart": chart_name,
                                "chart_version": chart_version,
                                "app_version": app_version,
                            })
                        });

                        // Convert to YAML string
                        let yaml_text = serde_yaml::to_string(&release_json)
                            .unwrap_or_else(|_| format!("name: {}\n", name));

                        (StatusCode::OK, yaml_text).into_response()
                    } else {
                        (StatusCode::NOT_FOUND, "Release data not decodable").into_response()
                    }
                }
                None => (StatusCode::NOT_FOUND, "Release not found").into_response(),
            }
        }
        Err(err) => {
            error!("Failed to get helm release YAML: {}", err);
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}

// ── Helm Release History (helm history -o json) ───────────────────────────────

#[derive(Serialize, Deserialize)]
pub struct HelmHistoryEntry {
    #[serde(alias = "Revision")]
    pub revision: u32,
    #[serde(alias = "Updated")]
    pub updated: String,
    #[serde(alias = "Status")]
    pub status: String,
    #[serde(alias = "Chart")]
    pub chart: String,
    #[serde(alias = "app_version", alias = "AppVersion", default)]
    pub app_version: String,
    #[serde(alias = "Description", default)]
    pub description: String,
}

/// GET /helm/releases/:namespace/:name/history — returns release revision history.
pub async fn get_helm_release_history(
    Path((namespace, name)): Path<(String, String)>,
    State(_state): State<AppState>,
) -> impl IntoResponse {
    let namespace = namespace.trim();
    let name = name.trim();
    if name.is_empty() {
        return (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({ "data": [], "message": "Release name is required" })),
        )
            .into_response();
    }
    let ns = if namespace.is_empty() { "default" } else { namespace };

    let output = Command::new("helm")
        .args(["history", name, "--namespace", ns, "--max", "256", "--output", "json"])
        .output()
        .await;

    match output {
        Ok(o) if o.status.success() => {
            let stdout = String::from_utf8_lossy(&o.stdout);
            match serde_json::from_str::<Vec<HelmHistoryEntry>>(&stdout) {
                Ok(entries) => {
                    let data: Vec<serde_json::Value> = entries
                        .into_iter()
                        .map(|e| {
                            serde_json::json!({
                                "revision": e.revision,
                                "updated": e.updated,
                                "status": e.status,
                                "chart": e.chart,
                                "app_version": e.app_version,
                                "description": e.description
                            })
                        })
                        .collect();
                    (
                        StatusCode::OK,
                        Json(serde_json::json!({ "data": data })),
                    )
                        .into_response()
                }
                Err(e) => {
                    error!("helm history JSON parse error: {}", e);
                    (
                        StatusCode::INTERNAL_SERVER_ERROR,
                        Json(serde_json::json!({
                            "data": [],
                            "message": format!("Failed to parse helm history: {}", e)
                        })),
                    )
                        .into_response()
                }
            }
        }
        Ok(o) => {
            let stderr = String::from_utf8_lossy(&o.stderr);
            if stderr.contains("not found") || stderr.contains("No such release") {
                return (
                    StatusCode::NOT_FOUND,
                    Json(serde_json::json!({ "data": [], "message": stderr.to_string() })),
                )
                    .into_response();
            }
            error!("helm history failed: {}", stderr);
            (
                StatusCode::BAD_GATEWAY,
                Json(serde_json::json!({ "data": [], "message": stderr.to_string() })),
            )
                .into_response()
        }
        Err(e) => {
            error!("helm history error: {}", e);
            (
                StatusCode::SERVICE_UNAVAILABLE,
                Json(serde_json::json!({
                    "data": [],
                    "message": format!("Helm not available: {}", e)
                })),
            )
                .into_response()
        }
    }
}

// ── Helm Release Rollback (helm rollback) ──────────────────────────────────────

#[derive(Deserialize)]
pub struct RollbackRequest {
    pub revision: u32,
}

/// POST /helm/releases/:namespace/:name/rollback — rollback release to a revision.
pub async fn rollback_helm_release(
    Path((namespace, name)): Path<(String, String)>,
    State(_state): State<AppState>,
    Json(req): Json<RollbackRequest>,
) -> impl IntoResponse {
    let namespace = namespace.trim();
    let name = name.trim();
    if name.is_empty() {
        return (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({
                "success": false,
                "message": "Release name is required"
            })),
        )
            .into_response();
    }
    let ns = if namespace.is_empty() { "default" } else { namespace };
    let revision = req.revision;

    let output = Command::new("helm")
        .args(["rollback", name, &revision.to_string(), "--namespace", ns])
        .output()
        .await;

    match output {
        Ok(o) if o.status.success() => (
            StatusCode::OK,
            Json(serde_json::json!({
                "success": true,
                "message": format!("Release '{}' rolled back to revision {}", name, revision)
            })),
        )
            .into_response(),
        Ok(o) => {
            let stderr = String::from_utf8_lossy(&o.stderr);
            error!("helm rollback failed: {}", stderr);
            (
                StatusCode::BAD_REQUEST,
                Json(serde_json::json!({
                    "success": false,
                    "message": stderr.to_string()
                })),
            )
                .into_response()
        }
        Err(e) => {
            error!("helm rollback error: {}", e);
            (
                StatusCode::SERVICE_UNAVAILABLE,
                Json(serde_json::json!({
                    "success": false,
                    "message": format!("Helm not available: {}", e)
                })),
            )
                .into_response()
        }
    }
}

// ── Helm Release Delete (uninstall — runs helm uninstall) ─────────────────────

pub async fn delete_helm_release(
    Path((namespace, name)): Path<(String, String)>,
    State(_state): State<AppState>,
) -> impl IntoResponse {
    let namespace = namespace.trim();
    let name = name.trim();
    if name.is_empty() {
        return (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({ "message": "Release name is required" })),
        )
            .into_response();
    }
    let ns = if namespace.is_empty() { "default" } else { namespace };

    let output = Command::new("helm")
        .args(["uninstall", name, "--namespace", ns])
        .output()
        .await;

    match output {
        Ok(o) if o.status.success() => (
            StatusCode::OK,
            Json(serde_json::json!({
                "message": format!("Release '{}' uninstalled successfully", name)
            })),
        )
            .into_response(),
        Ok(o) => {
            let stderr = String::from_utf8_lossy(&o.stderr);
            let stdout = String::from_utf8_lossy(&o.stdout);
            let msg = if !stderr.is_empty() { stderr } else { stdout };
            if msg.contains("not found") || msg.contains("No such release") {
                return (
                    StatusCode::NOT_FOUND,
                    Json(serde_json::json!({ "message": msg.to_string() })),
                )
                    .into_response();
            }
            error!("helm uninstall failed: {}", msg);
            (
                StatusCode::BAD_REQUEST,
                Json(serde_json::json!({ "message": msg.to_string() })),
            )
                .into_response()
        }
        Err(e) => {
            error!("helm uninstall error: {}", e);
            (
                StatusCode::SERVICE_UNAVAILABLE,
                Json(serde_json::json!({
                    "message": format!("Helm not available: {}", e)
                })),
            )
                .into_response()
        }
    }
}

pub async fn upgrade_helm_release(
    Path((namespace, name)): Path<(String, String)>,
    State(state): State<AppState>,
    body: String,
) -> impl IntoResponse {
    let values_yaml = body.trim();
    if values_yaml.is_empty() {
        return (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({
                "success": false,
                "message": "Values YAML is empty"
            })),
        )
            .into_response();
    }

    let api: Api<Secret> = Api::namespaced(state.client, &namespace);
    let lp = ListParams::default().labels(&format!("owner=helm,name={}", name));

    let list = match api.list(&lp).await {
        Ok(list) => list,
        Err(err) => {
            error!("Failed to list helm release secrets for upgrade: {}", err);
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({
                    "success": false,
                    "message": format!("Failed to inspect release: {}", err)
                })),
            )
                .into_response();
        }
    };

    let best = list
        .items
        .iter()
        .filter_map(|s| {
            let rev: i64 = s
                .metadata
                .labels
                .as_ref()
                .and_then(|l| l.get("version"))
                .and_then(|v| v.parse().ok())
                .unwrap_or(0);
            Some((rev, s))
        })
        .max_by_key(|(rev, _)| *rev)
        .map(|(_, s)| s);

    let Some(secret) = best else {
        return (
            StatusCode::NOT_FOUND,
            Json(serde_json::json!({
                "success": false,
                "message": "Helm release not found"
            })),
        )
            .into_response();
    };

    let release_json = match decode_helm_release_json(secret) {
        Some(v) => v,
        None => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({
                    "success": false,
                    "message": "Unable to decode Helm release metadata"
                })),
            )
                .into_response();
        }
    };

    let chart_name = release_json["chart"]["metadata"]["name"]
        .as_str()
        .unwrap_or("")
        .trim()
        .to_string();
    let chart_version = release_json["chart"]["metadata"]["version"]
        .as_str()
        .unwrap_or("")
        .trim()
        .to_string();

    if chart_name.is_empty() {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({
                "success": false,
                "message": "Unable to determine chart name for Helm release"
            })),
        )
            .into_response();
    }

    // Prefer local chart path when available (e.g. ./helm/pertisk-kube), otherwise
    // fall back to chart reference and rely on Helm's configured repositories.
    let local_chart_path = FsPath::new("helm").join(&chart_name);
    let chart_ref = if local_chart_path.exists() {
        local_chart_path.to_string_lossy().to_string()
    } else {
        chart_name.clone()
    };

    let mut cmd = Command::new("helm");
    cmd.arg("upgrade")
        .arg(&name)
        .arg(&chart_ref)
        .arg("--namespace")
        .arg(&namespace)
        .arg("--install")
        .arg("--create-namespace")
        .arg("--values")
        .arg("-")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    if !chart_version.is_empty() && chart_version != "-" {
        cmd.arg("--version").arg(&chart_version);
    }

    let mut child = match cmd.spawn() {
        Ok(child) => child,
        Err(err) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({
                    "success": false,
                    "message": format!("Failed to run helm command: {}", err)
                })),
            )
                .into_response();
        }
    };

    if let Some(mut stdin) = child.stdin.take() {
        if let Err(err) = stdin.write_all(values_yaml.as_bytes()).await {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({
                    "success": false,
                    "message": format!("Failed sending values to helm: {}", err)
                })),
            )
                .into_response();
        }
    }

    let output = match child.wait_with_output().await {
        Ok(out) => out,
        Err(err) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({
                    "success": false,
                    "message": format!("Failed waiting for helm command: {}", err)
                })),
            )
                .into_response();
        }
    };

    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();

    if output.status.success() {
        let message = if stdout.is_empty() {
            format!("Helm release '{}' upgraded successfully", name)
        } else {
            stdout
        };
        (
            StatusCode::OK,
            Json(serde_json::json!({
                "success": true,
                "message": message,
                "chart": chart_ref,
                "chartVersion": chart_version
            })),
        )
            .into_response()
    } else {
        let message = if !stderr.is_empty() {
            stderr
        } else if !stdout.is_empty() {
            stdout
        } else {
            format!("helm upgrade failed with status {}", output.status)
        };

        (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({
                "success": false,
                "message": message,
                "chart": chart_ref,
                "chartVersion": chart_version
            })),
        )
            .into_response()
    }
}

/// Decodes and returns the full Helm release JSON (for YAML view).
fn decode_helm_release_json(secret: &Secret) -> Option<Value> {
    let data = secret.data.as_ref()?;
    let release_bytes = data.get("release")?;
    let b64_str = String::from_utf8(release_bytes.0.clone()).ok()?;
    let gzip_bytes = STANDARD.decode(b64_str.trim()).ok()?;
    let mut decoder = GzDecoder::new(&gzip_bytes[..]);
    let mut json_str = String::new();
    decoder.read_to_string(&mut json_str).ok()?;
    serde_json::from_str(&json_str).ok()
}

// ── Helm chart default values (for install tab) ───────────────────────────────

#[derive(Deserialize)]
pub struct ChartValuesQuery {
    pub repo_url: String,
    pub chart: String,
    pub version: String,
}

#[derive(Deserialize)]
pub struct ChartVersionsQuery {
    pub repo_url: String,
    pub chart: String,
}

#[derive(Deserialize)]
pub struct HelmRepositoryCheckQuery {
    pub repo_url: String,
}

/// Fetches the chart's default values.yaml by running `helm repo add` + `helm show values`.
pub async fn get_helm_chart_values(
    Query(q): Query<ChartValuesQuery>,
    _state: State<AppState>,
) -> impl IntoResponse {
    let repo_url = q.repo_url.trim();
    let chart = q.chart.trim();
    let version = q.version.trim();

    if repo_url.is_empty() || chart.is_empty() || version.is_empty() {
        return (
            StatusCode::BAD_REQUEST,
            axum::response::Response::builder()
                .header("content-type", "text/plain; charset=utf-8")
                .body(axum::body::Body::from("Missing repo_url, chart, or version"))
                .unwrap(),
        )
            .into_response();
    }

    // Unique repo name to avoid clashes with concurrent requests
    let repo_name = format!("chartvals_{}", std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis());

    // helm repo add <name> <url>
    let add = Command::new("helm")
        .args(["repo", "add", &repo_name, repo_url])
        .output()
        .await;

    let _ = match add {
        Ok(o) if o.status.success() => o,
        Ok(o) => {
            let stderr = String::from_utf8_lossy(&o.stderr);
            error!("helm repo add failed: {}", stderr);
            let _ = Command::new("helm").args(["repo", "remove", &repo_name]).output().await;
            return (
                StatusCode::BAD_GATEWAY,
                axum::response::Response::builder()
                    .header("content-type", "text/plain; charset=utf-8")
                    .body(axum::body::Body::from(format!("Failed to add repo: {}", stderr)))
                    .unwrap(),
            )
                .into_response();
        }
        Err(e) => {
            error!("helm repo add error: {}", e);
            return (
                StatusCode::SERVICE_UNAVAILABLE,
                axum::response::Response::builder()
                    .header("content-type", "text/plain; charset=utf-8")
                    .body(axum::body::Body::from(format!("Helm not available: {}", e)))
                    .unwrap(),
            )
                .into_response();
        }
    };

    // helm show values <repo>/<chart> --version <version>
    let chart_ref = format!("{}/{}", repo_name, chart);
    let mut show = Command::new("helm");
    show.args(["show", "values", &chart_ref, "--version", version]);
    let show_out = show.output().await;

    let _ = Command::new("helm").args(["repo", "remove", &repo_name]).output().await;

    match show_out {
        Ok(o) if o.status.success() => {
            let yaml = String::from_utf8_lossy(&o.stdout).to_string();
            axum::response::Response::builder()
                .status(StatusCode::OK)
                .header("content-type", "text/plain; charset=utf-8")
                .body(axum::body::Body::from(yaml))
                .unwrap()
                .into_response()
        }
        Ok(o) => {
            let stderr = String::from_utf8_lossy(&o.stderr);
            error!("helm show values failed: {}", stderr);
            (
                StatusCode::BAD_GATEWAY,
                axum::response::Response::builder()
                    .header("content-type", "text/plain; charset=utf-8")
                    .body(axum::body::Body::from(stderr.to_string()))
                    .unwrap(),
            )
                .into_response()
        }
        Err(e) => {
            error!("helm show values error: {}", e);
            (
                StatusCode::SERVICE_UNAVAILABLE,
                axum::response::Response::builder()
                    .header("content-type", "text/plain; charset=utf-8")
                    .body(axum::body::Body::from(e.to_string()))
                    .unwrap(),
            )
                .into_response()
        }
    }
}

/// Fetches the chart's README by running `helm repo add` + `helm show readme`.
pub async fn get_helm_chart_readme(
    Query(q): Query<ChartValuesQuery>,
    _state: State<AppState>,
) -> impl IntoResponse {
    let repo_url = q.repo_url.trim();
    let chart = q.chart.trim();
    let version = q.version.trim();

    if repo_url.is_empty() || chart.is_empty() || version.is_empty() {
        return (
            StatusCode::BAD_REQUEST,
            axum::response::Response::builder()
                .header("content-type", "text/plain; charset=utf-8")
                .body(axum::body::Body::from("Missing repo_url, chart, or version"))
                .unwrap(),
        )
            .into_response();
    }

    let repo_name = format!(
        "chartreadme_{}",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis()
    );

    let add = Command::new("helm")
        .args(["repo", "add", &repo_name, repo_url])
        .output()
        .await;

    let _ = match add {
        Ok(o) if o.status.success() => o,
        Ok(o) => {
            let stderr = String::from_utf8_lossy(&o.stderr);
            error!("helm repo add failed (readme): {}", stderr);
            let _ = Command::new("helm").args(["repo", "remove", &repo_name]).output().await;
            return (
                StatusCode::BAD_GATEWAY,
                axum::response::Response::builder()
                    .header("content-type", "text/plain; charset=utf-8")
                    .body(axum::body::Body::from(format!("Failed to add repo: {}", stderr)))
                    .unwrap(),
            )
                .into_response();
        }
        Err(e) => {
            error!("helm repo add error (readme): {}", e);
            return (
                StatusCode::SERVICE_UNAVAILABLE,
                axum::response::Response::builder()
                    .header("content-type", "text/plain; charset=utf-8")
                    .body(axum::body::Body::from(format!("Helm not available: {}", e)))
                    .unwrap(),
            )
                .into_response();
        }
    };

    let chart_ref = format!("{}/{}", repo_name, chart);
    let show_out = Command::new("helm")
        .args(["show", "readme", &chart_ref, "--version", version])
        .output()
        .await;

    let _ = Command::new("helm").args(["repo", "remove", &repo_name]).output().await;

    match show_out {
        Ok(o) if o.status.success() => {
            let readme = String::from_utf8_lossy(&o.stdout).to_string();
            axum::response::Response::builder()
                .status(StatusCode::OK)
                .header("content-type", "text/plain; charset=utf-8")
                .header("content-disposition", "inline")
                .body(axum::body::Body::from(readme))
                .unwrap()
                .into_response()
        }
        Ok(o) => {
            let stderr = String::from_utf8_lossy(&o.stderr);
            error!("helm show readme failed: {}", stderr);
            (
                StatusCode::BAD_GATEWAY,
                axum::response::Response::builder()
                    .header("content-type", "text/plain; charset=utf-8")
                    .body(axum::body::Body::from(stderr.to_string()))
                    .unwrap(),
            )
                .into_response()
        }
        Err(e) => {
            error!("helm show readme error: {}", e);
            (
                StatusCode::SERVICE_UNAVAILABLE,
                axum::response::Response::builder()
                    .header("content-type", "text/plain; charset=utf-8")
                    .body(axum::body::Body::from(e.to_string()))
                    .unwrap(),
            )
                .into_response()
        }
    }
}

/// Returns available chart versions (helm search repo <repo>/<chart> --versions).
pub async fn get_helm_chart_versions(
    Query(q): Query<ChartVersionsQuery>,
    _state: State<AppState>,
) -> impl IntoResponse {
    let repo_url = q.repo_url.trim();
    let chart = q.chart.trim();

    if repo_url.is_empty() || chart.is_empty() {
        return (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({ "data": [], "message": "Missing repo_url or chart" })),
        )
            .into_response();
    }

    let repo_name = format!(
        "chartver_{}",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis()
    );

    let add_out = Command::new("helm")
        .args(["repo", "add", &repo_name, repo_url])
        .output()
        .await;

    let add_ok = match &add_out {
        Ok(o) => o.status.success(),
        Err(e) => {
            error!("helm repo add error: {}", e);
            return (
                StatusCode::SERVICE_UNAVAILABLE,
                Json(serde_json::json!({ "data": [], "message": format!("Helm not available: {}", e) })),
            )
                .into_response();
        }
    };

    if !add_ok {
        let stderr = add_out
            .as_ref()
            .map(|o| String::from_utf8_lossy(&o.stderr).to_string())
            .unwrap_or_default();
        let _ = Command::new("helm").args(["repo", "remove", &repo_name]).output().await;
        return (
            StatusCode::BAD_GATEWAY,
            Json(serde_json::json!({ "data": [], "message": format!("Failed to add repo: {}", stderr) })),
        )
            .into_response();
    }

    let chart_ref = format!("{}/{}", repo_name, chart);
    let search_out = Command::new("helm")
        .args(["search", "repo", &chart_ref, "--versions"])
        .output()
        .await;

    let _ = Command::new("helm").args(["repo", "remove", &repo_name]).output().await;

    match search_out {
        Ok(o) if o.status.success() => {
            let stdout = String::from_utf8_lossy(&o.stdout);
            let versions: Vec<String> = stdout
                .lines()
                .skip(1)
                .filter_map(|line| {
                    let parts: Vec<&str> = line.split_whitespace().collect();
                    if parts.len() >= 2 {
                        Some(parts[1].to_string())
                    } else {
                        None
                    }
                })
                .collect();
            (StatusCode::OK, Json(serde_json::json!({ "data": versions }))).into_response()
        }
        Ok(_) => {
            (StatusCode::OK, Json(serde_json::json!({ "data": [] }))).into_response()
        }
        Err(e) => {
            error!("helm search error: {}", e);
            (
                StatusCode::SERVICE_UNAVAILABLE,
                Json(serde_json::json!({ "data": [], "message": format!("Helm not available: {}", e) })),
            )
                .into_response()
        }
    }
}

pub async fn check_helm_repository(
    Query(q): Query<HelmRepositoryCheckQuery>,
    _state: State<AppState>,
) -> impl IntoResponse {
    let repo_url = q.repo_url.trim();
    if repo_url.is_empty() {
        return (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({ "success": false, "message": "Missing repo_url" })),
        )
            .into_response();
    }

    let repo_name = format!(
        "check_{}_{}",
        repo_alias_from_url(repo_url),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis()
    );

    let add_out = Command::new("helm")
        .args(["repo", "add", &repo_name, repo_url])
        .output()
        .await;

    let add_ok = match &add_out {
        Ok(o) => o.status.success(),
        Err(e) => {
            return (
                StatusCode::SERVICE_UNAVAILABLE,
                Json(serde_json::json!({ "success": false, "message": format!("Helm not available: {}", e) })),
            )
                .into_response();
        }
    };

    if !add_ok {
        let stderr = add_out
            .as_ref()
            .map(|o| String::from_utf8_lossy(&o.stderr).trim().to_string())
            .unwrap_or_else(|_| "Failed to add repository".to_string());
        let _ = Command::new("helm").args(["repo", "remove", &repo_name]).output().await;
        return (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({ "success": false, "message": stderr })),
        )
            .into_response();
    }

    let search_out = Command::new("helm")
        .args(["search", "repo", &format!("{}/", repo_name), "--output", "json"])
        .output()
        .await;

    let _ = Command::new("helm")
        .args(["repo", "remove", &repo_name])
        .output()
        .await;

    match search_out {
        Ok(o) if o.status.success() => {
            let stdout = String::from_utf8_lossy(&o.stdout).to_string();
            let chart_count = serde_json::from_str::<Vec<serde_json::Value>>(&stdout)
                .map(|rows| rows.len())
                .unwrap_or(0);
            (
                StatusCode::OK,
                Json(serde_json::json!({
                    "success": true,
                    "message": format!("Repository is reachable. {} chart(s) discovered.", chart_count),
                    "chart_count": chart_count
                })),
            )
                .into_response()
        }
        Ok(o) => {
            let stderr = String::from_utf8_lossy(&o.stderr).trim().to_string();
            (
                StatusCode::BAD_GATEWAY,
                Json(serde_json::json!({ "success": false, "message": stderr })),
            )
                .into_response()
        }
        Err(e) => (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(serde_json::json!({ "success": false, "message": format!("Helm not available: {}", e) })),
        )
            .into_response(),
    }
}

// ── Helm chart install (run helm upgrade --install) ───────────────────────────

#[derive(Deserialize)]
pub struct InstallChartRequest {
    pub namespace: String,
    pub release_name: String,
    pub repo_url: String,
    pub chart: String,
    pub version: String,
    pub values_yaml: String,
}

/// Runs `helm repo add` + `helm upgrade --install` with the given values, then removes the temp repo.
pub async fn install_helm_chart(
    State(_state): State<AppState>,
    Json(req): Json<InstallChartRequest>,
) -> impl IntoResponse {
    let namespace = req.namespace.trim();
    let release_name = req.release_name.trim();
    let repo_url = req.repo_url.trim();
    let chart = req.chart.trim();
    let version = req.version.trim();
    let values_yaml = req.values_yaml.trim();

    if release_name.is_empty() || repo_url.is_empty() || chart.is_empty() || version.is_empty() {
        return (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({
                "success": false,
                "message": "Missing release_name, repo_url, chart, or version"
            })),
        )
            .into_response();
    }

    let ns = if namespace.is_empty() { "default" } else { namespace };

    let repo_name = format!(
        "install_{}",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis()
    );

    let add_out = Command::new("helm")
        .args(["repo", "add", &repo_name, repo_url])
        .output()
        .await;

    let add_ok = match &add_out {
        Ok(o) => o.status.success(),
        Err(e) => {
            error!("helm repo add error: {}", e);
            return (
                StatusCode::SERVICE_UNAVAILABLE,
                Json(serde_json::json!({
                    "success": false,
                    "message": format!("Helm not available: {}", e)
                })),
            )
                .into_response();
        }
    };

    if !add_ok {
        let stderr = add_out
            .as_ref()
            .map(|o| String::from_utf8_lossy(&o.stderr).to_string())
            .unwrap_or_default();
        let _ = Command::new("helm").args(["repo", "remove", &repo_name]).output().await;
        return (
            StatusCode::BAD_GATEWAY,
            Json(serde_json::json!({
                "success": false,
                "message": format!("Failed to add repo: {}", stderr)
            })),
        )
            .into_response();
    }

    let chart_ref = format!("{}/{}", repo_name, chart);
    let mut cmd = Command::new("helm");
    cmd.arg("upgrade")
        .arg("--install")
        .arg(release_name)
        .arg(&chart_ref)
        .arg("--version")
        .arg(version)
        .arg("--namespace")
        .arg(ns)
        .arg("--create-namespace")
        .arg("--values")
        .arg("-")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    let mut child = match cmd.spawn() {
        Ok(c) => c,
        Err(e) => {
            let _ = Command::new("helm").args(["repo", "remove", &repo_name]).output().await;
            return (
                StatusCode::SERVICE_UNAVAILABLE,
                Json(serde_json::json!({
                    "success": false,
                    "message": format!("Failed to run helm upgrade --install: {}", e)
                })),
            )
                .into_response();
        }
    };

    if let Some(mut stdin) = child.stdin.take() {
        let body = if values_yaml.is_empty() { "{}" } else { values_yaml };
        if let Err(e) = stdin.write_all(body.as_bytes()).await {
            let _ = child.wait().await;
            let _ = Command::new("helm").args(["repo", "remove", &repo_name]).output().await;
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({
                    "success": false,
                    "message": format!("Failed to send values to helm: {}", e)
                })),
            )
                .into_response();
        }
    }

    let output = match child.wait_with_output().await {
        Ok(o) => o,
        Err(e) => {
            let _ = Command::new("helm").args(["repo", "remove", &repo_name]).output().await;
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({
                    "success": false,
                    "message": format!("Helm upgrade --install failed: {}", e)
                })),
            )
                .into_response();
        }
    };

    let _ = Command::new("helm").args(["repo", "remove", &repo_name]).output().await;

    if output.status.success() {
        (
            StatusCode::OK,
            Json(serde_json::json!({
                "success": true,
                "message": format!("Release '{}' installed/upgraded in namespace '{}'", release_name, ns)
            })),
        )
            .into_response()
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let stdout = String::from_utf8_lossy(&output.stdout);
        let msg = if !stderr.is_empty() { stderr } else { stdout };
        (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({
                "success": false,
                "message": msg.to_string()
            })),
        )
            .into_response()
    }
}

// ── Helm Release Resources (helm get manifest) ────────────────────────────────

#[derive(Serialize)]
pub struct HelmResourceItem {
    pub api_version: String,
    pub kind: String,
    pub name: String,
    pub namespace: String,
}

/// GET /helm/releases/:namespace/:name/resources — returns all K8s resources in the release manifest.
pub async fn get_helm_release_resources(
    Path((namespace, name)): Path<(String, String)>,
    State(_state): State<AppState>,
) -> impl IntoResponse {
    let namespace = namespace.trim();
    let name = name.trim();
    if name.is_empty() {
        return (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({ "data": [], "message": "Release name is required" })),
        )
            .into_response();
    }
    let ns = if namespace.is_empty() { "default" } else { namespace };

    let output = Command::new("helm")
        .args(["get", "manifest", name, "--namespace", ns])
        .output()
        .await;

    match output {
        Ok(o) if o.status.success() => {
            let manifest = String::from_utf8_lossy(&o.stdout);
            let mut resources: Vec<HelmResourceItem> = Vec::new();

            // Manifest is multiple YAML docs separated by ---
            for doc in manifest.split("\n---") {
                let trimmed = doc.trim_start_matches("---").trim();
                if trimmed.is_empty() {
                    continue;
                }
                if let Ok(v) = serde_yaml::from_str::<serde_json::Value>(trimmed) {
                    let kind = v["kind"].as_str().unwrap_or("").to_string();
                    let api_version = v["apiVersion"].as_str().unwrap_or("").to_string();
                    let res_name = v["metadata"]["name"].as_str().unwrap_or("").to_string();
                    let res_ns = v["metadata"]["namespace"]
                        .as_str()
                        .unwrap_or(ns)
                        .to_string();
                    if !kind.is_empty() && !res_name.is_empty() {
                        resources.push(HelmResourceItem {
                            api_version,
                            kind,
                            name: res_name,
                            namespace: res_ns,
                        });
                    }
                }
            }

            let total = resources.len();
            (
                StatusCode::OK,
                Json(serde_json::json!({ "data": resources, "total": total })),
            )
                .into_response()
        }
        Ok(o) => {
            let stderr = String::from_utf8_lossy(&o.stderr);
            error!("helm get manifest failed: {}", stderr);
            (
                StatusCode::BAD_REQUEST,
                Json(serde_json::json!({
                    "data": [],
                    "message": stderr.to_string()
                })),
            )
                .into_response()
        }
        Err(e) => {
            error!("helm get manifest error: {}", e);
            (
                StatusCode::SERVICE_UNAVAILABLE,
                Json(serde_json::json!({
                    "data": [],
                    "message": format!("Helm not available: {}", e)
                })),
            )
                .into_response()
        }
    }
}
