# Config Resources Implementation Template

## ✅ Completed
- ConfigMapsPage.tsx - Full functionality added

## 📋 Remaining Pages (8)

This template provides a systematic approach for implementing the remaining Config resource pages. Each follows the exact pattern used in ConfigMapsPage.tsx.

---

## Quick Reference Table

| Page File | Resource Type | API Endpoint | Detail Panel Component | Delete Function | Scoped |
|-----------|---------------|--------------|----------------------|-----------------|--------|
| SecretsPage.tsx | Secret | `/api/secrets` | SecretDetailPanel | deleteSecret | Namespaced |
| ResourceQuotasPage.tsx | ResourceQuota | `/api/resourcequotas` | ResourceQuotaDetailPanel | deleteResourceQuota | Namespaced |
| LimitRangesPage.tsx | LimitRange | `/api/limitranges` | LimitRangeDetailPanel | deleteLimitRange | Namespaced |
| HPAPage.tsx | HPA | `/api/hpa` | HPADetailPanel | deleteHPA | Namespaced |
| PDBPage.tsx | PDB | `/api/pdb` | PDBDetailPanel | deletePDB | Namespaced |
| LeasesPage.tsx | Lease | `/api/leases` | LeaseDetailPanel | deleteLease | Namespaced |
| PriorityClassesPage.tsx | PriorityClass | `/api/priorityclasses` | PriorityClassDetailPanel | deletePriorityClass | **Cluster** |
| RuntimeClassesPage.tsx | RuntimeClass | `/api/runtimeclasses` | RuntimeClassDetailPanel | deleteRuntimeClass | **Cluster** |

---

## Implementation Steps for Each Page

### 1. Update Imports

Replace the simple imports with:

```typescript
import { useEffect, useMemo, useRef, useState } from 'react';
import AceEditor from 'react-ace';
import YAML from 'yaml';
import 'ace-builds/src-noconflict/mode-yaml';
import 'ace-builds/src-noconflict/theme-github';
import 'ace-builds/src-noconflict/theme-tomorrow_night';
import { Trash2 } from 'lucide-react';
import { use{Resources}, delete{Resource} } from '../hooks/useKubernetes';
import { useNamespace } from '../context/NamespaceContext';
import { useTheme } from '../context/ThemeContext';
import { DataTable, {Resource}DetailPanel, ConfirmDialog } from '../components';
import type { {Resource} } from '../types';
import { getAuthToken } from '../utils/auth';
// Include other utils as needed (timeAgo, truncateString, getStatusColor, etc.)
```

**Replace placeholders:**
- `{Resources}` with hook name (e.g., `Secrets`, `HPA`)
- `{Resource}` with type name (e.g., `Secret`, `HPA`)
- `{Resource}DetailPanel` with component name (e.g., `SecretDetailPanel`)

### 2. Add Sanitize Function

```typescript
const sanitize{Resource}YamlForEdit = (yamlText: string) => {
  try {
    const parsed = YAML.parse(yamlText) as Record<string, unknown> | null;
    if (!parsed || typeof parsed !== 'object') {
      return yamlText;
    }

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
        if (Object.keys(annotations).length === 0) {
          delete metadata.annotations;
        }
      }
    }

    delete parsed.status;

    return YAML.stringify(parsed, { lineWidth: 0 });
  } catch {
    return yamlText;
  }
};
```

### 3. Add State Variables

Copy this entire block and replace `{Resource}` accordingly:

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
const [sortState, setSortState] = useState<{ key: {Resource}SortKey; direction: 'asc' | 'desc' }>({
  key: 'age',
  direction: 'desc',
});
```

### 4. Add Helper Functions

#### For Namespaced Resources:

```typescript
const get{Resource}Key = (resource: {Resource}) => `${resource.namespace}/${resource.name}`;
```

#### For Cluster-Scoped Resources (PriorityClass, RuntimeClass):

```typescript
const get{Resource}Key = (resource: {Resource}) => resource.name;
```

### 5. Add useEffect Hooks

Copy from ConfigMapsPage lines 100-180 (3 useEffect hooks for data syncing, YAML loading, and drawer resizing).

**Important:** Update API endpoint in the fetch URL:
- Namespaced: `/api/{resources}/${encodeURIComponent(resource.namespace)}/${encodeURIComponent(resource.name)}/yaml`
- Cluster-scoped: `/api/{resources}/${encodeURIComponent(resource.name)}/yaml`

### 6. Add Handler Functions

Copy all handlers from ConfigMapsPage:
- `handleCloseYamlEditor`
- `handleOpenYamlEditorFromPanel`
- `handleCloseYamlTab`
- `handleSaveYaml` (update success message to match resource type)
- `handleStartYaml DrawerResize`
- `handleDeleteSingle`
- `handleDeleteSelected`
- `handleConfirmDelete`

**Update:**
- Success message: `'{Resource} updated successfully'`
- Delete label: `'${selectedRows.length} {resources}'`

### 7. Update Return Statement

Copy the entire JSX from ConfigMapsPage lines 430-700. Update:
- Component props: `{Resource}DetailPanel`
- Resource variable names
- Confirmation dialog text

---

## Special Handling for Cluster-Scoped Resources

For **PriorityClassesPage** and **RuntimeClassesPage**:

1. **Remove namespace filter logic** from sortedData useMemo
2. **Key function:** `const get{Resource}Key = (resource: {Resource}) => resource.name;`
3. **API endpoints:** No namespace in URL
4. **Delete handler:** Only split on name, no namespace
5. **Columns:** Remove "Namespace" column

---

## Success Messages by Resource

- ConfigMap: `'ConfigMap updated successfully'`
- Secret: `'Secret updated successfully'`
- ResourceQuota: `'ResourceQuota updated successfully'`
- LimitRange: `'LimitRange updated successfully'`
- HPA: `'HPA updated successfully'`
- PDB: `'PDB updated successfully'`
- Lease: `'Lease updated successfully'`
- PriorityClass: `'PriorityClass updated successfully'`
- RuntimeClass: `'RuntimeClass updated successfully'`

---

## Testing Checklist (per page)

After implementing each page:

- [ ] No TypeScript compilation errors
- [ ] Page loads without crashing
- [ ] Click row → detail panel opens
- [ ] Click Edit YAML → YAML drawer appears
- [ ] YAML loads properly
- [ ] Edit and Save → success message
- [ ] Delete icon → confirmation dialog
- [ ] Confirm delete → resource removed
- [ ] Multi-select → toolbar appears
- [ ] Bulk delete works

---

## Order of Implementation (Suggested)

1. ✅ ConfigMapsPage - COMPLETED
2. SecretsPage (similar to ConfigMaps)
3. ResourceQuotasPage
4. LimitRangesPage
5. HPAPage
6. PDBPage
7. LeasesPage
8. PriorityClassesPage (cluster-scoped)
9. RuntimeClassesPage (cluster-scoped)

---

## RBAC Update Required

After all pages are implemented, update `helm/pertisk-kube/values.yaml`:

```yaml
# Add to rbac.rules array:

# Configuration resources
- apiGroups: [""]
  resources: ["configmaps", "secrets", "resourcequotas", "limitranges"]
  verbs: ["get", "list", "watch", "update", "patch", "delete"]

# Autoscaling
- apiGroups: ["autoscaling"]
  resources: ["horizontalpodautoscalers"]
  verbs: ["get", "list", "watch", "update", "patch", "delete"]

# Policy
- apiGroups: ["policy"]
  resources: ["poddisruptionbudgets"]
  verbs: ["get", "list", "watch", "update", "patch", "delete"]

# Scheduling
- apiGroups: ["scheduling.k8s.io"]
  resources: ["priorityclasses"]
  verbs: ["get", "list", "watch", "update", "patch", "delete"]

# Node
- apiGroups: ["node.k8s.io"]
  resources: ["runtimeclasses"]
  verbs: ["get", "list", "watch", "update", "patch", "delete"]

# Coordination
- apiGroups: ["coordination.k8s.io"]
  resources: ["leases"]
  verbs: ["get", "list", "watch", "update", "patch", "delete"]
```
