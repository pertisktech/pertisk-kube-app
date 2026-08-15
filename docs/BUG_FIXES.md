# Bug Fixes Summary

## Issues Fixed

### 1. ✅ Pod DELETE Returns 500 Error

**Problem:** Attempting to delete pods resulted in a 500 Internal Server Error.

**Root Cause:** RBAC permissions in `helm/pertisk-kube/values.yaml` only allowed `get`, `list`, `watch` verbs for pods and other resources, but not `delete`, `update`, or `patch`.

**Fix:** Updated RBAC rules to grant appropriate permissions:

```yaml
# Pods - Allow editing and deleting
- apiGroups: [""]
  resources: ["pods", "pods/log"]
  verbs: ["get", "list", "watch", "update", "patch", "delete"]

# Namespaces - Allow deleting  
- apiGroups: [""]
  resources: ["namespaces"]
  verbs: ["get", "list", "watch", "delete"]

# Apps resources - Allow editing and deleting
- apiGroups: ["apps"]
  resources: ["deployments", "replicasets", "statefulsets", "daemonsets"]
  verbs: ["get", "list", "watch", "update", "patch", "delete"]

# Batch resources - Allow editing and deleting
- apiGroups: ["batch"]
  resources: ["jobs", "cronjobs"]
  verbs: ["get", "list", "watch", "update", "patch", "delete"]
```

**Action Required:** Upgrade the Helm release to apply new RBAC permissions:

```bash
helm upgrade pertisk-kube ./helm/pertisk-kube -n your-namespace
```

---

### 2. ✅ Pod "Controlled By" Shows Wrong Value

**Problem:** The "Controlled By" field for pods was showing only the kind (e.g., "ReplicaSet") instead of the full reference including the name (e.g., "ReplicaSet/nginx-deployment-abc123").

**Root Cause:** Backend code at `backend/src/main.rs:1100` was only extracting `owner.kind` from the owner reference.

**Fix:** Changed to show both kind and name:

```rust
let controlled_by = pod
    .metadata
    .owner_references
    .as_ref()
    .and_then(|owners| owners.first())
    .map(|owner| format!("{}/{}", owner.kind, owner.name))  // Changed from owner.kind.clone()
    .unwrap_or_else(|| "-".to_string());
```

**Action Required:** Rebuild and redeploy the backend:

```bash
make docker-build-multi VERSION=0.0.5
make helm-upgrade
```

---

### 3. ⚠️ Version Shows "v1.0.0-dev" Instead of Correct Version

**Problem:** The login page shows "Pertisk Kube v1.0.0-dev" instead of the correct version (v0.0.4).

**Root Cause:** The Docker image was built without a proper Git tag, causing the Makefile's VERSION calculation to default to "1.0.0-dev". This version was baked into the frontend build as `VITE_APP_VERSION` and cannot be changed at runtime.

**Makefile VERSION Logic:**
```makefile
VERSION ?= $(shell V=$$(git describe --tags --always --abbrev=7 2>/dev/null || echo ""); \
	if echo "$$V" | grep -qE '^v?[0-9]+\.'; then \
		echo "$$V" | sed 's/^v//; s/-/./g'; \
	else \
		echo "1.0.0-dev"; \  # <- Defaults to this if no tag found
	fi)
```

**Solutions:**

#### Option A: Rebuild with Proper Git Tag (Recommended)

```bash
# Tag the current commit
git tag v0.0.5
git push origin v0.0.5

# Rebuild the image (VERSION will be auto-detected from tag)
make docker-build-multi

# Or explicitly specify version
make docker-build-multi VERSION=0.0.5

# Update Helm values and upgrade
# Edit helm/pertisk-kube/values.yaml to set image.tag: "v0.0.5"
make helm-upgrade
```

#### Option B: Build with Explicit VERSION

```bash
# Build with explicit version (bypasses git tag check)
make docker-build-multi VERSION=0.0.5

# Update Helm imagetag
# Edit helm/pertisk-kube/values.yaml to set image.tag: "v0.0.5"  
make helm-upgrade
```

#### Option C: Accept Current Version

If the "v1.0.0-dev" version is acceptable for development environments, no action is needed. The version is cosmetic and doesn't affect functionality.

**Technical Details:**

The version is set during Docker build:
1. Makefile calculates VERSION from git tags
2. Dockerfile receives VERSION as build arg: `ARG VERSION=0.0.1`
3. Frontend builder uses it: `RUN VITE_APP_VERSION=${VERSION} npm run build`
4. Vite embeds it in the build as `import.meta.env.VITE_APP_VERSION`
5. `frontend/src/utils/version.ts` reads it and exports `APP_VERSION`
6. Login page displays it: `<p>Pertisk Kube v{APP_VERSION}</p>`

Once baked into the image, it cannot be changed without rebuilding.

---

## Deployment Steps

To apply all fixes:

```bash
# 1. Ensure you're on the latest code
git pull

# 2. Tag for proper versioning (optional but recommended)
git tag v0.0.5
git push origin v0.0.5

# 3. Rebuild multi-arch image
make docker-build-multi

# 4. Update Helm values if needed
# Edit helm/pertisk-kube/values.yaml:
#   app.image.tag: "v0.0.5"  # or "0.0.5" or "latest"

# 5. Upgrade Helm release (applies RBAC + new image)
helm upgrade pertisk-kube ./helm/pertisk-kube \
  -n your-namespace

# 6. Verify deployment
kubectl get pods -n your-namespace
kubectl logs -n your-namespace -l app.kubernetes.io/name=pertisk-kube

# 7. Test in browser
# - Delete pods should now work (no 500 error)
# - "Controlled By" should show "Kind/Name" format
# - Version should show correct version if rebuilt with tag
```

---

## Files Changed

1. **helm/pertisk-kube/values.yaml** - Updated RBAC rules
2. **backend/src/main.rs** - Fixed controlled_by format

---

## Testing Checklist

- [ ] Delete a pod - Should succeed without 500 error
- [ ] Check "Controlled By" column - Should show "ReplicaSet/name" format
- [ ] Delete a deployment - Should succeed
- [ ] Edit pod YAML - Should save successfully  
- [ ] Edit deployment/statefulset/daemonset/job/cronjob YAML - Should save successfully
- [ ] Check version on login page - Should show correct version (if rebuilt with tag)
