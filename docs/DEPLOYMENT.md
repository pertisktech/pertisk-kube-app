# Deployment Guide

This guide explains how to deploy the Pertisk Kubernetes Web Application using a unified Docker image and Helm.

## Prerequisites

- Docker installed and configured
- Kubernetes cluster (v1.19+)
- Helm 3.0+
- kubectl configured to access your cluster
- A container registry (Docker Hub, GCR, ECR, etc.)

## Architecture

The application uses a **unified deployment architecture** where both frontend and backend are built into a single Docker image. The Rust backend serves both the API endpoints and the static frontend files, simplifying deployment and reducing complexity.

## Quick Start

### Step 1: Build Docker Image

The unified Dockerfile builds both frontend and backend in a single image:

```bash
# Set your Docker registry
export DOCKER_REGISTRY=your-registry
export IMAGE_TAG=v1.0.0

# Build unified image using Make (recommended)
make docker-build DOCKER_REGISTRY=$DOCKER_REGISTRY IMAGE_TAG=$IMAGE_TAG

# Or build manually:
docker build -f Dockerfile -t $DOCKER_REGISTRY/pertisk-kube:$IMAGE_TAG .
```

### Step 2: Push Image to Registry

```bash
# Using Make
make docker-push DOCKER_REGISTRY=$DOCKER_REGISTRY IMAGE_TAG=$IMAGE_TAG

# Or manually:
docker push $DOCKER_REGISTRY/pertisk-kube:$IMAGE_TAG
```

### Step 3: Configure Helm Values

Edit `helm/pertisk-kube/values.yaml` or create a custom values file:

```yaml
app:
  image:
    repository: your-registry/pertisk-kube
    tag: v1.0.0

ingress:
  hosts:
    - host: pertisk-kube.yourdomain.com
```

### Step 4: Deploy with Helm

```bash
# Preview what will be deployed
helm template pertisk-kube ./helm/pertisk-kube

# Install the chart
helm install pertisk-kube ./helm/pertisk-kube -n pertisk-kube --create-namespace

# Or use Make
make helm-install HELM_RELEASE=pertisk-kube HELM_NAMESPACE=pertisk-kube
```

## Deployment Options

### Development Deployment

For development, use the default values:
```bash
helm install pertisk-kube-dev ./helm/pertisk-kube \
  --set app.image.tag=latest \
  --set ingress.enabled=false
```

### Production Deployment

For production, use the production values file:
```bash
helm install pertisk-kube ./helm/pertisk-kube \
  -f helm/pertisk-kube/values-prod.yaml \
  --set app.image.tag=v1.0.0 \
  --set ingress.hosts[0].host=pertisk-kube.yourdomain.com
```

## Docker Build Details

### Unified Dockerfile

The unified Dockerfile uses a multi-stage build process:

1. **Stage 1 - Frontend Builder**: Builds the React/TypeScript frontend with Vite
2. **Stage 2 - Backend Builder**: Builds the Rust backend and includes frontend assets
3. **Stage 3 - Runtime**: Uses distroless image for security, runs as non-root user

Benefits:
- ✅ Simplified deployment (single container)
- ✅ Smaller image size through multi-stage build
- ✅ Better caching of dependencies
- ✅ No need for separate frontend server
- ✅ Reduced network complexity

## Accessing the Application

### Via Ingress (Production)

If ingress is enabled, access at your configured domain:
```
https://pertisk-kube.yourdomain.com
```

### Via Port Forward (Development)

```bash
# Forward the unified service
kubectl port-forward -n pertisk-kube svc/pertisk-kube 8080:8091

# Access at http://localhost:8080
```

The backend serves:
- Static frontend files at `/` (root)
- API endpoints at `/api/*`
- Health check at `/api/health`

## Upgrading

```bash
# Update the deployment
helm upgrade pertisk-kube ./helm/pertisk-kube -n pertisk-kube

# Or with Make
make helm-upgrade HELM_RELEASE=pertisk-kube HELM_NAMESPACE=pertisk-kube

# Update with new image version
helm upgrade pertisk-kube ./helm/pertisk-kube -n pertisk-kube \
  --set app.image.tag=v1.1.0
```

## Uninstalling

```bash
# Uninstall the release
helm uninstall pertisk-kube -n pertisk-kube

# Or with Make
make helm-uninstall HELM_RELEASE=pertisk-kube HELM_NAMESPACE=pertisk-kube

# Delete the namespace (optional)
kubectl delete namespace pertisk-kube
```

## Troubleshooting

### Check Pod Status
```bash
kubectl get pods -n pertisk-kube
kubectl describe pod <pod-name> -n pertisk-kube
```

### View Logs
```bash
# Application logs
kubectl logs -n pertisk-kube -l app=pertisk-kube -f

# Check specific pod
kubectl logs -n pertisk-kube <pod-name> -f
```

### Check Service Endpoints
```bash
kubectl get svc -n pertisk-kube
kubectl get endpoints -n pertisk-kube
```

### Check RBAC Permissions
```bash
kubectl get serviceaccount -n pertisk-kube
kubectl get clusterrole pertisk-kube-sa
kubectl get clusterrolebinding pertisk-kube-sa
```

### Common Issues

1. **ImagePullBackOff**: Check that your image is pushed to the registry and accessible from the cluster.

2. **CrashLoopBackOff**: Check logs for application errors. Ensure the backend can connect to the Kubernetes API.

3. **Service Not Accessible**: Check that service is running and endpoints are available.

4. **Frontend Not Loading**: Verify that STATIC_DIR environment variable is set correctly and frontend files are included in the image.

## Makefile Commands

Available make commands:

```bash
# Development
make dev                  # Run both backend and frontend in dev mode
make dev-backend         # Run backend in watch mode
make dev-frontend        # Run frontend dev server
make run-monolith        # Build frontend and run as single backend process

# Docker
make docker-build        # Build unified Docker image
make docker-push         # Push image to registry

# Helm
make helm-template       # Preview Kubernetes manifests
make helm-install        # Install Helm chart
make helm-upgrade        # Upgrade existing release
make helm-uninstall      # Uninstall release
```

## Environment Variables

You can customize the deployment by setting these environment variables:

```bash
export DOCKER_REGISTRY=your-registry  # Your container registry
export IMAGE_TAG=v1.0.0              # Image tag to use
export HELM_RELEASE=pertisk-kube     # Helm release name
export HELM_NAMESPACE=pertisk-kube   # Kubernetes namespace
```

## Legacy Separate Builds

If you need to build separate backend and frontend images (not recommended), the old Dockerfiles are still available:
- `backend/Dockerfile` - Backend only
- `frontend/Dockerfile` - Frontend only

However, the unified approach is recommended for simplicity and better resource utilization.

## Next Steps

1. Configure ingress with your domain and TLS certificates
2. Set up monitoring and logging
3. Configure resource limits based on your cluster capacity
4. Set up CI/CD pipeline for automated builds and deployments
5. Consider using Horizontal Pod Autoscaler (HPA) for automatic scaling
