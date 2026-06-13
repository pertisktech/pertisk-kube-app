use std::collections::HashMap;

use axum::{
    extract::{Path, Query, State},
    http::{header, StatusCode},
    response::IntoResponse,
    Json,
};
use k8s_openapi::api::core::v1::{Namespace, Service};
use k8s_openapi::apiextensions_apiserver::pkg::apis::apiextensions::v1::CustomResourceDefinition;
use kube::{
    api::{ApiResource, DeleteParams, DynamicObject, GroupVersionKind, ListParams},
    Api, Client,
};
use serde::Deserialize;
use tracing::{error, warn};

use crate::models::*;
use crate::{utils::kube_list_warning_response, AppState};

fn custom_resource_from_dynamic(obj: DynamicObject) -> CustomResourceItem {
    let manifest = serde_json::to_value(&obj).unwrap_or_default();
    let labels = obj
        .metadata
        .labels
        .as_ref()
        .map(|bt| bt.iter().map(|(k, v)| (k.clone(), v.clone())).collect::<HashMap<_, _>>());
    let annotations = obj
        .metadata
        .annotations
        .as_ref()
        .map(|bt| bt.iter().map(|(k, v)| (k.clone(), v.clone())).collect::<HashMap<_, _>>());
    CustomResourceItem {
        name: obj.metadata.name.unwrap_or_default(),
        namespace: obj.metadata.namespace,
        created_at: obj
            .metadata
            .creation_timestamp
            .map(|t| t.0.to_rfc3339()),
        spec: obj.data.get("spec").cloned().unwrap_or(serde_json::Value::Null),
        status: obj.data.get("status").cloned(),
        labels,
        annotations,
        manifest,
    }
}

fn gateway_has_status_addresses(status: Option<&serde_json::Value>) -> bool {
    status
        .and_then(|value| value.get("addresses"))
        .and_then(|value| value.as_array())
        .is_some_and(|addresses| !addresses.is_empty())
}

fn load_balancer_addresses_from_service(service: &Service) -> Vec<serde_json::Value> {
    service
        .status
        .as_ref()
        .and_then(|status| status.load_balancer.as_ref())
        .and_then(|lb| lb.ingress.as_ref())
        .map(|ingress| {
            ingress
                .iter()
                .filter_map(|entry| {
                    if let Some(ip) = entry.ip.as_ref().filter(|value| !value.is_empty()) {
                        Some(serde_json::json!({
                            "type": "IPAddress",
                            "value": ip,
                        }))
                    } else if let Some(hostname) = entry.hostname.as_ref().filter(|value| !value.is_empty()) {
                        Some(serde_json::json!({
                            "type": "Hostname",
                            "value": hostname,
                        }))
                    } else {
                        None
                    }
                })
                .collect::<Vec<_>>()
        })
        .unwrap_or_default()
}

fn gateway_class_name(item: &CustomResourceItem) -> Option<&str> {
    item.spec
        .get("gatewayClassName")
        .and_then(|value| value.as_str())
        .or_else(|| {
            item.manifest
                .get("spec")
                .and_then(|spec| spec.get("gatewayClassName"))
                .and_then(|value| value.as_str())
        })
}

fn service_matches_gateway(
    service: &Service,
    gateway_name: &str,
    namespace: &str,
    gateway_class_name: Option<&str>,
) -> bool {
    let service_namespace = service.metadata.namespace.as_deref().unwrap_or("default");
    if service_namespace != namespace {
        return false;
    }

    if service.metadata.name.as_deref() == Some(gateway_name) {
        return true;
    }

    if let Some(class_name) = gateway_class_name {
        if service.metadata.name.as_deref() == Some(class_name) {
            return true;
        }
    }

    service
        .metadata
        .labels
        .as_ref()
        .and_then(|labels| labels.get("gateway.networking.k8s.io/gateway-name"))
        .is_some_and(|value| value == gateway_name)
}

fn pick_service_for_gateway<'a>(
    services: &'a [Service],
    gateway_name: &str,
    namespace: &str,
    gateway_class_name: Option<&str>,
) -> Option<&'a Service> {
    if let Some(service) = services
        .iter()
        .find(|service| service_matches_gateway(service, gateway_name, namespace, gateway_class_name))
    {
        return Some(service);
    }

    services.iter().find(|service| {
        service.metadata.namespace.as_deref().unwrap_or("default") == namespace
            && service.metadata.name.as_deref() == Some(namespace)
    }).or_else(|| {
        let lb_services: Vec<&Service> = services
            .iter()
            .filter(|service| {
                service.metadata.namespace.as_deref().unwrap_or("default") == namespace
                    && service.spec.as_ref().is_some_and(|spec| {
                        spec.type_.as_deref() == Some("LoadBalancer")
                    })
                    && !load_balancer_addresses_from_service(service).is_empty()
            })
            .collect();
        if lb_services.len() == 1 {
            lb_services.into_iter().next()
        } else {
            None
        }
    })
}

fn inject_gateway_status_addresses(item: &mut CustomResourceItem, addresses: Vec<serde_json::Value>) {
    let addresses_value = serde_json::Value::Array(addresses);

    match item.status.as_mut() {
        Some(status) if status.is_object() => {
            status
                .as_object_mut()
                .expect("status object")
                .insert("addresses".to_string(), addresses_value.clone());
        }
        _ => {
            item.status = Some(serde_json::json!({ "addresses": addresses_value.clone() }));
        }
    }

    if let Some(manifest) = item.manifest.as_object_mut() {
        match manifest.get_mut("status") {
            Some(status) if status.is_object() => {
                status
                    .as_object_mut()
                    .expect("manifest status object")
                    .insert("addresses".to_string(), addresses_value);
            }
            _ => {
                manifest.insert("status".to_string(), serde_json::json!({ "addresses": addresses_value }));
            }
        }
    }
}

async fn enrich_gateway_addresses(
    client: Client,
    items: &mut [CustomResourceItem],
) -> Result<(), kube::Error> {
    if items.is_empty() {
        return Ok(());
    }

    let namespaces: Vec<String> = items
        .iter()
        .filter(|item| !gateway_has_status_addresses(item.status.as_ref()))
        .filter_map(|item| item.namespace.clone())
        .collect::<std::collections::HashSet<_>>()
        .into_iter()
        .collect();

    if namespaces.is_empty() {
        return Ok(());
    }

    let mut services = Vec::new();
    for namespace in namespaces {
        let api: Api<Service> = Api::namespaced(client.clone(), &namespace);
        match api.list(&ListParams::default()).await {
            Ok(list) => services.extend(list.items),
            Err(err) if is_list_forbidden(&err) => continue,
            Err(err) => return Err(err),
        }
    }

    for item in items.iter_mut() {
        if gateway_has_status_addresses(item.status.as_ref()) {
            continue;
        }
        let namespace = item.namespace.as_deref().unwrap_or("default");
        let gateway_class = gateway_class_name(item);
        let Some(service) =
            pick_service_for_gateway(&services, &item.name, namespace, gateway_class)
        else {
            continue;
        };
        let addresses = load_balancer_addresses_from_service(service);
        if addresses.is_empty() {
            continue;
        }
        inject_gateway_status_addresses(item, addresses);
    }

    Ok(())
}

pub fn is_gateway_api_gateway(group: &str, kind: &str) -> bool {
    group == "gateway.networking.k8s.io" && kind == "Gateway"
}

pub async fn finalize_custom_resource_item(
    client: Client,
    group: &str,
    kind: &str,
    item: CustomResourceItem,
) -> CustomResourceItem {
    if !is_gateway_api_gateway(group, kind) {
        return item;
    }
    let mut batch = vec![item];
    if enrich_gateway_addresses(client, &mut batch).await.is_ok() {
        return batch.remove(0);
    }
    batch.remove(0)
}

#[derive(Deserialize)]
pub struct NamespaceQuery {
    pub namespace: Option<String>,
}

pub async fn list_crds(State(state): State<AppState>) -> impl IntoResponse {
    let api: Api<CustomResourceDefinition> = Api::all(state.kube_client().await);
    match api.list(&ListParams::default()).await {
        Ok(list) => {
            let items: Vec<CrdItem> = list
                .items
                .iter()
                .map(|crd| {
                    let meta = &crd.metadata;
                    let spec = &crd.spec;
                    let names = &spec.names;
                    let storage_version = spec
                        .versions
                        .iter()
                        .find(|v| v.storage)
                        .or_else(|| spec.versions.first());
                    let printer_columns = storage_version
                        .and_then(|v| v.additional_printer_columns.as_ref())
                        .map(|cols| {
                            cols.iter()
                                .filter(|c| !c.json_path.is_empty() && !c.name.eq_ignore_ascii_case("age"))
                                .map(|c| CrdPrinterColumnItem {
                                    name: c.name.clone(),
                                    json_path: c.json_path.clone(),
                                    type_: Some(c.type_.clone()),
                                    priority: c.priority,
                                })
                                .collect::<Vec<_>>()
                        })
                        .filter(|v| !v.is_empty());

                    CrdItem {
                        name: meta.name.clone().unwrap_or_default(),
                        group: spec.group.clone(),
                        scope: spec.scope.clone(),
                        kind: names.kind.clone(),
                        singular: names.singular.clone().unwrap_or_default(),
                        plural: names.plural.clone(),
                        short_names: names.short_names.clone().unwrap_or_default(),
                        versions: spec
                            .versions
                            .iter()
                            .map(|v| CrdVersionItem {
                                name: v.name.clone(),
                                served: v.served,
                                storage: v.storage,
                            })
                            .collect(),
                        created_at: meta
                            .creation_timestamp
                            .as_ref()
                            .map(|t| t.0.to_rfc3339()),
                        printer_columns,
                    }
                })
                .collect();

            let total = items.len();
            (StatusCode::OK, Json(ApiResponse { data: items, total })).into_response()
        }
        Err(err) => {
            if let Some(response) = kube_list_warning_response("crds", &err) {
                return response;
            }
            error!("Error listing CRDs: {:?}", err);
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}

fn is_list_forbidden(err: &kube::Error) -> bool {
    matches!(err, kube::Error::Api(api_err) if api_err.code == 403)
}

fn is_transient_kube_list_error(err: &kube::Error) -> bool {
    match err {
        kube::Error::Api(api_err) => {
            if api_err.code == 429 || api_err.code == 503 {
                return true;
            }
            let message_lower = api_err.message.to_lowercase();
            message_lower.contains("storage is (re)initializing")
                || message_lower.contains("toomanyrequests")
        }
        _ => false,
    }
}

pub async fn list_custom_resource_items(
    client: Client,
    ar: &ApiResource,
    crd_name: &str,
    scope: &str,
    namespace: Option<&str>,
) -> Result<Vec<CustomResourceItem>, kube::Error> {
    if scope == "Namespaced" {
        if let Some(ns) = namespace {
            let api: Api<DynamicObject> = Api::namespaced_with(client.clone(), ns, ar);
            let list = api.list(&ListParams::default()).await?;
            return Ok(list
                .items
                .into_iter()
                .map(custom_resource_from_dynamic)
                .collect());
        }

        let api: Api<DynamicObject> = Api::all_with(client.clone(), ar);
        match api.list(&ListParams::default()).await {
            Ok(list) => {
                return Ok(list
                    .items
                    .into_iter()
                    .map(custom_resource_from_dynamic)
                    .collect());
            }
            Err(err) if is_list_forbidden(&err) => {
                warn!(
                    "Cluster-wide list forbidden for {}; falling back to per-namespace list",
                    crd_name
                );
            }
            Err(err) => return Err(err),
        }

        let ns_api: Api<Namespace> = Api::all(client.clone());
        let namespaces = ns_api.list(&ListParams::default()).await?;
        let mut items = Vec::new();
        for ns in namespaces.items {
            let Some(ns_name) = ns.metadata.name else {
                continue;
            };
            let api: Api<DynamicObject> = Api::namespaced_with(client.clone(), &ns_name, ar);
            match api.list(&ListParams::default()).await {
                Ok(list) => {
                    items.extend(
                        list.items
                            .into_iter()
                            .map(custom_resource_from_dynamic),
                    );
                }
                Err(err) if is_list_forbidden(&err) => continue,
                Err(err) if is_transient_kube_list_error(&err) => {
                    warn!(
                        "Transient API error listing {} in namespace {}; stopping namespace scan",
                        crd_name, ns_name
                    );
                    break;
                }
                Err(err) => {
                    warn!(
                        "Failed listing {} in namespace {}: {}",
                        crd_name, ns_name, err
                    );
                }
            }
        }
        return Ok(items);
    }

    let api: Api<DynamicObject> = Api::all_with(client.clone(), ar);
    let list = api.list(&ListParams::default()).await?;
    Ok(list
        .items
        .into_iter()
        .map(custom_resource_from_dynamic)
        .collect())
}

pub async fn list_custom_resources_for_crd(
    client: Client,
    crd_name: &str,
    namespace: Option<&str>,
) -> Result<Vec<CustomResourceItem>, kube::Error> {
    let crd_api: Api<CustomResourceDefinition> = Api::all(client.clone());
    let crd = crd_api.get(crd_name).await?;
    let spec = &crd.spec;
    let names = &spec.names;
    let storage_version = spec
        .versions
        .iter()
        .find(|v| v.storage)
        .or_else(|| spec.versions.first())
        .map(|v| v.name.clone())
        .unwrap_or_default();
    let gvk = GroupVersionKind::gvk(&spec.group, &storage_version, &names.kind);
    let ar = ApiResource::from_gvk_with_plural(&gvk, &names.plural);
    let mut items =
        list_custom_resource_items(client.clone(), &ar, crd_name, &spec.scope, namespace).await?;

    if is_gateway_api_gateway(&spec.group, &names.kind) {
        if let Err(err) = enrich_gateway_addresses(client, &mut items).await {
            warn!(
                "Failed to enrich Gateway addresses from Services for {}: {}",
                crd_name, err
            );
        }
    }

    Ok(items)
}

pub async fn list_custom_resources(
    State(state): State<AppState>,
    Path(crd_name): Path<String>,
    Query(query): Query<NamespaceQuery>,
) -> impl IntoResponse {
    let client = state.kube_client().await;

    let crd_api: Api<CustomResourceDefinition> = Api::all(client.clone());
    let crd = match crd_api.get(&crd_name).await {
        Ok(c) => c,
        Err(err) => {
            error!("Error fetching CRD {}: {:?}", crd_name, err);
            return StatusCode::NOT_FOUND.into_response();
        }
    };

    let storage_version = crd
        .spec
        .versions
        .iter()
        .find(|v| v.storage)
        .or_else(|| crd.spec.versions.first())
        .map(|v| v.name.clone())
        .unwrap_or_default();

    if storage_version.is_empty() {
        return (
            StatusCode::OK,
            Json(serde_json::json!({
                "data": [],
                "total": 0,
                "warnings": [format!("CRD {} has no storage version configured.", crd_name)],
            })),
        )
            .into_response();
    }

    let items = match list_custom_resources_for_crd(
        client,
        &crd_name,
        query.namespace.as_deref(),
    )
    .await
    {
        Ok(items) => items,
        Err(err) => {
            if let Some(response) = kube_list_warning_response(&crd_name, &err) {
                return response;
            }
            error!("Error listing custom resources for {}: {:?}", crd_name, err);
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({
                    "data": [],
                    "total": 0,
                    "error": err.to_string(),
                })),
            )
                .into_response();
        }
    };

    let total = items.len();
    (StatusCode::OK, Json(ApiResponse { data: items, total })).into_response()
}

pub async fn get_custom_resource_yaml(
    State(state): State<AppState>,
    Path((crd_name, name)): Path<(String, String)>,
    Query(query): Query<NamespaceQuery>,
) -> impl IntoResponse {
    let client = state.kube_client().await;

    let crd_api: Api<CustomResourceDefinition> = Api::all(client.clone());
    let crd = match crd_api.get(&crd_name).await {
        Ok(c) => c,
        Err(err) => {
            error!("Error fetching CRD {}: {:?}", crd_name, err);
            return StatusCode::NOT_FOUND.into_response();
        }
    };

    let spec = &crd.spec;
    let names = &spec.names;

    let storage_version = spec
        .versions
        .iter()
        .find(|v| v.storage)
        .or_else(|| spec.versions.first())
        .map(|v| v.name.clone())
        .unwrap_or_default();

    let gvk = GroupVersionKind::gvk(&spec.group, &storage_version, &names.kind);
    let ar = ApiResource::from_gvk_with_plural(&gvk, &names.plural);

    let obj = if spec.scope == "Namespaced" {
        let ns = match query.namespace {
            Some(ns) => ns,
            None => {
                return (StatusCode::BAD_REQUEST, "namespace query param required").into_response();
            }
        };
        let api: Api<DynamicObject> = Api::namespaced_with(client.clone(), &ns, &ar);
        match api.get(&name).await {
            Ok(o) => o,
            Err(err) => {
                error!("Error fetching custom resource {} in {}: {:?}", name, crd_name, err);
                return StatusCode::NOT_FOUND.into_response();
            }
        }
    } else {
        let api: Api<DynamicObject> = Api::all_with(client.clone(), &ar);
        match api.get(&name).await {
            Ok(o) => o,
            Err(err) => {
                error!("Error fetching custom resource {} in {}: {:?}", name, crd_name, err);
                return StatusCode::NOT_FOUND.into_response();
            }
        }
    };

    match serde_yaml::to_string(&obj) {
        Ok(yaml) => (
            StatusCode::OK,
            [(header::CONTENT_TYPE, "application/x-yaml")],
            yaml,
        )
            .into_response(),
        Err(err) => {
            error!("Error serializing custom resource to YAML: {:?}", err);
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}

pub async fn delete_custom_resource(
    State(state): State<AppState>,
    Path((crd_name, name)): Path<(String, String)>,
    Query(query): Query<NamespaceQuery>,
) -> impl IntoResponse {
    let client = state.kube_client().await;

    let crd_api: Api<CustomResourceDefinition> = Api::all(client.clone());
    let crd = match crd_api.get(&crd_name).await {
        Ok(c) => c,
        Err(err) => {
            error!("Error fetching CRD {}: {:?}", crd_name, err);
            return StatusCode::NOT_FOUND.into_response();
        }
    };

    let spec = &crd.spec;
    let names = &spec.names;

    let storage_version = spec
        .versions
        .iter()
        .find(|v| v.storage)
        .or_else(|| spec.versions.first())
        .map(|v| v.name.clone())
        .unwrap_or_default();

    let gvk = GroupVersionKind::gvk(&spec.group, &storage_version, &names.kind);
    let ar = ApiResource::from_gvk_with_plural(&gvk, &names.plural);

    let result = if spec.scope == "Namespaced" {
        let ns = match query.namespace {
            Some(ns) => ns,
            None => {
                return (StatusCode::BAD_REQUEST, "namespace query param required").into_response();
            }
        };
        let api: Api<DynamicObject> = Api::namespaced_with(client.clone(), &ns, &ar);
        api.delete(&name, &DeleteParams::default()).await
    } else {
        let api: Api<DynamicObject> = Api::all_with(client.clone(), &ar);
        api.delete(&name, &DeleteParams::default()).await
    };

    match result {
        Ok(_) => StatusCode::NO_CONTENT.into_response(),
        Err(err) => {
            error!("Error deleting custom resource {} ({}): {:?}", name, crd_name, err);
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}

#[cfg(test)]
mod gateway_address_tests {
    use super::*;
    use k8s_openapi::api::core::v1::{LoadBalancerIngress, LoadBalancerStatus, Service, ServiceSpec, ServiceStatus};
    use k8s_openapi::apimachinery::pkg::apis::meta::v1::ObjectMeta;

    fn lb_service(name: &str, namespace: &str, ips: &[&str]) -> Service {
        Service {
            metadata: ObjectMeta {
                name: Some(name.to_string()),
                namespace: Some(namespace.to_string()),
                ..Default::default()
            },
            spec: Some(ServiceSpec {
                type_: Some("LoadBalancer".to_string()),
                ..Default::default()
            }),
            status: Some(ServiceStatus {
                load_balancer: Some(LoadBalancerStatus {
                    ingress: Some(
                        ips.iter()
                            .map(|ip| LoadBalancerIngress {
                                ip: Some((*ip).to_string()),
                                ..Default::default()
                            })
                            .collect(),
                    ),
                }),
                ..Default::default()
            }),
            ..Default::default()
        }
    }

    #[test]
    fn matches_pertisk_eproxy_service_by_gateway_class_name() {
        let services = vec![lb_service(
            "pertisk-eproxy",
            "pertisk-eproxy",
            &[
                "10.1.1.83",
                "2405:9800:b900:f3ba:c39:b0af:fc26:d226",
            ],
        )];

        let picked = pick_service_for_gateway(
            &services,
            "pertisk-gateway",
            "pertisk-eproxy",
            Some("pertisk-eproxy"),
        )
        .expect("service should match gatewayClassName");

        let addresses = load_balancer_addresses_from_service(picked);
        assert_eq!(addresses.len(), 2);
        assert_eq!(addresses[0]["value"], "10.1.1.83");
        assert_eq!(
            addresses[1]["value"],
            "2405:9800:b900:f3ba:c39:b0af:fc26:d226"
        );
    }
}
