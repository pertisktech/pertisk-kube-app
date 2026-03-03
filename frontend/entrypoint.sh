#!/bin/sh
set -eu

# Runtime config for the SPA.
# This avoids having to rebuild the image to change backend URL.
BACKEND_URL="${BACKEND_URL:-http://pertisk-kube-backend.pertisk-kube.svc.cluster.local:8091/api}"

cat > /app/dist/config.js <<EOF
window.__PERTISK_CONFIG__ = { backendUrl: "${BACKEND_URL}" };
EOF

exec serve -s /app/dist -l 3000

