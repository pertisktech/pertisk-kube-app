import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { CSSProperties } from 'react';
import AceEditor from 'react-ace';
import 'ace-builds/src-noconflict/mode-yaml';
import 'ace-builds/src-noconflict/theme-github';
import 'ace-builds/src-noconflict/theme-tomorrow_night';
import {
  ArrowDown,
  Circle,
  ChevronDown,
  ChevronUp,
  Dot,
  FileText,
  Loader,
  Maximize2,
  Minimize2,
  Plus,
  RotateCw,
  ScrollText,
  Server,
  Terminal,
  Upload,
  X,
} from './Icons';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import YAML from 'yaml';
import { toast } from 'sonner';
import { Terminal as TerminalComponent } from './Terminal';
import { PodFileTransfer } from './PodFileTransfer';
import { getHelmChartReadme, getHelmChartValues, getHelmReleaseValues, installHelmChart, useHelmChartVersions, useNamespaces, useNodes, usePods } from '../hooks/useKubernetes';
import { getAuthToken } from '../utils/auth';
import { isDesktopRuntime } from '../utils/desktopBridge';
import { cn } from '../utils';
import { Checkbox } from './Checkbox';
import { useTheme } from '../context/ThemeContext';
import { useFeatureSettings } from '../context/FeatureSettingsContext';

// ── Types ────────────────────────────────────────────────────────────────────

export type PanelTabType = 'pod-exec' | 'pod-files' | 'node-exec' | 'logs' | 'yaml-editor' | 'host-shell' | 'install-chart';

export interface OpenPanelTabOptions {
  type: PanelTabType;
  podName?: string;
  namespace?: string;
  containerName?: string;
  initialCommand?: string;
  yamlContent?: string;
  title?: string;
  yamlActionLabel?: 'Apply' | 'Upgrade';
  helmReleaseName?: string;
  helmReleaseNamespace?: string;
  /** For type 'install-chart': chart to install (opens bottom tab like Freelens) */
  installChart?: {
    name: string;
    repository: string;
    version: string;
    repository_url: string;
    /** Existing release info for upgrade flow (pre-fills namespace/releaseName/values) */
    existingRelease?: { namespace: string; releaseName: string };
  };
}

/** Open a tab in the bottom panel from anywhere in the app */
export const openPanelTab = (opts: OpenPanelTabOptions) => {
  window.dispatchEvent(new CustomEvent('panel:open', { detail: opts }));
};

interface TabTarget {
  namespace: string;
  podName: string;
  containerName?: string;
}

interface PanelTab {
  id: string;
  type: PanelTabType;
  identity?: string;
  label: string;
  target?: TabTarget;
  initialCommand?: string;
  yamlContent?: string;
  yamlSavedContent?: string;
  yamlDirty?: boolean;
  title?: string;
  yamlActionLabel?: 'Apply' | 'Upgrade';
  helmReleaseName?: string;
  helmReleaseNamespace?: string;
  installChart?: {
    name: string;
    repository: string;
    version: string;
    repository_url: string;
    existingRelease?: { namespace: string; releaseName: string };
  };
}

/** Default Values content for Helm install tab — loaded so user can edit before install */
const HELM_DEFAULT_VALUES = [
  '# Helm values (YAML)',
  '# Add custom values for the chart below.',
  '{}',
  '',
].join('\n');

const DEFAULT_YAML = `apiVersion: apps/v1
kind: Deployment
metadata:
  name: my-app
  namespace: default
spec:
  replicas: 1
  selector:
    matchLabels:
      app: my-app
  template:
    metadata:
      labels:
        app: my-app
    spec:
      containers:
        - name: app
          image: nginx:latest
`;

type YamlKindTemplate = {
  key: string;
  label: string;
  template: string;
};

const YAML_KIND_TEMPLATES: YamlKindTemplate[] = [
  {
    key: 'ConfigMap',
    label: 'ConfigMap',
    template: `apiVersion: v1
kind: ConfigMap
metadata:
  name: example-config
  namespace: default
data:
  key: value
`,
  },
  {
    key: 'Secret',
    label: 'Secret',
    template: `apiVersion: v1
kind: Secret
metadata:
  name: example-secret
  namespace: default
type: Opaque
stringData:
  username: admin
  password: change-me
`,
  },
  {
    key: 'Service',
    label: 'Service',
    template: `apiVersion: v1
kind: Service
metadata:
  name: my-service
  namespace: default
spec:
  selector:
    app: my-app
  ports:
    - port: 80
      targetPort: 80
`,
  },
  {
    key: 'PersistentVolumeClaim',
    label: 'PersistentVolumeClaim',
    template: `apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: my-pvc
  namespace: default
spec:
  accessModes:
    - ReadWriteOnce
  resources:
    requests:
      storage: 1Gi
`,
  },
  {
    key: 'Deployment',
    label: 'Deployment',
    template: DEFAULT_YAML,
  },
  {
    key: 'StatefulSet',
    label: 'StatefulSet',
    template: `apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: my-statefulset
  namespace: default
spec:
  serviceName: my-statefulset
  replicas: 1
  selector:
    matchLabels:
      app: my-statefulset
  template:
    metadata:
      labels:
        app: my-statefulset
    spec:
      containers:
        - name: app
          image: nginx:latest
`,
  },
  {
    key: 'DaemonSet',
    label: 'DaemonSet',
    template: `apiVersion: apps/v1
kind: DaemonSet
metadata:
  name: my-daemonset
  namespace: default
spec:
  selector:
    matchLabels:
      app: my-daemonset
  template:
    metadata:
      labels:
        app: my-daemonset
    spec:
      containers:
        - name: app
          image: nginx:latest
`,
  },
  {
    key: 'Job',
    label: 'Job',
    template: `apiVersion: batch/v1
kind: Job
metadata:
  name: my-job
  namespace: default
spec:
  template:
    spec:
      restartPolicy: Never
      containers:
        - name: app
          image: busybox
          command: ["sh", "-c", "echo hello"]
`,
  },
  {
    key: 'CronJob',
    label: 'CronJob',
    template: `apiVersion: batch/v1
kind: CronJob
metadata:
  name: my-cronjob
  namespace: default
spec:
  schedule: "0 * * * *"
  jobTemplate:
    spec:
      template:
        spec:
          restartPolicy: Never
          containers:
            - name: app
              image: busybox
              command: ["sh", "-c", "date"]
`,
  },
  {
    key: 'Ingress',
    label: 'Ingress',
    template: `apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: my-ingress
  namespace: default
spec:
  rules:
    - host: example.local
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: my-service
                port:
                  number: 80
`,
  },
  {
    key: 'NetworkPolicy',
    label: 'NetworkPolicy',
    template: `apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: default-deny
  namespace: default
spec:
  podSelector: {}
  policyTypes:
    - Ingress
    - Egress
`,
  },
  {
    key: 'HorizontalPodAutoscaler',
    label: 'HorizontalPodAutoscaler',
    template: `apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: my-app-hpa
  namespace: default
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: my-app
  minReplicas: 1
  maxReplicas: 3
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70
`,
  },
  {
    key: 'PodDisruptionBudget',
    label: 'PodDisruptionBudget',
    template: `apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: my-app-pdb
  namespace: default
spec:
  minAvailable: 1
  selector:
    matchLabels:
      app: my-app
`,
  },
  {
    key: 'Role',
    label: 'Role',
    template: `apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: app-reader
  namespace: default
rules:
  - apiGroups: [""]
    resources: ["pods"]
    verbs: ["get", "list", "watch"]
`,
  },
  {
    key: 'RoleBinding',
    label: 'RoleBinding',
    template: `apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: app-reader-binding
  namespace: default
subjects:
  - kind: ServiceAccount
    name: default
    namespace: default
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: Role
  name: app-reader
`,
  },
  {
    key: 'ClusterRole',
    label: 'ClusterRole',
    template: `apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: app-cluster-reader
rules:
  - apiGroups: [""]
    resources: ["nodes", "namespaces"]
    verbs: ["get", "list", "watch"]
`,
  },
  {
    key: 'ClusterRoleBinding',
    label: 'ClusterRoleBinding',
    template: `apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: app-cluster-reader-binding
subjects:
  - kind: ServiceAccount
    name: default
    namespace: default
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: ClusterRole
  name: app-cluster-reader
`,
  },
  {
    key: 'StorageClass',
    label: 'StorageClass',
    template: `apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: example-storage
provisioner: kubernetes.io/no-provisioner
volumeBindingMode: WaitForFirstConsumer
`,
  },
  {
    key: 'PriorityClass',
    label: 'PriorityClass',
    template: `apiVersion: scheduling.k8s.io/v1
kind: PriorityClass
metadata:
  name: high-priority
value: 100000
globalDefault: false
description: "Priority class for critical workloads"
`,
  },
];

const LABEL_MAP: Record<PanelTabType, string> = {
  'host-shell': 'Terminal',
  'pod-exec': 'Pod Shell',
  'pod-files': 'Pod Files',
  'node-exec': 'Node Shell',
  logs: 'Logs',
  'yaml-editor': 'YAML',
  'install-chart': 'Helm Install',
};

const splitYamlDocuments = (yamlText: string): string[] => {
  const normalized = yamlText.split('\r\n').join('\n').trim();
  if (!normalized) return [];
  const docs = normalized
    .split(/^\s*---\s*$/m)
    .map((doc: string) => doc.trim())
    .filter(Boolean);
  return docs.length > 0 ? docs : [normalized];
};

const toFilenamePart = (value: string): string => {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalized || 'resource';
};

const inferYamlFilename = (yamlText: string, fallbackTitle?: string): string => {
  const fallbackBase = toFilenamePart(fallbackTitle ?? 'manifest');

  try {
    const [firstDoc] = splitYamlDocuments(yamlText);
    if (!firstDoc) return `${fallbackBase}.yaml`;

    const parsed = YAML.parse(firstDoc) as Record<string, unknown> | null;
    if (!parsed || typeof parsed !== 'object') return `${fallbackBase}.yaml`;

    const kind = typeof parsed.kind === 'string' ? toFilenamePart(parsed.kind) : '';
    const metadata = parsed.metadata as Record<string, unknown> | undefined;
    const name = typeof metadata?.name === 'string' ? toFilenamePart(metadata.name) : '';
    const namespace = typeof metadata?.namespace === 'string' ? toFilenamePart(metadata.namespace) : '';

    const base = [kind, name, namespace].filter(Boolean).join('_');
    return `${base || fallbackBase}.yaml`;
  } catch {
    return `${fallbackBase}.yaml`;
  }
};

const blobToDataUrl = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read export data.'));
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.readAsDataURL(blob);
  });

const makeTabIdentity = (type: PanelTabType, opts?: Partial<OpenPanelTabOptions>): string | null => {
  if (type === 'yaml-editor') {
    // YAML editor tabs are intentionally always new workspaces.
    return null;
  }

  if (type === 'pod-exec' || type === 'pod-files' || type === 'logs') {
    const ns = opts?.namespace ?? 'default';
    const pod = opts?.podName ?? '';
    if (!pod) return null;
    return `${type}:${ns}:${pod}:${opts?.containerName ?? ''}`;
  }

  if (type === 'node-exec') {
    const node = opts?.podName ?? '';
    if (!node) return null;
    return `${type}:${node}`;
  }

  if (type === 'install-chart' && opts?.installChart) {
    const c = opts.installChart;
    return `${type}:${c.repository_url}:${c.name}:${c.version}`;
  }

  if (type === 'host-shell') {
    const command = opts?.initialCommand?.trim();
    if (command) {
      return `${type}:${command}`;
    }

    const title = opts?.title?.trim();
    if (title) {
      return `${type}:${title}`;
    }

    return type;
  }

  return null;
};

const ADD_OPTIONS: {
  type: PanelTabType;
  label: string;
  icon: React.ElementType;
  description: string;
}[] = [
  { type: 'host-shell',  label: 'Terminal',   icon: Terminal,   description: 'Open a host shell' },
  { type: 'yaml-editor', label: 'New YAML',   icon: FileText,   description: 'Edit & apply a YAML manifest' },
  { type: 'pod-exec',    label: 'Pod Shell',  icon: Terminal,   description: 'Exec into a running pod' },
  { type: 'pod-files',   label: 'Pod Files',  icon: Upload,     description: 'Two-panel local-to-pod file transfer' },
  { type: 'node-exec',   label: 'Node Shell', icon: Server,     description: 'Shell on a Kubernetes node' },
  { type: 'logs',        label: 'Logs',       icon: ScrollText, description: 'Stream logs from a pod' },
];

// ── PodSelector ──────────────────────────────────────────────────────────────

const PodSelector = ({
  title,
  onSelect,
}: {
  title: string;
  onSelect: (namespace: string, podName: string, containerName?: string) => void;
}) => {
  const { data: namespaces } = useNamespaces();
  const { data: pods } = usePods();
  const [selectedNs, setSelectedNs] = useState('');
  const [selectedPod, setSelectedPod] = useState('');

  const nsList = namespaces?.map((ns) => ns.name) ?? [];
  const podList = pods?.filter((p) => !selectedNs || p.namespace === selectedNs) ?? [];

  return (
    <div className="flex flex-col items-center justify-center h-full gap-4 p-6">
      <p className="text-sm text-text-secondary">{title}</p>
      <div className="flex flex-wrap gap-3 items-end">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-text-secondary">Namespace</label>
          <select
            value={selectedNs}
            onChange={(e) => {
              setSelectedNs(e.target.value);
              setSelectedPod('');
            }}
            className="border border-border rounded-lg px-2.5 py-1.5 text-sm bg-bg text-text focus:outline-none focus:border-primary"
          >
            <option value="">All</option>
            {nsList.map((ns) => (
              <option key={ns} value={ns}>
                {ns}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-text-secondary">Pod</label>
          <select
            value={selectedPod}
            onChange={(e) => setSelectedPod(e.target.value)}
            className="border border-border rounded-lg px-2.5 py-1.5 text-sm bg-bg text-text focus:outline-none focus:border-primary"
          >
            <option value="">— select pod —</option>
            {podList.map((p) => (
              <option key={`${p.namespace}/${p.name}`} value={p.name}>
                {p.namespace}/{p.name}
              </option>
            ))}
          </select>
        </div>
        <button
          type="button"
          onClick={() => {
            if (!selectedPod) return;
            const pod = podList.find((p) => p.name === selectedPod);
            onSelect(pod?.namespace ?? selectedNs, selectedPod, undefined);
          }}
          disabled={!selectedPod}
          className="px-4 py-1.5 rounded-lg bg-primary text-bg text-sm font-medium disabled:opacity-40 hover:opacity-90 transition-opacity"
        >
          Connect
        </button>
      </div>
    </div>
  );
};

// ── NodeSelector ─────────────────────────────────────────────────────────────

const NodeSelector = ({ onSelect }: { onSelect: (nodeName: string) => void }) => {
  const { data: nodes } = useNodes();
  const [selected, setSelected] = useState('');
  const nodeList = nodes ?? [];

  return (
    <div className="flex flex-col items-center justify-center h-full gap-4 p-6">
      <p className="text-sm text-text-secondary">Select a node to open a shell</p>
      <div className="flex flex-wrap gap-3 items-end">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-text-secondary">Node</label>
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            className="border border-border rounded-lg px-2.5 py-1.5 text-sm bg-bg text-text focus:outline-none focus:border-primary"
          >
            <option value="">— select node —</option>
            {nodeList.map((n) => (
              <option key={n.name} value={n.name}>
                {n.name}
              </option>
            ))}
          </select>
        </div>
        <button
          type="button"
          onClick={() => {
            if (selected) onSelect(selected);
          }}
          disabled={!selected}
          className="px-4 py-1.5 rounded-lg bg-primary text-bg text-sm font-medium disabled:opacity-40 hover:opacity-90 transition-opacity"
        >
          Connect
        </button>
      </div>
    </div>
  );
};

// ── InstallChartTab (Freelens-style: controls + Values editor + Install button) ──

type InstallChartSubTab = 'values' | 'readme';

const InstallChartTabContent = ({
  chart,
  onInstallSuccess,
}: {
  chart: {
    name: string;
    repository: string;
    version: string;
    repository_url: string;
    existingRelease?: { namespace: string; releaseName: string };
  };
  onInstallSuccess?: () => void;
}) => {
  const theme = useTheme();
  const { settings } = useFeatureSettings();
  const queryClient = useQueryClient();
  const { data: namespaces } = useNamespaces();
  const effectiveRepoUrl = chart.repository_url.trim() || settings.helmRepoUrl.trim();
  const { data: versionsList = [], isLoading: versionsLoading } = useHelmChartVersions(effectiveRepoUrl, chart.name);
  const versions = versionsList.length > 0 ? versionsList : [chart.version];
  const [selectedVersion, setSelectedVersion] = useState(chart.version);
  const [namespace, setNamespace] = useState(chart.existingRelease?.namespace ?? 'default');
  const [releaseName, setReleaseName] = useState(chart.existingRelease?.releaseName ?? '');
  const [valuesYaml, setValuesYaml] = useState(HELM_DEFAULT_VALUES);
  const valuesFetchedRef = useRef(false);
  const existingValuesFetchedRef = useRef(false);
  const [valuesError, setValuesError] = useState<string | null>(null);
  const [installing, setInstalling] = useState(false);
  const [subTab, setSubTab] = useState<InstallChartSubTab>('values');
  const isUpgrade = !!chart.existingRelease;

  // Fetch existing release values for upgrade flow
  const { data: existingReleaseValues, isLoading: existingValuesLoading } = useQuery({
    queryKey: ['helm-release-values', chart.existingRelease?.namespace, chart.existingRelease?.releaseName],
    queryFn: () => getHelmReleaseValues(chart.existingRelease!.namespace, chart.existingRelease!.releaseName),
    enabled: !!chart.existingRelease,
    staleTime: 0,
  });

  // Load existing release values when available (for upgrade)
  useEffect(() => {
    if (existingReleaseValues && !existingValuesFetchedRef.current) {
      existingValuesFetchedRef.current = true;
      setValuesYaml(existingReleaseValues);
    }
  }, [existingReleaseValues]);

  useEffect(() => {
    setSelectedVersion(chart.version);
  }, [chart.repository_url, chart.name, chart.version, effectiveRepoUrl]);

  useEffect(() => {
    if (versions.length > 0 && !versions.includes(selectedVersion)) {
      setSelectedVersion(versions[0]);
    }
  }, [versions, selectedVersion]);

  useEffect(() => {
    valuesFetchedRef.current = false;
  }, [selectedVersion]);

  const { data: fetchedValues, isLoading: valuesLoading, isError: valuesFetchFailed, error: valuesFetchError, refetch: refetchValues } = useQuery({
    queryKey: ['helm-chart-values', effectiveRepoUrl, chart.name, selectedVersion],
    queryFn: () => getHelmChartValues(effectiveRepoUrl, chart.name, selectedVersion),
    enabled: !!effectiveRepoUrl?.trim() && !!selectedVersion,
    staleTime: 5 * 60 * 1000,
  });

  const { data: readmeContent, isLoading: readmeLoading, isError: readmeError, error: readmeFetchError, refetch: refetchReadme } = useQuery({
    queryKey: ['helm-chart-readme', effectiveRepoUrl, chart.name, selectedVersion],
    queryFn: () => getHelmChartReadme(effectiveRepoUrl, chart.name, selectedVersion),
    enabled: !!effectiveRepoUrl?.trim() && !!selectedVersion && subTab === 'readme',
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    setSubTab('values');
  }, [chart.repository_url, chart.name, selectedVersion, effectiveRepoUrl]);

  // Load chart default values only if not in upgrade mode (existing release takes precedence)
  useEffect(() => {
    if (fetchedValues != null && fetchedValues.trim() && !valuesFetchedRef.current && !isUpgrade) {
      valuesFetchedRef.current = true;
      setValuesYaml(fetchedValues);
    }
  }, [fetchedValues, isUpgrade]);

  useEffect(() => {
    if (valuesFetchFailed && valuesFetchError) {
      const msg = valuesFetchError instanceof Error ? valuesFetchError.message : 'Could not load chart default values.';
      toast.error(msg.length > 120 ? `${msg.slice(0, 120)}…` : msg);
    }
  }, [valuesFetchFailed, valuesFetchError]);

  const nsList = namespaces?.map((ns) => ns.name) ?? [];
  const chartRef = `${chart.repository}/${chart.name}`;
  const installRelease = releaseName.trim() || chart.name;

  const handleValuesChange = (value: string) => {
    setValuesYaml(value);
    const err = validateValuesYamlSilent(value) ? null : getValuesYamlError(value);
    setValuesError(err);
  };

  const handleInstall = async () => {
    if (valuesYaml.trim() && !validateValuesYamlSilent(valuesYaml)) {
      toast.error('Fix YAML syntax in Values before installing.');
      return;
    }
    setInstalling(true);
    try {
      await installHelmChart({
        namespace,
        release_name: installRelease,
        repo_url: effectiveRepoUrl,
        chart: chart.name,
        version: selectedVersion,
        values_yaml: valuesYaml.trim() || '{}',
      });
      toast.success(`Release '${installRelease}' installed in namespace '${namespace}'.`);
      void queryClient.invalidateQueries({ queryKey: ['helm-releases'] });
      onInstallSuccess?.();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Install failed';
      toast.error(msg);
    } finally {
      setInstalling(false);
    }
  };

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden text-sm" style={{ color: 'var(--color-text)' }}>
      {/* Top bar: Chart, Version, Namespace, Release name, Install button (Freelens InfoPanel-style) */}
      <div className="flex-shrink-0 p-4 border-b border-border bg-surface-elevated space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-text-secondary">Chart</span>
          <span
            className="px-2 py-0.5 rounded border font-medium"
            style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)' }}
          >
            {chartRef}
          </span>
          <span className="text-text-secondary">Version</span>
          <select
            value={selectedVersion}
            onChange={(e) => setSelectedVersion(e.target.value)}
            className="border border-border rounded px-2 py-1 bg-bg text-text font-mono focus:outline-none focus:border-primary min-w-[8rem]"
            title="Chart version to install (default: latest)"
          >
            {versions.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
          {versionsLoading && (
            <span className="inline-flex items-center gap-1 text-text-secondary">
              <Loader size={12} className="animate-spin flex-shrink-0" />
              versions
            </span>
          )}
          {existingValuesLoading && (
            <span className="inline-flex items-center gap-1 text-text-secondary">
              <Loader size={12} className="animate-spin flex-shrink-0" />
              loading values
            </span>
          )}
          <span className="text-text-secondary">Namespace</span>
          <input
            type="text"
            list="helm-install-namespace-options"
            value={namespace}
            onChange={(e) => setNamespace(e.target.value)}
            className="border border-border rounded px-2 py-1 bg-bg text-text focus:outline-none focus:border-primary min-w-[7rem]"
            placeholder="default"
            title="Choose an existing namespace or type a new one"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
          />
          <datalist id="helm-install-namespace-options">
            {(nsList.length ? nsList : ['default']).map((ns) => (
              <option key={ns} value={ns} />
            ))}
          </datalist>
          <input
            type="text"
            placeholder="Name (optional)"
            value={releaseName}
            onChange={(e) => setReleaseName(e.target.value)}
            className="border border-border rounded px-2 py-1 bg-bg text-text focus:outline-none focus:border-primary min-w-[8rem]"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
          />
          <button
            type="button"
            onClick={() => void handleInstall()}
            disabled={installing || (isUpgrade && existingValuesLoading)}
            className="px-4 py-1.5 rounded font-medium bg-primary text-white hover:opacity-90 disabled:opacity-50"
          >
            {installing ? (isUpgrade ? 'Upgrading…' : 'Installing…') : (isUpgrade ? 'Upgrade' : 'Install')}
          </button>
        </div>
        {valuesError && (
          <p className="text-red-500 text-xs" role="alert">Values: {valuesError}</p>
        )}
        <p className="text-xs text-text-secondary break-all">
          Effective Helm repo: {effectiveRepoUrl || 'Unavailable'}
        </p>
      </div>
      {/* Sub-tabs: Values | README */}
      <div className="flex-shrink-0 flex border-b border-border bg-surface-elevated px-4 gap-1">
        <button
          type="button"
          onClick={() => setSubTab('values')}
          className={cn(
            'px-3 py-2 text-sm font-medium border-b-2 transition-colors',
            subTab === 'values'
              ? 'border-primary text-primary'
              : 'border-transparent text-text-secondary hover:text-text hover:bg-hover'
          )}
        >
          Values
        </button>
        <button
          type="button"
          onClick={() => setSubTab('readme')}
          className={cn(
            'px-3 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-1.5',
            subTab === 'readme'
              ? 'border-primary text-primary'
              : 'border-transparent text-text-secondary hover:text-text hover:bg-hover'
          )}
        >
          <ScrollText size={14} className="flex-shrink-0" />
          README
        </button>
      </div>
      {/* Content: Values editor or README */}
      {subTab === 'values' ? (
        <div className="flex-1 min-h-0 flex flex-col p-4">
          <div className="flex items-center justify-between gap-2 mb-2">
            <label className="text-text-secondary font-medium flex items-center gap-2">
              Values
              {valuesLoading && (
                <span className="inline-flex items-center gap-1.5 text-xs font-normal text-primary">
                  <Loader size={12} className="animate-spin flex-shrink-0" />
                  Loading… (fetching Helm values)
                </span>
              )}
            </label>
            {valuesFetchFailed && (
              <button
                type="button"
                onClick={() => void refetchValues()}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
              >
                <RotateCw size={12} className="flex-shrink-0" />
                Retry
              </button>
            )}
          </div>
          {valuesFetchFailed && valuesFetchError && (
            <p className="text-red-500 text-xs mb-2 break-words" role="alert">
              {valuesFetchError instanceof Error ? valuesFetchError.message : 'Failed to load default values.'}
            </p>
          )}
          <div
            className={cn(
              'yaml-editor-pane flex-1 min-h-[200px] rounded-lg overflow-hidden border bg-surface-elevated',
              valuesError ? 'border-red-500' : 'border-border'
            )}
          >
            <AceEditor
              mode="yaml"
              theme={(settings.yamlEditor.theme === 'auto' ? !!theme?.isDark : settings.yamlEditor.theme === 'dark') ? 'tomorrow_night' : 'github'}
              value={valuesYaml}
              onChange={(value) => handleValuesChange(value)}
              readOnly={valuesLoading}
              width="100%"
              height="100%"
              showPrintMargin={false}
              setOptions={{ useWorker: false, tabSize: 2 }}
              editorProps={{ $blockScrolling: true }}
              style={{
                fontSize: settings.yamlEditor.fontSize,
                fontFamily: settings.yamlEditor.fontName,
                minHeight: 200,
              }}
            />
          </div>
        </div>
      ) : (
        <div className="flex-1 min-h-0 flex flex-col p-4 overflow-hidden">
          <div className="flex items-center justify-between gap-2 mb-2">
            <label className="text-text-secondary font-medium flex items-center gap-2">
              <ScrollText size={14} className="flex-shrink-0" />
              README
              {readmeLoading && (
                <span className="inline-flex items-center gap-1.5 text-xs font-normal text-primary">
                  <Loader size={12} className="animate-spin flex-shrink-0" />
                  Loading…
                </span>
              )}
            </label>
            {readmeError && (
              <button
                type="button"
                onClick={() => void refetchReadme()}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
              >
                <RotateCw size={12} className="flex-shrink-0" />
                Retry
              </button>
            )}
          </div>
          <div
            className="flex-1 min-h-0 rounded-lg border border-border bg-surface-elevated overflow-auto p-4 text-sm markdown-viewer"
            style={{ color: 'var(--color-text)' }}
          >
            {readmeError && readmeFetchError && (
              <p className="text-red-500 text-xs break-words mb-2" role="alert">
                {readmeFetchError instanceof Error ? readmeFetchError.message : 'Failed to load README.'}
              </p>
            )}
            {readmeContent != null && readmeContent !== '' && !readmeLoading && (
              <div className="markdown-viewer-content">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {readmeContent}
                </ReactMarkdown>
              </div>
            )}
            {readmeContent === '' && !readmeLoading && !readmeError && (
              <p className="text-text-secondary">No README content for this chart.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

function validateValuesYamlSilent(yamlStr: string): boolean {
  const t = yamlStr.trim();
  if (!t) return true;
  try {
    YAML.parse(t);
    return true;
  } catch {
    return false;
  }
}

function getValuesYamlError(yamlStr: string): string | null {
  const t = yamlStr.trim();
  if (!t) return null;
  try {
    YAML.parse(t);
    return null;
  } catch (err) {
    return err instanceof Error ? err.message : 'Invalid YAML';
  }
}

// ── LogViewer ────────────────────────────────────────────────────────────────

const LogViewer = ({ namespace, podName }: { namespace: string; podName: string }) => {
  const [logs, setLogs] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = getAuthToken();
      const res = await fetch(
        `/api/pods/${encodeURIComponent(namespace)}/${encodeURIComponent(podName)}/logs`,
        { headers: token ? { Authorization: token } : undefined }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      setLogs(text);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch logs');
    } finally {
      setLoading(false);
    }
  }, [namespace, podName]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView();
  }, [logs]);

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center gap-2 px-3 py-1 border-b border-border flex-shrink-0 bg-surface">
        <span className="text-xs font-mono text-text-secondary">
          {namespace}/{podName}
        </span>
        <button
          type="button"
          onClick={fetchLogs}
          disabled={loading}
          title="Reload logs"
          className="ml-auto p-1 hover:bg-hover rounded text-text-secondary disabled:opacity-40"
        >
          <RotateCw size={13} className={cn(loading && 'animate-spin')} />
        </button>
      </div>
      {error ? (
        <p className="p-4 text-sm text-red-500">{error}</p>
      ) : (
        <pre className="flex-1 overflow-auto text-[11px] p-3 font-mono text-text-secondary whitespace-pre-wrap leading-relaxed">
          {loading && !logs ? 'Loading…' : logs || 'No logs available'}
          <div ref={logsEndRef} />
        </pre>
      )}
    </div>
  );
};

// ── YamlEditorTab ────────────────────────────────────────────────────────────

const YamlEditorTab = ({
  initialContent,
  title,
  onContentChange,
}: {
  initialContent: string;
  title?: string;
  onContentChange: (content: string) => void;
}) => {
  const theme = useTheme();
  const { settings } = useFeatureSettings();
  const [yaml, setYaml] = useState(initialContent);
  const [showTemplateMenu, setShowTemplateMenu] = useState(false);
  const [selectedKinds, setSelectedKinds] = useState<string[]>(['Deployment']);
  const templateMenuRef = useRef<HTMLDivElement | null>(null);

  const handleChange = (value: string) => {
    setYaml(value);
    onContentChange(value);
  };

  const toggleKind = (kind: string) => {
    setSelectedKinds((previous) =>
      previous.includes(kind)
        ? previous.filter((item) => item !== kind)
        : [...previous, kind],
    );
  };

  const selectAllKinds = () => {
    setSelectedKinds(YAML_KIND_TEMPLATES.map((item) => item.key));
  };

  const clearKinds = () => {
    setSelectedKinds([]);
  };

  const applyKindsTemplate = () => {
    if (selectedKinds.length === 0) return;
    const selectedTemplates = YAML_KIND_TEMPLATES
      .filter((item) => selectedKinds.includes(item.key))
      .map((item) => item.template.trim())
      .filter(Boolean);
    if (selectedTemplates.length === 0) return;

    const generated = selectedTemplates.join('\n\n---\n\n') + '\n';
    handleChange(generated);
    setShowTemplateMenu(false);
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (templateMenuRef.current && !templateMenuRef.current.contains(target)) {
        setShowTemplateMenu(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="yaml-editor-pane h-full flex flex-col bg-surface-elevated">
      <div className="flex items-center justify-between gap-2 px-3 py-1 border-b border-white/10 flex-shrink-0 bg-surface-elevated">
        <span className="text-xs text-white/50">{title ?? 'New Resource'}</span>
        <div ref={templateMenuRef} className="relative">
          <button
            type="button"
            onClick={() => setShowTemplateMenu((previous) => !previous)}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-[11px] text-text-secondary hover:bg-hover"
          >
            Kind Templates
            <ChevronDown size={12} className={cn('transition-transform', showTemplateMenu && 'rotate-180')} />
          </button>

          {showTemplateMenu && (
            <div className="absolute right-0 top-7 z-20 w-72 rounded-md border border-border bg-surface shadow-xl">
              <div className="flex items-center justify-between border-b border-border px-2 py-1.5">
                <span className="text-[11px] text-text-secondary">Select kinds ({selectedKinds.length})</span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={selectAllKinds}
                    className="text-[11px] text-primary hover:underline"
                  >
                    Select all
                  </button>
                  <button
                    type="button"
                    onClick={clearKinds}
                    className="text-[11px] text-text-secondary hover:underline"
                  >
                    Clear
                  </button>
                </div>
              </div>
              <div className="max-h-64 overflow-y-auto p-1">
                {YAML_KIND_TEMPLATES.map((item) => {
                  const checked = selectedKinds.includes(item.key);
                  return (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => toggleKind(item.key)}
                      className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs text-text-secondary hover:bg-hover"
                    >
                      <Checkbox checked={checked} onChange={() => toggleKind(item.key)} />
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </div>
              <div className="flex items-center justify-end border-t border-border px-2 py-1.5">
                <button
                  type="button"
                  onClick={applyKindsTemplate}
                  disabled={selectedKinds.length === 0}
                  className="rounded-md bg-primary px-2.5 py-1 text-[11px] font-medium text-white disabled:opacity-50"
                >
                  Generate YAML
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
      <div className="flex-1 overflow-hidden">
        <AceEditor
          mode="yaml"
          theme={(settings.yamlEditor.theme === 'auto' ? !!theme?.isDark : settings.yamlEditor.theme === 'dark') ? 'tomorrow_night' : 'github'}
          value={yaml}
          onChange={handleChange}
          width="100%"
          height="100%"
          showPrintMargin={false}
          setOptions={{ useWorker: false, tabSize: 2 }}
          editorProps={{ $blockScrolling: true }}
          style={{
            fontSize: settings.yamlEditor.fontSize,
            fontFamily: settings.yamlEditor.fontName,
          }}
        />
      </div>
    </div>
  );
};

// ── TabIcon ───────────────────────────────────────────────────────────────────

const TabIcon = ({ type, size = 13 }: { type: PanelTabType; size?: number }) => {
  switch (type) {
    case 'host-shell':
    case 'pod-exec':
      return <Terminal size={size} />;
    case 'pod-files':
      return <Upload size={size} />;
    case 'node-exec':
      return <Server size={size} />;
    case 'logs':
      return <ScrollText size={size} />;
    case 'yaml-editor':
      return <FileText size={size} />;
    case 'install-chart':
      return <Upload size={size} />;
  }
};

// ── AddMenu — rendered inline inside the panel, no portal needed ──────────────

const AddMenu = ({ onSelect }: { onSelect: (type: PanelTabType) => void }) => (
  <div
    className="absolute right-0 top-8 w-56 bg-surface border border-border rounded-bl-xl shadow-2xl z-50 py-1"
    onClick={(e) => e.stopPropagation()}
  >
    {ADD_OPTIONS.map(({ type, label, icon: Icon, description }) => (
      <button
        key={type}
        type="button"
        onClick={() => onSelect(type)}
        className="w-full flex items-start gap-3 px-3 py-2.5 hover:bg-hover text-left transition-colors"
      >
        <Icon size={15} className="text-primary mt-0.5 flex-shrink-0" />
        <div>
          <div className="text-sm font-medium text-text leading-tight">{label}</div>
          <div className="text-xs text-text-secondary mt-0.5">{description}</div>
        </div>
      </button>
    ))}
  </div>
);

// ── TabContent ────────────────────────────────────────────────────────────────

const TabContent = ({
  tab,
  onConnect,
  onYamlChange,
  onCloseCurrentTab,
}: {
  tab: PanelTab;
  onConnect: (target: TabTarget) => void;
  onYamlChange: (content: string) => void;
  onCloseCurrentTab?: () => void;
}) => {
  switch (tab.type) {
    case 'pod-exec':
      if (!tab.target) {
        return (
          <PodSelector
            title="Select a pod to exec into"
            onSelect={(ns, pod, container) => onConnect({ namespace: ns, podName: pod, containerName: container })}
          />
        );
      }
      return (
        <TerminalComponent
          podName={tab.target.podName}
          namespace={tab.target.namespace}
          containerName={tab.target.containerName}
          initialCommand={tab.initialCommand}
        />
      );

    case 'pod-files':
      if (!tab.target) {
        return (
          <PodSelector
            title="Select a pod to open file transfer"
            onSelect={(ns, pod, container) => onConnect({ namespace: ns, podName: pod, containerName: container })}
          />
        );
      }
      return (
        <PodFileTransfer
          podName={tab.target.podName}
          namespace={tab.target.namespace}
          containerName={tab.target.containerName}
          onPodReplaced={(nextPodName) =>
            onConnect({
              namespace: tab.target!.namespace,
              podName: nextPodName,
              containerName: tab.target!.containerName,
            })
          }
        />
      );

    case 'node-exec':
      if (!tab.target) {
        return (
          <NodeSelector
            onSelect={(nodeName) => onConnect({ namespace: 'node', podName: nodeName })}
          />
        );
      }
      return <TerminalComponent podName={tab.target.podName} namespace="node" initialCommand={tab.initialCommand} />;

    case 'logs':
      if (!tab.target) {
        return (
          <PodSelector
            title="Select a pod to view logs"
            onSelect={(ns, pod) => onConnect({ namespace: ns, podName: pod })}
          />
        );
      }
      return <LogViewer namespace={tab.target.namespace} podName={tab.target.podName} />;

    case 'host-shell':
      return <TerminalComponent podName="host" namespace="host" initialCommand={tab.initialCommand} />;

    case 'yaml-editor':
      return (
        <YamlEditorTab
          initialContent={tab.yamlContent ?? DEFAULT_YAML}
          title={tab.title}
          onContentChange={onYamlChange}
        />
      );

    case 'install-chart':
      if (!tab.installChart) {
        return (
          <div className="flex items-center justify-center h-full p-6 text-sm text-text-secondary">
            No chart selected. Open a chart from the Charts page and click Install.
          </div>
        );
      }
      return (
        <InstallChartTabContent
          key={tab.id}
          chart={tab.installChart}
          onInstallSuccess={onCloseCurrentTab}
        />
      );
  }
};

// ── BottomPanel (main export) ─────────────────────────────────────────────────

const MENU_ITEM_HEIGHT = 48;
const MIN_PANEL_HEIGHT = 280;
const DEFAULT_PANEL_HEIGHT = () => Math.round(window.innerHeight * 0.5);

export const BottomPanel = () => {
  const [tabs, setTabs] = useState<PanelTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [panelHeight, setPanelHeight] = useState(MIN_PANEL_HEIGHT);
  const [fullScreen, setFullScreen] = useState(false);
  const savedBeforeFullScreen = useRef<{ height: number; collapsed: boolean } | null>(null);
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [yamlActionLoading, setYamlActionLoading] = useState(false);
  const [yamlActionResult, setYamlActionResult] = useState<{ ok: boolean; tabId: string } | null>(null);

  const activeTab = tabs.find((t) => t.id === activeTabId) ?? null;
  const isActiveYamlTab = !!activeTab && activeTab.type === 'yaml-editor';
  const activeYamlActionLabel = isActiveYamlTab ? (activeTab.yamlActionLabel ?? 'Apply') : 'Apply';
  const activeYamlDirty = !!(isActiveYamlTab && activeTab?.yamlDirty);

  // ── External open events (e.g. sidebar Terminal button) ───────────────────
  const doAddTab = useCallback((type: PanelTabType, opts?: Partial<OpenPanelTabOptions>) => {
    const identity = makeTabIdentity(type, opts);

    if (identity) {
      const existing = tabs.find((t) => t.identity === identity);
      if (existing) {
        setActiveTabId(existing.id);
        setCollapsed(false);
        setPanelHeight((h) => (h <= MIN_PANEL_HEIGHT ? DEFAULT_PANEL_HEIGHT() : h));
        setShowAddMenu(false);
        return;
      }
    }

    const id = `${type}-${Date.now()}`;
    const label =
      opts?.title?.trim()
        ? opts.title.trim()
        : type === 'yaml-editor'
          ? LABEL_MAP[type]
        : type === 'install-chart' && opts?.installChart
          ? opts.installChart.existingRelease
            ? `Helm Upgrade: ${opts.installChart.repository}/${opts.installChart.name}`
            : `Helm Install: ${opts.installChart.repository}/${opts.installChart.name}`
          : (opts?.podName ?? LABEL_MAP[type]);
    setTabs((prev) => [
      ...prev,
      {
        id,
        type,
        identity: identity ?? undefined,
        label,
        initialCommand: opts?.initialCommand,
        ...(type === 'yaml-editor'
          ? {
              yamlContent: opts?.yamlContent ?? DEFAULT_YAML,
              yamlSavedContent: opts?.yamlContent ?? DEFAULT_YAML,
              yamlDirty: false,
              title: opts?.title,
              yamlActionLabel: opts?.yamlActionLabel ?? 'Apply',
              helmReleaseName: opts?.helmReleaseName,
              helmReleaseNamespace: opts?.helmReleaseNamespace,
            }
          : {}),
        ...(type === 'install-chart' && opts?.installChart
          ? { installChart: opts.installChart }
          : {}),
        ...(opts?.podName
          ? { target: { namespace: opts.namespace ?? 'default', podName: opts.podName, containerName: opts.containerName } }
          : {}),
      },
    ]);
    setActiveTabId(id);
    setCollapsed(false);
    setPanelHeight((h) => (h <= MIN_PANEL_HEIGHT ? DEFAULT_PANEL_HEIGHT() : h));
    setShowAddMenu(false);
  }, [tabs]);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<OpenPanelTabOptions>).detail;
      doAddTab(detail.type, detail);
    };
    window.addEventListener('panel:open', handler);
    return () => window.removeEventListener('panel:open', handler);
  }, [doAddTab]);

  // ── Close add menu on outside click ───────────────────────────────────────
  useEffect(() => {
    if (!showAddMenu) return;
    const t = window.setTimeout(() => {
      document.addEventListener('click', () => setShowAddMenu(false), { once: true });
    }, 0);
    return () => window.clearTimeout(t);
  }, [showAddMenu]);

  // ── Exit full screen on Escape ───────────────────────────────────────────
  useEffect(() => {
    if (!fullScreen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFullScreen(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [fullScreen]);

  const handleAddClick = () => {
    if (!showAddMenu) {
      // Ensure panel is tall enough to show all menu items
      setCollapsed(false);
      setPanelHeight((h) => Math.max(h, ADD_OPTIONS.length * MENU_ITEM_HEIGHT + 40));
    }
    setShowAddMenu((p) => !p);
  };

  const closeTab = (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setTabs((prev) => {
      const next = prev.filter((t) => t.id !== id);
      if (activeTabId === id) setActiveTabId(next.length > 0 ? next[next.length - 1].id : null);
      if (next.length === 0) setFullScreen(false);
      return next;
    });
  };

  const connectTab = (id: string, target: TabTarget) => {
    setTabs((prev) =>
      prev.map((t) => {
        if (t.id !== id) return t;
        return {
          ...t,
          target,
          label: target.podName,
          identity:
            t.type === 'pod-exec' || t.type === 'pod-files' || t.type === 'logs'
              ? `${t.type}:${target.namespace}:${target.podName}:${target.containerName ?? ''}`
              : t.identity,
        };
      })
    );
  };

  const updateYaml = (id: string, content: string) => {
    setTabs((prev) =>
      prev.map((t) => {
        if (t.id !== id || t.type !== 'yaml-editor') return t;
        const yamlSavedContent = t.yamlSavedContent ?? '';
        return {
          ...t,
          yamlContent: content,
          yamlDirty: content !== yamlSavedContent,
        };
      })
    );
    if (yamlActionResult?.tabId === id) {
      setYamlActionResult(null);
    }
  };

  const handleYamlPrimaryAction = async () => {
    if (!activeTab || activeTab.type !== 'yaml-editor') return;
    const rawYaml = activeTab.yamlContent ?? '';
    const yaml = rawYaml.trim();
    if (!yaml) return;

    setYamlActionLoading(true);
    setYamlActionResult(null);
    try {
      const token = getAuthToken();
      const isHelmUpgrade =
        activeTab.yamlActionLabel === 'Upgrade' &&
        !!activeTab.helmReleaseName &&
        !!activeTab.helmReleaseNamespace;

      const endpoint = isHelmUpgrade
        ? `/api/helm/releases/${encodeURIComponent(activeTab.helmReleaseNamespace as string)}/${encodeURIComponent(activeTab.helmReleaseName as string)}/upgrade`
        : '/api/apply';

      const documents = isHelmUpgrade ? [yaml] : splitYamlDocuments(yaml);
      if (documents.length === 0) {
        toast.error('YAML is empty.');
        setYamlActionResult({ ok: false, tabId: activeTab.id });
        return;
      }

      let lastSuccessMessage = activeTab.yamlActionLabel === 'Upgrade' ? 'Upgraded successfully' : 'Applied successfully';
      for (let index = 0; index < documents.length; index += 1) {
        const body = documents[index];
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/yaml',
            ...(token ? { Authorization: token } : {}),
          },
          body,
        });

        const text = await res.text().catch(() => '');
        let message: string;
        try {
          const json = JSON.parse(text);
          message = json.message ?? (res.ok ? 'Applied successfully' : `Error ${res.status}`);
        } catch {
          message = text || (res.ok ? 'Applied successfully' : `Error ${res.status}`);
        }

        if (!res.ok) {
          const withIndex = documents.length > 1
            ? `Document ${index + 1}/${documents.length}: ${message}`
            : message;
          throw new Error(withIndex);
        }

        lastSuccessMessage = message;
      }

      if (documents.length > 1) {
        toast.success(`Applied ${documents.length} YAML documents successfully.`);
      } else {
        toast.success(lastSuccessMessage);
      }

      if (documents.length >= 1) {
        setTabs((prev) =>
          prev.map((t) =>
            t.id === activeTab.id && t.type === 'yaml-editor'
              ? { ...t, yamlSavedContent: rawYaml, yamlDirty: false }
              : t
          )
        );
      }

      setYamlActionResult({ ok: true, tabId: activeTab.id });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Network error';
      toast.error(message);
      setYamlActionResult({ ok: false, tabId: activeTab.id });
    } finally {
      setYamlActionLoading(false);
    }
  };

  const handleYamlExport = async () => {
    if (activeTab?.type !== 'yaml-editor') return;
    const content = (activeTab.yamlContent ?? '').trim();
    if (!content) {
      toast.error('YAML is empty.');
      return;
    }

    const filename = inferYamlFilename(content, activeTab.title);
    const blob = new Blob([content.endsWith('\n') ? content : `${content}\n`], {
      type: 'application/yaml; charset=utf-8',
    });

    try {
      if (isDesktopRuntime()) {
        const { invoke } = await import('@tauri-apps/api/core');
        const dataUrl = await blobToDataUrl(blob);
        const savedPath = await invoke<string | null>('save_base64_file', {
          defaultFileName: filename,
          base64Data: dataUrl,
        });

        if (!savedPath) {
          toast.message('Export cancelled.');
          return;
        }

        toast.success(`Exported to ${savedPath}`);
        return;
      }

      const pickerHost = globalThis as typeof globalThis & {
        showSaveFilePicker?: (options?: {
          suggestedName?: string;
          types?: Array<{ description?: string; accept: Record<string, string[]> }>;
        }) => Promise<{
          createWritable: () => Promise<{ write: (data: Blob) => Promise<void>; close: () => Promise<void> }>;
        }>;
      };

      if (typeof pickerHost.showSaveFilePicker === 'function') {
        const handle = await pickerHost.showSaveFilePicker({
          suggestedName: filename,
          types: [{
            description: 'YAML files',
            accept: { 'application/yaml': ['.yaml', '.yml'] },
          }],
        });
        const writable = await handle.createWritable();
        await writable.write(blob);
        await writable.close();
        toast.success(`Exported ${filename}`);
        return;
      }

      const url = globalThis.URL.createObjectURL(blob);
      try {
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        link.remove();
        toast.success(`Exported ${filename}`);
      } finally {
        globalThis.URL.revokeObjectURL(url);
      }
    } catch (err) {
      const maybeDomErr = err as { name?: string };
      if (maybeDomErr?.name === 'AbortError') {
        toast.message('Export cancelled.');
        return;
      }

      const message = err instanceof Error ? err.message : 'Failed to export YAML.';
      toast.error(message);
    }
  };

  const handleDragStart = (e: React.MouseEvent) => {
    e.preventDefault();
    const startY = e.clientY;
    const startH = panelHeight;
    const onMove = (ev: MouseEvent) => setPanelHeight(Math.max(120, Math.min(window.innerHeight - 80, startH + startY - ev.clientY)));
    const onUp = () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  // Panel needs explicit height when showing content or the dropdown menu
  const needsHeight = (!collapsed && tabs.length > 0) || showAddMenu;

  const toggleFullScreen = () => {
    setFullScreen((prev) => {
      if (!prev) {
        savedBeforeFullScreen.current = { height: panelHeight, collapsed };
        setCollapsed(false);
        setPanelHeight(window.innerHeight - 32);
      } else {
        const saved = savedBeforeFullScreen.current;
        if (saved) {
          setPanelHeight(saved.height);
          setCollapsed(saved.collapsed);
          savedBeforeFullScreen.current = null;
        } else {
          setPanelHeight(DEFAULT_PANEL_HEIGHT());
        }
      }
      return !prev;
    });
  };

  const desktopMode = isDesktopRuntime();

  const effectiveHeight = fullScreen
    ? (desktopMode ? 'calc(100vh - 36px)' : '100vh')
    : needsHeight
      ? (!collapsed && tabs.length > 0) ? panelHeight : Math.max(panelHeight, ADD_OPTIONS.length * MENU_ITEM_HEIGHT + 40)
      : undefined;



  return (
    <div
      className={cn(
        'bottom-panel-shell flex flex-col rounded-xl overflow-hidden border border-border',
        fullScreen
          ? cn('fixed inset-x-0 bottom-0 z-[100] rounded-none', desktopMode ? 'top-9' : 'top-0')
          : 'relative flex-shrink-0 mx-2 mb-2'
      )}
      style={{
        boxShadow: '0 -4px 24px rgba(0,0,0,0.25)',
        ...(effectiveHeight !== undefined ? { height: effectiveHeight } : {}),
      } as CSSProperties}
    >
      {/* Drag handle */}
      {!collapsed && tabs.length > 0 && (
        <div
          onMouseDown={handleDragStart}
          className="h-1 flex-shrink-0 cursor-ns-resize hover:bg-primary/20 transition-colors"
          title="Drag to resize"
        />
      )}

      {/* Tab bar */}
      <div className="bottom-panel-tabbar flex items-center flex-shrink-0">
        {/* Scrollable tabs */}
        <div className="bottom-panel-tabs flex-1 flex items-center overflow-x-auto gap-1 px-2 min-w-0">
          {tabs.map((tab) => {
            const isActive = tab.id === activeTabId && !collapsed;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => { setActiveTabId(tab.id); setCollapsed(false); }}
                className={cn(
                  'bottom-panel-tab group flex items-center gap-1.5 px-3 text-xs font-medium flex-shrink-0 transition-colors',
                  isActive ? 'is-active text-text' : 'text-text-secondary hover:text-text'
                )}
              >
                <TabIcon type={tab.type} size={12} />
                <span className="max-w-[7rem] truncate">{tab.label}</span>
                {tab.type === 'yaml-editor' && tab.yamlDirty && (
                  <span title="Unsaved changes" className="-ml-1">
                    <Dot
                      size={16}
                      className="text-amber-400"
                    />
                  </span>
                )}
                <span
                  role="button" tabIndex={0}
                  onClick={(e) => closeTab(tab.id, e)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') closeTab(tab.id, e as unknown as React.MouseEvent); }}
                  className="ml-0.5 p-0.5 hover:bg-hover rounded opacity-70 hover:opacity-100 cursor-pointer"
                  title="Close"
                >
                  <X size={10} />
                </span>
              </button>
            );
          })}
        </div>

        {/* Fixed right controls */}
        <div className="bottom-panel-controls flex-shrink-0 flex items-center gap-1 px-2">
          {isActiveYamlTab && (
            <>
              <button
                type="button"
                onClick={() => { void handleYamlExport(); }}
                disabled={!activeTab?.yamlContent?.trim()}
                className={cn(
                  'flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors border disabled:opacity-40',
                  'bg-hover hover:bg-surface text-text border-border'
                )}
                title="Export YAML file"
              >
                <ArrowDown size={10} />
                Export
              </button>
              {yamlActionResult?.tabId === activeTab.id && (
                <span
                  className={cn(
                    'text-[11px] px-2 py-0.5 rounded border',
                    yamlActionResult.ok
                      ? 'text-green-300 border-green-500/40 bg-green-500/10'
                      : 'text-red-300 border-red-500/40 bg-red-500/10'
                  )}
                >
                  {yamlActionResult.ok
                    ? (activeYamlActionLabel === 'Upgrade' ? 'Upgraded ✓' : 'Applied ✓')
                    : 'Failed ✗'}
                </span>
              )}
              <button
                type="button"
                onClick={handleYamlPrimaryAction}
                disabled={yamlActionLoading || !activeYamlDirty}
                className={cn(
                  'flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors border disabled:opacity-40',
                  activeYamlDirty
                    ? 'bg-primary/20 hover:bg-primary/30 text-primary border-primary/40'
                    : 'bg-hover text-text-secondary border-border'
                )}
                title={activeYamlActionLabel}
              >
                <Circle
                  size={10}
                  className={cn(activeYamlDirty ? 'text-amber-400 fill-current' : 'text-text-secondary')}
                />
                {yamlActionLoading
                  ? (activeYamlActionLabel === 'Upgrade' ? 'Upgrading…' : 'Applying…')
                  : (activeYamlDirty ? activeYamlActionLabel : 'Saved')}
              </button>
            </>
          )}
          <button
            type="button"
            onClick={handleAddClick}
            className={cn(
              'bottom-panel-control-btn flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors',
              'text-primary border border-border',
              showAddMenu && 'bg-hover border-border'
            )}
            title="Add tab"
          >
            <Plus size={13} strokeWidth={2.5} />
            <span>New Tab</span>
          </button>
          {tabs.length > 0 && (
            <>
              <button
                type="button"
                onClick={toggleFullScreen}
                className={cn(
                  'flex items-center gap-1.5 rounded transition-colors',
                  fullScreen
                    ? 'px-2 py-1 bg-primary/20 hover:bg-primary/30 text-primary border border-primary/40'
                    : 'p-1 hover:bg-hover text-text-secondary'
                )}
                title={fullScreen ? 'Exit full screen' : 'Full screen'}
              >
                {fullScreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
                {fullScreen && <span className="text-xs font-medium">Exit full screen</span>}
              </button>
              <button
                type="button"
                onClick={() => setCollapsed((p) => !p)}
                className="p-1 hover:bg-hover rounded text-text-secondary transition-colors"
                title={collapsed ? 'Expand' : 'Collapse'}
              >
                {collapsed ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Inline add menu — absolutely positioned inside panel, overlays content */}
      {showAddMenu && <AddMenu onSelect={(type) => doAddTab(type)} />}

      {/* Content area — all tabs stay mounted; only active one is visible */}
      {tabs.length > 0 && !collapsed && (
        <div className="flex-1 min-h-0 overflow-hidden bg-sidebar">
          {tabs.map((tab) => (
            <div key={tab.id} className="h-full" style={{ display: tab.id === activeTabId ? 'block' : 'none' }}>
              <TabContent
                tab={tab}
                onConnect={(target) => connectTab(tab.id, target)}
                onYamlChange={(content) => updateYaml(tab.id, content)}
                onCloseCurrentTab={() => closeTab(tab.id)}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
