#!/usr/bin/env python3
"""
Refactor all YAML-drawer pages to route through global BottomPanel via openPanelTab().
Run from: frontend/  (i.e. python3 refactor_pages.py)
"""
import os, re, sys

PAGES_DIR = "src/pages"

# ---------------------------------------------------------------------------
# Per-page configuration
# ---------------------------------------------------------------------------
# url uses {arg}.name and {arg}.namespace placeholders (replaced below)
PAGES = [
    dict(file="ClusterRoleBindingsPage.tsx", arg="item", type="ClusterRoleBinding",
         url="`/api/clusterrolebindings/${encodeURIComponent(item.name)}/yaml`",
         sanitize="sanitizeYamlForEdit"),
    dict(file="ClusterRolesPage.tsx", arg="item", type="ClusterRole",
         url="`/api/clusterroles/${encodeURIComponent(item.name)}/yaml`",
         sanitize="sanitizeYamlForEdit"),
    dict(file="ConfigMapsPage.tsx", arg="configMap", type="ConfigMap",
         url="`/api/configmaps/${encodeURIComponent(configMap.namespace)}/${encodeURIComponent(configMap.name)}/yaml`",
         sanitize="sanitizeConfigMapYamlForEdit"),
    dict(file="CronJobsPage.tsx", arg="cronJob", type="CronJob",
         url="`/api/cronjobs/${encodeURIComponent(cronJob.namespace)}/${encodeURIComponent(cronJob.name)}/yaml`",
         sanitize="sanitizeCronJobYamlForEdit"),
    dict(file="DaemonSetsPage.tsx", arg="daemonSet", type="DaemonSet",
         url="`/api/daemonsets/${encodeURIComponent(daemonSet.namespace)}/${encodeURIComponent(daemonSet.name)}/yaml`",
         sanitize="sanitizeDaemonSetYamlForEdit"),
    dict(file="DeploymentsPage.tsx", arg="deployment", type="Deployment",
         url="`/api/deployments/${encodeURIComponent(deployment.namespace)}/${encodeURIComponent(deployment.name)}/yaml`",
         sanitize="sanitizeDeploymentYamlForEdit"),
    dict(file="EndpointsPage.tsx", arg="item", type="Endpoint",
         url="`/api/endpoints/${encodeURIComponent(item.namespace)}/${encodeURIComponent(item.name)}/yaml`",
         sanitize="sanitizeYamlForEdit"),
    dict(file="HPAPage.tsx", arg="hpa", type="HPA",
         url="`/api/hpa/${encodeURIComponent(hpa.namespace)}/${encodeURIComponent(hpa.name)}/yaml`",
         sanitize="sanitizeHPAYamlForEdit"),
    dict(file="IngressClassesPage.tsx", arg="item", type="IngressClass",
         url="`/api/ingressclasses/${encodeURIComponent(item.name)}/yaml`",
         sanitize="sanitizeYamlForEdit"),
    dict(file="IngressesPage.tsx", arg="item", type="Ingress",
         url="`/api/ingresses/${encodeURIComponent(item.namespace)}/${encodeURIComponent(item.name)}/yaml`",
         sanitize="sanitizeYamlForEdit"),
    dict(file="JobsPage.tsx", arg="job", type="Job",
         url="`/api/jobs/${encodeURIComponent(job.namespace)}/${encodeURIComponent(job.name)}/yaml`",
         sanitize="sanitizeJobYamlForEdit"),
    dict(file="LimitRangesPage.tsx", arg="limitRange", type="LimitRange",
         url="`/api/limitranges/${encodeURIComponent(limitRange.namespace)}/${encodeURIComponent(limitRange.name)}/yaml`",
         sanitize="sanitizeLimitRangeYamlForEdit"),
    dict(file="NetworkPoliciesPage.tsx", arg="item", type="NetworkPolicy",
         url="`/api/networkpolicies/${encodeURIComponent(item.namespace)}/${encodeURIComponent(item.name)}/yaml`",
         sanitize="sanitizeYamlForEdit"),
    dict(file="PDBPage.tsx", arg="pdb", type="PDB",
         url="`/api/pdb/${encodeURIComponent(pdb.namespace)}/${encodeURIComponent(pdb.name)}/yaml`",
         sanitize="sanitizePDBYamlForEdit"),
    dict(file="PersistentVolumeClaimsPage.tsx", arg="item", type="PersistentVolumeClaim",
         url="`/api/persistentvolumeclaims/${encodeURIComponent(item.namespace)}/${encodeURIComponent(item.name)}/yaml`",
         sanitize="sanitizeYamlForEdit"),
    dict(file="PersistentVolumesPage.tsx", arg="item", type="PersistentVolume",
         url="`/api/persistentvolumes/${encodeURIComponent(item.name)}/yaml`",
         sanitize="sanitizeYamlForEdit"),
    dict(file="ReplicaSetsPage.tsx", arg="replicaSet", type="ReplicaSet",
         url="`/api/replicasets/${encodeURIComponent(replicaSet.namespace)}/${encodeURIComponent(replicaSet.name)}/yaml`",
         sanitize="sanitizeReplicaSetYamlForEdit"),
    dict(file="ResourceQuotasPage.tsx", arg="resourceQuota", type="ResourceQuota",
         url="`/api/resourcequotas/${encodeURIComponent(resourceQuota.namespace)}/${encodeURIComponent(resourceQuota.name)}/yaml`",
         sanitize="sanitizeResourceQuotaYamlForEdit"),
    dict(file="RoleBindingsPage.tsx", arg="item", type="RoleBinding",
         url="`/api/rolebindings/${encodeURIComponent(item.namespace)}/${encodeURIComponent(item.name)}/yaml`",
         sanitize="sanitizeYamlForEdit"),
    dict(file="RolesPage.tsx", arg="item", type="Role",
         url="`/api/roles/${encodeURIComponent(item.namespace)}/${encodeURIComponent(item.name)}/yaml`",
         sanitize="sanitizeYamlForEdit"),
    dict(file="SecretsPage.tsx", arg="secret", type="Secret",
         url="`/api/secrets/${encodeURIComponent(secret.namespace)}/${encodeURIComponent(secret.name)}/yaml`",
         sanitize="sanitizeSecretYamlForEdit"),
    dict(file="ServiceAccountsPage.tsx", arg="item", type="ServiceAccount",
         url="`/api/serviceaccounts/${encodeURIComponent(item.namespace)}/${encodeURIComponent(item.name)}/yaml`",
         sanitize="sanitizeYamlForEdit"),
    dict(file="ServicesPage.tsx", arg="item", type="Service",
         url="`/api/services/${encodeURIComponent(item.namespace)}/${encodeURIComponent(item.name)}/yaml`",
         sanitize="sanitizeYamlForEdit"),
    dict(file="StatefulSetsPage.tsx", arg="statefulSet", type="StatefulSet",
         url="`/api/statefulsets/${encodeURIComponent(statefulSet.namespace)}/${encodeURIComponent(statefulSet.name)}/yaml`",
         sanitize="sanitizeStatefulSetYamlForEdit"),
    dict(file="StorageClassesPage.tsx", arg="item", type="StorageClass",
         url="`/api/storageclasses/${encodeURIComponent(item.name)}/yaml`",
         sanitize="sanitizeYamlForEdit"),
]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def remove_lines_matching(content: str, patterns: list[str]) -> str:
    """Remove specific whole lines containing any of the given string patterns."""
    lines = content.split("\n")
    result = []
    for line in lines:
        if any(p in line for p in patterns):
            continue
        result.append(line)
    return "\n".join(result)


def remove_block(content: str, start_marker: str, end_marker: str = "\n  };\n") -> tuple[str, bool]:
    """
    Remove a block from start_marker to the first occurrence of end_marker after it.
    Returns (new_content, was_found).
    """
    idx = content.find(start_marker)
    if idx == -1:
        return content, False
    end_idx = content.find(end_marker, idx)
    if end_idx == -1:
        return content, False
    return content[:idx] + content[end_idx + len(end_marker):], True


def remove_all_blocks(content: str, start_marker: str, end_marker: str = "\n  };\n") -> str:
    """Remove all occurrences of blocks starting with start_marker."""
    while True:
        content, found = remove_block(content, start_marker, end_marker)
        if not found:
            break
    return content


def remove_jsx_block(content: str, start_marker: str) -> tuple[str, bool]:
    """
    Remove a JSX conditional block starting at start_marker.
    Counts curly braces to find the end of the block.
    The block starts at start_marker (must start with '{') and ends when
    the opening brace is balanced.
    """
    idx = content.find(start_marker)
    if idx == -1:
        return content, False

    # start_marker must start with '{' logically; find the actual '{' at idx
    depth = 0
    pos = idx
    started = False
    while pos < len(content):
        ch = content[pos]
        if ch == '{':
            depth += 1
            started = True
        elif ch == '}':
            depth -= 1
            if started and depth == 0:
                pos += 1
                # Skip optional whitespace / newlines after closing }
                while pos < len(content) and content[pos] in ' \n':
                    pos += 1
                break
        pos += 1

    removed_len = pos - idx
    if removed_len < 10:
        return content, False  # Safety: something went wrong

    print(f"    Removed JSX block starting '{start_marker[:50].strip()}' ({removed_len} chars)")
    return content[:idx] + content[pos:], True


def remove_style_paddingbottom(content: str) -> str:
    """
    Remove the style={{paddingBottom: ...}} attribute from the wrapper div.
    Works for both single-line and multi-line style attributes.
    """
    # Try to find and remove style={{ paddingBottom: ... yamlTabs ... }}
    # Pattern: 'style={{\n...paddingBottom...\n      }}' (multi-line)
    # or: 'style={{ paddingBottom: ...' (single-line)

    # Multi-line: find 'style={{\n' followed eventually by paddingBottom and closing '}}'
    idx = content.find("\n        style={{\n")
    if idx != -1:
        end = content.find("\n        }}\n", idx)
        if end != -1 and "paddingBottom" in content[idx:end]:
            content = content[:idx] + content[end + len("\n        }}\n") - 1:]
            print("    Removed multi-line style paddingBottom")
            return content

    # Single-line: style={{ paddingBottom: yamlTabs...
    pattern = re.compile(r'\s+style=\{\{\s*paddingBottom:[^}]+\}\}')
    m = pattern.search(content)
    if m:
        # Verify it's yaml-related
        if "yamlTabs" in m.group() or "yaml" in m.group().lower():
            content = content[:m.start()] + content[m.end():]
            print("    Removed single-line style paddingBottom")
    return content


def add_import_openpaneltab(content: str) -> str:
    """Add openPanelTab import if not already present."""
    if "from '../components/BottomPanel'" in content:
        return content
    # Find the last import line
    lines = content.split("\n")
    last_import = -1
    for i, line in enumerate(lines):
        if line.startswith("import "):
            last_import = i
    if last_import >= 0:
        lines.insert(last_import + 1, "import { openPanelTab } from '../components/BottomPanel';")
        print("    Added openPanelTab import")
    return "\n".join(lines)


def remove_ace_imports(content: str) -> str:
    """Remove AceEditor and ace-builds imports (always safe)."""
    for imp in [
        "import 'ace-builds/src-noconflict/mode-yaml';",
        "import 'ace-builds/src-noconflict/theme-github';",
        "import 'ace-builds/src-noconflict/theme-tomorrow_night';",
        "import AceEditor from 'react-ace';",
    ]:
        content = content.replace(imp + "\n", "")
    return content


def remove_unused_imports(content: str) -> str:
    """Remove useRef and useTheme if no longer used (call AFTER all code changes)."""
    # Remove useRef from react import if no longer used
    non_import = "\n".join(l for l in content.split("\n") if not l.startswith("import "))
    if "useRef" not in non_import:
        content = re.sub(r",\s*useRef\b", "", content)
        content = re.sub(r"\buseRef\s*,\s*", "", content)
        print("    Removed useRef from imports")

    # Remove `const theme = useTheme()` line if theme is no longer used
    non_import2 = "\n".join(l for l in content.split("\n") if not l.strip().startswith("import "))
    if "useTheme" in non_import2:
        # Check if theme variable is still referenced (outside of the useTheme call itself)
        theme_usage = re.sub(r"const theme = useTheme\(\);", "", non_import2)
        if not re.search(r"\btheme\b", theme_usage):
            # Remove the `const theme = useTheme()` line
            content = re.sub(r"  const theme = useTheme\(\);\n", "", content)
            # Remove the useTheme import line
            content = re.sub(r"import \{ useTheme \} from '[^']+';\n", "", content)
            print("    Removed useTheme + const theme")

    return content


def remove_state_vars(content: str) -> str:
    """Remove all YAML drawer state variable declarations."""
    # Single-line state var patterns
    single_line_patterns = [
        r"  const \[yamlTabs, setYamlTabs\] = useState[^;]+;\n",
        r"  const \[activeYamlTabKey, setActiveYamlTabKey\] = useState[^;]+;\n",
        r"  const \[yamlDrawerVisible, setYamlDrawerVisible\] = useState[^;]+;\n",
        r"  const \[yamlDrawerHeightPx, setYamlDrawerHeightPx\] = useState[^;]+;\n",
        r"  const \[isResizingYamlDrawer, setIsResizingYamlDrawer\] = useState[^;]+;\n",
        r"  const resizeStartYRef = useRef[^;]+;\n",
        r"  const resizeStartHeightRef = useRef[^;]+;\n",
        r"  const \[yamlContentsByTab, setYamlContentsByTab\] = useState[^;]+;\n",
        r"  const \[yamlLoadingTabKey, setYamlLoadingTabKey\] = useState[^;]+;\n",
        r"  const \[yamlSavingTabKey, setYamlSavingTabKey\] = useState[^;]+;\n",
        r"  const \[yamlErrorByTab, setYamlErrorByTab\] = useState[^;]+;\n",
        r"  const \[yamlSuccessByTab, setYamlSuccessByTab\] = useState[^;]+;\n",
    ]
    for pat in single_line_patterns:
        content = re.sub(pat, "", content)

    # Remove activeYaml* useMemo (multi-line or single-line)
    content = re.sub(
        r"  const activeYaml\w+ = useMemo\([^\)]+\)\s*,\s*\[[^\]]*\]\s*\);\n",
        "",
        content,
        flags=re.DOTALL,
    )

    # Also handle `useMemo(() => { ... }, [deps]);` multi-statement form
    # Find 'const activeYaml' ... to closing ');'
    while True:
        m = re.search(r"\n  const activeYaml\w+ = useMemo\(", content)
        if not m:
            break
        # Find the matching ');' at depth 0
        start = m.start() + 1  # skip the leading \n
        pos = m.end()
        depth = 1  # we're inside useMemo(
        while pos < len(content) and depth > 0:
            if content[pos] == '(':
                depth += 1
            elif content[pos] == ')':
                depth -= 1
            pos += 1
        # pos now points right after the closing ')' of useMemo(...)
        # skip optional ';' and '\n'
        while pos < len(content) and content[pos] in ';\n':
            pos += 1
        content = content[:start] + content[pos:]
        print("    Removed activeYaml* useMemo")

    return content


def remove_yaml_useeffects(content: str) -> str:
    """
    Remove useEffects that deal with yaml state:
    - The one syncing yamlTabs with data
    - The one loading YAML when activeYaml* changes
    - The resize useEffect
    """
    # These all follow: useEffect(() => { ... }, [deps]);
    # We identify them by their dep arrays or body content

    def find_and_remove_useeffect(content, body_signature):
        """Find a useEffect containing body_signature and remove it."""
        idx = content.find(body_signature)
        if idx == -1:
            return content, False
        # Walk backwards to find the 'useEffect(' opening
        start = content.rfind("  useEffect(", 0, idx)
        if start == -1:
            return content, False
        # Walk forward to find balanced closing ');' of useEffect(()=>{},[])
        pos = start + len("  useEffect(")
        depth = 1
        while pos < len(content) and depth > 0:
            if content[pos] == '(':
                depth += 1
            elif content[pos] == ')':
                depth -= 1
            pos += 1
        # Skip ';' and newlines
        while pos < len(content) and content[pos] in ';\n':
            pos += 1
        removed = content[start:pos]
        print(f"    Removed useEffect ({len(removed)} chars, containing '{body_signature[:40]}')")
        return content[:start] + content[pos:], True

    # Remove the resize useEffect
    content, _ = find_and_remove_useeffect(content, "isResizingYamlDrawer")

    # Remove the YAML-loading useEffect (references activeYamlTabKey and fetch)
    content, _ = find_and_remove_useeffect(content, "yamlContentsByTab[activeYamlTabKey] !== undefined")

    # Remove the yamlTabs sync useEffect
    content, _ = find_and_remove_useeffect(content, "setYamlTabs((previousTabs)")
    content, _ = find_and_remove_useeffect(content, "setYamlTabs((p)")
    content, _ = find_and_remove_useeffect(content, "previousTabs\n        .map")

    # Also handle the data-sync useEffect (checks yamlTabs.length)
    content, _ = find_and_remove_useeffect(content, "data, yamlTabs.length")

    return content


def remove_helper_functions(content: str) -> str:
    """Remove handleCloseYamlEditor, handleCloseYamlTab, handleStartYamlDrawerResize, handleSaveYaml, handleVerifyYaml."""
    funcs_to_remove = [
        "  const handleCloseYamlEditor = ",
        "  const handleCloseYamlTab = ",
        "  const handleStartYamlDrawerResize = ",
        "  const handleSaveYaml = ",
        "  const handleVerifyYaml = ",
    ]
    for func_start in funcs_to_remove:
        content, found = remove_block(content, func_start, "\n  };\n")
        if found:
            print(f"    Removed {func_start.strip()[:40]}")
        else:
            # Try inline version (arrow function on one line ending with }; on same line)
            # Find the line and remove it
            lines = content.split("\n")
            new_lines = []
            skip = False
            for line in lines:
                if skip:
                    if line.strip() == "};":
                        skip = False
                    continue
                if line.startswith(func_start):
                    if line.rstrip().endswith("};"):
                        print(f"    Removed inline {func_start.strip()[:40]}")
                        continue
                    else:
                        skip = True
                        print(f"    Removed multi-line {func_start.strip()[:40]}")
                        continue
                new_lines.append(line)
            if skip:
                # Handle case where we didn't find closing }; properly
                pass
            content = "\n".join(new_lines)
    return content


def replace_handler(content: str, cfg: dict) -> str:
    """Replace handleOpenYamlEditorFromPanel with async openPanelTab version."""
    arg = cfg["arg"]
    typ = cfg["type"]
    url = cfg["url"]
    sanitize = cfg["sanitize"]

    new_handler = f"""  const handleOpenYamlEditorFromPanel = async ({arg}: {typ}) => {{
    setPanelOpen(false);
    try {{
      const token = getAuthToken();
      const res = await fetch({url}, {{
        headers: token ? {{ Authorization: token }} : {{}},
      }});
      if (!res.ok) throw new Error(`Failed to load YAML: ${{res.statusText}}`);
      const yaml = await res.text();
      openPanelTab({{ type: 'yaml-editor', yamlContent: {sanitize}(yaml) }});
    }} catch {{
      openPanelTab({{ type: 'yaml-editor' }});
    }}
  }};"""

    # Find the old handler from '  const handleOpenYamlEditorFromPanel = ' to '  };'
    start_marker = "  const handleOpenYamlEditorFromPanel = "
    idx = content.find(start_marker)
    if idx == -1:
        print("    WARNING: handleOpenYamlEditorFromPanel not found!")
        return content

    end_marker = "\n  };\n"
    end_idx = content.find(end_marker, idx)
    if end_idx == -1:
        print("    WARNING: could not find end of handleOpenYamlEditorFromPanel!")
        return content

    old_handler = content[idx:end_idx + len(end_marker)]
    content = content[:idx] + new_handler + "\n\n" + content[end_idx + len(end_marker):]
    print(f"    Replaced handleOpenYamlEditorFromPanel ({len(old_handler)} -> {len(new_handler)} chars)")
    return content


def remove_drawer_jsx(content: str) -> str:
    """Remove the two yamlTabs-conditional drawer sections from JSX."""
    # Remove style={{ paddingBottom: ... }} from wrapper div
    content = remove_style_paddingbottom(content)

    # Remove the first section: {yamlTabs.length > 0 && !yamlDrawerVisible && (
    content, _ = remove_jsx_block(content, "{yamlTabs.length > 0 && !yamlDrawerVisible && (")

    # Remove the second section: {yamlTabs.length > 0 && yamlDrawerVisible && ...
    content, _ = remove_jsx_block(content, "{yamlTabs.length > 0 && yamlDrawerVisible && ")

    return content


def check_getdeploymentkey_etc(content: str) -> str:
    """
    Some pages have a helper function like getDeploymentKey, getTabKey, etc.
    Remove them if they're no longer referenced (they were only used in the drawer).
    """
    # Find all `const get*Key = ` functions that are only used in removed code
    # A safe heuristic: if getXxxKey appears only in the removed sections, remove the function too
    helper_pattern = re.compile(r"  const get\w+Key = [^\n]+;\n")
    for m in helper_pattern.finditer(content):
        func_name = re.search(r"const (\w+) =", m.group()).group(1)
        # Count occurrences outside the definition
        rest = content[:m.start()] + content[m.end():]
        if func_name not in rest:
            content = content[:m.start()] + content[m.end():]
            print(f"    Removed unused helper {func_name}")
    return content


def remove_getcomponent_key(content: str) -> str:
    """Remove getDeploymentKey and similar helper functions that are no longer used."""
    # Remove `const getXxxKey = ...` single-line helpers
    keys_pattern = re.compile(r"\n  const get\w+Key = \([^)]*\)[^;]+;\n")
    for m in list(keys_pattern.finditer(content)):
        func_name = re.search(r"const (\w+) =", m.group()).group(1)
        context_without_def = content[:m.start()] + content[m.end():]
        if func_name not in context_without_def:
            content = content[:m.start()] + content[m.end():]
            print(f"    Removed unused {func_name}")
    return content


def clean_double_blank_lines(content: str) -> str:
    """Collapse 3+ consecutive blank lines into 2."""
    content = re.sub(r"\n{4,}", "\n\n\n", content)
    return content


# ---------------------------------------------------------------------------
# Main processing
# ---------------------------------------------------------------------------

def process_page(cfg: dict) -> bool:
    filepath = os.path.join(PAGES_DIR, cfg["file"])
    if not os.path.exists(filepath):
        print(f"  SKIP: {cfg['file']} not found")
        return False

    with open(filepath, "r") as f:
        original = f.read()

    if "fixed bottom-0" not in original:
        print(f"  SKIP: {cfg['file']} already refactored")
        return False

    print(f"\nProcessing {cfg['file']}...")
    content = original

    # 1. Remove ace imports (always safe)
    content = remove_ace_imports(content)

    # 2. Remove YAML drawer state vars
    content = remove_state_vars(content)

    # 3. Remove YAML useEffects
    content = remove_yaml_useeffects(content)

    # 4. Replace handleOpenYamlEditorFromPanel with async version
    content = replace_handler(content, cfg)

    # 5. Remove helper functions (after handler replacement so we don't accidentally
    #    remove what the new handler references)
    content = remove_helper_functions(content)

    # 6. Remove drawer JSX sections
    content = remove_drawer_jsx(content)

    # 7. Add openPanelTab import
    content = add_import_openpaneltab(content)

    # 8. Remove unused imports (useRef, useTheme) - must run AFTER code changes
    content = remove_unused_imports(content)

    # 9. Remove unused key helpers
    content = remove_getcomponent_key(content)

    # 10. Clean up whitespace
    content = clean_double_blank_lines(content)

    if content == original:
        print(f"  No changes made (unexpected).")
        return False

    with open(filepath, "w") as f:
        f.write(content)

    print(f"  Saved: {cfg['file']}")
    return True


def main():
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    changed = []
    failed = []

    target = sys.argv[1] if len(sys.argv) > 1 else None

    for cfg in PAGES:
        if target and cfg["file"] != target:
            continue
        try:
            if process_page(cfg):
                changed.append(cfg["file"])
        except Exception as e:
            print(f"  ERROR in {cfg['file']}: {e}")
            import traceback; traceback.print_exc()
            failed.append(cfg["file"])

    print(f"\n\nSummary: {len(changed)} changed, {len(failed)} errors")
    for f in changed:
        print(f"  ✓ {f}")
    for f in failed:
        print(f"  ✗ {f}")


if __name__ == "__main__":
    main()
