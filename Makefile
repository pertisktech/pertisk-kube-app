SHELL := /bin/sh

K3S_KUBECONFIG ?= /Users/dotnetnat/.kube/talos-omni-hz-cluister-kubeconfig.yaml
DOCKER_REGISTRY ?= your-registry
IMAGE_TAG ?= latest
HELM_RELEASE ?= pertisk-kube
HELM_NAMESPACE ?= pertisk-kube

.PHONY: dev dev-backend dev-frontend frontend-install frontend-build tools fmt build-backend run-monolith run-ingress-k3s
.PHONY: docker-build docker-build-backend docker-build-frontend docker-push helm-install helm-upgrade helm-uninstall helm-template

dev:
	$(MAKE) -j2 dev-backend dev-frontend

tools:
	@command -v cargo-watch >/dev/null 2>&1 || cargo install cargo-watch

dev-backend:
	@command -v cargo-watch >/dev/null 2>&1 && cargo watch -x "run -p pertisk-kube-backend" || cargo run -p pertisk-kube-backend

frontend-install:
	cd frontend && npm install

dev-frontend:
	cd frontend && npm install && npm run dev

frontend-build:
	cd frontend && npm install && npm run build

fmt:
	cargo fmt

build-backend:
	cargo build -p pertisk-kube-backend

# Build frontend and run backend serving the built SPA on a single port.
run-monolith: frontend-build
	STATIC_DIR=frontend/dist cargo run -p pertisk-kube-backend

# Simulate running as an ingress-style controller talking to k3s/k8s via kubeconfig.
run-ingress-k3s: tools frontend-build
	@if [ -f "$(K3S_KUBECONFIG)" ]; then \
		echo "Using local k3s kubeconfig: $(K3S_KUBECONFIG)"; \
		KUBECONFIG="$(K3S_KUBECONFIG)" \
		STATIC_DIR=frontend/dist \
		cargo watch -x 'run -p pertisk-kube-backend'; \
	else \
		echo "k3s kubeconfig not found at $(K3S_KUBECONFIG); using current kubeconfig context instead."; \
		STATIC_DIR=frontend/dist \
		cargo watch -x 'run -p pertisk-kube-backend'; \
	fi

# Docker targets
docker-build:
	docker build -f Dockerfile -t $(DOCKER_REGISTRY)/pertisk-kube:$(IMAGE_TAG) .

docker-push:
	docker push $(DOCKER_REGISTRY)/pertisk-kube:$(IMAGE_TAG)

# Legacy separate build targets (for backward compatibility)
docker-build-backend: frontend-build
	docker build -f backend/Dockerfile -t $(DOCKER_REGISTRY)/pertisk-kube-backend:$(IMAGE_TAG) .

docker-build-frontend:
	docker build -f frontend/Dockerfile -t $(DOCKER_REGISTRY)/pertisk-kube-frontend:$(IMAGE_TAG) .

# Helm targets
helm-template:
	helm template $(HELM_RELEASE) ./helm/pertisk-kube

helm-install:
	helm install $(HELM_RELEASE) ./helm/pertisk-kube -n $(HELM_NAMESPACE) --create-namespace

helm-upgrade:
	helm upgrade $(HELM_RELEASE) ./helm/pertisk-kube -n $(HELM_NAMESPACE)

helm-uninstall:
	helm uninstall $(HELM_RELEASE) -n $(HELM_NAMESPACE)

