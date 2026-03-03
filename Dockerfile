# Multi-stage Dockerfile for Pertisk Kube Web
# Builds both frontend and backend in a single image

# Stage 1: Build Frontend
FROM node:20-alpine AS frontend-builder
WORKDIR /app/frontend

# Copy frontend package files
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm install

# Copy frontend source and build
COPY frontend/tsconfig.json frontend/tsconfig.node.json ./
COPY frontend/vite.config.mts frontend/postcss.config.js frontend/tailwind.config.js ./
COPY frontend/index.html ./
COPY frontend/src ./src
COPY frontend/public ./public

RUN npm run build

# Stage 2: Build Backend
FROM rust:alpine AS backend-builder
WORKDIR /app

# Install build dependencies for native crates
RUN apk add --no-cache build-base pkgconfig openssl-dev

# Copy workspace Cargo.toml first
COPY Cargo.toml ./Cargo.toml

# Create backend directory structure matching workspace
RUN mkdir -p backend/src
COPY backend/Cargo.toml ./backend/Cargo.toml

# Create a dummy main.rs to cache dependencies
RUN echo "fn main() {}" > backend/src/main.rs
RUN cargo fetch

# Now copy the actual backend source
COPY backend/src ./backend/src

# Copy frontend build output
COPY --from=frontend-builder /app/frontend/dist ./frontend_dist

# Build the backend
RUN cargo build --release --bin pertisk-kube-backend

# Stage 3: Runtime
FROM alpine:latest
WORKDIR /app

# Install ca-certificates for HTTPS and create non-root user
RUN apk add --no-cache ca-certificates && \
    adduser -D -u 65532 appuser

# Copy the backend binary
COPY --from=backend-builder /app/target/release/pertisk-kube-backend .

# Copy the frontend static files
COPY --from=frontend-builder /app/frontend/dist ./static

# Set environment variables
ENV STATIC_DIR=/app/static
ENV RUST_LOG=info

EXPOSE 8091

# Run as non-root user
USER appuser

ENTRYPOINT ["./pertisk-kube-backend"]
