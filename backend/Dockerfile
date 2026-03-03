 FROM rust:1.81 as builder
 WORKDIR /app

 # Create a dummy project to cache dependencies
 RUN cargo new pertisk-kube-backend
 WORKDIR /app/pertisk-kube-backend

 COPY backend/Cargo.toml ./Cargo.toml
 RUN cargo fetch

 # Now copy source and build
 COPY backend/src ./src
COPY frontend/dist /app/frontend_dist
 RUN cargo build --release

 FROM gcr.io/distroless/cc
 WORKDIR /app
 COPY --from=builder /app/pertisk-kube-backend/target/release/pertisk-kube-backend .
COPY --from=builder /app/frontend_dist ./static
ENV STATIC_DIR=/app/static
EXPOSE 8091
 USER 65532
 ENTRYPOINT ["./pertisk-kube-backend"]

