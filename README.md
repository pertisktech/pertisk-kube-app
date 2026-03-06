# Pertisk Kubernetes Web Dashboard

A comprehensive, real-time Kubernetes management dashboard built with Rust (Axum) backend and modern React frontend. This project provides a unified interface for monitoring and managing Kubernetes clusters with a focus on performance, security, and user experience.

This project is structured as a **single workspace**:

- `backend` – Rust service (Axum + kube-rs client) exposing a secure Kubernetes management API
- `frontend` – React SPA with real-time updates via WebSocket
- `proto` – gRPC protocol definitions for real-time resource streaming
- `helm` – Kubernetes Helm chart for production deployment

## 🎯 Core Features

### Dashboard Overview
- **Cluster Health Status** - Real-time cluster health indicators
- **Resource Utilization** - CPU, Memory, Storage, and Pod capacity monitoring
- **Node Information** - Detailed node status with allocatable resources, taints, and labels
- **Workload Summary** - Quick overview of all workload types (Deployments, StatefulSets, DaemonSets, Jobs, CronJobs, ReplicaSets)
- **Metrics Charts** - Interactive charts for:
  - Pod status distribution (Running, Pending, Failed, Succeeded, Unknown)
  - Node status (Ready vs NotReady)
  - Pod distribution by namespace (top 10)

### Kubernetes Resources Management

#### Workloads
- **Deployments** - Full CRUD with YAML editor, real-time pod tracking
- **StatefulSets** - Manage stateful applications
- **DaemonSets** - Monitor daemon pods with node selection
- **Jobs** - View and manage batch jobs
- **CronJobs** - Scheduled job management
- **ReplicaSets** - Replica management and pod distribution
- **Pods** - Pod management with execution terminal (exec into containers)

#### Configuration & Secrets
- **ConfigMaps** - Create and manage configuration files
- **Secrets** - Secure secret management
- **Resource Quotas** - Monitor namespace resource limits
- **Limit Ranges** - View and manage resource constraints

#### Networking
- **Services** - Expose and manage services (ClusterIP, NodePort, LoadBalancer)
- **Endpoints** - View service endpoints
- **Ingresses** - Manage ingress routes and rules
- **Ingress Classes** - Configure ingress class definitions
- **Network Policies** - Define network access rules

#### Storage
- **Persistent Volumes (PV)** - Manage cluster-level storage
- **Persistent Volume Claims (PVC)** - Application storage requests
- **Storage Classes** - Configure storage provisioning
- **Storage Resources** - Overview and management interface

#### Access Control (RBAC)
- **Service Accounts** - User and service identity management
- **Roles** - Namespace-scoped permissions
- **Role Bindings** - Bind roles to users/groups
- **Cluster Roles** - Cluster-wide permissions
- **Cluster Role Bindings** - Bind cluster roles to users/groups
- **Access Control Pages** - Unified RBAC management interface

#### Advanced Features
- **Horizontal Pod Autoscaling (HPA)** - Auto-scaling configurations
- **Pod Disruption Budgets (PDB)** - Availability guarantees
- **Priority Classes** - Pod scheduling priorities
- **Runtime Classes** - Container runtime selection
- **Leases** - Distributed coordination leases
- **Helm Resources** - View and manage Helm releases

### Real-Time Features
- **WebSocket-based Updates** - Live resource streaming via gRPC
- **Pod Logs** - Real-time pod log streaming
- **Pod Execution Terminal** - Interactive shell access to containers
- **Auto-Refresh Metrics** - Automatic dashboard updates every 30 seconds

### Security & Authentication
- **Basic Authentication** - Secure login system (HTTP Basic Auth)
- **RBAC Integration** - Respects Kubernetes RBAC policies
- **Kubernetes-aware Permissions** - Uses service account credentials
- **Secure YAML Editing** - Safe resource modification with validation

### User Interface
- **Omni-inspired Dark Theme** - Modern, eye-friendly color scheme
- **Responsive Design** - Works on desktop, tablet, and mobile
- **Real-time Theme Support** - Automatic light/dark mode detection
- **Data Tables** - Sortable, filterable resource lists
- **Detail Panels** - Comprehensive resource information in sidebars
- **Dashboard Metrics** - Visual gauges and charts for utilization

## 📋 Build & Development

### Prerequisites
- Rust 1.70+ (for backend)
- Node.js 18+ (for frontend)
- Docker (optional, for deployment)
- Kubernetes cluster (1.20+)

### Build / Run (workspace root)

```bash
# build Rust backend
cargo build -p pertisk-kube-backend

# run backend
cargo run -p pertisk-kube-backend
```

### Single-port Application (Backend + Frontend)

```bash
make run-monolith
```

Builds the React frontend and serves it from the Rust backend on a single port (default: http://localhost:8091).

### Hot Reload Development

```bash
make dev
```

- Backend hot reload uses `cargo watch` (auto-installed via `make tools`)
- Frontend hot reload uses Vite dev server on `http://localhost:3000`

## 🚀 Deployment

### Kubernetes Deployment via Helm

```bash
helm install pertisk-kube ./helm/pertisk-kube \
  -n pertisk-system \
  --create-namespace \
  -f ./helm/pertisk-kube/values.yaml
```

### Docker Deployment

```bash
# Build images
docker build -t pertisk-kube-backend:latest ./backend -f ./backend/Dockerfile
docker build -t pertisk-kube-frontend:latest ./frontend -f ./frontend/Dockerfile

# Run with docker-compose
docker-compose up -d
```

## 🔧 API Endpoints

### Public Endpoints
- `GET /api/health` - Health check
- `GET /api/readiness` - Readiness check
- `POST /api/login` - Authentication

### Protected Endpoints (Require Basic Auth)

#### Cluster
- `GET /api/dashboard` - Dashboard summary

#### Compute Resources
- `GET /api/nodes` - List nodes
- `GET /api/namespaces` - List namespaces
- `GET /api/pods` - List pods
- `PUT /api/pods/:namespace/:name/yaml` - Update pod YAML

#### Workloads
- `GET /api/deployments` - List deployments
- `GET /api/statefulsets` - List statefulsets
- `GET /api/daemonsets` - List daemonsets
- `GET /api/replicasets` - List replicasets
- `GET /api/jobs` - List jobs
- `GET /api/cronjobs` - List cronjobs

#### Configuration
- `GET /api/configmaps` - List configmaps
- `GET /api/secrets` - List secrets
- `GET /api/resourcequotas` - List resource quotas
- `GET /api/limitranges` - List limit ranges

#### Networking
- `GET /api/services` - List services
- `GET /api/endpoints` - List endpoints
- `GET /api/ingresses` - List ingresses
- `GET /api/ingressclasses` - List ingress classes
- `GET /api/networkpolicies` - List network policies

#### Storage
- `GET /api/persistentvolumes` - List persistent volumes
- `GET /api/persistentvolumeclaims` - List persistent volume claims
- `GET /api/storageclasses` - List storage classes

#### Access Control
- `GET /api/serviceaccounts` - List service accounts
- `GET /api/roles` - List roles
- `GET /api/rolebindings` - List role bindings
- `GET /api/clusterroles` - List cluster roles
- `GET /api/clusterrolebindings` - List cluster role bindings

#### Advanced
- `GET /api/events` - List events
- `GET /api/hpa` - List horizontal pod autoscalers
- `GET /api/pdb` - List pod disruption budgets
- `GET /api/priorityclasses` - List priority classes
- `GET /api/runtimeclasses` - List runtime classes
- `GET /api/leases` - List leases

### WebSocket Endpoints
- `WS /ws` - Real-time resource streaming (gRPC-Web)
- `WS /api/exec` - Pod execution terminal

## 📊 Technology Stack

### Backend
- **Rust 1.70+** - Systems programming language
- **Axum** - Ergonomic and modular web framework
- **kube-rs** - Kubernetes client library
- **Tokio** - Async runtime
- **Tonic** - gRPC framework
- **Serde** - Serialization/deserialization

### Frontend
- **React 18** - UI library
- **TypeScript** - Type-safe JavaScript
- **Vite** - Fast build tool
- **TanStack Query** - Data fetching and caching
- **Tailwind CSS** - Utility-first CSS framework
- **Recharts** - React charting library
- **Chart.js** - Data visualization
- **Lucide React** - Icon library

### Deployment
- **Docker** - Container images
- **Helm** - Kubernetes package manager
- **Kubernetes** - Container orchestration

## 📝 Configuration

### Environment Variables (Backend)
- `KUBECONFIG` - Path to kubeconfig file (optional, uses in-cluster config if not set)
- `PORT` - Server port (default: 8091)
- `RUST_LOG` - Log level (default: info)

### Helm Values
- `image.tag` - Container image tag
- `replicaCount` - Number of dashboard replicas
- `resources.limits` - Resource limits
- `resources.requests` - Resource requests
- `rbac.rules` - Custom RBAC rules

## 🔐 Security

- **HTTPS Ready** - Deploy behind reverse proxy for TLS
- **Basic Auth** - Simple authentication system
- **RBAC Compliant** - Respects Kubernetes RBAC
- **Service Account** - Uses Kubernetes service accounts for API access
- **Read-Heavy** - Mostly read-only operations (safe for monitoring)

## 📝 License

See LICENSE file for details.
 
