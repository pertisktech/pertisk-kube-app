# Realtime Support Audit: WebSocket & gRPC

Which resources and panels use **realtime** (WebSocket or gRPC).

## Summary

| Layer        | WebSocket (used by UI) |
|-------------|-------------------------|
| **Backend** | All standard K8s resource types + **custom resources** (subscribe with `customresources/<crd_name>`) |
| **Frontend**| **All resource pages** use realtime hooks; list and panel data update live over WebSocket |

The UI uses **WebSocket** (`/ws`) only. gRPC is implemented on the backend but the frontend does not use it for resource lists.

---

## Backend: WebSocket (`/ws`)

**File:** `backend/src/ws_handler.rs`

- **Supported resource types** (subscribe with `type: 'subscribe', resource: '<name>'`):
  - **Workloads:** `pods` (custom logic + initial list), `namespaces`, `deployments`, `statefulsets`, `daemonsets`, `replicasets`, `jobs`, `cronjobs`, `events`, `nodes`, `services`
  - **Config:** `configmaps`, `secrets`, `resourcequotas`, `limitranges`, `hpa`, `pdb`
  - **Network:** `ingresses`, `ingressclasses`, `endpoints`, `networkpolicies`
  - **Storage:** `persistentvolumes`, `persistentvolumeclaims`, `storageclasses`
  - **RBAC:** `serviceaccounts`, `clusterroles`, `clusterrolebindings`, `roles`, `rolebindings`
  - **Other:** `priorityclasses`, `runtimeclasses`, `leases`
  - **CRDs (sidebar / level 3):** `crds` — list of CustomResourceDefinitions for the menu
  - **Custom resources:** `customresources/<crd_name>` (e.g. `customresources/crontabs.stable.example.com`)

- **Protocol:** JSON. Messages: `subscribe` / `unsubscribe` / `ping`; server sends `resource_update` (action: ADDED/MODIFIED/DELETED), `subscribed`, `error`, `pong`.

---

## Backend: gRPC (port 50051)

**File:** `backend/src/grpc_service.rs`

- **Supported resource types** (for watch and list): Pods, Deployments, **Services**, **Nodes**, Events, StatefulSets, DaemonSets, Jobs, CronJobs, ReplicaSets, Namespaces.
- **Usage:** Optional; browser could use grpc-web. Currently the app uses WebSocket for realtime.

---

## Frontend: Pages and Realtime

All resource list pages use a **realtime hook**; list and (where applicable) panel data update live over WebSocket.

| Page / Panel           | Realtime hook / source        |
|------------------------|-------------------------------|
| **PodsPage**           | `useRealtimePods` + `useRealtimeEvents` |
| **NamespacesPage**     | `useRealtimeNamespaces`       |
| **Layout (sidebar)**   | `useRealtimeNamespaces`       |
| **DeploymentsPage**    | `useRealtimeDeployments`     |
| **StatefulSetsPage**   | `useRealtimeStatefulSets`    |
| **DaemonSetsPage**     | `useRealtimeDaemonSets`      |
| **ReplicaSetsPage**    | `useRealtimeReplicaSets`     |
| **JobsPage**           | `useRealtimeJobs`            |
| **CronJobsPage**       | `useRealtimeCronJobs`        |
| **EventsPage**         | `useRealtimeEvents`          |
| **NodesPage**          | `useRealtimeNodes`           |
| **ServicesPage**       | `useRealtimeServices`        |
| **ConfigMapsPage**     | `useRealtimeConfigMaps`      |
| **SecretsPage**        | `useRealtimeSecrets`         |
| **ResourceQuotasPage** | `useRealtimeResourceQuotas`  |
| **LimitRangesPage**    | `useRealtimeLimitRanges`     |
| **HPAPage**            | `useRealtimeHPA`             |
| **PDBPage**            | `useRealtimePDB`             |
| **IngressesPage**      | `useRealtimeIngresses`       |
| **IngressClassesPage** | `useRealtimeIngressClasses`  |
| **EndpointsPage**      | `useRealtimeEndpoints`       |
| **NetworkPoliciesPage**| `useRealtimeNetworkPolicies` |
| **PersistentVolumesPage** | `useRealtimePersistentVolumes` |
| **PersistentVolumeClaimsPage** | `useRealtimePersistentVolumeClaims` |
| **StorageClassesPage** | `useRealtimeStorageClasses`  |
| **ServiceAccountsPage**| `useRealtimeServiceAccounts` |
| **ClusterRolesPage**   | `useRealtimeClusterRoles`    |
| **ClusterRoleBindingsPage** | `useRealtimeClusterRoleBindings` |
| **RolesPage**          | `useRealtimeRoles`           |
| **RoleBindingsPage**   | `useRealtimeRoleBindings`    |
| **PriorityClassesPage**| `useRealtimePriorityClasses` |
| **RuntimeClassesPage** | `useRealtimeRuntimeClasses`  |
| **LeasesPage**         | `useRealtimeLeases`          |
| **Sidebar Custom Resources menu** | `useRealtimeCrds()` (level 3 CRD links update live) |
| **CustomResourcesPage**| `useRealtimeCrds()` + `useRealtimeCustomResources(crdName)` (CRD list + instances) |
| **Terminal (exec)**    | WebSocket (`/api/exec`)      |
| **Bottom panel (logs)**| REST fetch (manual refresh)  |

---

## Panel info and realtime

- **Pod detail panel:** Uses data from parent (PodsPage). When the list is realtime (`useRealtimePods`), the selected pod can be updated from the same state; panel does not have its own WebSocket.
- **Node detail panel:** Uses node list + events. With `useRealtimeNodes` and `useRealtimeEvents`, node list and events update live.
- **Service detail panel:** With `useRealtimeServices`, service list updates live; selected service stays in sync.
- **Logs (bottom panel):** Fetched via REST; no WebSocket stream for logs in this audit (exec terminal is separate and uses WebSocket).

---

## Notes

1. **Nodes:** Realtime node list does not include metrics (CPU/memory usage). Those come from the metrics server and are filled by the REST handler. Realtime node list can show basic node fields; metrics can stay from a separate poll or be left as “-”.
2. **Pods:** Uses a dedicated `useRealtimePods` (with optional REST sync for details/metrics), not the generic `useRealtimeResources`.
3. **Single WebSocket:** Each tab/hook that uses `useRealtime*` opens its own WebSocket to `/ws` and subscribes to one or more resources. Backend supports multiple subscriptions per connection.
