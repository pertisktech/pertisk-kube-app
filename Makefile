SHELL := /bin/sh

K8S_KUBECONFIG ?=
#K8S_KUBECONFIG ?= /Users/dotnetnat/.kube/talos-omni-proxmox-cluster-kubeconfig.yaml
VERSION ?= $(shell V=$$(git describe --tags --always --abbrev=7 2>/dev/null || echo ""); \
	if echo "$$V" | grep -qE '^v?[0-9]+\.'; then \
		echo "$$V" | sed 's/^v//; s/-/./g'; \
	else \
		echo "1.0.0-dev"; \
	fi)
APP_PORT ?= 15222
GRPC_PORT ?= 50051
WEBTRANSPORT_ENABLED ?= true
WEBTRANSPORT_PATH ?= /wt
VITE_REALTIME_TRANSPORT ?= webtransport

.PHONY: dev dev-backend dev-frontend frontend-install frontend-build frontend-build-watch tools fmt build-backend run run-desktop run-desktop-dev run-desktop-webtransport run-desktop-no-webtransport build-desktop build-macos-dmg run-monolith run-ingress-k8s
.PHONY: version

KUBE_ENV = $(if $(strip $(K8S_KUBECONFIG)),KUBECONFIG="$(K8S_KUBECONFIG)",)
WEBTRANSPORT_ENV = $(if $(strip $(WEBTRANSPORT_ENABLED)),WEBTRANSPORT_ENABLED="$(WEBTRANSPORT_ENABLED)",) $(if $(strip $(WEBTRANSPORT_PATH)),WEBTRANSPORT_PATH="$(WEBTRANSPORT_PATH)",)

# Development targets
dev:
	$(MAKE) -j2 dev-backend dev-frontend

tools:
	@command -v cargo-watch >/dev/null 2>&1 || cargo install cargo-watch

dev-backend:
	@command -v cargo-watch >/dev/null 2>&1 && $(KUBE_ENV) cargo watch -x "run -p pertisk-kube-backend" || $(KUBE_ENV) cargo run -p pertisk-kube-backend

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

# Desktop run target (Tauri + backend sidecar)
run: run-desktop

build-desktop: build-backend
	cd frontend && npm install && npm run tauri:build

build-macos-dmg: build-backend frontend-install
	@if [ "$$(uname -s)" != "Darwin" ]; then \
		echo "build-macos-dmg is only supported on macOS"; \
		exit 1; \
	fi
	cd frontend && npm run tauri:build -- --bundles dmg

run-desktop: frontend-install build-backend
	@pkill -f "ptkublet-desktop" 2>/dev/null || true
	@pkill -f "pertisk-kube-backend" 2>/dev/null || true
	@sleep 0.5
	@lsof -ti:$(APP_PORT) -ti:$(GRPC_PORT) 2>/dev/null | sort -u | xargs kill -9 2>/dev/null || true
	@echo "run-desktop WEBTRANSPORT_ENABLED='$(WEBTRANSPORT_ENABLED)' WEBTRANSPORT_PATH='$(WEBTRANSPORT_PATH)' VITE_REALTIME_TRANSPORT='$(VITE_REALTIME_TRANSPORT)'"
	cd frontend && $(KUBE_ENV) APP_PORT=$(APP_PORT) GRPC_PORT=$(GRPC_PORT) PERTISK_BACKEND_BIN="$(CURDIR)/target/debug/pertisk-kube-backend" VITE_REALTIME_TRANSPORT="$(VITE_REALTIME_TRANSPORT)" $(WEBTRANSPORT_ENV) npm run tauri:dev

run-desktop-dev: run-desktop
	@echo "Desktop dev uses debug backend at target/debug/pertisk-kube-backend"

run-desktop-webtransport:
	$(MAKE) run-desktop WEBTRANSPORT_ENABLED=true WEBTRANSPORT_PATH=/wt

run-desktop-no-webtransport:
	$(MAKE) run-desktop WEBTRANSPORT_ENABLED=false WEBTRANSPORT_PATH=




# Build frontend and run backend serving the built SPA on a single port.
run-monolith: frontend-build
	$(KUBE_ENV) APP_PORT=$(APP_PORT) GRPC_PORT=$(GRPC_PORT) STATIC_DIR=frontend/dist cargo run -p pertisk-kube-backend

# Simulate running as an ingress-style controller talking to k8s via kubeconfig.
run-ingress-k8s: tools frontend-build
	@pkill -f "cargo-watch watch -x run -p pertisk-kube-backend" 2>/dev/null || true
	@pkill -f "target/debug/pertisk-kube-backend" 2>/dev/null || true
	@EXISTING_PIDS=$$(lsof -ti:$(APP_PORT) -ti:$(GRPC_PORT) 2>/dev/null | sort -u); \
	if [ -n "$$EXISTING_PIDS" ]; then \
		echo "Stopping existing process(es) on ports $(APP_PORT)/$(GRPC_PORT): $$EXISTING_PIDS"; \
		echo "$$EXISTING_PIDS" | xargs kill -9; \
		sleep 1; \
	fi
	@echo "Starting frontend build watcher (npm install && npm run build -- --watch)..."
	@$(MAKE) frontend-build-watch & FRONTEND_WATCH_PID=$$!; \
	trap 'kill $$FRONTEND_WATCH_PID 2>/dev/null || true' INT TERM EXIT; \
	if [ -f "$(K8S_KUBECONFIG)" ]; then \
		echo "Using local k8s kubeconfig: $(K8S_KUBECONFIG)"; \
		KUBECONFIG="$(K8S_KUBECONFIG)" \
		APP_PORT=$(APP_PORT) GRPC_PORT=$(GRPC_PORT) \
		STATIC_DIR=frontend/dist \
		cargo watch -x 'run -p pertisk-kube-backend'; \
	else \
		echo "k8s kubeconfig not found at $(K8S_KUBECONFIG); using current kubeconfig context instead."; \
		APP_PORT=$(APP_PORT) GRPC_PORT=$(GRPC_PORT) \
		STATIC_DIR=frontend/dist \
		cargo watch -x 'run -p pertisk-kube-backend'; \
	fi

# Show current version from git
version:
	@echo "$(VERSION)"

