 # Pertisk Kubernetes Web Dashboard
 
 This project is structured as a **single workspace**, similar in spirit to `pertisk-rproxy`:
 
 - `backend` – Rust service (Axum + kube client) exposing a Kubernetes management API.
 - `frontend` – React Admin SPA that talks to the backend API.
 - `k8s` – Kubernetes manifests (namespace, RBAC, Deployments, Services, Ingress).
 
 ## Build / run (workspace root)
 
 ```bash
 # build Rust backend from the workspace root
 cargo build -p pertisk-kube-backend
 
 # run backend
 cargo run -p pertisk-kube-backend
 ```
 
## Single-port app (backend + frontend together)

```bash
make run-monolith
```

This builds the React Admin frontend and serves it from the Rust backend on a single port (default: http://localhost:8091).

## Hot reload (backend + frontend)

```bash
make dev
```

- Backend hot reload uses `cargo watch` (auto-installed via `make tools`).
- Frontend hot reload uses Vite dev server on `http://localhost:3000`.

 Frontend and deployment usage are described inline in the manifests and Dockerfiles.
 
