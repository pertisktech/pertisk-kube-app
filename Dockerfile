# Dockerfile — Code-only build; uses pre-built base images for fast iteration.
#
# Prerequisites — push base images first (only needed when deps change):
#   make docker-base-push        # single-arch
#   make docker-base-push-multi  # multi-arch
#
# Then for every code change:
#   make docker-build
#   make docker-build-multi

ARG VERSION=0.0.1

# Base image coordinates (override via --build-arg or Makefile)
ARG BASE_REGISTRY=harbor.tools.thaidevops.co/pertisksoft/pertisk-kube
ARG BASE_TAG=latest

# ─── Stage 1: Build Frontend (node_modules already in base) ──────────────────
FROM ${BASE_REGISTRY}/web-base-frontend:${BASE_TAG} AS frontend-builder
ARG VERSION
WORKDIR /app/frontend

COPY frontend/package.json frontend/package-lock.json ./
RUN npm install --prefer-offline --no-audit --no-fund

COPY frontend/tsconfig.json frontend/tsconfig.node.json ./
COPY frontend/vite.config.mts frontend/postcss.config.js frontend/tailwind.config.js ./
COPY frontend/index.html ./
COPY frontend/src ./src
COPY frontend/public ./public

RUN VITE_APP_VERSION=${VERSION} npm run build

# ─── Stage 2: Build Backend (all crates pre-compiled in base) ────────────────
FROM ${BASE_REGISTRY}/web-base-backend:${BASE_TAG} AS backend-builder
WORKDIR /app

# Replace dummy source with real application code
COPY backend/src ./backend/src

# touch main.rs so Cargo detects the change and recompiles only app code
RUN touch backend/src/main.rs && \
    cargo build --release --bin pertisk-kube-backend

# ─── Stage 3: Runtime (system tools, shell, fonts already in base) ────────────
FROM ${BASE_REGISTRY}/web-base-runtime:${BASE_TAG}

COPY --from=backend-builder /app/target/release/pertisk-kube-backend /app/
COPY --from=frontend-builder /app/frontend/dist /app/static

ENTRYPOINT ["/app/pertisk-kube-backend"]
