use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use base64::{engine::general_purpose::STANDARD, Engine};
use flate2::read::GzDecoder;
use k8s_openapi::api::core::v1::Secret;
use kube::{api::{DeleteParams, ListParams}, Api};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::io::Read;
use std::time::Duration;
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

#[derive(Serialize)]
pub struct HelmChartItem {
    pub name: String,
    pub description: String,
    pub version: String,
    pub app_version: String,
    pub repository: String,
    pub repository_url: String,
    pub stars: u64,
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

pub async fn list_helm_charts(_state: State<AppState>) -> impl IntoResponse {
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

// ── Helm Release Delete (uninstall — removes all history secrets) ─────────────

pub async fn delete_helm_release(
    Path((namespace, name)): Path<(String, String)>,
    State(state): State<AppState>,
) -> impl IntoResponse {
    let client = state.client.clone();
    let api: Api<Secret> = Api::namespaced(client, &namespace);
    let lp = ListParams::default().labels(&format!("owner=helm,name={}", name));

    match api.list(&lp).await {
        Ok(list) => {
            if list.items.is_empty() {
                return (
                    StatusCode::NOT_FOUND,
                    Json(serde_json::json!({ "message": "Release not found" })),
                )
                    .into_response();
            }

            let dp = DeleteParams::default();
            let mut errors: Vec<String> = Vec::new();

            for secret in &list.items {
                if let Some(secret_name) = &secret.metadata.name {
                    if let Err(err) = api.delete(secret_name, &dp).await {
                        errors.push(format!("{}: {}", secret_name, err));
                    }
                }
            }

            if errors.is_empty() {
                (
                    StatusCode::OK,
                    Json(serde_json::json!({
                        "message": format!("Release '{}' uninstalled successfully", name)
                    })),
                )
                    .into_response()
            } else {
                error!("Errors deleting helm release {}: {:?}", name, errors);
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(serde_json::json!({
                        "message": format!("Partial failure uninstalling '{}': {}", name, errors.join("; "))
                    })),
                )
                    .into_response()
            }
        }
        Err(err) => {
            error!("Failed to list helm release secrets for deletion: {}", err);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({ "message": err.to_string() })),
            )
                .into_response()
        }
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
