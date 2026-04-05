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

.PHONY: dev dev-backend dev-frontend frontend-install frontend-build frontend-build-watch tools fmt build-backend run run-desktop run-desktop-dev build-desktop build-macos-dmg run-monolith run-ingress-k8s
.PHONY: version

KUBE_ENV = $(if $(strip $(K8S_KUBECONFIG)),KUBECONFIG="$(K8S_KUBECONFIG)",)

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

build-desktop: build-backend frontend-install
	@KTAIL_BIN=""; \
	KTAIL_REPO=""; \
	if [ -f ../pertisk-ktail/Cargo.toml ]; then \
		KTAIL_REPO="../pertisk-ktail"; \
	elif [ -f ../ktail/Cargo.toml ]; then \
		KTAIL_REPO="../ktail"; \
	fi; \
	if [ -z "$$KTAIL_REPO" ]; then \
		TMP_KTAIL_DIR="/tmp/pertisk-ktail-$$USER"; \
		echo "Fetching pertisk-ktail source from GitHub..."; \
		rm -rf "$$TMP_KTAIL_DIR"; \
		git clone --depth 1 https://github.com/pertisktech/pertisk-ktail.git "$$TMP_KTAIL_DIR" >/dev/null 2>&1 || true; \
		if [ -f "$$TMP_KTAIL_DIR/Cargo.toml" ]; then \
			KTAIL_REPO="$$TMP_KTAIL_DIR"; \
		fi; \
	fi; \
	if [ -n "$$KTAIL_REPO" ]; then \
		echo "Building ktail release binary from $$KTAIL_REPO..."; \
		cargo build --release --manifest-path "$$KTAIL_REPO/Cargo.toml"; \
		if [ -x "$$KTAIL_REPO/target/release/ktail" ]; then \
			KTAIL_BIN="$$(cd "$$KTAIL_REPO/target/release" && pwd)/ktail"; \
		elif [ -x "$$KTAIL_REPO/target/release/pertisk-ktail" ]; then \
			KTAIL_BIN="$$(cd "$$KTAIL_REPO/target/release" && pwd)/pertisk-ktail"; \
		fi; \
	fi; \
	if [ -n "$$KTAIL_BIN" ]; then \
		echo "Using ktail binary: $$KTAIL_BIN"; \
	else \
		echo "ktail binary not auto-detected; build will continue without bundled ktail"; \
	fi; \
	TAURI_VERSION=$$(echo "$(VERSION)" | sed -E 's/^[vV]//; s/^([0-9]+\.[0-9]+\.[0-9]+).*/\1/'); \
	if ! echo "$$TAURI_VERSION" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+$$'; then TAURI_VERSION="0.1.0"; fi; \
	cd frontend && KTAIL_BINARY_PATH="$$KTAIL_BIN" VITE_APP_VERSION="$(VERSION)" npm run tauri:build -- --config '{"version":"'"$$TAURI_VERSION"'"}'

build-macos-dmg: frontend-install
	@if [ "$$(uname -s)" != "Darwin" ]; then \
		echo "build-macos-dmg is only supported on macOS"; \
		exit 1; \
	fi
	@echo "Building backend release binary for bundling..."
	cargo build --release -p pertisk-kube-backend
	@KTAIL_BIN=""; \
	KTAIL_REPO=""; \
	if [ -f ../pertisk-ktail/Cargo.toml ]; then \
		KTAIL_REPO="../pertisk-ktail"; \
	elif [ -f ../ktail/Cargo.toml ]; then \
		KTAIL_REPO="../ktail"; \
	fi; \
	if [ -z "$$KTAIL_REPO" ]; then \
		TMP_KTAIL_DIR="/tmp/pertisk-ktail-$$USER"; \
		echo "Fetching pertisk-ktail source from GitHub..."; \
		rm -rf "$$TMP_KTAIL_DIR"; \
		git clone --depth 1 https://github.com/pertisktech/pertisk-ktail.git "$$TMP_KTAIL_DIR" >/dev/null 2>&1 || true; \
		if [ -f "$$TMP_KTAIL_DIR/Cargo.toml" ]; then \
			KTAIL_REPO="$$TMP_KTAIL_DIR"; \
		fi; \
	fi; \
	if [ -n "$$KTAIL_REPO" ]; then \
		echo "Building ktail release binary from $$KTAIL_REPO..."; \
		cargo build --release --manifest-path "$$KTAIL_REPO/Cargo.toml"; \
		if [ -x "$$KTAIL_REPO/target/release/ktail" ]; then \
			KTAIL_BIN="$$(cd "$$KTAIL_REPO/target/release" && pwd)/ktail"; \
		elif [ -x "$$KTAIL_REPO/target/release/pertisk-ktail" ]; then \
			KTAIL_BIN="$$(cd "$$KTAIL_REPO/target/release" && pwd)/pertisk-ktail"; \
		fi; \
	fi; \
	if [ -n "$$KTAIL_BIN" ]; then \
		echo "Using ktail binary: $$KTAIL_BIN"; \
	else \
		echo "ktail binary not auto-detected; build will continue without bundled ktail"; \
	fi; \
	TAURI_VERSION=$$(echo "$(VERSION)" | sed -E 's/^[vV]//; s/^([0-9]+\.[0-9]+\.[0-9]+).*/\1/'); \
	if ! echo "$$TAURI_VERSION" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+$$'; then TAURI_VERSION="0.1.0"; fi; \
	echo "Building macOS DMG v$$TAURI_VERSION (display $(VERSION))..."; \
	cd frontend && KTAIL_BINARY_PATH="$$KTAIL_BIN" VITE_APP_VERSION="$(VERSION)" npm run tauri:build -- --bundles dmg --config '{"version":"'"$$TAURI_VERSION"'"}'
	@echo ""
	@echo "DMG output:"
	@ls -lh frontend/src-tauri/target/release/bundle/dmg/*.dmg 2>/dev/null || echo "  (no .dmg found — check build output above)"

run-desktop: frontend-install build-backend
	@pkill -f "ptkublet-desktop" 2>/dev/null || true
	@pkill -f "pertisk-kube-backend" 2>/dev/null || true
	@pkill -f "tauri dev" 2>/dev/null || true
	@pkill -f "vite" 2>/dev/null || true
	@sleep 0.5
	@lsof -ti:3000 -ti:$(APP_PORT) -ti:$(GRPC_PORT) 2>/dev/null | sort -u | xargs kill -9 2>/dev/null || true
	cd frontend && $(KUBE_ENV) APP_PORT=$(APP_PORT) GRPC_PORT=$(GRPC_PORT) PERTISK_BACKEND_BIN="$(CURDIR)/target/debug/pertisk-kube-backend" npm run tauri:dev

run-desktop-dev: run-desktop
	@echo "Desktop dev uses debug backend at target/debug/pertisk-kube-backend"




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

