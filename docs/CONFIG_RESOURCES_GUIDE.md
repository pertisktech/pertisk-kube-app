# Config Resources Implementation Guide

## Completion Status

✅ **Backend:** All YAML get/put and delete endpoints added for all 9 Config resources
✅ **Detail Panels:** All 9 detail panel components created
✅ **Delete Functions:** All delete functions added to useKubernetes.ts
⏳ **Frontend Pages:** Need to be updated (template provided below)

## Resources Covered

### Namespaced Resources:
1. ConfigMaps
2. Secrets  
3. ResourceQuotas
4. LimitRanges
5. HPA (HorizontalPodAutoscalers)
6. PDB (PodDisruptionBudgets)
7. Leases

### Cluster-Scoped Resources:
8. PriorityClasses
9. RuntimeClasses

## Template for Updating Pages

Each Config page needs to be updated following the **StatefulSetsPage.tsx** pattern:

### Required Additions:

1. **Imports:**
```typescript
import { useEffect, useMemo, useRef, useState } from 'react';
import AceEditor from 'react-ace';
import YAML from 'yaml';
import 'ace-builds/src-noconflict/mode-yaml';
import 'ace-builds/src-noconflict/theme-github';
import 'ace-builds/src-noconflict/theme-tomorrow_night';
import { Trash2 } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import { {ResourceDetailPanel}, ConfirmDialog } from '../components';
import { getAuthToken } from '../utils/auth';
import { delete{Resource} } from '../hooks/useKubernetes';
```

2. **Sanitize Function:**
```typescript
const sanitize{Resource}YamlForEdit = (yamlText: string) => {
  try {
    const parsed = YAML.parse(yamlText) as Record<string, unknown> | null;
    if (!parsed || typeof parsed !== 'object') return yamlText;

    const metadata = (parsed.metadata as Record<string, unknown> | undefined) ?? undefined;
    if (metadata && typeof metadata === 'object') {
      delete metadata.managedFields;
      delete metadata.resourceVersion;
      delete metadata.uid;
      delete metadata.generation;
      delete metadata.creationTimestamp;
      delete metadata.selfLink;
      
      const annotations = metadata.annotations as Record<string, unknown> | undefined;
      if (annotations && typeof annotations === 'object') {
        delete annotations['kubectl.kubernetes.io/last-applied-configuration'];
        if (Object.keys(annotations).length === 0) delete metadata.annotations;
      }
    }

    delete parsed.status;
    return YAML.stringify(parsed, { lineWidth: 0 });
  } catch {
    return yamlText;
  }
};
```

3. **State Management:**
```typescript
const theme = useTheme();
const [selected{Resource}, setSelected{Resource}] = useState<{Resource} | null>(null);
const [panelOpen, setPanelOpen] = useState(false);
const [yamlTabs, setYamlTabs] = useState<{Resource}[]>([]);
const [activeYamlTabKey, setActiveYamlTabKey] = useState<string | null>(null);
const [yamlDrawerVisible, setYamlDrawerVisible] = useState(true);
const [yamlDrawerHeightPx, setYamlDrawerHeightPx] = useState<number | null>(null);
const [isResizingYamlDrawer, setIsResizingYamlDrawer] = useState(false);
const resizeStartYRef = useRef(0);
const resizeStartHeightRef = useRef(0);
const [yamlContentsByTab, setYamlContentsByTab] = useState<Record<string, string>>({});
const [yamlLoadingTabKey, setYamlLoadingTabKey] = useState<string | null>(null);
const [yamlSavingTabKey, setYamlSavingTabKey] = useState<string | null>(null);
const [yamlErrorByTab, setYamlErrorByTab] = useState<Record<string, string | null>>({});
const [yamlSuccessByTab, setYamlSuccessByTab] = useState<Record<string, string | null>>({});
const [selectedRows, setSelectedRows] = useState<string[]>([]);
const [confirmDelete, setConfirmDelete] = useState<{ keys: string[]; label: string } | null>(null);
const [isDeleting, setIsDeleting] = useState(false);
```

4. **Helper Functions:**
```typescript
const get{Resource}Key = (resource: {Resource}) => `${resource.namespace}/${resource.name}`;
// For cluster-scoped: const get{Resource}Key = (resource: {Resource}) => resource.name;

// YAML loading, saving, drawer resize handlers (copy from StatefulSetsPage)
// Delete handlers (copy pattern from StatefulSetsPage)
```

5. **API Endpoints:**
- **Namespaced:** `/api/{resources}/${namespace}/${name}/yaml`
- **Cluster-scoped:** `/api/{resources}/${name}/yaml`

6. **Success Messages:**
- "ConfigMap updated successfully"
- "Secret updated successfully"
- etc.

### Pages to Update:

| Page | Resource Type | API Endpoint | Scoped | Status |
|------|---------------|--------------|--------|--------|
| ConfigMapsPage.tsx | ConfigMap | `/api/configmaps` | Namespaced | ⏳ TODO |
| SecretsPage.tsx | Secret | `/api/secrets` | Namespaced | ⏳ TODO |
| ResourceQuotasPage.tsx | ResourceQuota | `/api/resourcequotas` | Namespaced | ⏳ TODO |
| LimitRangesPage.tsx | LimitRange | `/api/limitranges` | Namespaced | ⏳ TODO |
| HPAPage.tsx | HPA | `/api/hpa` | Namespaced | ⏳ TODO |
| PDBPage.tsx | PDB | `/api/pdb` | Namespaced | ⏳ TODO |
| LeasesPage.tsx | Lease | `/api/leases` | Namespaced | ⏳ TODO |
| PriorityClassesPage.tsx | PriorityClass | `/api/priorityclasses` | Cluster | ⏳ TODO |
| RuntimeClassesPage.tsx | RuntimeClass | `/api/runtimeclasses` | Cluster | ⏳ TODO |

## Deployment Steps

After updating all pages:

```bash
# Rebuild backend and frontend
make docker-build-multi VERSION=0.0.6

# Update RBAC permissions in values.yaml (add delete, update, patch verbs)

# Deploy
helm upgrade pertisk-kube ./helm/pertisk-kube \
  -n pertisk-rproxy \
  --set app.image.tag=0.0.6
```

## RBAC Permissions Needed

Add to `helm/pertisk-kube/values.yaml`:

```yaml
# Configuration resources - Allow editing and deleting
- apiGroups: [""]
  resources: ["configmaps", "secrets", "resourcequotas", "limitranges"]
  verbs: ["get", "list", "watch", "update", "patch", "delete"]

# Autoscaling - Allow editing and deleting
- apiGroups: ["autoscaling"]
  resources: ["horizontalpodautoscalers"]
  verbs: ["get", "list", "watch", "update", "patch", "delete"]

# Policy - Allow editing and deleting
- apiGroups: ["policy"]
  resources: ["poddisruptionbudgets"]
  verbs: ["get", "list", "watch", "update", "patch", "delete"]

# Scheduling (cluster-scoped) - Allow editing and deleting
- apiGroups: ["scheduling.k8s.io"]
  resources: ["priorityclasses"]
  verbs: ["get", "list", "watch", "update", "patch", "delete"]

# Node (cluster-scoped) - Allow editing and deleting
- apiGroups: ["node.k8s.io"]
  resources: ["runtimeclasses"]
  verbs: ["get", "list", "watch", "update", "patch", "delete"]

# Coordination - Allow editing and deleting
- apiGroups: ["coordination.k8s.io"]
  resources: ["leases"]
  verbs: ["get", "list", "watch", "update", "patch", "delete"]
```

## Testing Checklist

For each Config resource page:
- [ ] Click row → detail panel opens on right
- [ ] Click Edit YAML → YAML editor drawer opens at bottom
- [ ] Edit YAML and save → success message appears
- [ ] Click delete icon → confirmation dialog appears
- [ ] Confirm delete → resource is deleted
- [ ] Select multiple rows → bulk delete toolbar appears
- [ ] Delete multiple → all selected resources deleted
