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
- **Deployments** - Full CRUD with YAML editor, real-time pod tracking, **dynamic scaling (adjust replica count)**
- **StatefulSets** - Manage stateful applications with YAML editor
- **DaemonSets** - Monitor daemon pods with node selection and YAML editor
- **Jobs** - View and manage batch jobs with YAML editor
- **CronJobs** - Scheduled job management with YAML editor
- **ReplicaSets** - Replica management and pod distribution with YAML editor
- **Pods** - Pod management with YAML editor and execution terminal (exec into containers)

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
- **JWT Token Authentication** - Secure login system with JWT tokens (1-hour expiration)
- **Automatic Token Refresh** - Expired tokens trigger re-login automatically
- **Bearer Token Support** - API endpoints accept Bearer tokens in Authorization header
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
- `POST /api/login` - Authentication (returns JWT token with 1-hour expiration)

### Protected Endpoints (Require JWT Bearer Token or Basic Auth)

#### Cluster
- `GET /api/dashboard` - Dashboard summary

#### Compute Resources
- `GET /api/nodes` - List nodes
- `GET /api/namespaces` - List namespaces
- `GET /api/pods` - List pods
- `PUT /api/pods/:namespace/:name/yaml` - Update pod YAML

#### Workloads
- `GET /api/deployments` - List deployments
- `POST /api/deployments/:namespace/:name/scale` - Scale deployment replicas
- `GET /api/deployments/:namespace/:name/yaml` - Get deployment YAML
- `PUT /api/deployments/:namespace/:name/yaml` - Update deployment YAML
- `GET /api/statefulsets` - List statefulsets
- `GET /api/statefulsets/:namespace/:name/yaml` - Get statefulset YAML
- `PUT /api/statefulsets/:namespace/:name/yaml` - Update statefulset YAML
- `GET /api/daemonsets` - List daemonsets
- `GET /api/daemonsets/:namespace/:name/yaml` - Get daemonset YAML
- `PUT /api/daemonsets/:namespace/:name/yaml` - Update daemonset YAML
- `GET /api/replicasets` - List replicasets
- `GET /api/replicasets/:namespace/:name/yaml` - Get replicaset YAML
- `PUT /api/replicasets/:namespace/:name/yaml` - Update replicaset YAML
- `GET /api/jobs` - List jobs
- `GET /api/jobs/:namespace/:name/yaml` - Get job YAML
- `PUT /api/jobs/:namespace/:name/yaml` - Update job YAML
- `GET /api/cronjobs` - List cronjobs
- `GET /api/cronjobs/:namespace/:name/yaml` - Get cronjob YAML
- `PUT /api/cronjobs/:namespace/:name/yaml` - Update cronjob YAML

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
- `USERNAME` - Dashboard login username (default: admin)
- `PASSWORD` - Dashboard login password (default: admin)
- `JWT_SECRET` - Secret key for JWT token signing (default: your-secret-key-change-in-production) ⚠️ **Change in production!**

### Token Expiration
- **JWT Tokens expire after 1 hour** from login
- Expired tokens automatically redirect to login page
- Re-login required after expiration

### Helm Values
- `image.tag` - Container image tag
- `replicaCount` - Number of dashboard replicas
- `resources.limits` - Resource limits
- `resources.requests` - Resource requests
- `rbac.rules` - Custom RBAC rules

## 🔐 Security

- **HTTPS Ready** - Deploy behind reverse proxy for TLS
- **JWT Authentication** - Secure login with JWT tokens (1-hour expiration)
- **Bearer Token Support** - Token-based API authentication
- **Automatic Session Expiry** - Expired tokens redirect to login
- **RBAC Compliant** - Respects Kubernetes RBAC
- **Service Account** - Uses Kubernetes service accounts for API access
- **Read-Heavy** - Mostly read-only operations (safe for monitoring)

## 💡 Usage Examples

### Scaling a Deployment

1. Navigate to **Deployments** page
2. Click on a deployment to open the detail panel
3. Scroll to "Scale Deployment" section
4. Enter the desired number of replicas (0-N)
5. Click "Scale" button
6. Deployment will scale to the specified number of pods

**API Call:**
```bash
curl -X POST http://localhost:8091/api/deployments/default/my-app/scale \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"replicas": 2}'
```

### Authentication & Token Management

**Login and Get Token:**
```bash
curl -X POST http://localhost:8091/api/login \
  -H "Content-Type: application/json" \
  -d '{"username": "admin", "password": "admin"}'
```

**Response:**
```json
{
  "success": true,
  "token": "eyJ0eXAiOiJKV1QiLCJhbGc..."
}
```

**Use Token in API Calls:**
```bash
curl http://localhost:8091/api/deployments \
  -H "Authorization: Bearer eyJ0eXAiOiJKV1QiLCJhbGc..."
```

**Token Expiration:**
- Tokens expire after **1 hour** from login
- Frontend automatically detects expiry and redirects to login
- Return to login page to get a new token

## 📝 License

See LICENSE file for details.
 
