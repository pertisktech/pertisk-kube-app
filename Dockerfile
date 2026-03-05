# Multi-stage Dockerfile for Pertisk Kube Web
# Builds both frontend and backend in a single image

# Build arguments
ARG VERSION=0.0.1

# Stage 1: Build Frontend
FROM node:20-alpine AS frontend-builder
ARG VERSION
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

RUN VITE_APP_VERSION=${VERSION} npm run build

# Stage 2: Build Backend
FROM rust:alpine AS backend-builder
WORKDIR /app

# Install build dependencies for native crates
RUN apk add --no-cache build-base pkgconfig openssl-dev protobuf-dev

# Copy workspace Cargo.toml first
COPY Cargo.toml ./Cargo.toml

# Create backend directory structure matching workspace
RUN mkdir -p backend/src
COPY backend/Cargo.toml ./backend/Cargo.toml

# Create a dummy main.rs to cache dependencies
RUN echo "fn main() {}" > backend/src/main.rs
RUN cargo fetch

# Copy proto files and build script (needed for code generation)
COPY proto ./proto
COPY backend/build.rs ./backend/build.rs

# Now copy the actual backend source
COPY backend/src ./backend/src

# Copy frontend build output
COPY --from=frontend-builder /app/frontend/dist ./frontend_dist

# Build the backend
RUN cargo build --release --bin pertisk-kube-backend

# Stage 3: Build ktail from source (portable across architectures)
FROM golang:1.22-alpine AS ktail-builder
WORKDIR /src
RUN apk add --no-cache git
RUN git clone --depth=1 --branch v1.4.0 https://github.com/atombender/ktail.git . && \
  go build -o /out/ktail .

# Stage 4: Runtime
FROM alpine:latest
WORKDIR /app
ARG TARGETARCH

# Install ca-certificates, kubectl, zsh, and dependencies for oh-my-zsh
RUN apk add --no-cache \
    ca-certificates \
    kubectl \
    zsh \
    git \
    curl \
    wget \
    bash \
    fontconfig \
    font-freefont \
    && adduser -D -u 65532 appuser

# Set system-wide PATH to include /usr/local/bin for all shells
RUN echo 'export PATH=/usr/local/bin:/usr/bin:/bin' >> /etc/profile && \
    echo 'export PATH=/usr/local/bin:/usr/bin:/bin' > /etc/zsh/zshenv

# Install ktail from source-built artifact
COPY --from=ktail-builder /out/ktail /usr/local/bin/ktail
RUN chmod +x /usr/local/bin/ktail && \
  ln -sf /usr/local/bin/ktail /usr/bin/ktail

# Install Nerd Font (Meslo LG)
RUN mkdir -p /home/appuser/.local/share/fonts && \
    cd /tmp && \
    wget https://github.com/ryanoasis/nerd-fonts/releases/download/v3.0.2/Meslo.zip && \
    unzip Meslo.zip -d /home/appuser/.local/share/fonts/ && \
    fc-cache -fv /home/appuser/.local/share/fonts && \
    rm Meslo.zip && \
    chown -R appuser:appuser /home/appuser/.local

# Install Oh-My-Zsh and plugins
RUN HOME=/home/appuser sh -c "$(curl -fsSL https://raw.githubusercontent.com/ohmyzsh/ohmyzsh/master/tools/install.sh)" "" --unattended || true && \
    git clone https://github.com/zsh-users/zsh-syntax-highlighting.git /home/appuser/.oh-my-zsh/custom/plugins/zsh-syntax-highlighting && \
    git clone https://github.com/zsh-users/zsh-autosuggestions.git /home/appuser/.oh-my-zsh/custom/plugins/zsh-autosuggestions && \
    chown -R appuser:appuser /home/appuser/.oh-my-zsh && \
    chown -R appuser:appuser /home/appuser/.zshrc

# Configure .zshrc with proper shell syntax
RUN /bin/sh -c ' \
printf "%s\n" \
  "# Path configuration - must be first" \
  "export PATH=\"/usr/local/bin:/usr/bin:/bin:\$PATH\"" \
  "" \
  "# Oh-My-Zsh configuration" \
  "export ZSH=\"\$HOME/.oh-my-zsh\"" \
    "ZSH_THEME=\"robbyrussell\"" \
  "plugins=(git zsh-syntax-highlighting zsh-autosuggestions kubectl docker docker-compose)" \
  "ZSH_DISABLE_COMPFIX=true" \
  "" \
  "# Load Oh-My-Zsh" \
  "source \$ZSH/oh-my-zsh.sh" \
  "" \
  "# History options" \
  "setopt HIST_IGNORE_DUPS" \
  "setopt HIST_IGNORE_SPACE" \
    "setopt HIST_FIND_NO_DUPS" \
  > /home/appuser/.zshrc \
' && chmod 644 /home/appuser/.zshrc && chown appuser:appuser /home/appuser/.zshrc

# Set zsh as default shell for appuser
RUN sed -i 's|appuser:.*|appuser:x:65532:65532:appuser:/home/appuser:/bin/zsh|' /etc/passwd

# Copy the backend binary
COPY --from=backend-builder /app/target/release/pertisk-kube-backend .

# Copy the frontend static files
COPY --from=frontend-builder /app/frontend/dist ./static

# Set environment variables
ENV STATIC_DIR=/app/static
ENV RUST_LOG=info
ENV SHELL=/bin/zsh

EXPOSE 8091
EXPOSE 50051

# Run as non-root user
USER appuser

ENTRYPOINT ["./pertisk-kube-backend"]
