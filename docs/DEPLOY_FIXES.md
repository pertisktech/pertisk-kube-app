# Quick Fix Deployment Guide

## What Was Fixed

1. **✅ DELETE pod 500 errors** - Updated RBAC permissions
2. **✅ Controlled By showing only kind** - Now shows "Kind/Name" format  
3. **⚠️ Version showing v1.0.0-dev** - Documented fix (requires rebuild)

## Quick Deploy (Fixes 1 & 2)

```bash
# Navigate to project root
cd /path/to/pertisk-kube-app

# Build new multi-arch image with fixes
make docker-build-multi VERSION=0.0.5

# Upgrade Helm release (applies RBAC + new backend)
helm upgrade pertisk-kube ./helm/pertisk-kube \
  -n your-namespace \
  --set app.image.tag=0.0.5

# Wait for rollout
kubectl rollout status deployment/pertisk-kube -n your-namespace

# Check logs
kubectl logs -n your-namespace -l app.kubernetes.io/name=pertisk-kube --tail=50
```

## Verify Fixes

1. **Test DELETE**: Go to Pods page, try to delete a pod
   - ✅ Should succeed (no 500 error)

2. **Test Controlled By**: Look at the "Controlled By" column
   - ✅ Should show "ReplicaSet/my-app-xyz123" instead of just "ReplicaSet"

3. **Test YAML Editor**: Try editing a StatefulSet/DaemonSet/Job/CronJob
   - ✅ Should save successfully

4. **Check Version**: Login page will still show "v1.0.0-dev"
   - ⚠️ This is expected - version was baked into the previous build
   - ✅ Will show "v0.0.5" after rebuild with VERSION=0.0.5

## Files Modified

- `helm/pertisk-kube/values.yaml` - RBAC permissions updated
- `backend/src/main.rs` - controlled_by format fixed

## Rollback (if needed)

```bash
helm rollback pertisk-kube -n your-namespace
```
