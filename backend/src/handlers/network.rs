use axum::{
    extract::{Path, State},
    http::{header, StatusCode},
    response::IntoResponse,
    Json,
};
use k8s_openapi::api::core::v1::Service;
use k8s_openapi::api::networking::v1::IngressStatus;
use kube::{api::{DeleteParams, ListParams, Patch, PatchParams}, Api, ResourceExt};
use std::collections::{BTreeMap, HashMap};
use tracing::{error, info};

use crate::models::*;
use crate::{utils::kube_list_warning_response, AppState};

fn sort_ingress_addresses(addresses: &mut Vec<String>) {
    addresses.sort_by(|a, b| {
        let is_ipv4 = |value: &str| value.contains('.') && !value.contains(':');
        match (is_ipv4(a), is_ipv4(b)) {
            (true, false) => std::cmp::Ordering::Less,
            (false, true) => std::cmp::Ordering::Greater,
            _ => a.cmp(b),
        }
    });
    addresses.dedup();
}

fn collect_service_lb_addresses(
    status: Option<&k8s_openapi::api::core::v1::ServiceStatus>,
    external_ips: Option<Vec<String>>,
) -> Vec<String> {
    let mut addresses = external_ips.unwrap_or_default();
    if let Some(lb_ingress) = status
        .and_then(|value| value.load_balancer.as_ref())
        .and_then(|lb| lb.ingress.as_ref())
    {
        addresses.extend(lb_ingress.iter().filter_map(|entry| {
            entry
                .ip
                .clone()
                .or_else(|| entry.hostname.clone())
        }));
    }
    addresses.retain(|value| !value.is_empty() && value != "-");
    sort_ingress_addresses(&mut addresses);
    addresses
}

fn controller_service_candidates(
    class_name: &str,
    metadata: &kube::core::ObjectMeta,
    controller: Option<&str>,
) -> Vec<(String, String)> {
    let mut candidates = Vec::new();
    let release_namespace = metadata
        .annotations
        .as_ref()
        .and_then(|annotations| annotations.get("meta.helm.sh/release-namespace"))
        .cloned();
    let app_name = metadata
        .labels
        .as_ref()
        .and_then(|labels| labels.get("app.kubernetes.io/name"))
        .cloned();

    if let (Some(namespace), Some(service_name)) = (release_namespace.clone(), app_name.clone()) {
        candidates.push((namespace, service_name));
    }
    if let Some(namespace) = release_namespace.clone() {
        candidates.push((namespace, class_name.to_string()));
    }
    if let (Some(namespace), Some(controller)) = (release_namespace, controller) {
        if let Some(service_name) = controller.rsplit('/').next().filter(|part| !part.is_empty()) {
            candidates.push((namespace, service_name.to_string()));
        }
    }

    candidates
}

async fn build_ingress_class_controller_address_map(
    client: &kube::Client,
) -> HashMap<String, String> {
    use k8s_openapi::api::networking::v1::IngressClass;

    let service_api: Api<Service> = Api::all(client.clone());
    let class_api: Api<IngressClass> = Api::all(client.clone());

    let mut load_balancer_services: HashMap<(String, String), Vec<String>> = HashMap::new();
    if let Ok(service_list) = service_api.list(&ListParams::default()).await {
        for service in service_list.items {
            let service_type = service
                .spec
                .as_ref()
                .and_then(|spec| spec.type_.clone())
                .unwrap_or_default();
            if service_type != "LoadBalancer" {
                continue;
            }

            let namespace = service.namespace().unwrap_or_else(|| "default".into());
            let name = service.name_any();
            let addresses = collect_service_lb_addresses(
                service.status.as_ref(),
                service.spec.as_ref().and_then(|spec| spec.external_ips.clone()),
            );
            if !addresses.is_empty() {
                load_balancer_services.insert((namespace, name), addresses);
            }
        }
    }

    let mut class_addresses = HashMap::new();
    if let Ok(class_list) = class_api.list(&ListParams::default()).await {
        for ingress_class in class_list.items {
            let class_name = ingress_class.name_any();
            let controller = ingress_class
                .spec
                .as_ref()
                .and_then(|spec| spec.controller.as_deref());
            let candidates = controller_service_candidates(
                &class_name,
                &ingress_class.metadata,
                controller,
            );

            for (namespace, service_name) in candidates {
                if let Some(addresses) =
                    load_balancer_services.get(&(namespace.clone(), service_name.clone()))
                {
                    class_addresses.insert(class_name.clone(), format_ingress_addresses(addresses.clone()));
                    break;
                }
            }
        }
    }

    class_addresses
}

fn collect_ingress_lb_addresses(status: Option<&IngressStatus>) -> Vec<String> {
    status
        .and_then(|value| value.load_balancer.as_ref())
        .and_then(|lb| lb.ingress.as_ref())
        .map(|entries| {
            entries
                .iter()
                .filter_map(|entry| entry.ip.clone().or_else(|| entry.hostname.clone()))
                .collect::<Vec<_>>()
        })
        .unwrap_or_default()
}

fn collect_ingress_annotation_addresses(
    annotations: Option<&BTreeMap<String, String>>,
) -> Vec<String> {
    let Some(annotations) = annotations else {
        return Vec::new();
    };

    [
        "external-dns.alpha.kubernetes.io/target",
        "external-dns.alpha.kubernetes.io/hostname",
        "nginx.ingress.kubernetes.io/external-dns",
    ]
    .into_iter()
    .filter_map(|key| annotations.get(key))
    .flat_map(|value| {
        value
            .split(',')
            .map(str::trim)
            .filter(|part| !part.is_empty())
            .map(str::to_string)
    })
    .collect()
}

fn format_ingress_addresses(mut addresses: Vec<String>) -> String {
    addresses.retain(|value| !value.is_empty() && value != "-");
    sort_ingress_addresses(&mut addresses);
    if addresses.is_empty() {
        "-".into()
    } else {
        addresses.join(", ")
    }
}

fn resolve_ingress_address(
    ingress_class: &str,
    status: Option<&IngressStatus>,
    annotations: Option<&BTreeMap<String, String>>,
    class_controller_addresses: &HashMap<String, String>,
) -> String {
    if let Some(address) = class_controller_addresses.get(ingress_class) {
        if address != "-" {
            return address.clone();
        }
    }

    let mut addresses = collect_ingress_lb_addresses(status);
    addresses.extend(collect_ingress_annotation_addresses(annotations));
    format_ingress_addresses(addresses)
}

fn apply_ingress_class_address_fallback(
    items: &mut [IngressItem],
    class_controller_addresses: &HashMap<String, String>,
) {
    let mut class_addresses: HashMap<String, Vec<String>> = HashMap::new();

    for (class_name, address) in class_controller_addresses {
        if address == "-" {
            continue;
        }
        class_addresses.insert(
            class_name.clone(),
            address
                .split(", ")
                .filter(|part| !part.is_empty())
                .map(str::to_string)
                .collect(),
        );
    }

    for item in items.iter() {
        if item.address == "-" {
            continue;
        }
        let entry = class_addresses.entry(item.ingress_class.clone()).or_default();
        entry.extend(
            item.address
                .split(", ")
                .filter(|part| !part.is_empty())
                .map(str::to_string),
        );
    }

    for addresses in class_addresses.values_mut() {
        sort_ingress_addresses(addresses);
    }

    for item in items.iter_mut() {
        if item.address != "-" {
            continue;
        }
        let Some(addresses) = class_addresses.get(&item.ingress_class) else {
            continue;
        };
        if addresses.is_empty() {
            continue;
        }
        item.address = addresses.join(", ");
    }
}

pub async fn list_services(State(state): State<AppState>) -> impl IntoResponse {
    use k8s_openapi::api::core::v1::Service;

    let api: Api<Service> = Api::all(state.kube_client().await);
    match api.list(&ListParams::default()).await {
        Ok(list) => {
            let items: Vec<ServiceItem> = list
                .items
                .into_iter()
                .map(|svc| {
                    let name = svc.metadata.name.unwrap_or_default();
                    let namespace = svc.metadata.namespace.unwrap_or_else(|| "default".into());
                    let spec = svc.spec.as_ref();
                    let status = svc.status.as_ref();

                    let service_type = spec
                        .and_then(|s| s.type_.clone())
                        .unwrap_or_else(|| "ClusterIP".into());

                    let cluster_ip = spec
                        .and_then(|s| s.cluster_ip.clone())
                        .unwrap_or_else(|| "-".into());

                    let mut external_values: Vec<String> = spec
                        .and_then(|s| s.external_ips.clone())
                        .unwrap_or_default();

                    if let Some(lb_ingress) = status
                        .and_then(|s| s.load_balancer.as_ref())
                        .and_then(|lb| lb.ingress.as_ref())
                    {
                        external_values.extend(lb_ingress.iter().map(|entry| {
                            entry
                                .ip
                                .clone()
                                .or_else(|| entry.hostname.clone())
                                .unwrap_or_else(|| "-".into())
                        }));
                    }

                    external_values.retain(|value| value != "-");
                    external_values.sort();
                    external_values.dedup();

                    let external_ip = if external_values.is_empty() {
                        "-".into()
                    } else {
                        external_values.join(", ")
                    };

                    let ports = spec
                        .and_then(|s| s.ports.clone())
                        .map(|values| {
                            let rendered: Vec<String> = values
                                .into_iter()
                                .map(|port| format!("{}/{}", port.port, port.protocol.unwrap_or_else(|| "TCP".into())))
                                .collect();
                            if rendered.is_empty() {
                                "-".into()
                            } else {
                                rendered.join(", ")
                            }
                        })
                        .unwrap_or_else(|| "-".into());

                    let age = svc
                        .metadata
                        .creation_timestamp
                        .as_ref()
                        .map(|t| t.0.to_rfc3339())
                        .unwrap_or_default();

                    let labels = svc
                        .metadata
                        .labels
                        .as_ref()
                        .and_then(|l| serde_json::to_value(l).ok())
                        .and_then(|v| v.as_object().cloned());
                    let annotations = svc
                        .metadata
                        .annotations
                        .as_ref()
                        .and_then(|a| serde_json::to_value(a).ok())
                        .and_then(|v| v.as_object().cloned());

                    ServiceItem {
                        name,
                        namespace,
                        service_type,
                        cluster_ip,
                        external_ip,
                        ports,
                        age,
                        labels,
                        annotations,
                    }
                })
                .collect();

            let total = items.len();
            (StatusCode::OK, Json(ApiResponse { data: items, total })).into_response()
        }
        Err(err) => {
            if let Some(response) = kube_list_warning_response("services", &err) {
                return response;
            }
            error!("Error listing services: {:?}", err);
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}

pub async fn list_endpoints(State(state): State<AppState>) -> impl IntoResponse {
    use k8s_openapi::api::core::v1::Endpoints;

    let api: Api<Endpoints> = Api::all(state.kube_client().await);
    match api.list(&ListParams::default()).await {
        Ok(list) => {
            let items: Vec<EndpointItem> = list
                .items
                .into_iter()
                .map(|ep| {
                    let name = ep.metadata.name.unwrap_or_default();
                    let namespace = ep.metadata.namespace.unwrap_or_else(|| "default".into());

                    let subsets = ep.subsets.unwrap_or_default();
                    let addresses = subsets
                        .iter()
                        .map(|subset| subset.addresses.as_ref().map_or(0, |a| a.len()))
                        .sum();
                    let not_ready = subsets
                        .iter()
                        .map(|subset| subset.not_ready_addresses.as_ref().map_or(0, |a| a.len()))
                        .sum();

                    let mut unique_ports: Vec<String> = subsets
                        .iter()
                        .flat_map(|subset| {
                            subset
                                .ports
                                .as_ref()
                                .map(|ports| {
                                    ports
                                        .iter()
                                        .map(|port| format!("{}/{}", port.port, port.protocol.clone().unwrap_or_else(|| "TCP".into())))
                                        .collect::<Vec<_>>()
                                })
                                .unwrap_or_default()
                        })
                        .collect();
                    unique_ports.sort();
                    unique_ports.dedup();

                    let ports = if unique_ports.is_empty() {
                        "-".into()
                    } else {
                        unique_ports.join(", ")
                    };

                    let age = ep
                        .metadata
                        .creation_timestamp
                        .as_ref()
                        .map(|t| t.0.to_rfc3339())
                        .unwrap_or_default();

                    let labels = ep
                        .metadata
                        .labels
                        .as_ref()
                        .and_then(|l| serde_json::to_value(l).ok())
                        .and_then(|v| v.as_object().cloned());
                    let annotations = ep
                        .metadata
                        .annotations
                        .as_ref()
                        .and_then(|a| serde_json::to_value(a).ok())
                        .and_then(|v| v.as_object().cloned());

                    EndpointItem {
                        name,
                        namespace,
                        addresses,
                        not_ready,
                        ports,
                        age,
                        labels,
                        annotations,
                    }
                })
                .collect();

            let total = items.len();
            (StatusCode::OK, Json(ApiResponse { data: items, total })).into_response()
        }
        Err(err) => {
            if let Some(response) = kube_list_warning_response("endpoints", &err) {
                return response;
            }
            error!("Error listing endpoints: {:?}", err);
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}

pub async fn list_ingresses(State(state): State<AppState>) -> impl IntoResponse {
    use k8s_openapi::api::networking::v1::Ingress;

    let client = state.kube_client().await;
    let class_controller_addresses = build_ingress_class_controller_address_map(&client).await;
    let api: Api<Ingress> = Api::all(client);
    match api.list(&ListParams::default()).await {
        Ok(list) => {
            let items: Vec<IngressItem> = list
                .items
                .into_iter()
                .map(|ing| {
                    let name = ing.metadata.name.unwrap_or_default();
                    let namespace = ing.metadata.namespace.unwrap_or_else(|| "default".into());
                    let spec = ing.spec.as_ref();
                    let status = ing.status.as_ref();

                    let ingress_class = spec
                        .and_then(|s| s.ingress_class_name.clone())
                        .unwrap_or_else(|| "-".into());

                    let rules = spec
                        .and_then(|s| s.rules.as_ref())
                        .map_or(0, |values| values.len());

                    let mut hosts: Vec<String> = spec
                        .and_then(|s| s.rules.as_ref())
                        .map(|values| {
                            values
                                .iter()
                                .filter_map(|rule| rule.host.clone())
                                .collect::<Vec<_>>()
                        })
                        .unwrap_or_default();
                    hosts.sort();
                    hosts.dedup();
                    let hosts = if hosts.is_empty() {
                        "-".into()
                    } else {
                        hosts.join(", ")
                    };

                    let address = resolve_ingress_address(
                        &ingress_class,
                        status,
                        ing.metadata.annotations.as_ref(),
                        &class_controller_addresses,
                    );

                    let age = ing
                        .metadata
                        .creation_timestamp
                        .as_ref()
                        .map(|t| t.0.to_rfc3339())
                        .unwrap_or_default();

                    let labels = ing
                        .metadata
                        .labels
                        .as_ref()
                        .and_then(|l| serde_json::to_value(l).ok())
                        .and_then(|v| v.as_object().cloned());
                    let annotations = ing
                        .metadata
                        .annotations
                        .as_ref()
                        .and_then(|a| serde_json::to_value(a).ok())
                        .and_then(|v| v.as_object().cloned());

                    IngressItem {
                        name,
                        namespace,
                        ingress_class,
                        hosts,
                        address,
                        rules,
                        age,
                        labels,
                        annotations,
                    }
                })
                .collect();

            let mut items = items;
            apply_ingress_class_address_fallback(&mut items, &class_controller_addresses);

            let total = items.len();
            (StatusCode::OK, Json(ApiResponse { data: items, total })).into_response()
        }
        Err(err) => {
            if let Some(response) = kube_list_warning_response("ingresses", &err) {
                return response;
            }
            error!("Error listing ingresses: {:?}", err);
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}

pub async fn list_ingressclasses(State(state): State<AppState>) -> impl IntoResponse {
    use k8s_openapi::api::networking::v1::IngressClass;

    let client = state.kube_client().await;
    let class_controller_addresses = build_ingress_class_controller_address_map(&client).await;
    let api: Api<IngressClass> = Api::all(client);
    match api.list(&ListParams::default()).await {
        Ok(list) => {
            let items: Vec<IngressClassItem> = list
                .items
                .into_iter()
                .map(|ing_class| {
                    let name = ing_class.metadata.name.unwrap_or_default();
                    let controller = ing_class
                        .spec
                        .as_ref()
                        .and_then(|spec| spec.controller.clone())
                        .unwrap_or_else(|| "-".into());
                    let parameters = ing_class
                        .spec
                        .as_ref()
                        .and_then(|spec| spec.parameters.as_ref())
                        .as_ref()
                        .map(|params| format!("{}/{}", params.kind, params.name))
                        .unwrap_or_else(|| "-".into());

                    let is_default = ing_class
                        .metadata
                        .annotations
                        .as_ref()
                        .and_then(|annotations| annotations.get("ingressclass.kubernetes.io/is-default-class"))
                        .map(|value| value == "true")
                        .unwrap_or(false);

                    let age = ing_class
                        .metadata
                        .creation_timestamp
                        .as_ref()
                        .map(|t| t.0.to_rfc3339())
                        .unwrap_or_default();

                    let labels = ing_class
                        .metadata
                        .labels
                        .as_ref()
                        .and_then(|l| serde_json::to_value(l).ok())
                        .and_then(|v| v.as_object().cloned());
                    let annotations = ing_class
                        .metadata
                        .annotations
                        .as_ref()
                        .and_then(|a| serde_json::to_value(a).ok())
                        .and_then(|v| v.as_object().cloned());

                    IngressClassItem {
                        name: name.clone(),
                        controller,
                        is_default,
                        parameters,
                        age,
                        address: class_controller_addresses
                            .get(&name)
                            .cloned()
                            .unwrap_or_else(|| "-".into()),
                        labels,
                        annotations,
                    }
                })
                .collect();

            let total = items.len();
            (StatusCode::OK, Json(ApiResponse { data: items, total })).into_response()
        }
        Err(err) => {
            if let Some(response) = kube_list_warning_response("ingressclasses", &err) {
                return response;
            }
            error!("Error listing ingress classes: {:?}", err);
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}

pub async fn list_networkpolicies(State(state): State<AppState>) -> impl IntoResponse {
    use k8s_openapi::api::networking::v1::NetworkPolicy;

    let api: Api<NetworkPolicy> = Api::all(state.kube_client().await);
    match api.list(&ListParams::default()).await {
        Ok(list) => {
            let items: Vec<NetworkPolicyItem> = list
                .items
                .into_iter()
                .map(|policy| {
                    let name = policy.metadata.name.unwrap_or_default();
                    let namespace = policy.metadata.namespace.unwrap_or_else(|| "default".into());

                    let selector_labels = policy
                        .spec
                        .as_ref()
                        .and_then(|spec| spec.pod_selector.match_labels.as_ref())
                        .as_ref()
                        .map(|labels| {
                            let mut rendered: Vec<String> = labels
                                .iter()
                                .map(|(key, value)| format!("{}={}", key, value))
                                .collect();
                            rendered.sort();
                            if rendered.is_empty() {
                                "All pods".into()
                            } else {
                                rendered.join(", ")
                            }
                        })
                        .unwrap_or_else(|| "All pods".into());

                    let policy_types = policy
                        .spec
                        .as_ref()
                        .and_then(|spec| spec.policy_types.clone())
                        .unwrap_or_default()
                        .join(", ");

                    let ingress_rules = policy
                        .spec
                        .as_ref()
                        .and_then(|spec| spec.ingress.as_ref())
                        .map_or(0, |rules| rules.len());
                    let egress_rules = policy
                        .spec
                        .as_ref()
                        .and_then(|spec| spec.egress.as_ref())
                        .map_or(0, |rules| rules.len());

                    let age = policy
                        .metadata
                        .creation_timestamp
                        .as_ref()
                        .map(|t| t.0.to_rfc3339())
                        .unwrap_or_default();

                    let labels = policy
                        .metadata
                        .labels
                        .as_ref()
                        .and_then(|l| serde_json::to_value(l).ok())
                        .and_then(|v| v.as_object().cloned());
                    let annotations = policy
                        .metadata
                        .annotations
                        .as_ref()
                        .and_then(|a| serde_json::to_value(a).ok())
                        .and_then(|v| v.as_object().cloned());

                    NetworkPolicyItem {
                        name,
                        namespace,
                        pod_selector: selector_labels,
                        policy_types,
                        ingress_rules,
                        egress_rules,
                        age,
                        labels,
                        annotations,
                    }
                })
                .collect();

            let total = items.len();
            (StatusCode::OK, Json(ApiResponse { data: items, total })).into_response()
        }
        Err(err) => {
            if let Some(response) = kube_list_warning_response("networkpolicies", &err) {
                return response;
            }
            error!("Error listing network policies: {:?}", err);
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}

pub async fn get_service_yaml(
    Path((namespace, name)): Path<(String, String)>,
    State(state): State<AppState>,
) -> impl IntoResponse {
    use k8s_openapi::api::core::v1::Service;

    let api: Api<Service> = Api::namespaced(state.kube_client().await, &namespace);
    match api.get(&name).await {
        Ok(obj) => match serde_yaml::to_string(&obj) {
            Ok(yaml) => (
                StatusCode::OK,
                [(header::CONTENT_TYPE, "application/yaml; charset=utf-8")],
                yaml,
            )
                .into_response(),
            Err(err) => {
                error!(
                    "Failed to serialize service to YAML {}/{}: {:?}",
                    namespace, name, err
                );
                StatusCode::INTERNAL_SERVER_ERROR.into_response()
            }
        },
        Err(err) => {
            error!("Error getting service YAML {}/{}: {:?}", namespace, name, err);
            StatusCode::NOT_FOUND.into_response()
        }
    }
}

pub async fn update_service_yaml(
    Path((namespace, name)): Path<(String, String)>,
    State(state): State<AppState>,
    body: String,
) -> impl IntoResponse {
    use k8s_openapi::api::core::v1::Service;

    let mut obj: Service = match serde_yaml::from_str(&body) {
        Ok(o) => o,
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

    obj.metadata.name = Some(name.clone());
    obj.metadata.namespace = Some(namespace.clone());

    let api: Api<Service> = Api::namespaced(state.kube_client().await, &namespace);
    let patch_value = match serde_json::to_value(&obj) {
        Ok(v) => v,
        Err(err) => {
            error!(
                "Failed converting service YAML to JSON {}/{}: {:?}",
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
                "message": "Service updated successfully"
            })),
        )
            .into_response(),
        Err(err) => {
            error!("Error updating service YAML {}/{}: {:?}", namespace, name, err);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({
                    "success": false,
                    "message": format!("Failed to update service: {}", err)
                })),
            )
                .into_response()
        }
    }
}

pub async fn get_endpoint_yaml(
    Path((namespace, name)): Path<(String, String)>,
    State(state): State<AppState>,
) -> impl IntoResponse {
    use k8s_openapi::api::core::v1::Endpoints;

    let api: Api<Endpoints> = Api::namespaced(state.kube_client().await, &namespace);
    match api.get(&name).await {
        Ok(obj) => match serde_yaml::to_string(&obj) {
            Ok(yaml) => (
                StatusCode::OK,
                [(header::CONTENT_TYPE, "application/yaml; charset=utf-8")],
                yaml,
            )
                .into_response(),
            Err(err) => {
                error!(
                    "Failed to serialize endpoint to YAML {}/{}: {:?}",
                    namespace, name, err
                );
                StatusCode::INTERNAL_SERVER_ERROR.into_response()
            }
        },
        Err(err) => {
            error!("Error getting endpoint YAML {}/{}: {:?}", namespace, name, err);
            StatusCode::NOT_FOUND.into_response()
        }
    }
}

pub async fn update_endpoint_yaml(
    Path((namespace, name)): Path<(String, String)>,
    State(state): State<AppState>,
    body: String,
) -> impl IntoResponse {
    use k8s_openapi::api::core::v1::Endpoints;

    let mut obj: Endpoints = match serde_yaml::from_str(&body) {
        Ok(o) => o,
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

    obj.metadata.name = Some(name.clone());
    obj.metadata.namespace = Some(namespace.clone());

    let api: Api<Endpoints> = Api::namespaced(state.kube_client().await, &namespace);
    let patch_value = match serde_json::to_value(&obj) {
        Ok(v) => v,
        Err(err) => {
            error!(
                "Failed converting endpoint YAML to JSON {}/{}: {:?}",
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
                "message": "Endpoint updated successfully"
            })),
        )
            .into_response(),
        Err(err) => {
            error!("Error updating endpoint YAML {}/{}: {:?}", namespace, name, err);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({
                    "success": false,
                    "message": format!("Failed to update endpoint: {}", err)
                })),
            )
                .into_response()
        }
    }
}

pub async fn get_ingress_yaml(
    Path((namespace, name)): Path<(String, String)>,
    State(state): State<AppState>,
) -> impl IntoResponse {
    use k8s_openapi::api::networking::v1::Ingress;

    let api: Api<Ingress> = Api::namespaced(state.kube_client().await, &namespace);
    match api.get(&name).await {
        Ok(obj) => match serde_yaml::to_string(&obj) {
            Ok(yaml) => (
                StatusCode::OK,
                [(header::CONTENT_TYPE, "application/yaml; charset=utf-8")],
                yaml,
            )
                .into_response(),
            Err(err) => {
                error!(
                    "Failed to serialize ingress to YAML {}/{}: {:?}",
                    namespace, name, err
                );
                StatusCode::INTERNAL_SERVER_ERROR.into_response()
            }
        },
        Err(err) => {
            error!("Error getting ingress YAML {}/{}: {:?}", namespace, name, err);
            StatusCode::NOT_FOUND.into_response()
        }
    }
}

pub async fn update_ingress_yaml(
    Path((namespace, name)): Path<(String, String)>,
    State(state): State<AppState>,
    body: String,
) -> impl IntoResponse {
    use k8s_openapi::api::networking::v1::Ingress;

    let mut obj: Ingress = match serde_yaml::from_str(&body) {
        Ok(o) => o,
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

    obj.metadata.name = Some(name.clone());
    obj.metadata.namespace = Some(namespace.clone());

    let api: Api<Ingress> = Api::namespaced(state.kube_client().await, &namespace);
    let patch_value = match serde_json::to_value(&obj) {
        Ok(v) => v,
        Err(err) => {
            error!(
                "Failed converting ingress YAML to JSON {}/{}: {:?}",
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
                "message": "Ingress updated successfully"
            })),
        )
            .into_response(),
        Err(err) => {
            error!("Error updating ingress YAML {}/{}: {:?}", namespace, name, err);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({
                    "success": false,
                    "message": format!("Failed to update ingress: {}", err)
                })),
            )
                .into_response()
        }
    }
}

pub async fn get_ingressclass_yaml(
    Path(name): Path<String>,
    State(state): State<AppState>,
) -> impl IntoResponse {
    use k8s_openapi::api::networking::v1::IngressClass;

    let api: Api<IngressClass> = Api::all(state.kube_client().await);
    match api.get(&name).await {
        Ok(obj) => match serde_yaml::to_string(&obj) {
            Ok(yaml) => (
                StatusCode::OK,
                [(header::CONTENT_TYPE, "application/yaml; charset=utf-8")],
                yaml,
            )
                .into_response(),
            Err(err) => {
                error!("Failed to serialize ingressclass to YAML {}: {:?}", name, err);
                StatusCode::INTERNAL_SERVER_ERROR.into_response()
            }
        },
        Err(err) => {
            error!("Error getting ingressclass YAML {}: {:?}", name, err);
            StatusCode::NOT_FOUND.into_response()
        }
    }
}

pub async fn update_ingressclass_yaml(
    Path(name): Path<String>,
    State(state): State<AppState>,
    body: String,
) -> impl IntoResponse {
    use k8s_openapi::api::networking::v1::IngressClass;

    let mut obj: IngressClass = match serde_yaml::from_str(&body) {
        Ok(o) => o,
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

    obj.metadata.name = Some(name.clone());

    let api: Api<IngressClass> = Api::all(state.kube_client().await);
    let patch_value = match serde_json::to_value(&obj) {
        Ok(v) => v,
        Err(err) => {
            error!("Failed converting ingressclass YAML to JSON {}: {:?}", name, err);
            return StatusCode::INTERNAL_SERVER_ERROR.into_response();
        }
    };

    let patch_params = PatchParams::apply("pertisk-kube-web").force();
    match api.patch(&name, &patch_params, &Patch::Apply(patch_value)).await {
        Ok(_) => (
            StatusCode::OK,
            Json(serde_json::json!({
                "success": true,
                "message": "IngressClass updated successfully"
            })),
        )
            .into_response(),
        Err(err) => {
            error!("Error updating ingressclass YAML {}: {:?}", name, err);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({
                    "success": false,
                    "message": format!("Failed to update ingressclass: {}", err)
                })),
            )
                .into_response()
        }
    }
}

pub async fn get_networkpolicy_yaml(
    Path((namespace, name)): Path<(String, String)>,
    State(state): State<AppState>,
) -> impl IntoResponse {
    use k8s_openapi::api::networking::v1::NetworkPolicy;

    let api: Api<NetworkPolicy> = Api::namespaced(state.kube_client().await, &namespace);
    match api.get(&name).await {
        Ok(obj) => match serde_yaml::to_string(&obj) {
            Ok(yaml) => (
                StatusCode::OK,
                [(header::CONTENT_TYPE, "application/yaml; charset=utf-8")],
                yaml,
            )
                .into_response(),
            Err(err) => {
                error!(
                    "Failed to serialize networkpolicy to YAML {}/{}: {:?}",
                    namespace, name, err
                );
                StatusCode::INTERNAL_SERVER_ERROR.into_response()
            }
        },
        Err(err) => {
            error!(
                "Error getting networkpolicy YAML {}/{}: {:?}",
                namespace, name, err
            );
            StatusCode::NOT_FOUND.into_response()
        }
    }
}

pub async fn update_networkpolicy_yaml(
    Path((namespace, name)): Path<(String, String)>,
    State(state): State<AppState>,
    body: String,
) -> impl IntoResponse {
    use k8s_openapi::api::networking::v1::NetworkPolicy;

    let mut obj: NetworkPolicy = match serde_yaml::from_str(&body) {
        Ok(o) => o,
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

    obj.metadata.name = Some(name.clone());
    obj.metadata.namespace = Some(namespace.clone());

    let api: Api<NetworkPolicy> = Api::namespaced(state.kube_client().await, &namespace);
    let patch_value = match serde_json::to_value(&obj) {
        Ok(v) => v,
        Err(err) => {
            error!(
                "Failed converting networkpolicy YAML to JSON {}/{}: {:?}",
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
                "message": "NetworkPolicy updated successfully"
            })),
        )
            .into_response(),
        Err(err) => {
            error!(
                "Error updating networkpolicy YAML {}/{}: {:?}",
                namespace, name, err
            );
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({
                    "success": false,
                    "message": format!("Failed to update networkpolicy: {}", err)
                })),
            )
                .into_response()
        }
    }
}

pub async fn delete_service(
    Path((namespace, name)): Path<(String, String)>,
    State(state): State<AppState>,
) -> impl IntoResponse {
    use k8s_openapi::api::core::v1::Service;

    let api: Api<Service> = Api::namespaced(state.kube_client().await, &namespace);
    match api.delete(&name, &DeleteParams::default()).await {
        Ok(_) => {
            info!("Deleted service {}/{}", namespace, name);
            (StatusCode::OK, Json(serde_json::json!({ "success": true }))).into_response()
        }
        Err(err) => {
            error!("Error deleting service {}/{}: {:?}", namespace, name, err);
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}

pub async fn delete_endpoint(
    Path((namespace, name)): Path<(String, String)>,
    State(state): State<AppState>,
) -> impl IntoResponse {
    use k8s_openapi::api::core::v1::Endpoints;

    let api: Api<Endpoints> = Api::namespaced(state.kube_client().await, &namespace);
    match api.delete(&name, &DeleteParams::default()).await {
        Ok(_) => {
            info!("Deleted endpoint {}/{}", namespace, name);
            (StatusCode::OK, Json(serde_json::json!({ "success": true }))).into_response()
        }
        Err(err) => {
            error!("Error deleting endpoint {}/{}: {:?}", namespace, name, err);
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}

pub async fn delete_ingress(
    Path((namespace, name)): Path<(String, String)>,
    State(state): State<AppState>,
) -> impl IntoResponse {
    use k8s_openapi::api::networking::v1::Ingress;

    let api: Api<Ingress> = Api::namespaced(state.kube_client().await, &namespace);
    match api.delete(&name, &DeleteParams::default()).await {
        Ok(_) => {
            info!("Deleted ingress {}/{}", namespace, name);
            (StatusCode::OK, Json(serde_json::json!({ "success": true }))).into_response()
        }
        Err(err) => {
            error!("Error deleting ingress {}/{}: {:?}", namespace, name, err);
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}

pub async fn delete_ingressclass(
    Path(name): Path<String>,
    State(state): State<AppState>,
) -> impl IntoResponse {
    use k8s_openapi::api::networking::v1::IngressClass;

    let api: Api<IngressClass> = Api::all(state.kube_client().await);
    match api.delete(&name, &DeleteParams::default()).await {
        Ok(_) => {
            info!("Deleted ingressclass {}", name);
            (StatusCode::OK, Json(serde_json::json!({ "success": true }))).into_response()
        }
        Err(err) => {
            error!("Error deleting ingressclass {}: {:?}", name, err);
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}

pub async fn delete_networkpolicy(
    Path((namespace, name)): Path<(String, String)>,
    State(state): State<AppState>,
) -> impl IntoResponse {
    use k8s_openapi::api::networking::v1::NetworkPolicy;

    let api: Api<NetworkPolicy> = Api::namespaced(state.kube_client().await, &namespace);
    match api.delete(&name, &DeleteParams::default()).await {
        Ok(_) => {
            info!("Deleted networkpolicy {}/{}", namespace, name);
            (StatusCode::OK, Json(serde_json::json!({ "success": true }))).into_response()
        }
        Err(err) => {
            error!(
                "Error deleting networkpolicy {}/{}: {:?}",
                namespace, name, err
            );
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}
