SHELL := /bin/sh

K3S_KUBECONFIG ?= /Users/nat/.kube/talos-omni-hz-cluister-kubeconfig.yaml
VERSION ?= $(shell git describe --tags --always 2>/dev/null | sed 's/^v//' || echo "0.0.1")
DOCKER_REGISTRY ?= harbor.tools.thaidevops.co
DOCKER_IMAGE ?= $(DOCKER_REGISTRY)/pertisksoft/pertisk-kube/web
DOCKER_TAG ?= $(VERSION)
HELM_RELEASE ?= pertisk-kube
HELM_NAMESPACE ?= pertisk-rproxy

.PHONY: dev dev-backend dev-frontend frontend-install frontend-build frontend-build-watch tools fmt build-backend run-monolith run-ingress-k3s
.PHONY: docker-build docker-build-amd64 docker-build-arm64 docker-build-multi docker-push docker-push-multi
.PHONY: helm-install helm-upgrade helm-uninstall helm-template helm-deploy
.PHONY: release version

# Development targets
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

frontend-build-watch:
	cd frontend && npm install && npm run build -- --watch

fmt:
	cargo fmt

build-backend:
	cargo build -p pertisk-kube-backend

# Build frontend and run backend serving the built SPA on a single port.
run-monolith: frontend-build
	STATIC_DIR=frontend/dist cargo run -p pertisk-kube-backend

# Simulate running as an ingress-style controller talking to k3s/k8s via kubeconfig.
run-ingress-k3s: tools frontend-build
	@echo "Starting frontend build watcher (npm install && npm run build -- --watch)..."
	@$(MAKE) frontend-build-watch & FRONTEND_WATCH_PID=$$!; \
	trap 'kill $$FRONTEND_WATCH_PID 2>/dev/null || true' INT TERM EXIT; \
	if [ -f "$(K3S_KUBECONFIG)" ]; then \
		echo "Using local k3s kubeconfig: $(K3S_KUBECONFIG)"; \
		KUBECONFIG="$(K3S_KUBECONFIG)" \
		STATIC_DIR=frontend/dist \
		cargo watch -x 'run -p pertisk-kube-backend'; \
	else \
		echo "k3s kubeconfig not found at $(K3S_KUBECONFIG); using current kubeconfig context instead."; \
		STATIC_DIR=frontend/dist \
		cargo watch -x 'run -p pertisk-kube-backend'; \
	fi

# Docker targets - multi-architecture support
# Usage examples:
#   make docker-build                 — build for current platform (quick local test)
#   make docker-build-amd64           — build linux/amd64 image
#   make docker-build-arm64           — build linux/arm64 image
#   make docker-build-multi           — build and push multi-arch (amd64 + arm64)
#   make docker-build-multi VERSION=v1.0.0  — build with specific version
#   make docker-push                  — push single-platform image
#   make release                      — build multi-arch and deploy to k8s

docker-build:
	docker build -f Dockerfile -t $(DOCKER_IMAGE):$(DOCKER_TAG) .
	@echo "Built: $(DOCKER_IMAGE):$(DOCKER_TAG)"

docker-build-amd64:
	docker buildx build --platform linux/amd64 -f Dockerfile --load -t $(DOCKER_IMAGE):$(DOCKER_TAG)-amd64 -t $(DOCKER_IMAGE):amd64 .
	@echo "Built: $(DOCKER_IMAGE):$(DOCKER_TAG)-amd64"

docker-build-arm64:
	docker buildx build --platform linux/arm64 -f Dockerfile --load -t $(DOCKER_IMAGE):$(DOCKER_TAG)-arm64 -t $(DOCKER_IMAGE):arm64 .
	@echo "Built: $(DOCKER_IMAGE):$(DOCKER_TAG)-arm64"

docker-build-multi:
	@echo "Building multi-arch image: $(DOCKER_IMAGE):$(DOCKER_TAG)"
	@if docker buildx inspect default > /dev/null 2>&1; then \
		echo "Using buildx for multi-platform build..."; \
		docker buildx build --platform linux/amd64,linux/arm64 -f Dockerfile --push \
			-t $(DOCKER_IMAGE):$(DOCKER_TAG) \
			-t $(DOCKER_IMAGE):latest .; \
		echo "✓ Built and pushed multi-arch: $(DOCKER_IMAGE):$(DOCKER_TAG)"; \
	else \
		echo "WARNING: docker buildx not available. Falling back to single-platform build."; \
		echo "To enable multi-platform builds, run:"; \
		echo "  docker buildx create --use"; \
		echo ""; \
		docker build -f Dockerfile --push \
			-t $(DOCKER_IMAGE):$(DOCKER_TAG) \
			-t $(DOCKER_IMAGE):latest .; \
		echo "✓ Built and pushed (single-arch): $(DOCKER_IMAGE):$(DOCKER_TAG)"; \
	fi

docker-push:
	docker push $(DOCKER_IMAGE):$(DOCKER_TAG)
	@echo "Pushed: $(DOCKER_IMAGE):$(DOCKER_TAG)"

docker-push-multi: docker-build-multi
	@echo "✓ Multi-arch image pushed: $(DOCKER_IMAGE):$(DOCKER_TAG)"

# Helm targets
helm-template:
	helm template $(HELM_RELEASE) ./helm/pertisk-kube -n $(HELM_NAMESPACE)

helm-install:
	helm install $(HELM_RELEASE) ./helm/pertisk-kube -n $(HELM_NAMESPACE) --create-namespace \
		--set app.image.tag=$(DOCKER_TAG)
	@echo "✓ Installed $(HELM_RELEASE) with version $(DOCKER_TAG)"

helm-upgrade:
	helm upgrade $(HELM_RELEASE) ./helm/pertisk-kube -n $(HELM_NAMESPACE) \
		--set app.image.tag=$(DOCKER_TAG)
	@echo "✓ Upgraded $(HELM_RELEASE) to version $(DOCKER_TAG)"

helm-uninstall:
	helm uninstall $(HELM_RELEASE) -n $(HELM_NAMESPACE)
	@echo "✓ Uninstalled $(HELM_RELEASE)"

# Build, push multi-arch Docker image and deploy with Helm
helm-deploy: docker-build-multi
	@echo "Deploying pertisk-kube with image tag $(DOCKER_TAG)..."
	helm upgrade --install $(HELM_RELEASE) ./helm/pertisk-kube -n $(HELM_NAMESPACE) \
		--create-namespace \
		--set app.image.tag=$(DOCKER_TAG)
	@echo "✓ Deployed pertisk-kube version $(DOCKER_TAG)"

# Complete release: build multi-arch and deploy
release: docker-build-multi helm-deploy
	@echo "✓ Released version $(VERSION)"

# Show current version from git
version:
	@echo "$(VERSION)"

# Setup buildx for multi-platform builds (required for docker-build-multi on macOS/OrbStack)
buildx-setup:
	@echo "Setting up Docker buildx for multi-platform builds..."
	@if docker buildx inspect multiarch > /dev/null 2>&1; then \
		echo "✓ multiarch builder already exists"; \
		docker buildx use multiarch; \
	else \
		echo "Creating multiarch builder..."; \
		docker buildx create --name multiarch --use; \
		docker buildx inspect multiarch --bootstrap; \
	fi
	@echo "✓ Buildx ready for multi-platform builds"

