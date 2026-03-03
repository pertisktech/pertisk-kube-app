 FROM node:20-alpine AS builder
 WORKDIR /app
 
COPY frontend/package.json frontend/vite.config.mts frontend/index.html ./ 
 COPY frontend/src ./src
COPY frontend/public ./public
 
 RUN npm install && npm run build
 
 FROM node:20-alpine
 WORKDIR /app
 RUN npm install -g serve
 COPY --from=builder /app/dist ./dist
COPY frontend/entrypoint.sh ./entrypoint.sh
RUN chmod +x /app/entrypoint.sh
 EXPOSE 3000
ENV BACKEND_URL=""
ENTRYPOINT ["/app/entrypoint.sh"]
 
