use axum::{
    extract::{Path, State},
    http::{header, StatusCode},
    response::IntoResponse,
    Json,
};
use kube::{api::{DeleteParams, ListParams, Patch, PatchParams}, Api};
use tracing::{error, info, warn};

use crate::models::*;
use crate::AppState;

pub async fn list_configmaps(State(state): State<AppState>) -> impl IntoResponse {
    use k8s_openapi::api::core::v1::ConfigMap;

    let api: Api<ConfigMap> = Api::all(state.client);
    match api.list(&ListParams::default()).await {
        Ok(list) => {
            let items: Vec<ConfigMapItem> = list
                .items
                .into_iter()
                .map(|cm| {
                    let name = cm.metadata.name.unwrap_or_default();
                    let namespace = cm.metadata.namespace.unwrap_or_else(|| "default".into());
                    let data_keys = cm.data.as_ref().map(|d| d.len()).unwrap_or(0);
                    let age = cm
                        .metadata
                        .creation_timestamp
                        .as_ref()
                        .map(|t| t.0.to_rfc3339())
                        .unwrap_or_default();
                    ConfigMapItem {
                        name,
                        namespace,
                        data_keys,
                        age,
                    }
                })
                .collect();
            let total = items.len();
            (StatusCode::OK, Json(ApiResponse { data: items, total })).into_response()
        }
        Err(err) => {
            error!("Error listing configmaps: {:?}", err);
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}

pub async fn list_secrets(State(state): State<AppState>) -> impl IntoResponse {
    use k8s_openapi::api::core::v1::Secret;

    let api: Api<Secret> = Api::all(state.client);
    match api.list(&ListParams::default()).await {
        Ok(list) => {
            let items: Vec<SecretItem> = list
                .items
                .into_iter()
                .map(|secret| {
                    let name = secret.metadata.name.unwrap_or_default();
                    let namespace = secret.metadata.namespace.unwrap_or_else(|| "default".into());
                    let secret_type = secret.type_.unwrap_or_default();
                    let data_keys = secret.data.as_ref().map(|d| d.len()).unwrap_or(0);
                    let age = secret
                        .metadata
                        .creation_timestamp
                        .as_ref()
                        .map(|t| t.0.to_rfc3339())
                        .unwrap_or_default();
                    SecretItem {
                        name,
                        namespace,
                        secret_type,
                        data_keys,
                        age,
                    }
                })
                .collect();
            let total = items.len();
            (StatusCode::OK, Json(ApiResponse { data: items, total })).into_response()
        }
        Err(err) => {
            error!("Error listing secrets: {:?}", err);
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}

pub async fn list_resourcequotas(State(state): State<AppState>) -> impl IntoResponse {
    use k8s_openapi::api::core::v1::ResourceQuota;

    let api: Api<ResourceQuota> = Api::all(state.client);
    match api.list(&ListParams::default()).await {
        Ok(list) => {
            let items: Vec<ResourceQuotaItem> = list
                .items
                .into_iter()
                .map(|rq| {
                    let name = rq.metadata.name.unwrap_or_default();
                    let namespace = rq.metadata.namespace.unwrap_or_else(|| "default".into());
                    let status = "Active".to_string();
                    let age = rq
                        .metadata
                        .creation_timestamp
                        .as_ref()
                        .map(|t| t.0.to_rfc3339())
                        .unwrap_or_default();
                    ResourceQuotaItem {
                        name,
                        namespace,
                        status,
                        age,
                    }
                })
                .collect();
            let total = items.len();
            (StatusCode::OK, Json(ApiResponse { data: items, total })).into_response()
        }
        Err(err) => {
            error!("Error listing resourcequotas: {:?}", err);
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}

pub async fn list_limitranges(State(state): State<AppState>) -> impl IntoResponse {
    use k8s_openapi::api::core::v1::LimitRange;

    let api: Api<LimitRange> = Api::all(state.client);
    match api.list(&ListParams::default()).await {
        Ok(list) => {
            let items: Vec<LimitRangeItem> = list
                .items
                .into_iter()
                .map(|lr| {
                    let name = lr.metadata.name.unwrap_or_default();
                    let namespace = lr.metadata.namespace.unwrap_or_else(|| "default".into());
                    let limits = if let Some(spec) = lr.spec.as_ref() {
                        spec.limits.len()
                    } else {
                        0
                    };
                    let age = lr
                        .metadata
                        .creation_timestamp
                        .as_ref()
                        .map(|t| t.0.to_rfc3339())
                        .unwrap_or_default();
                    LimitRangeItem {
                        name,
                        namespace,
                        limits,
                        age,
                    }
                })
                .collect();
            let total = items.len();
            (StatusCode::OK, Json(ApiResponse { data: items, total })).into_response()
        }
        Err(err) => {
            error!("Error listing limitranges: {:?}", err);
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}

pub async fn list_hpa(State(state): State<AppState>) -> impl IntoResponse {
    use k8s_openapi::api::autoscaling::v2::HorizontalPodAutoscaler;

    let api: Api<HorizontalPodAutoscaler> = Api::all(state.client);
    match api.list(&ListParams::default()).await {
        Ok(list) => {
            let items: Vec<HPAItem> = list
                .items
                .into_iter()
                .map(|hpa| {
                    let name = hpa.metadata.name.unwrap_or_default();
                    let namespace = hpa.metadata.namespace.unwrap_or_else(|| "default".into());
                    let spec = hpa.spec.as_ref();
                    let status = hpa.status.as_ref();
                    let reference = spec
                        .map(|s| format!("{}/{}", s.scale_target_ref.kind, s.scale_target_ref.name))
                        .unwrap_or_default();
                    let min_replicas = spec.and_then(|s| s.min_replicas).unwrap_or(1);
                    let max_replicas = spec.map(|s| s.max_replicas).unwrap_or(0);
                    let targets = spec
                        .and_then(|s| s.metrics.as_ref())
                        .map(|m| m.len())
                        .unwrap_or(0);
                    let current_replicas = status.and_then(|s| s.current_replicas).unwrap_or(0);
                    let desired_replicas = status.map(|s| s.desired_replicas).unwrap_or(0);
                    let age = hpa
                        .metadata
                        .creation_timestamp
                        .as_ref()
                        .map(|t| t.0.to_rfc3339())
                        .unwrap_or_default();
                    HPAItem {
                        name,
                        namespace,
                        reference,
                        targets,
                        current_replicas,
                        desired_replicas,
                        min_replicas,
                        max_replicas,
                        age,
                    }
                })
                .collect();
            let total = items.len();
            (StatusCode::OK, Json(ApiResponse { data: items, total })).into_response()
        }
        Err(err) => {
            error!("Error listing hpa: {:?}", err);
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}

pub async fn list_pdb(State(state): State<AppState>) -> impl IntoResponse {
    use k8s_openapi::api::policy::v1::PodDisruptionBudget;

    let api: Api<PodDisruptionBudget> = Api::all(state.client);
    match api.list(&ListParams::default()).await {
        Ok(list) => {
            let items: Vec<PDBItem> = list
                .items
                .into_iter()
                .map(|pdb| {
                    let name = pdb.metadata.name.unwrap_or_default();
                    let namespace = pdb.metadata.namespace.unwrap_or_else(|| "default".into());
                    let spec = pdb.spec.as_ref();
                    let min_available = spec
                        .and_then(|s| s.min_available.as_ref())
                        .map(|m| format!("{:?}", m))
                        .unwrap_or_default();
                    let allowed_disruptions = pdb
                        .status
                        .as_ref()
                        .map(|s| s.disruptions_allowed)
                        .unwrap_or(0);
                    let status = if allowed_disruptions > 0 {
                        "Healthy".to_string()
                    } else {
                        "Unhealthy".to_string()
                    };
                    let age = pdb
                        .metadata
                        .creation_timestamp
                        .as_ref()
                        .map(|t| t.0.to_rfc3339())
                        .unwrap_or_default();
                    PDBItem {
                        name,
                        namespace,
                        min_available,
                        allowed_disruptions,
                        status,
                        age,
                    }
                })
                .collect();
            let total = items.len();
            (StatusCode::OK, Json(ApiResponse { data: items, total })).into_response()
        }
        Err(err) => {
            error!("Error listing pdb: {:?}", err);
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}

pub async fn list_priorityclasses(State(state): State<AppState>) -> impl IntoResponse {
    use k8s_openapi::api::scheduling::v1::PriorityClass;

    let api: Api<PriorityClass> = Api::all(state.client);
    match api.list(&ListParams::default()).await {
        Ok(list) => {
            let items: Vec<PriorityClassItem> = list
                .items
                .into_iter()
                .map(|pc| {
                    let name = pc.metadata.name.unwrap_or_default();
                    let value = pc.value;
                    let global_default = pc.global_default.unwrap_or(false);
                    let age = pc
                        .metadata
                        .creation_timestamp
                        .as_ref()
                        .map(|t| t.0.to_rfc3339())
                        .unwrap_or_default();
                    PriorityClassItem {
                        name,
                        value,
                        global_default,
                        age,
                    }
                })
                .collect();
            let total = items.len();
            (StatusCode::OK, Json(ApiResponse { data: items, total })).into_response()
        }
        Err(err) => {
            if let kube::Error::Api(api_err) = &err {
                if api_err.code == 403 || api_err.code == 404 {
                    warn!(
                        "PriorityClass API unavailable or forbidden (code {}): {}",
                        api_err.code, api_err.message
                    );
                    return (StatusCode::OK, Json(ApiResponse::<PriorityClassItem> { data: vec![], total: 0 }))
                        .into_response();
                }
            }
            error!("Error listing priorityclasses: {:?}", err);
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}

pub async fn list_runtimeclasses(State(state): State<AppState>) -> impl IntoResponse {
    use k8s_openapi::api::node::v1::RuntimeClass;

    let api: Api<RuntimeClass> = Api::all(state.client);
    match api.list(&ListParams::default()).await {
        Ok(list) => {
            let items: Vec<RuntimeClassItem> = list
                .items
                .into_iter()
                .map(|rc| {
                    let name = rc.metadata.name.unwrap_or_default();
                    let handler = rc.handler;
                    let scheduling = rc
                        .scheduling
                        .as_ref()
                        .map(|_| "Configured".into())
                        .unwrap_or_default();
                    let age = rc
                        .metadata
                        .creation_timestamp
                        .as_ref()
                        .map(|t| t.0.to_rfc3339())
                        .unwrap_or_default();
                    RuntimeClassItem {
                        name,
                        handler,
                        scheduling,
                        age,
                    }
                })
                .collect();
            let total = items.len();
            (StatusCode::OK, Json(ApiResponse { data: items, total })).into_response()
        }
        Err(err) => {
            if let kube::Error::Api(api_err) = &err {
                if api_err.code == 403 || api_err.code == 404 {
                    warn!(
                        "RuntimeClass API unavailable or forbidden (code {}): {}",
                        api_err.code, api_err.message
                    );
                    return (StatusCode::OK, Json(ApiResponse::<RuntimeClassItem> { data: vec![], total: 0 }))
                        .into_response();
                }
            }
            error!("Error listing runtimeclasses: {:?}", err);
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}

pub async fn list_leases(State(state): State<AppState>) -> impl IntoResponse {
    use k8s_openapi::api::coordination::v1::Lease;

    let api: Api<Lease> = Api::all(state.client);
    match api.list(&ListParams::default()).await {
        Ok(list) => {
            let items: Vec<LeaseItem> = list
                .items
                .into_iter()
                .map(|lease| {
                    let name = lease.metadata.name.unwrap_or_default();
                    let namespace = lease.metadata.namespace.unwrap_or_else(|| "default".into());
                    let spec = lease.spec.as_ref();
                    let holder_identity = spec
                        .and_then(|s| s.holder_identity.clone())
                        .unwrap_or_default();
                    let lease_duration_seconds = spec
                        .and_then(|s| s.lease_duration_seconds)
                        .unwrap_or(0);
                    let age = lease
                        .metadata
                        .creation_timestamp
                        .as_ref()
                        .map(|t| t.0.to_rfc3339())
                        .unwrap_or_default();
                    LeaseItem {
                        name,
                        namespace,
                        holder_identity,
                        lease_duration_seconds,
                        age,
                    }
                })
                .collect();
            let total = items.len();
            (StatusCode::OK, Json(ApiResponse { data: items, total })).into_response()
        }
        Err(err) => {
            if let kube::Error::Api(api_err) = &err {
                if api_err.code == 403 || api_err.code == 404 {
                    warn!(
                        "Lease API unavailable or forbidden (code {}): {}",
                        api_err.code, api_err.message
                    );
                    return (StatusCode::OK, Json(ApiResponse::<LeaseItem> { data: vec![], total: 0 }))
                        .into_response();
                }
            }
            error!("Error listing leases: {:?}", err);
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}

pub async fn get_configmap_yaml(
    Path((namespace, name)): Path<(String, String)>,
    State(state): State<AppState>,
) -> impl IntoResponse {
    use k8s_openapi::api::core::v1::ConfigMap;

    let api: Api<ConfigMap> = Api::namespaced(state.client, &namespace);
    match api.get(&name).await {
        Ok(configmap) => match serde_yaml::to_string(&configmap) {
            Ok(yaml) => (
                StatusCode::OK,
                [(header::CONTENT_TYPE, "application/yaml; charset=utf-8")],
                yaml,
            )
                .into_response(),
            Err(err) => {
                error!(
                    "Failed to serialize configmap to YAML {}/{}: {:?}",
                    namespace, name, err
                );
                StatusCode::INTERNAL_SERVER_ERROR.into_response()
            }
        },
        Err(err) => {
            error!("Error getting configmap YAML {}/{}: {:?}", namespace, name, err);
            StatusCode::NOT_FOUND.into_response()
        }
    }
}

pub async fn update_configmap_yaml(
    Path((namespace, name)): Path<(String, String)>,
    State(state): State<AppState>,
    body: String,
) -> impl IntoResponse {
    use k8s_openapi::api::core::v1::ConfigMap;

    let mut configmap: ConfigMap = match serde_yaml::from_str(&body) {
        Ok(configmap) => configmap,
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

    configmap.metadata.name = Some(name.clone());
    configmap.metadata.namespace = Some(namespace.clone());

    let api: Api<ConfigMap> = Api::namespaced(state.client, &namespace);
    let patch_value = match serde_json::to_value(&configmap) {
        Ok(value) => value,
        Err(err) => {
            error!(
                "Failed converting configmap YAML to JSON {}/{}: {:?}",
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
                "message": "ConfigMap updated successfully"
            })),
        )
            .into_response(),
        Err(err) => {
            error!("Error updating configmap YAML {}/{}: {:?}", namespace, name, err);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({
                    "success": false,
                    "message": format!("Failed to update configmap: {}", err),
                })),
            )
                .into_response()
        }
    }
}

pub async fn delete_configmap(
    Path((namespace, name)): Path<(String, String)>,
    State(state): State<AppState>,
) -> impl IntoResponse {
    use k8s_openapi::api::core::v1::ConfigMap;
    let api: Api<ConfigMap> = Api::namespaced(state.client, &namespace);
    match api.delete(&name, &DeleteParams::default()).await {
        Ok(_) => {
            info!("Deleted configmap {}/{}", namespace, name);
            (StatusCode::OK, Json(serde_json::json!({ "success": true }))).into_response()
        }
        Err(err) => {
            error!("Error deleting configmap {}/{}: {:?}", namespace, name, err);
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}

pub async fn get_secret_yaml(
    Path((namespace, name)): Path<(String, String)>,
    State(state): State<AppState>,
) -> impl IntoResponse {
    use k8s_openapi::api::core::v1::Secret;

    let api: Api<Secret> = Api::namespaced(state.client, &namespace);
    match api.get(&name).await {
        Ok(secret) => match serde_yaml::to_string(&secret) {
            Ok(yaml) => (
                StatusCode::OK,
                [(header::CONTENT_TYPE, "application/yaml; charset=utf-8")],
                yaml,
            )
                .into_response(),
            Err(err) => {
                error!(
                    "Failed to serialize secret to YAML {}/{}: {:?}",
                    namespace, name, err
                );
                StatusCode::INTERNAL_SERVER_ERROR.into_response()
            }
        },
        Err(err) => {
            error!("Error getting secret YAML {}/{}: {:?}", namespace, name, err);
            StatusCode::NOT_FOUND.into_response()
        }
    }
}

pub async fn get_secret_data(
    Path((namespace, name)): Path<(String, String)>,
    State(state): State<AppState>,
) -> impl IntoResponse {
    use k8s_openapi::api::core::v1::Secret;

    let api: Api<Secret> = Api::namespaced(state.client, &namespace);
    match api.get(&name).await {
        Ok(secret) => {
            let mut decoded = serde_json::Map::new();
            if let Some(data) = secret.data {
                for (key, value) in data {
                    let decoded_value = String::from_utf8(value.0.clone())
                        .unwrap_or_else(|_| String::from_utf8_lossy(&value.0).to_string());
                    decoded.insert(key, serde_json::Value::String(decoded_value));
                }
            }

            (
                StatusCode::OK,
                Json(serde_json::json!({
                    "data": decoded,
                })),
            )
                .into_response()
        }
        Err(err) => {
            error!("Error getting secret data {}/{}: {:?}", namespace, name, err);
            StatusCode::NOT_FOUND.into_response()
        }
    }
}

pub async fn update_secret_yaml(
    Path((namespace, name)): Path<(String, String)>,
    State(state): State<AppState>,
    body: String,
) -> impl IntoResponse {
    use k8s_openapi::api::core::v1::Secret;

    let mut secret: Secret = match serde_yaml::from_str(&body) {
        Ok(secret) => secret,
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

    secret.metadata.name = Some(name.clone());
    secret.metadata.namespace = Some(namespace.clone());

    let api: Api<Secret> = Api::namespaced(state.client, &namespace);
    let patch_value = match serde_json::to_value(&secret) {
        Ok(value) => value,
        Err(err) => {
            error!(
                "Failed converting secret YAML to JSON {}/{}: {:?}",
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
                "message": "Secret updated successfully"
            })),
        )
            .into_response(),
        Err(err) => {
            error!("Error updating secret YAML {}/{}: {:?}", namespace, name, err);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({
                    "success": false,
                    "message": format!("Failed to update secret: {}", err),
                })),
            )
                .into_response()
        }
    }
}

pub async fn delete_secret(
    Path((namespace, name)): Path<(String, String)>,
    State(state): State<AppState>,
) -> impl IntoResponse {
    use k8s_openapi::api::core::v1::Secret;
    let api: Api<Secret> = Api::namespaced(state.client, &namespace);
    match api.delete(&name, &DeleteParams::default()).await {
        Ok(_) => {
            info!("Deleted secret {}/{}", namespace, name);
            (StatusCode::OK, Json(serde_json::json!({ "success": true }))).into_response()
        }
        Err(err) => {
            error!("Error deleting secret {}/{}: {:?}", namespace, name, err);
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}

pub async fn get_resourcequota_yaml(
    Path((namespace, name)): Path<(String, String)>,
    State(state): State<AppState>,
) -> impl IntoResponse {
    use k8s_openapi::api::core::v1::ResourceQuota;

    let api: Api<ResourceQuota> = Api::namespaced(state.client, &namespace);
    match api.get(&name).await {
        Ok(resourcequota) => match serde_yaml::to_string(&resourcequota) {
            Ok(yaml) => (
                StatusCode::OK,
                [(header::CONTENT_TYPE, "application/yaml; charset=utf-8")],
                yaml,
            )
                .into_response(),
            Err(err) => {
                error!(
                    "Failed to serialize resourcequota to YAML {}/{}: {:?}",
                    namespace, name, err
                );
                StatusCode::INTERNAL_SERVER_ERROR.into_response()
            }
        },
        Err(err) => {
            error!("Error getting resourcequota YAML {}/{}: {:?}", namespace, name, err);
            StatusCode::NOT_FOUND.into_response()
        }
    }
}

pub async fn update_resourcequota_yaml(
    Path((namespace, name)): Path<(String, String)>,
    State(state): State<AppState>,
    body: String,
) -> impl IntoResponse {
    use k8s_openapi::api::core::v1::ResourceQuota;

    let mut resourcequota: ResourceQuota = match serde_yaml::from_str(&body) {
        Ok(resourcequota) => resourcequota,
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

    resourcequota.metadata.name = Some(name.clone());
    resourcequota.metadata.namespace = Some(namespace.clone());

    let api: Api<ResourceQuota> = Api::namespaced(state.client, &namespace);
    let patch_value = match serde_json::to_value(&resourcequota) {
        Ok(value) => value,
        Err(err) => {
            error!(
                "Failed converting resourcequota YAML to JSON {}/{}: {:?}",
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
                "message": "ResourceQuota updated successfully"
            })),
        )
            .into_response(),
        Err(err) => {
            error!("Error updating resourcequota YAML {}/{}: {:?}", namespace, name, err);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({
                    "success": false,
                    "message": format!("Failed to update resourcequota: {}", err),
                })),
            )
                .into_response()
        }
    }
}

pub async fn delete_resourcequota(
    Path((namespace, name)): Path<(String, String)>,
    State(state): State<AppState>,
) -> impl IntoResponse {
    use k8s_openapi::api::core::v1::ResourceQuota;
    let api: Api<ResourceQuota> = Api::namespaced(state.client, &namespace);
    match api.delete(&name, &DeleteParams::default()).await {
        Ok(_) => {
            info!("Deleted resourcequota {}/{}", namespace, name);
            (StatusCode::OK, Json(serde_json::json!({ "success": true }))).into_response()
        }
        Err(err) => {
            error!("Error deleting resourcequota {}/{}: {:?}", namespace, name, err);
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}

pub async fn get_limitrange_yaml(
    Path((namespace, name)): Path<(String, String)>,
    State(state): State<AppState>,
) -> impl IntoResponse {
    use k8s_openapi::api::core::v1::LimitRange;

    let api: Api<LimitRange> = Api::namespaced(state.client, &namespace);
    match api.get(&name).await {
        Ok(limitrange) => match serde_yaml::to_string(&limitrange) {
            Ok(yaml) => (
                StatusCode::OK,
                [(header::CONTENT_TYPE, "application/yaml; charset=utf-8")],
                yaml,
            )
                .into_response(),
            Err(err) => {
                error!(
                    "Failed to serialize limitrange to YAML {}/{}: {:?}",
                    namespace, name, err
                );
                StatusCode::INTERNAL_SERVER_ERROR.into_response()
            }
        },
        Err(err) => {
            error!("Error getting limitrange YAML {}/{}: {:?}", namespace, name, err);
            StatusCode::NOT_FOUND.into_response()
        }
    }
}

pub async fn update_limitrange_yaml(
    Path((namespace, name)): Path<(String, String)>,
    State(state): State<AppState>,
    body: String,
) -> impl IntoResponse {
    use k8s_openapi::api::core::v1::LimitRange;

    let mut limitrange: LimitRange = match serde_yaml::from_str(&body) {
        Ok(limitrange) => limitrange,
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

    limitrange.metadata.name = Some(name.clone());
    limitrange.metadata.namespace = Some(namespace.clone());

    let api: Api<LimitRange> = Api::namespaced(state.client, &namespace);
    let patch_value = match serde_json::to_value(&limitrange) {
        Ok(value) => value,
        Err(err) => {
            error!(
                "Failed converting limitrange YAML to JSON {}/{}: {:?}",
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
                "message": "LimitRange updated successfully"
            })),
        )
            .into_response(),
        Err(err) => {
            error!("Error updating limitrange YAML {}/{}: {:?}", namespace, name, err);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({
                    "success": false,
                    "message": format!("Failed to update limitrange: {}", err),
                })),
            )
                .into_response()
        }
    }
}

pub async fn delete_limitrange(
    Path((namespace, name)): Path<(String, String)>,
    State(state): State<AppState>,
) -> impl IntoResponse {
    use k8s_openapi::api::core::v1::LimitRange;
    let api: Api<LimitRange> = Api::namespaced(state.client, &namespace);
    match api.delete(&name, &DeleteParams::default()).await {
        Ok(_) => {
            info!("Deleted limitrange {}/{}", namespace, name);
            (StatusCode::OK, Json(serde_json::json!({ "success": true }))).into_response()
        }
        Err(err) => {
            error!("Error deleting limitrange {}/{}: {:?}", namespace, name, err);
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}

pub async fn get_hpa_yaml(
    Path((namespace, name)): Path<(String, String)>,
    State(state): State<AppState>,
) -> impl IntoResponse {
    use k8s_openapi::api::autoscaling::v2::HorizontalPodAutoscaler;

    let api: Api<HorizontalPodAutoscaler> = Api::namespaced(state.client, &namespace);
    match api.get(&name).await {
        Ok(hpa) => match serde_yaml::to_string(&hpa) {
            Ok(yaml) => (
                StatusCode::OK,
                [(header::CONTENT_TYPE, "application/yaml; charset=utf-8")],
                yaml,
            )
                .into_response(),
            Err(err) => {
                error!(
                    "Failed to serialize hpa to YAML {}/{}: {:?}",
                    namespace, name, err
                );
                StatusCode::INTERNAL_SERVER_ERROR.into_response()
            }
        },
        Err(err) => {
            error!("Error getting hpa YAML {}/{}: {:?}", namespace, name, err);
            StatusCode::NOT_FOUND.into_response()
        }
    }
}

pub async fn update_hpa_yaml(
    Path((namespace, name)): Path<(String, String)>,
    State(state): State<AppState>,
    body: String,
) -> impl IntoResponse {
    use k8s_openapi::api::autoscaling::v2::HorizontalPodAutoscaler;

    let mut hpa: HorizontalPodAutoscaler = match serde_yaml::from_str(&body) {
        Ok(hpa) => hpa,
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

    hpa.metadata.name = Some(name.clone());
    hpa.metadata.namespace = Some(namespace.clone());

    let api: Api<HorizontalPodAutoscaler> = Api::namespaced(state.client, &namespace);
    let patch_value = match serde_json::to_value(&hpa) {
        Ok(value) => value,
        Err(err) => {
            error!(
                "Failed converting hpa YAML to JSON {}/{}: {:?}",
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
                "message": "HorizontalPodAutoscaler updated successfully"
            })),
        )
            .into_response(),
        Err(err) => {
            error!("Error updating hpa YAML {}/{}: {:?}", namespace, name, err);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({
                    "success": false,
                    "message": format!("Failed to update hpa: {}", err),
                })),
            )
                .into_response()
        }
    }
}

pub async fn delete_hpa(
    Path((namespace, name)): Path<(String, String)>,
    State(state): State<AppState>,
) -> impl IntoResponse {
    use k8s_openapi::api::autoscaling::v2::HorizontalPodAutoscaler;
    let api: Api<HorizontalPodAutoscaler> = Api::namespaced(state.client, &namespace);
    match api.delete(&name, &DeleteParams::default()).await {
        Ok(_) => {
            info!("Deleted hpa {}/{}", namespace, name);
            (StatusCode::OK, Json(serde_json::json!({ "success": true }))).into_response()
        }
        Err(err) => {
            error!("Error deleting hpa {}/{}: {:?}", namespace, name, err);
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}

pub async fn get_pdb_yaml(
    Path((namespace, name)): Path<(String, String)>,
    State(state): State<AppState>,
) -> impl IntoResponse {
    use k8s_openapi::api::policy::v1::PodDisruptionBudget;

    let api: Api<PodDisruptionBudget> = Api::namespaced(state.client, &namespace);
    match api.get(&name).await {
        Ok(pdb) => match serde_yaml::to_string(&pdb) {
            Ok(yaml) => (
                StatusCode::OK,
                [(header::CONTENT_TYPE, "application/yaml; charset=utf-8")],
                yaml,
            )
                .into_response(),
            Err(err) => {
                error!(
                    "Failed to serialize pdb to YAML {}/{}: {:?}",
                    namespace, name, err
                );
                StatusCode::INTERNAL_SERVER_ERROR.into_response()
            }
        },
        Err(err) => {
            error!("Error getting pdb YAML {}/{}: {:?}", namespace, name, err);
            StatusCode::NOT_FOUND.into_response()
        }
    }
}

pub async fn update_pdb_yaml(
    Path((namespace, name)): Path<(String, String)>,
    State(state): State<AppState>,
    body: String,
) -> impl IntoResponse {
    use k8s_openapi::api::policy::v1::PodDisruptionBudget;

    let mut pdb: PodDisruptionBudget = match serde_yaml::from_str(&body) {
        Ok(pdb) => pdb,
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

    pdb.metadata.name = Some(name.clone());
    pdb.metadata.namespace = Some(namespace.clone());

    let api: Api<PodDisruptionBudget> = Api::namespaced(state.client, &namespace);
    let patch_value = match serde_json::to_value(&pdb) {
        Ok(value) => value,
        Err(err) => {
            error!(
                "Failed converting pdb YAML to JSON {}/{}: {:?}",
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
                "message": "PodDisruptionBudget updated successfully"
            })),
        )
            .into_response(),
        Err(err) => {
            error!("Error updating pdb YAML {}/{}: {:?}", namespace, name, err);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({
                    "success": false,
                    "message": format!("Failed to update pdb: {}", err),
                })),
            )
                .into_response()
        }
    }
}

pub async fn delete_pdb(
    Path((namespace, name)): Path<(String, String)>,
    State(state): State<AppState>,
) -> impl IntoResponse {
    use k8s_openapi::api::policy::v1::PodDisruptionBudget;
    let api: Api<PodDisruptionBudget> = Api::namespaced(state.client, &namespace);
    match api.delete(&name, &DeleteParams::default()).await {
        Ok(_) => {
            info!("Deleted pdb {}/{}", namespace, name);
            (StatusCode::OK, Json(serde_json::json!({ "success": true }))).into_response()
        }
        Err(err) => {
            error!("Error deleting pdb {}/{}: {:?}", namespace, name, err);
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}

pub async fn get_priorityclass_yaml(
    Path(name): Path<String>,
    State(state): State<AppState>,
) -> impl IntoResponse {
    use k8s_openapi::api::scheduling::v1::PriorityClass;

    let api: Api<PriorityClass> = Api::all(state.client);
    match api.get(&name).await {
        Ok(priorityclass) => match serde_yaml::to_string(&priorityclass) {
            Ok(yaml) => (
                StatusCode::OK,
                [(header::CONTENT_TYPE, "application/yaml; charset=utf-8")],
                yaml,
            )
                .into_response(),
            Err(err) => {
                error!(
                    "Failed to serialize priorityclass to YAML {}: {:?}",
                    name, err
                );
                StatusCode::INTERNAL_SERVER_ERROR.into_response()
            }
        },
        Err(err) => {
            error!("Error getting priorityclass YAML {}: {:?}", name, err);
            StatusCode::NOT_FOUND.into_response()
        }
    }
}

pub async fn update_priorityclass_yaml(
    Path(name): Path<String>,
    State(state): State<AppState>,
    body: String,
) -> impl IntoResponse {
    use k8s_openapi::api::scheduling::v1::PriorityClass;

    let mut priorityclass: PriorityClass = match serde_yaml::from_str(&body) {
        Ok(priorityclass) => priorityclass,
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

    priorityclass.metadata.name = Some(name.clone());

    let api: Api<PriorityClass> = Api::all(state.client);
    let patch_value = match serde_json::to_value(&priorityclass) {
        Ok(value) => value,
        Err(err) => {
            error!(
                "Failed converting priorityclass YAML to JSON {}: {:?}",
                name, err
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
                "message": "PriorityClass updated successfully"
            })),
        )
            .into_response(),
        Err(err) => {
            error!("Error updating priorityclass YAML {}: {:?}", name, err);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({
                    "success": false,
                    "message": format!("Failed to update priorityclass: {}", err),
                })),
            )
                .into_response()
        }
    }
}

pub async fn delete_priorityclass(
    Path(name): Path<String>,
    State(state): State<AppState>,
) -> impl IntoResponse {
    use k8s_openapi::api::scheduling::v1::PriorityClass;
    let api: Api<PriorityClass> = Api::all(state.client);
    match api.delete(&name, &DeleteParams::default()).await {
        Ok(_) => {
            info!("Deleted priorityclass {}", name);
            (StatusCode::OK, Json(serde_json::json!({ "success": true }))).into_response()
        }
        Err(err) => {
            error!("Error deleting priorityclass {}: {:?}", name, err);
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}

pub async fn get_runtimeclass_yaml(
    Path(name): Path<String>,
    State(state): State<AppState>,
) -> impl IntoResponse {
    use k8s_openapi::api::node::v1::RuntimeClass;

    let api: Api<RuntimeClass> = Api::all(state.client);
    match api.get(&name).await {
        Ok(runtimeclass) => match serde_yaml::to_string(&runtimeclass) {
            Ok(yaml) => (
                StatusCode::OK,
                [(header::CONTENT_TYPE, "application/yaml; charset=utf-8")],
                yaml,
            )
                .into_response(),
            Err(err) => {
                error!(
                    "Failed to serialize runtimeclass to YAML {}: {:?}",
                    name, err
                );
                StatusCode::INTERNAL_SERVER_ERROR.into_response()
            }
        },
        Err(err) => {
            error!("Error getting runtimeclass YAML {}: {:?}", name, err);
            StatusCode::NOT_FOUND.into_response()
        }
    }
}

pub async fn update_runtimeclass_yaml(
    Path(name): Path<String>,
    State(state): State<AppState>,
    body: String,
) -> impl IntoResponse {
    use k8s_openapi::api::node::v1::RuntimeClass;

    let mut runtimeclass: RuntimeClass = match serde_yaml::from_str(&body) {
        Ok(runtimeclass) => runtimeclass,
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

    runtimeclass.metadata.name = Some(name.clone());

    let api: Api<RuntimeClass> = Api::all(state.client);
    let patch_value = match serde_json::to_value(&runtimeclass) {
        Ok(value) => value,
        Err(err) => {
            error!(
                "Failed converting runtimeclass YAML to JSON {}: {:?}",
                name, err
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
                "message": "RuntimeClass updated successfully"
            })),
        )
            .into_response(),
        Err(err) => {
            error!("Error updating runtimeclass YAML {}: {:?}", name, err);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({
                    "success": false,
                    "message": format!("Failed to update runtimeclass: {}", err),
                })),
            )
                .into_response()
        }
    }
}

pub async fn delete_runtimeclass(
    Path(name): Path<String>,
    State(state): State<AppState>,
) -> impl IntoResponse {
    use k8s_openapi::api::node::v1::RuntimeClass;
    let api: Api<RuntimeClass> = Api::all(state.client);
    match api.delete(&name, &DeleteParams::default()).await {
        Ok(_) => {
            info!("Deleted runtimeclass {}", name);
            (StatusCode::OK, Json(serde_json::json!({ "success": true }))).into_response()
        }
        Err(err) => {
            error!("Error deleting runtimeclass {}: {:?}", name, err);
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}

pub async fn get_lease_yaml(
    Path((namespace, name)): Path<(String, String)>,
    State(state): State<AppState>,
) -> impl IntoResponse {
    use k8s_openapi::api::coordination::v1::Lease;

    let api: Api<Lease> = Api::namespaced(state.client, &namespace);
    match api.get(&name).await {
        Ok(lease) => match serde_yaml::to_string(&lease) {
            Ok(yaml) => (
                StatusCode::OK,
                [(header::CONTENT_TYPE, "application/yaml; charset=utf-8")],
                yaml,
            )
                .into_response(),
            Err(err) => {
                error!(
                    "Failed to serialize lease to YAML {}/{}: {:?}",
                    namespace, name, err
                );
                StatusCode::INTERNAL_SERVER_ERROR.into_response()
            }
        },
        Err(err) => {
            error!("Error getting lease YAML {}/{}: {:?}", namespace, name, err);
            StatusCode::NOT_FOUND.into_response()
        }
    }
}

pub async fn update_lease_yaml(
    Path((namespace, name)): Path<(String, String)>,
    State(state): State<AppState>,
    body: String,
) -> impl IntoResponse {
    use k8s_openapi::api::coordination::v1::Lease;

    let mut lease: Lease = match serde_yaml::from_str(&body) {
        Ok(lease) => lease,
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

    lease.metadata.name = Some(name.clone());
    lease.metadata.namespace = Some(namespace.clone());

    let api: Api<Lease> = Api::namespaced(state.client, &namespace);
    let patch_value = match serde_json::to_value(&lease) {
        Ok(value) => value,
        Err(err) => {
            error!(
                "Failed converting lease YAML to JSON {}/{}: {:?}",
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
                "message": "Lease updated successfully"
            })),
        )
            .into_response(),
        Err(err) => {
            error!("Error updating lease YAML {}/{}: {:?}", namespace, name, err);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({
                    "success": false,
                    "message": format!("Failed to update lease: {}", err),
                })),
            )
                .into_response()
        }
    }
}

pub async fn delete_lease(
    Path((namespace, name)): Path<(String, String)>,
    State(state): State<AppState>,
) -> impl IntoResponse {
    use k8s_openapi::api::coordination::v1::Lease;
    let api: Api<Lease> = Api::namespaced(state.client, &namespace);
    match api.delete(&name, &DeleteParams::default()).await {
        Ok(_) => {
            info!("Deleted lease {}/{}", namespace, name);
            (StatusCode::OK, Json(serde_json::json!({ "success": true }))).into_response()
        }
        Err(err) => {
            error!("Error deleting lease {}/{}: {:?}", namespace, name, err);
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}
