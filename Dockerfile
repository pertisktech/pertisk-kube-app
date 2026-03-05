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

# Stage 3: Runtime
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

# Install ktail CLI (multi-arch)
RUN case "${TARGETARCH}" in \
        amd64) KTAIL_URL="https://github.com/atombender/ktail/releases/download/v1.4.0/ktail-linux-amd64" ;; \
        arm64|arm) KTAIL_URL="https://github.com/atombender/ktail/releases/download/v1.4.0/ktail-linux-arm" ;; \
        *) echo "Unsupported TARGETARCH: ${TARGETARCH}" && exit 1 ;; \
    esac && \
    wget -O /usr/local/bin/ktail "${KTAIL_URL}" && \
    chmod +x /usr/local/bin/ktail

# Install Nerd Font (Meslo LG)
RUN mkdir -p /home/appuser/.local/share/fonts && \
    cd /tmp && \
    wget https://github.com/ryanoasis/nerd-fonts/releases/download/v3.0.2/Meslo.zip && \
    unzip Meslo.zip -d /home/appuser/.local/share/fonts/ && \
    fc-cache -fv /home/appuser/.local/share/fonts && \
    rm Meslo.zip && \
    chown -R appuser:appuser /home/appuser/.local

# Install oh-my-zsh for appuser
RUN HOME=/home/appuser sh -c "$(curl -fsSL https://raw.githubusercontent.com/ohmyzsh/ohmyzsh/master/tools/install.sh)" "" --unattended && \
    chown -R appuser:appuser /home/appuser

# Install powerlevel10k theme
RUN git clone --depth=1 https://github.com/romkatv/powerlevel10k.git /home/appuser/.oh-my-zsh/custom/themes/powerlevel10k && \
    chown -R appuser:appuser /home/appuser/.oh-my-zsh

# Set zsh as default shell and configure oh-my-zsh
RUN sed -i 's/^ZSH_THEME=.*/ZSH_THEME="powerlevel10k\/powerlevel10k"/' /home/appuser/.zshrc && \
    chown -R appuser:appuser /home/appuser

# Create minimal zsh config for web terminal (non-PTY environments)
RUN mkdir -p /tmp/.zsh-terminal && \
    echo '# Minimal zsh config for web terminal' > /tmp/.zsh-terminal/.zshrc && \
    echo '# Disable all prompts and interactive features' >> /tmp/.zsh-terminal/.zshrc && \
    echo 'setopt NO_PROMPT_CR' >> /tmp/.zsh-terminal/.zshrc && \
    echo 'setopt NO_PROMPT_SP' >> /tmp/.zsh-terminal/.zshrc && \
    echo 'unsetopt PROMPT_CR' >> /tmp/.zsh-terminal/.zshrc && \
    echo 'unsetopt PROMPT_SP' >> /tmp/.zsh-terminal/.zshrc && \
    echo 'unsetopt zle' >> /tmp/.zsh-terminal/.zshrc && \
    echo 'TERM=dumb' >> /tmp/.zsh-terminal/.zshrc && \
    echo '# Simple prompt' >> /tmp/.zsh-terminal/.zshrc && \
    echo 'PS1="$ "' >> /tmp/.zsh-terminal/.zshrc && \
    echo 'PS2="> "' >> /tmp/.zsh-terminal/.zshrc && \
    echo 'PS3=""' >> /tmp/.zsh-terminal/.zshrc && \
    echo 'PS4=""' >> /tmp/.zsh-terminal/.zshrc && \
    echo '# Disable fancy features' >> /tmp/.zsh-terminal/.zshrc && \
    echo 'DISABLE_AUTO_TITLE="true"' >> /tmp/.zsh-terminal/.zshrc && \
    echo 'DISABLE_AUTO_UPDATE="true"' >> /tmp/.zsh-terminal/.zshrc && \
    chmod 644 /tmp/.zsh-terminal/.zshrc

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
