import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { useNamespace } from '../context/NamespaceContext';
import { useRealtimeNamespaces, useRealtimeCrds } from '../hooks/useRealtimeResources';
import { useNamespaces } from '../hooks/useKubernetes';
import { Checkbox } from './Checkbox';
import { BottomPanel } from './BottomPanel';
import type { IconComponent } from './Icons';
import {
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  Menu,
  X,
  LayoutDashboard,
  Server,
  Cpu,
  Network,
  Database,
  Archive,
  Copy,
  RotateCw,
  Boxes,
  Settings,
  Globe,
  HardDrive,
  FileText,
  KeyRound,
  Gauge,
  Shield,
  Flag,
  Timer,
  SlidersHorizontal,
  Bell,
  Terminal,
  Layers,
  LayoutGrid,
  Share2,
  FolderTree,
  Package,
  Rocket,
  Ship,
  Workflow,
  Plug,
  LogIn,
  Tag,
  ShieldAlert,
  Forward,
  UserCog,
  UserCheck,
  Link as LinkIcon,
  Link2,
  FilePenLine,
  FileCheck,
  CalendarClock,
  Repeat,
  Layers3,
  DatabaseZap,
  TrendingUp,
  Briefcase,
  Container,
  Cog,
} from './Icons';
import { SidecarLogsPanel } from './SidecarLogsPanel';
import { cn } from '../utils';
import {
  type DesktopAuthStatus,
  type DesktopKubeconfigCluster,
  getDesktopAuthStatus,
  getDesktopSidecarConfig,
  listDesktopKubeconfigClusters,
  listDesktopKubeconfigCandidates,
  listAwsEksClusters,
  awsEksUpdateKubeconfig,
  openDesktopExternalUrl,
  saveDesktopSidecarConfig,
  waitDesktopClusterSwitchResult,
  logOmniConnectionAttempt,
  listOmniClusters,
  omniUpdateKubeconfig,
  listGcpClusters,
  listAzureClusters,
} from '../utils/tauriDesktop';
import { isDesktopRuntime } from '../utils/desktopBridge';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { APP_VERSION } from '../utils/version';
import { DesktopSettingsPage } from '../pages/DesktopSettingsPage';
import classNames from 'classnames';

const appWindow = (() => {
  if (!isDesktopRuntime()) return null;
  try {
    return getCurrentWindow();
  } catch {
    return null;
  }
})();

interface NavItem {
  label: string;
  path: string;
  icon: IconComponent;
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', path: '/', icon: LayoutDashboard },
  { label: 'Nodes', path: '/nodes', icon: Cpu },
];

const BOTTOM_NAV_ITEMS: NavItem[] = [
  { label: 'Cluster', path: '/cluster', icon: Server },
  { label: 'Resource Map', path: '/resource-map', icon: Share2 },
];

const NAMESPACE_ITEM: NavItem = {
  label: 'Namespace',
  path: '/namespaces',
  icon: FolderTree,
};

const EVENTS_ITEM: NavItem = {
  label: 'Events',
  path: '/events',
  icon: Bell,
};

const SIDEBAR_WIDTH_DEFAULT = 256; // 16rem
const SIDEBAR_WIDTH_MIN = 200;
const SIDEBAR_WIDTH_MAX = 420;
const SIDEBAR_WIDTH_STORAGE_KEY = 'pertisk-kube-sidebar-width';
const TALOS_OMNI_URL_STORAGE_KEY = 'pertisk-talos-omni-url';
const TALOS_OMNI_EMAIL_STORAGE_KEY = 'pertisk-talos-omni-email';
const AWS_ACCESS_KEY_STORAGE_KEY = 'pertisk-aws-access-key';
const AWS_SECRET_KEY_STORAGE_KEY = 'pertisk-aws-secret-key';
const AWS_SESSION_TOKEN_STORAGE_KEY = 'pertisk-aws-session-token';
const AWS_ACCOUNT_ID_STORAGE_KEY = 'pertisk-aws-account-id';
const GCP_PROJECT_ID_STORAGE_KEY = 'pertisk-gcp-project-id';
const AZURE_SUBSCRIPTION_ID_STORAGE_KEY = 'pertisk-azure-subscription-id';
const DIGITALOCEAN_TOKEN_STORAGE_KEY = 'pertisk-digitalocean-api-token';

const CLOUD_PROVIDER_OPTIONS = [
  { value: 'talos-omni', label: 'Talos Omni', description: 'Browser-based Omni login and cluster import.' },
  { value: 'aws', label: 'AWS', description: 'List EKS clusters directly from the AWS API.' },
  { value: 'gcp', label: 'Google Cloud', description: 'Use browser sign-in for Google Cloud access.' },
  { value: 'azure', label: 'Azure', description: 'Authenticate with Microsoft Azure in the browser.' },
  { value: 'digitalocian', label: 'DigitalOcean', description: 'Import clusters with a DigitalOcean API token.' },
] as const;

const CLUSTER_IMPORT_TABS = [
  { value: 'kubeconfig', label: 'Kubeconfig', description: 'Import from local kubeconfig contexts.' },
  { value: 'cloud', label: 'Cloud Provider', description: 'Connect directly to your cloud account.' },
] as const;

const HELM_ITEMS: NavItem[] = [
  { label: 'Charts', path: '/helm/charts', icon: Package },
  { label: 'Releases', path: '/helm/releases', icon: Ship },
];

const ACCESS_CONTROL_ITEMS: NavItem[] = [
  { label: 'Service Accounts', path: '/access-control/serviceaccounts', icon: UserCog },
  { label: 'Cluster Roles', path: '/access-control/clusterroles', icon: Shield },
  { label: 'Roles', path: '/access-control/roles', icon: UserCheck },
  { label: 'Cluster Role Bindings', path: '/access-control/clusterrolebindings', icon: LinkIcon },
  { label: 'Role Bindings', path: '/access-control/rolebindings', icon: Link2 },
];

const NETWORK_ITEMS: NavItem[] = [
  { label: 'Services', path: '/network/services', icon: Workflow },
  { label: 'Endpoints', path: '/network/endpoints', icon: Plug },
  { label: 'Ingresses', path: '/network/ingresses', icon: LogIn },
  { label: 'Ingress Classes', path: '/network/ingressclasses', icon: Tag },
  { label: 'Network Policies', path: '/network/networkpolicies', icon: ShieldAlert },
  { label: 'Port Forwarding', path: '/network/portforwarding', icon: Forward },
];

const STORAGE_ITEMS: NavItem[] = [
  { label: 'PVC', path: '/storage/pvc', icon: HardDrive },
  { label: 'PV', path: '/storage/pv', icon: DatabaseZap },
  { label: 'Storage Classes', path: '/storage/storageclasses', icon: Layers3 },
];

function getErrorMessage(err: unknown): string | null {
  if (err instanceof Error && err.message.trim()) return err.message;
  if (typeof err === 'string' && err.trim()) return err;
  if (typeof err === 'object' && err !== null && 'message' in err) {
    const message = (err as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim()) return message;
  }
  return null;
}

function isNoKubeconfigError(message: string | null): boolean {
  if (!message) return false;
  const normalized = message.toLowerCase();
  return normalized.includes('no kubeconfig file found')
    || normalized.includes('no kubeconfig files found')
    || normalized.includes('no cluster configuration found');
}

const CONFIG_ITEMS: NavItem[] = [
  { label: 'Config Maps', path: '/config/configmaps', icon: FileText },
  { label: 'Secrets', path: '/config/secrets', icon: KeyRound },
  { label: 'Resource Quotas', path: '/config/resourcequotas', icon: Gauge },
  { label: 'Limit Ranges', path: '/config/limitranges', icon: SlidersHorizontal },
  { label: 'HPA', path: '/config/hpa', icon: TrendingUp },
  { label: 'PDB', path: '/config/pdb', icon: Shield },
  { label: 'Priority Classes', path: '/config/priorityclasses', icon: Flag },
  { label: 'Runtime Classes', path: '/config/runtimeclasses', icon: Cog },
  { label: 'Leases', path: '/config/leases', icon: Timer },
  { label: 'MWC', path: '/config/mwc', icon: FilePenLine },
  { label: 'VWC', path: '/config/vwc', icon: FileCheck },
];

const WORKLOAD_ITEMS: NavItem[] = [
  { label: 'Overview', path: '/workloads', icon: LayoutGrid },
  { label: 'Pods', path: '/pods', icon: Container },
  { label: 'Deployment', path: '/deployments', icon: Rocket },
  { label: 'StatefulSet', path: '/statefulsets', icon: Database },
  { label: 'DaemonSet', path: '/daemonsets', icon: Repeat },
  { label: 'ReplicaSet', path: '/replicasets', icon: Copy },
  { label: 'Jobs', path: '/jobs', icon: Briefcase },
  { label: 'CronJob', path: '/cronjobs', icon: CalendarClock },
];

interface BreadcrumbItem {
  label: string;
  path?: string;
  icon?: IconComponent;
}

function kubeconfigDisplayName(path: string): string {
  const trimmed = path.trim();
  if (!trimmed) return 'Default kubeconfig';
  const segments = trimmed.split('/').filter(Boolean);
  return segments.length ? segments[segments.length - 1] : trimmed;
}

function normalizeOmniUrl(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

function buildOmniConnectUrl(omniUrl: string, email: string): string {
  const parsed = new URL(omniUrl);
  const normalizedEmail = email.trim();
  if (normalizedEmail) {
    parsed.searchParams.set('email', normalizedEmail);
    parsed.searchParams.set('login_hint', normalizedEmail);
  }
  return parsed.toString();
}

function isLikelyDigitalOceanContext(item: DesktopKubeconfigCluster): boolean {
  const haystack = `${item.context} ${item.cluster ?? ''} ${item.kubeconfigPath}`.toLowerCase();
  return haystack.includes('digitalocean') || haystack.includes('digitalocian') || haystack.includes('do-');
}

export const Layout = () => {
  const desktopMode = isDesktopRuntime();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [showNamespaceMenu, setShowNamespaceMenu] = useState(false);
  const [showKubeconfigModal, setShowKubeconfigModal] = useState(false);
  const [kubeconfigPath, setKubeconfigPath] = useState('');
  const [kubeContext, setKubeContext] = useState('');
  const [kubeconfigCandidates, setKubeconfigCandidates] = useState<string[]>([]);
  const [kubeconfigInput, setKubeconfigInput] = useState('');
  const [clusterSearch, setClusterSearch] = useState('');
  const [kubeClusters, setKubeClusters] = useState<DesktopKubeconfigCluster[]>([]);
  const [selectedClusterContext, setSelectedClusterContext] = useState('');
  const [kubeconfigLoading, setKubeconfigLoading] = useState(false);
  const [kubeconfigSwitching, setKubeconfigSwitching] = useState(false);
  const [kubeconfigInitialized, setKubeconfigInitialized] = useState(false);
  const [kubeconfigError, setKubeconfigError] = useState<string | null>(null);
  const [noClusterConfigDetected, setNoClusterConfigDetected] = useState(false);
  const [startupClusterSelectionDone, setStartupClusterSelectionDone] = useState(false);
  const [authStatus, setAuthStatus] = useState<DesktopAuthStatus | null>(null);
  const [omniUrl, setOmniUrl] = useState('');
  const [omniEmail, setOmniEmail] = useState('');
  const [omniConnectLoading, setOmniConnectLoading] = useState(false);
  const [cloudProvider, setCloudProvider] = useState<'talos-omni' | 'gcp' | 'aws' | 'azure' | 'digitalocian'>('talos-omni');
  const [digitaloceanApiToken, setDigitaloceanApiToken] = useState('');
  const [awsAccessKey, setAwsAccessKey] = useState('');
  const [awsSecretKey, setAwsSecretKey] = useState('');
  const [awsSessionToken, setAwsSessionToken] = useState('');
  const [awsAccountId, setAwsAccountId] = useState('');
  const [awsRegion, setAwsRegion] = useState('ap-southeast-1');
  const [awsEksClusters, setAwsEksClusters] = useState<import('../utils/tauriDesktop').EksClusterEntry[]>([]);
  const [cloudListReady, setCloudListReady] = useState(false);
  const [omniClusters, setOmniClusters] = useState<any[]>([]);
  const [omniLoading, setOmniLoading] = useState(false);
  const [gcpProjectId, setGcpProjectId] = useState('');
  const [gcpClusters, setGcpClusters] = useState<any[]>([]);
  const [gcpLoading, setGcpLoading] = useState(false);
  const [azureSubscriptionId, setAzureSubscriptionId] = useState('');
  const [azureClusters, setAzureClusters] = useState<any[]>([]);
  const [azureLoading, setAzureLoading] = useState(false);
  const [showCloudProviderMenu, setShowCloudProviderMenu] = useState(false);
  const [showClusterMenu, setShowClusterMenu] = useState(false);
  const [omniSubmitted, setOmniSubmitted] = useState(false);
  const [awsSubmitted, setAwsSubmitted] = useState(false);
  const [gcpSubmitted, setGcpSubmitted] = useState(false);
  const [azureSubmitted, setAzureSubmitted] = useState(false);
  const [digitaloceanSubmitted, setDigitaloceanSubmitted] = useState(false);
  const [clusterImportTab, setClusterImportTab] = useState<'kubeconfig' | 'cloud'>('kubeconfig');
  const [workloadsOpen, setWorkloadsOpen] = useState(false);
  const [showSidecarLogs, setShowSidecarLogs] = useState(false);
  const [configOpen, setConfigOpen] = useState(false);
  const [storageOpen, setStorageOpen] = useState(false);
  const [networkOpen, setNetworkOpen] = useState(false);
  const [helmOpen, setHelmOpen] = useState(false);
  const [accessControlOpen, setAccessControlOpen] = useState(false);
  const [customResourcesOpen, setCustomResourcesOpen] = useState(false);
  const [expandedCrdGroups, setExpandedCrdGroups] = useState<Set<string>>(new Set());
  const [sidebarWidthPx, setSidebarWidthPx] = useState(() => {
    if (typeof window === 'undefined') return SIDEBAR_WIDTH_DEFAULT;
    const stored = window.localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY);
    const n = stored ? parseInt(stored, 10) : NaN;
    return Number.isFinite(n) ? Math.min(SIDEBAR_WIDTH_MAX, Math.max(SIDEBAR_WIDTH_MIN, n)) : SIDEBAR_WIDTH_DEFAULT;
  });
  const isResizingRef = useRef(false);
  const resizeStartXRef = useRef(0);
  const resizeStartWidthRef = useRef(0);
  const kubeconfigRefreshRequestRef = useRef(0);
  const clusterApplyTargetRef = useRef('');
  const noConfigModalShownRef = useRef(false);
  const authPlaceholderModalShownRef = useRef(false);

  const location = useLocation();
  const navigate = useNavigate();
  const isAppSettingsOpen = location.pathname === '/desktop/settings';
  const { data: crds, isLoading: crdsLoading, hasFetched: crdsHasFetched, emptyListConfirmed: crdsEmptyListConfirmed } = useRealtimeCrds();

  const crdGroups = useMemo(() => {
    if (!crds) return [];
    const groupMap = new Map<string, typeof crds>();
    for (const crd of crds) {
      if (!groupMap.has(crd.group)) groupMap.set(crd.group, []);
      groupMap.get(crd.group)!.push(crd);
    }
    return Array.from(groupMap.entries())
      .map(([group, items]) => ({
        group,
        crds: [...items].sort((a, b) => a.kind.localeCompare(b.kind)),
      }))
      .sort((a, b) => a.group.localeCompare(b.group));
  }, [crds]);

  const namespaceMenuRef = useRef<HTMLDivElement>(null);
  const cloudProviderMenuRef = useRef<HTMLDivElement>(null);
  const clusterMenuRef = useRef<HTMLDivElement>(null);
  const { selectedNamespaces, setSelectedNamespaces, toggleNamespace, clearNamespaces, namespaces, setNamespaces, resourceNameFilter, setResourceNameFilter } = useNamespace();
  const { data: realtimeNamespaces } = useRealtimeNamespaces();
  const { data: apiNamespaces } = useNamespaces();

  // Hide namespace filter on Dashboard, Nodes, Namespaces, and Helm Charts
  const shouldShowNamespaceFilter = location.pathname !== '/'
    && location.pathname !== '/cluster'
    && location.pathname !== '/nodes'
    && location.pathname !== '/namespaces'
    && location.pathname !== '/helm/charts';

  // Connect to host machine or Kubernetes pod
  // (handled by BottomPanel via openPanelTab)

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (namespaceMenuRef.current && !namespaceMenuRef.current.contains(event.target as Node)) {
        setShowNamespaceMenu(false);
      }
      if (cloudProviderMenuRef.current && !cloudProviderMenuRef.current.contains(event.target as Node)) {
        setShowCloudProviderMenu(false);
      }
      if (clusterMenuRef.current && !clusterMenuRef.current.contains(event.target as Node)) {
        setShowClusterMenu(false);
      }
    }

    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  useEffect(() => {
    const openSettings = () => {
      navigate('/desktop/settings');
      setSidebarOpen(false);
    };

    window.addEventListener('ptkublet-open-settings', openSettings as EventListener);
    return () => window.removeEventListener('ptkublet-open-settings', openSettings as EventListener);
  }, [navigate]);

  const closeAppSettings = () => {
    if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate('/');
    }
  };

  useEffect(() => {
    if (!desktopMode) return;

    let cancelled = false;
    const loadKubeconfigInfo = async () => {
      setKubeconfigLoading(true);
      try {
        const [config, candidates] = await Promise.all([
          getDesktopSidecarConfig(),
          listDesktopKubeconfigCandidates(),
        ]);
        if (cancelled) return;

        const currentPath = (config.kubeconfigPath ?? '').trim();
        const currentContext = (config.kubeContext ?? '').trim();

        // Always keep a saved/persisted kubeconfig path even when discovery is empty
        // (common for Finder-launched DMG installs with a minimal process env).
        const merged = new Set(candidates ?? []);
        if (currentPath) merged.add(currentPath);
        const sortedCandidates = Array.from(merged).sort((a, b) => a.localeCompare(b));

        if (sortedCandidates.length === 0) {
          setKubeconfigError(null);
          setNoClusterConfigDetected(true);
          setKubeClusters([]);
          setSelectedClusterContext('');
          setKubeconfigPath('');
          setKubeContext('');
          setKubeconfigInput('');
          setKubeconfigCandidates([]);
          setKubeconfigLoading(false);
          setKubeconfigInitialized(true);
          return;
        }

        setNoClusterConfigDetected(false);
        setKubeconfigPath(currentPath);
        setKubeContext(currentContext);
        setStartupClusterSelectionDone(Boolean(currentContext));
        setKubeconfigInput(currentPath);
        setSelectedClusterContext('');
        setKubeconfigCandidates(sortedCandidates);

        const clusters = await listDesktopKubeconfigClusters(currentPath || null);
        if (cancelled) return;
        setKubeClusters(clusters);
      } catch (err) {
        if (cancelled) return;
        const rawMessage = getErrorMessage(err);
        const auth = await getDesktopAuthStatus();
        const resolvedMessage =
          rawMessage
          || auth.message
          || 'Failed to load Kubernetes cluster configuration.';

        if (isNoKubeconfigError(resolvedMessage)) {
          setKubeconfigError(null);
          setNoClusterConfigDetected(true);
          setKubeClusters([]);
          setSelectedClusterContext('');
          return;
        }

        setNoClusterConfigDetected(false);
        setKubeconfigError(resolvedMessage);
        toast.error(resolvedMessage);
      } finally {
        if (!cancelled) {
          setKubeconfigLoading(false);
          setKubeconfigInitialized(true);
        }
      }
    };

    void loadKubeconfigInfo();

    return () => {
      cancelled = true;
    };
  }, [desktopMode]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setOmniUrl(window.localStorage.getItem(TALOS_OMNI_URL_STORAGE_KEY) ?? '');
    setOmniEmail(window.localStorage.getItem(TALOS_OMNI_EMAIL_STORAGE_KEY) ?? '');
    setAwsAccessKey(window.localStorage.getItem(AWS_ACCESS_KEY_STORAGE_KEY) ?? '');
    setAwsSecretKey(window.localStorage.getItem(AWS_SECRET_KEY_STORAGE_KEY) ?? '');
    setAwsSessionToken(window.localStorage.getItem(AWS_SESSION_TOKEN_STORAGE_KEY) ?? '');
    setAwsAccountId(window.localStorage.getItem(AWS_ACCOUNT_ID_STORAGE_KEY) ?? '');
    setGcpProjectId(window.localStorage.getItem(GCP_PROJECT_ID_STORAGE_KEY) ?? '');
    setAzureSubscriptionId(window.localStorage.getItem(AZURE_SUBSCRIPTION_ID_STORAGE_KEY) ?? '');
    setDigitaloceanApiToken(window.localStorage.getItem(DIGITALOCEAN_TOKEN_STORAGE_KEY) ?? '');
  }, []);

  // Poll /api/auth-status every 5s so we can show the browser-login CTA when
  // the sidecar starts with a placeholder (unauthenticated) kube client.
  useEffect(() => {
    if (!desktopMode) return;
    let alive = true;

    const poll = async () => {
      const status = await getDesktopAuthStatus();
      if (alive) setAuthStatus(status);
    };

    void poll();
    const id = window.setInterval(() => {
      void poll();
    }, 5_000);

    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [desktopMode]);

  const trimmedOmniUrl = omniUrl.trim();
  const trimmedOmniEmail = omniEmail.trim();
  const normalizedOmniUrl = normalizeOmniUrl(trimmedOmniUrl);
  const omniUrlError = useMemo(() => {
    if (!trimmedOmniUrl) return 'Omni URL is required.';
    try {
      const parsed = new URL(normalizedOmniUrl);
      if (!/^https?:$/.test(parsed.protocol)) {
        return 'Omni URL must start with http:// or https://';
      }
      return null;
    } catch {
      return 'Enter a valid Omni URL.';
    }
  }, [trimmedOmniUrl, normalizedOmniUrl]);
  const omniEmailError = useMemo(() => {
    if (!trimmedOmniEmail) return 'Email address is required.';
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedOmniEmail)
      ? null
      : 'Enter a valid email address.';
  }, [trimmedOmniEmail]);

  const trimmedAwsAccessKey = awsAccessKey.trim();
  const trimmedAwsSecretKey = awsSecretKey.trim();
  const trimmedAwsSessionToken = awsSessionToken.trim();
  const trimmedAwsAccountId = awsAccountId.trim();
  const trimmedAwsRegion = awsRegion.trim();
  const awsAccessKeyError = useMemo(() => {
    if (!trimmedAwsAccessKey) return 'Access key is required.';
    return /^[A-Z0-9]{16,128}$/.test(trimmedAwsAccessKey)
      ? null
      : 'Access key should be uppercase alphanumeric (min 16 chars).';
  }, [trimmedAwsAccessKey]);
  const awsSecretKeyError = useMemo(() => {
    if (!trimmedAwsSecretKey) return 'Secret key is required.';
    return trimmedAwsSecretKey.length >= 20 ? null : 'Secret key looks too short.';
  }, [trimmedAwsSecretKey]);
  const awsAccountIdError = useMemo(() => {
    if (!trimmedAwsAccountId) return null;
    return /^\d{12}$/.test(trimmedAwsAccountId) ? null : 'AWS account ID must be 12 digits.';
  }, [trimmedAwsAccountId]);
  const awsRegionError = useMemo(() => {
    if (!trimmedAwsRegion) return 'Region is required.';
    return /^[a-z]{2}(?:-gov)?-[a-z]+-\d$/.test(trimmedAwsRegion)
      ? null
      : 'Region format looks invalid (example: ap-southeast-1).';
  }, [trimmedAwsRegion]);

  const trimmedGcpProjectId = gcpProjectId.trim();
  const gcpProjectIdError = useMemo(() => {
    if (!trimmedGcpProjectId) return 'GCP project ID is required.';
    return trimmedGcpProjectId.length >= 6 ? null : 'Project ID should be at least 6 characters.';
  }, [trimmedGcpProjectId]);

  const trimmedAzureSubscriptionId = azureSubscriptionId.trim();
  const azureSubscriptionIdError = useMemo(() => {
    if (!trimmedAzureSubscriptionId) return 'Subscription ID is required.';
    return /^[a-f0-9\-]{36}$/.test(trimmedAzureSubscriptionId) ? null : 'Subscription ID format is invalid.';
  }, [trimmedAzureSubscriptionId]);

  const trimmedDigitaloceanToken = digitaloceanApiToken.trim();
  const digitaloceanTokenError = useMemo(() => {
    if (!trimmedDigitaloceanToken) return 'DigitalOcean API token is required.';
    return /^dop_v1_\w+$/.test(trimmedDigitaloceanToken)
      ? null
      : 'Token should start with dop_v1_';
  }, [trimmedDigitaloceanToken]);

  const handleTalosOmniConnect = async () => {
    setOmniSubmitted(true);
    if (omniUrlError) {
      toast.error(omniUrlError);
      return;
    }
    if (omniEmailError) {
      toast.error(omniEmailError);
      return;
    }

    setOmniConnectLoading(true);
    try {
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(TALOS_OMNI_URL_STORAGE_KEY, normalizedOmniUrl);
        window.localStorage.setItem(TALOS_OMNI_EMAIL_STORAGE_KEY, trimmedOmniEmail);
      }

      // Log the connection attempt
      await logOmniConnectionAttempt(normalizedOmniUrl, trimmedOmniEmail);

      const connectUrl = buildOmniConnectUrl(normalizedOmniUrl, trimmedOmniEmail);
      await openDesktopExternalUrl(connectUrl);
      setCloudListReady(true);
    } catch (err) {
      toast.error(getErrorMessage(err) ?? 'Failed to open Talos Omni browser login.');
    } finally {
      setOmniConnectLoading(false);
    }
  };

  const handleOmniListClusters = async () => {
    setOmniSubmitted(true);
    if (omniUrlError) {
      toast.error(omniUrlError);
      return;
    }

    setOmniLoading(true);
    try {
      const clusters = await listOmniClusters(normalizedOmniUrl);
      setOmniClusters(clusters || []);
      setCloudListReady(true);
      if (!clusters || clusters.length === 0) {
        toast.success('No Talos Omni clusters found from provider.');
      } else {
        toast.success(`Found ${clusters.length} Talos Omni cluster(s) from provider (filtered).`);
      }
    } catch (err) {
      toast.error(`Failed to list Talos Omni clusters: ${getErrorMessage(err) ?? String(err)}`);
    } finally {
      setOmniLoading(false);
    }
  };

  const handleProviderSignIn = async () => {
    if (cloudProvider === 'azure') {
      await openDesktopExternalUrl('https://portal.azure.com/');
      return;
    }
    if (cloudProvider === 'gcp') {
      await openDesktopExternalUrl('https://accounts.google.com/');
    }
  };

  const handleAwsApplyCredentials = async () => {
    setAwsSubmitted(true);
    const firstError = awsAccessKeyError || awsSecretKeyError || awsAccountIdError || awsRegionError;
    if (firstError) {
      toast.error(firstError);
      return;
    }

    if (typeof window !== 'undefined') {
      window.localStorage.setItem(AWS_ACCESS_KEY_STORAGE_KEY, trimmedAwsAccessKey);
      window.localStorage.setItem(AWS_SECRET_KEY_STORAGE_KEY, trimmedAwsSecretKey);
      window.localStorage.setItem(AWS_SESSION_TOKEN_STORAGE_KEY, trimmedAwsSessionToken);
      window.localStorage.setItem(AWS_ACCOUNT_ID_STORAGE_KEY, trimmedAwsAccountId);
    }

    setKubeconfigLoading(true);
    try {
      const eksClusters = await listAwsEksClusters(trimmedAwsAccessKey, trimmedAwsSecretKey, trimmedAwsSessionToken, trimmedAwsRegion || 'us-east-1');
      setAwsEksClusters(eksClusters);
      if (eksClusters.length === 0) {
        toast.success('AWS credentials saved. No EKS clusters found in that region.');
      } else {
        toast.success(`AWS credentials saved. Found ${eksClusters.length} EKS cluster(s).`);
      }
      setCloudListReady(true);
    } catch (err) {
      console.error('[AWS] list EKS clusters error:', err);
      toast.error(`Failed to list EKS clusters: ${getErrorMessage(err) ?? String(err)}`);
    } finally {
      setKubeconfigLoading(false);
    }
  };

  const handleGcpApplyCredentials = async () => {
    setGcpSubmitted(true);
    if (gcpProjectIdError) {
      toast.error(gcpProjectIdError);
      return;
    }

    if (typeof window !== 'undefined') {
      window.localStorage.setItem(GCP_PROJECT_ID_STORAGE_KEY, trimmedGcpProjectId);
    }

    setGcpLoading(true);
    try {
      const clusters = await listGcpClusters(trimmedGcpProjectId);
      setGcpClusters(clusters || []);
      setCloudListReady(true);
      if (!clusters || clusters.length === 0) {
        toast.success('GCP project set. No GKE clusters found.');
      } else {
        toast.success(`GCP project set. Found ${clusters.length} GKE cluster(s).`);
      }
    } catch (err) {
      console.error('[GCP] list clusters error:', err);
      toast.error(`Failed to list GCP clusters: ${getErrorMessage(err) ?? String(err)}`);
    } finally {
      setGcpLoading(false);
    }
  };

  const handleAzureApplyCredentials = async () => {
    setAzureSubmitted(true);
    if (azureSubscriptionIdError) {
      toast.error(azureSubscriptionIdError);
      return;
    }

    if (typeof window !== 'undefined') {
      window.localStorage.setItem(AZURE_SUBSCRIPTION_ID_STORAGE_KEY, trimmedAzureSubscriptionId);
    }

    setAzureLoading(true);
    try {
      const clusters = await listAzureClusters(trimmedAzureSubscriptionId);
      setAzureClusters(clusters || []);
      setCloudListReady(true);
      if (!clusters || clusters.length === 0) {
        toast.success('Azure subscription set. No AKS clusters found.');
      } else {
        toast.success(`Azure subscription set. Found ${clusters.length} AKS cluster(s).`);
      }
    } catch (err) {
      console.error('[Azure] list clusters error:', err);
      toast.error(`Failed to list Azure clusters: ${getErrorMessage(err) ?? String(err)}`);
    } finally {
      setAzureLoading(false);
    }
  };

  const handleDigitaloceanApplyToken = async () => {
    setDigitaloceanSubmitted(true);
    if (digitaloceanTokenError) {
      toast.error(digitaloceanTokenError);
      return;
    }

    if (typeof window !== 'undefined') {
      window.localStorage.setItem(DIGITALOCEAN_TOKEN_STORAGE_KEY, trimmedDigitaloceanToken);
    }

    toast.success('DigitalOcian API token saved.');
    setCloudListReady(true);
  };

  const handleCloudProviderRefresh = async () => {
    if (cloudProvider === 'talos-omni') {
      await handleOmniListClusters();
      return;
    }
    if (cloudProvider === 'aws') {
      await handleAwsApplyCredentials();
      return;
    }
    if (cloudProvider === 'gcp') {
      await handleGcpApplyCredentials();
      return;
    }
    if (cloudProvider === 'azure') {
      await handleAzureApplyCredentials();
      return;
    }
    await handleDigitaloceanApplyToken();
  };

  const refreshClustersForKubeconfig = async (path: string) => {
    if (!desktopMode) return;

    const requestId = ++kubeconfigRefreshRequestRef.current;
    setKubeconfigLoading(true);
    try {
      const clusters = await listDesktopKubeconfigClusters(path || null);
      if (requestId !== kubeconfigRefreshRequestRef.current) {
        return;
      }

      setKubeClusters(clusters);
      setNoClusterConfigDetected(false);
      if (clusters.length === 0) {
        setSelectedClusterContext('');
      } else {
        setSelectedClusterContext('');
      }
    } catch (err) {
      if (requestId !== kubeconfigRefreshRequestRef.current) {
        return;
      }

      const rawMessage = getErrorMessage(err);
      if (isNoKubeconfigError(rawMessage)) {
        setNoClusterConfigDetected(true);
        setKubeClusters([]);
        setSelectedClusterContext('');
        return;
      }
      setNoClusterConfigDetected(false);
      setKubeClusters([]);
      toast.error(err instanceof Error ? err.message : 'Failed to load clusters for kubeconfig.');
    } finally {
      if (requestId === kubeconfigRefreshRequestRef.current) {
        setKubeconfigLoading(false);
      }
    }
  };

  const refreshKubeconfigSources = async (preferredPath?: string) => {
    const candidates = await listDesktopKubeconfigCandidates();
    const merged = new Set(candidates);
    if (kubeconfigInput) merged.add(kubeconfigInput);
    if (kubeconfigPath) merged.add(kubeconfigPath);

    const sorted = Array.from(merged).sort((a, b) => a.localeCompare(b));
    setKubeconfigCandidates(sorted);

    const targetPath = (preferredPath ?? (kubeconfigInput || kubeconfigPath)).trim();
    await refreshClustersForKubeconfig(targetPath);

    if (targetPath) {
      setKubeconfigInput(targetPath);
    }
  };

  const handleManualClusterRefresh = async () => {
    try {
      const refreshPath = clusterImportTab === 'cloud' ? '' : (kubeconfigInput || kubeconfigPath);
      await refreshKubeconfigSources(refreshPath);
      if (!refreshPath.trim()) {
        setKubeconfigInput('');
      }
    } catch (err) {
      toast.error(getErrorMessage(err) ?? 'Failed to refresh cluster contexts.');
    }
  };

  const applyClusterSelection = async (path: string, context: string) => {
    if (!desktopMode) return;
    if (kubeconfigSwitching) return;

    setKubeconfigSwitching(true);
    try {
      const current = await getDesktopSidecarConfig();
      const nextPath = path.trim();
      const nextContext = context.trim();

      if (!nextContext) {
        return;
      }

      const targetKey = `${nextPath}::${nextContext}`;
      if (clusterApplyTargetRef.current === targetKey) {
        return;
      }
      clusterApplyTargetRef.current = targetKey;

      const currentPath = (current.kubeconfigPath || '').trim();
      const currentContext = (current.kubeContext || '').trim();
      if (currentPath === nextPath && currentContext === nextContext) {
        setKubeconfigPath(nextPath);
        setKubeContext(nextContext);
        setKubeconfigInput(nextPath);
        setSelectedClusterContext(nextContext);
        setShowKubeconfigModal(false);
        setStartupClusterSelectionDone(true);
        return;
      }

      await saveDesktopSidecarConfig({
        ...current,
        kubeconfigPath: nextPath || null,
        kubeContext: nextContext || null,
      });

      // Clear stale old-cluster content immediately while switch is in progress.
      window.dispatchEvent(new CustomEvent('cluster:switched'));

      const switchResult = await waitDesktopClusterSwitchResult(nextContext, 95_000);
      if (!switchResult.success) {
        throw new Error(switchResult.message || 'Cluster switch failed. Previous cluster was restored.');
      }

      // Sidecar restart may auto-select a different free port; re-read effective config
      // so desktop HTTP/WebSocket calls target the live backend immediately.
      await getDesktopSidecarConfig();

      const candidates = await listDesktopKubeconfigCandidates();
      const merged = new Set(candidates);
      if (nextPath) merged.add(nextPath);

      setKubeconfigPath(nextPath);
      setKubeContext(nextContext);
      setNoClusterConfigDetected(false);
      setKubeconfigInput(nextPath);
      setSelectedClusterContext(nextContext);
      setKubeconfigCandidates(Array.from(merged).sort((a, b) => a.localeCompare(b)));
      await refreshClustersForKubeconfig(nextPath);
      setShowKubeconfigModal(false);
      setStartupClusterSelectionDone(true);
      toast.success('Cluster switched successfully.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to apply cluster selection.');
    } finally {
      clusterApplyTargetRef.current = '';
      setKubeconfigSwitching(false);
    }
  };

  const filteredClusters = useMemo(() => {
    const q = clusterSearch.trim().toLowerCase();
    if (!q) return kubeClusters;
    return kubeClusters.filter((item) => {
      const hay = `${item.context} ${item.cluster ?? ''} ${item.namespace ?? ''}`.toLowerCase();
      return hay.includes(q);
    });
  }, [clusterSearch, kubeClusters]);

  const visibleClusters = useMemo(() => {
    if (clusterImportTab !== 'cloud') return filteredClusters;

    if (cloudProvider === 'talos-omni') {
      if (omniClusters.length > 0) {
        const q = clusterSearch.toLowerCase();
        return omniClusters
          .filter((c) => {
            const name = (c?.name || c?.id || c?.metadata?.name || '').toString();
            return !q || name.toLowerCase().includes(q);
          })
          .map((c) => {
            const name = (c?.name || c?.id || c?.metadata?.name || 'unknown').toString();
            return {
              context: name,
              cluster: name,
              namespace: null,
              isCurrent: false,
              kubeconfigPath: '',
            };
          });
      }
      return [];
    }
    
    if (cloudProvider === 'aws') {
      // When cloud list is ready, show only clusters fetched directly from AWS EKS API
      if (cloudListReady && awsEksClusters.length >= 0) {
        const q = clusterSearch.toLowerCase();
        return awsEksClusters
          .filter((e) => !q || e.arn.toLowerCase().includes(q) || e.name.toLowerCase().includes(q))
          .map((e) => ({
            context: e.arn,
            cluster: e.arn,
            namespace: null,
            isCurrent: false,
            kubeconfigPath: '',
          }));
      }
      return [];
    }
    
    if (cloudProvider === 'gcp') {
      // Show clusters from GCP API
      if (gcpClusters.length > 0) {
        const q = clusterSearch.toLowerCase();
        return gcpClusters
          .filter((c) => {
            const name = c.name || '';
            return !q || name.toLowerCase().includes(q);
          })
          .map((c) => ({
            context: c.name || 'unknown',
            cluster: c.name || 'unknown',
            namespace: null,
            isCurrent: false,
            kubeconfigPath: '',
          }));
      }
      return [];
    }
    
    if (cloudProvider === 'azure') {
      // Show clusters from Azure API
      if (azureClusters.length > 0) {
        const q = clusterSearch.toLowerCase();
        return azureClusters
          .filter((c) => {
            const name = c.name || '';
            return !q || name.toLowerCase().includes(q);
          })
          .map((c) => ({
            context: c.name || 'unknown',
            cluster: c.name || 'unknown',
            namespace: null,
            isCurrent: false,
            kubeconfigPath: '',
          }));
      }
      return [];
    }
    
    return filteredClusters.filter(isLikelyDigitalOceanContext);
  }, [clusterImportTab, cloudProvider, filteredClusters, awsAccountId, awsEksClusters, cloudListReady, clusterSearch, omniClusters, gcpClusters, azureClusters]);

  const selectedClusterItem = useMemo(
    () => visibleClusters.find((item) => item.context === selectedClusterContext) ?? null,
    [selectedClusterContext, visibleClusters]
  );

  const hasConfiguredClusterContext = kubeContext.trim().length > 0 || selectedClusterContext.trim().length > 0;
  const hasKubeconfigSource = kubeconfigPath.trim().length > 0 || kubeconfigCandidates.length > 0;

  const mustSelectCluster =
    desktopMode &&
    kubeconfigInitialized &&
    !kubeconfigLoading &&
    hasKubeconfigSource &&
    !hasConfiguredClusterContext &&
    !startupClusterSelectionDone &&
    kubeClusters.length > 0;

  useEffect(() => {
    if (mustSelectCluster) {
      setCloudProvider('talos-omni');
      setClusterImportTab('kubeconfig');
      setClusterSearch('');
      setShowKubeconfigModal(true);
    }
  }, [mustSelectCluster]);

  useEffect(() => {
    if (!desktopMode) return;

    if (!noClusterConfigDetected) {
      noConfigModalShownRef.current = false;
      return;
    }

    // No kubeconfig was discovered; open cluster modal once and direct user to
    // browser-based auth/import flow.
    if (noConfigModalShownRef.current) return;

    noConfigModalShownRef.current = true;
    setCloudProvider('talos-omni');
    setClusterImportTab('cloud');
    setClusterSearch('');
    setShowKubeconfigModal(true);
  }, [desktopMode, noClusterConfigDetected]);

  // Clear search when switching between tabs so cluster lists don't get filtered by stale search terms
  useEffect(() => {
    if (showKubeconfigModal) {
      setClusterSearch('');
    }
  }, [clusterImportTab, showKubeconfigModal]);

  useEffect(() => {
    if (!showKubeconfigModal) {
      setShowCloudProviderMenu(false);
      setShowClusterMenu(false);
      return;
    }

    if (clusterImportTab !== 'cloud' || cloudListReady) {
      setShowCloudProviderMenu(false);
    }
    setShowClusterMenu(false);
  }, [clusterImportTab, cloudListReady, showKubeconfigModal]);

  useEffect(() => {
    if (!desktopMode) return;

    if (!authStatus?.placeholder) {
      authPlaceholderModalShownRef.current = false;
      return;
    }

    // Cluster auth exists but is not currently usable (e.g. expired OIDC creds).
    // Open cluster selection modal once so user can re-authenticate or switch cluster.
    if (authPlaceholderModalShownRef.current) return;

    authPlaceholderModalShownRef.current = true;
    setCloudProvider('talos-omni');
    setClusterImportTab('cloud');
    setClusterSearch('');
    setShowKubeconfigModal(true);
  }, [desktopMode, authStatus?.placeholder]);

  useEffect(() => {
    if (!desktopMode) return;
    if (clusterImportTab !== 'kubeconfig') return;
    if (!showKubeconfigModal) return;

    void refreshKubeconfigSources();
  }, [desktopMode, clusterImportTab, showKubeconfigModal]);

  useEffect(() => {
    if (!desktopMode) return;
    if (!showKubeconfigModal) return;
    if (clusterImportTab !== 'kubeconfig') return;

    const onFocus = () => {
      void refreshKubeconfigSources();
    };

    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [desktopMode, showKubeconfigModal, clusterImportTab]);

  useEffect(() => {
    if (!desktopMode) return;
    if (clusterImportTab !== 'kubeconfig') return;

    const source = kubeconfigInput || kubeconfigPath;
    void refreshClustersForKubeconfig(source);
  }, [clusterImportTab]);

  useEffect(() => {
    if (clusterImportTab !== 'cloud') return;
    setCloudListReady(false);
    setSelectedClusterContext('');
    setOmniClusters([]);
    setAwsEksClusters([]);
    setGcpClusters([]);
    setAzureClusters([]);
  }, [clusterImportTab, cloudProvider]);

  useEffect(() => {
    const pathname = location.pathname;

    if (WORKLOAD_ITEMS.some((item) => pathname.startsWith(item.path))) {
      setWorkloadsOpen(true);
    }
    if (CONFIG_ITEMS.some((item) => pathname.startsWith(item.path))) {
      setConfigOpen(true);
    }
    if (NETWORK_ITEMS.some((item) => pathname.startsWith(item.path)) || pathname === '/network') {
      setNetworkOpen(true);
    }
    if (STORAGE_ITEMS.some((item) => pathname.startsWith(item.path)) || pathname === '/storage') {
      setStorageOpen(true);
    }
    if (HELM_ITEMS.some((item) => pathname.startsWith(item.path)) || pathname === '/helm') {
      setHelmOpen(true);
    }
    if (ACCESS_CONTROL_ITEMS.some((item) => pathname.startsWith(item.path)) || pathname === '/access-control') {
      setAccessControlOpen(true);
    }
    // Custom Resources: when on /crds/:crdName, expand section and the API group so level 3 is visible
    if (pathname.startsWith('/crds/') && pathname !== '/crds') {
      const match = pathname.match(/^\/crds\/(.+)$/);
      if (match) {
        const crdName = decodeURIComponent(match[1].replace(/\/$/, ''));
        const group = crdName.includes('.') ? crdName.split('.').slice(1).join('.') : crdName;
        setCustomResourcesOpen(true);
        setExpandedCrdGroups((prev) => new Set(prev).add(group));
      }
    }
  }, [location.pathname]);

  useEffect(() => {
    const merged = new Set<string>();

    (apiNamespaces || []).forEach((ns) => {
      if (ns?.name) {
        merged.add(ns.name);
      }
    });

    (realtimeNamespaces || []).forEach((ns) => {
      if (ns?.name) {
        merged.add(ns.name);
      }
    });

    const namespaceNames = Array.from(merged).sort((a, b) => a.localeCompare(b));

    // Always sync namespace options, including empty states after cluster switches,
    // so old-cluster entries do not linger in the filter menu.
    setNamespaces(namespaceNames);

    if (selectedNamespaces.length > 0 && namespaceNames.length > 0) {
      const validSelected = selectedNamespaces.filter((ns) => namespaceNames.includes(ns));
      if (validSelected.length !== selectedNamespaces.length) {
        setSelectedNamespaces(validSelected);
      }
    } else if (selectedNamespaces.length > 0 && namespaceNames.length === 0) {
      setSelectedNamespaces([]);
    }
  }, [apiNamespaces, realtimeNamespaces, selectedNamespaces, setNamespaces, setSelectedNamespaces]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, String(sidebarWidthPx));
  }, [sidebarWidthPx]);

  const handleSidebarResizeStart = (e: React.MouseEvent) => {
    if (sidebarCollapsed) return;
    e.preventDefault();
    isResizingRef.current = true;
    resizeStartXRef.current = e.clientX;
    resizeStartWidthRef.current = sidebarWidthPx;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    const onMouseMove = (ev: MouseEvent) => {
      const delta = ev.clientX - resizeStartXRef.current;
      const next = Math.min(SIDEBAR_WIDTH_MAX, Math.max(SIDEBAR_WIDTH_MIN, resizeStartWidthRef.current + delta));
      setSidebarWidthPx(next);
    };
    const onMouseUp = () => {
      isResizingRef.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  };

  const isActive = (path: string) => {
    if (path === '/') return location.pathname === '/';
    // Exact match or starts with path followed by '/' or '?'
    if (location.pathname === path) return true;
    return location.pathname.startsWith(path + '/');
  };

  const hasActiveWorkload = WORKLOAD_ITEMS.some((item) => isActive(item.path));
  const hasActiveConfig = CONFIG_ITEMS.some((item) => isActive(item.path));
  const hasActiveStorage = STORAGE_ITEMS.some((item) => isActive(item.path));
  const hasActiveNetwork = NETWORK_ITEMS.some((item) => isActive(item.path));
  const hasActiveHelm = HELM_ITEMS.some((item) => isActive(item.path));
  const hasActiveAccessControl = ACCESS_CONTROL_ITEMS.some((item) => isActive(item.path));
  const hasActiveCustomResources = location.pathname.startsWith('/crds');

  const breadcrumbs = (() => {
    // Show Terminal breadcrumb if on terminal route
    if (location.pathname === '/terminal') {
      return [{ label: 'Terminal', icon: Terminal }] as BreadcrumbItem[];
    }

    const pathname = location.pathname;

    if (pathname === '/') {
      return [{ label: 'Dashboard', path: '/', icon: LayoutDashboard }] as BreadcrumbItem[];
    }

    if (pathname === NAMESPACE_ITEM.path || pathname.startsWith(`${NAMESPACE_ITEM.path}/`)) {
      return [{ label: NAMESPACE_ITEM.label, path: NAMESPACE_ITEM.path, icon: NAMESPACE_ITEM.icon }] as BreadcrumbItem[];
    }

    if (pathname === EVENTS_ITEM.path || pathname.startsWith(`${EVENTS_ITEM.path}/`)) {
      return [{ label: EVENTS_ITEM.label, path: EVENTS_ITEM.path, icon: EVENTS_ITEM.icon }] as BreadcrumbItem[];
    }

    const navItem = [...NAV_ITEMS, ...BOTTOM_NAV_ITEMS].find(
      (item) => item.path !== '/' && (pathname === item.path || pathname.startsWith(`${item.path}/`))
    );
    if (navItem) {
      return [{ label: navItem.label, path: navItem.path, icon: navItem.icon }] as BreadcrumbItem[];
    }

    const workloadItem = WORKLOAD_ITEMS.find(
      (item) => pathname === item.path || pathname.startsWith(`${item.path}/`)
    );
    if (workloadItem) {
      return [{ label: 'Workloads', icon: Archive }, { label: workloadItem.label, icon: workloadItem.icon }] as BreadcrumbItem[];
    }

    const configItem = CONFIG_ITEMS.find(
      (item) => pathname === item.path || pathname.startsWith(`${item.path}/`)
    );
    if (configItem) {
      return [{ label: 'Config', icon: Settings }, { label: configItem.label, icon: configItem.icon }] as BreadcrumbItem[];
    }

    const networkItem = NETWORK_ITEMS.find(
      (item) => pathname === item.path || pathname.startsWith(`${item.path}/`)
    );
    if (networkItem) {
      return [{ label: 'Networks', path: '/network', icon: Network }, { label: networkItem.label, icon: networkItem.icon }] as BreadcrumbItem[];
    }
    if (pathname === '/network') {
      return [{ label: 'Networks', path: '/network', icon: Network }] as BreadcrumbItem[];
    }

    const storageItem = STORAGE_ITEMS.find(
      (item) => pathname === item.path || pathname.startsWith(`${item.path}/`)
    );
    if (storageItem) {
      return [{ label: 'Storage', path: '/storage', icon: Database }, { label: storageItem.label, icon: storageItem.icon }] as BreadcrumbItem[];
    }
    if (pathname === '/storage') {
      return [{ label: 'Storage', path: '/storage', icon: Database }] as BreadcrumbItem[];
    }

    const helmItem = HELM_ITEMS.find(
      (item) => pathname === item.path || pathname.startsWith(`${item.path}/`)
    );
    if (helmItem) {
      return [{ label: 'Helm', icon: Boxes }, { label: helmItem.label, icon: helmItem.icon }] as BreadcrumbItem[];
    }
    if (pathname === '/helm') {
      return [{ label: 'Helm', icon: Boxes }] as BreadcrumbItem[];
    }

    const accessControlItem = ACCESS_CONTROL_ITEMS.find(
      (item) => pathname === item.path || pathname.startsWith(`${item.path}/`)
    );
    if (accessControlItem) {
      return [
        { label: 'Access Control', icon: Shield },
        { label: accessControlItem.label, icon: accessControlItem.icon },
      ] as BreadcrumbItem[];
    }
    if (pathname === '/access-control') {
      return [{ label: 'Access Control', icon: Shield }] as BreadcrumbItem[];
    }

    if (pathname.startsWith('/crds/')) {
      const crdName = decodeURIComponent(pathname.replace('/crds/', ''));
      const crd = crds?.find((c) => c.name === crdName);
      if (crd) {
        return [
          { label: 'Custom Resources', icon: Layers },
          { label: crd.group },
          { label: crd.kind },
        ] as BreadcrumbItem[];
      }
      return [
        { label: 'Custom Resources', icon: Layers },
        { label: crdName },
      ] as BreadcrumbItem[];
    }
    if (pathname === '/crds') {
      return [{ label: 'Custom Resources', icon: Layers }] as BreadcrumbItem[];
    }

    return [{ label: 'Dashboard', path: '/', icon: LayoutDashboard }] as BreadcrumbItem[];
  })();

  const effectiveSidebarWidth = sidebarCollapsed ? 72 : sidebarWidthPx;
  const topRightTitle = (typeof window !== 'undefined' && window.__PERTISK_CONFIG__?.topRightTitle?.trim())
    || 'PTKublet';

  const handleDesktopTitleBarMouseDown = (e: React.MouseEvent) => {
    if (e.buttons !== 1) return;
    if (!appWindow) return;
    const target = e.target as HTMLElement;
    if (target.closest('button, a, input, select, textarea, [role="button"]')) return;
    if (e.detail === 2) {
      void appWindow.toggleMaximize();
    } else {
      void appWindow.startDragging();
    }
  };

  const clusterSelectionDialog = (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/50 p-3 sm:p-4"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Select cluster"
        className="flex h-[calc(100vh-1.5rem)] max-h-[calc(100vh-1.5rem)] w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-xl sm:h-[calc(100vh-2rem)] sm:max-h-[calc(100vh-2rem)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h3 className="text-base font-semibold text-text">Cluster</h3>
          <button
            type="button"
            onClick={() => {
              if (!mustSelectCluster) {
                setShowKubeconfigModal(false);
              }
            }}
            className="rounded-md p-1 text-text-secondary hover:bg-hover"
            disabled={mustSelectCluster}
          >
            <X size={18} />
          </button>
        </div>

        <div className="min-h-0 flex-1 px-4 py-3 sm:px-5 sm:py-4">
          <div className="grid h-full min-h-0 overflow-hidden rounded-lg border border-border bg-surface md:grid-cols-[220px,1fr]">
            <aside className="overflow-auto border-b border-border p-3 md:border-b-0 md:border-r">
              <nav className="space-y-1" aria-label="Cluster source tabs">
                {CLUSTER_IMPORT_TABS.map((tab) => {
                  const active = clusterImportTab === tab.value;
                  return (
                    <button
                      key={tab.value}
                      type="button"
                      onClick={() => {
                        setShowCloudProviderMenu(false);
                        if (tab.value === 'cloud') {
                          setClusterImportTab('cloud');
                          setKubeconfigInput('');
                          return;
                        }
                        setShowCloudProviderMenu(false);
                        setClusterImportTab('kubeconfig');
                      }}
                      className={cn(
                        'w-full rounded-md px-3 py-2 text-left text-sm font-medium transition-colors',
                        active
                          ? 'bg-primary text-white'
                          : 'text-text-secondary hover:bg-hover hover:text-text'
                      )}
                    >
                      {tab.label}
                    </button>
                  );
                })}
              </nav>
            </aside>

            <section className="flex min-h-0 flex-col">
              <header className="border-b border-border px-5 py-4">
                <h4 className="text-sm font-semibold text-text">
                  {CLUSTER_IMPORT_TABS.find((tab) => tab.value === clusterImportTab)?.label}
                </h4>
              </header>

              <div
                className={cn(
                  'flex-1 p-4 sm:p-5',
                  clusterImportTab === 'cloud' || clusterImportTab === 'kubeconfig'
                    ? `flex min-h-0 flex-col gap-4 ${showClusterMenu ? 'overflow-auto' : 'overflow-hidden'}`
                    : 'space-y-4 overflow-auto'
                )}
              >
                {mustSelectCluster && (
                  <div className="rounded-md border border-border bg-surface-elevated px-3 py-2 text-sm text-text-secondary">
                    Select a cluster context to continue to the dashboard.
                  </div>
                )}

                {clusterImportTab === 'cloud' && (
                  <div className="max-h-[40vh] shrink-0 overflow-auto rounded-lg border border-border bg-surface-elevated px-4 py-4 space-y-3 sm:max-h-[45vh] md:max-h-[unset]">
                    <div>
                      <h4 className="text-sm font-semibold text-text">Cloud Provider</h4>
                      <p className="mt-1 text-xs text-text-secondary">
                        Connect in your browser, then refresh and import a cluster context.
                      </p>
                    </div>

                    <div className="space-y-2">
                      <div className="block text-sm font-medium text-text-secondary">
                        Provider
                      </div>
                      <div ref={cloudProviderMenuRef} className="relative">
                        <button
                          type="button"
                          onClick={() => setShowCloudProviderMenu((previous) => !previous)}
                          className={cn(
                            'w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-left transition-colors',
                            showCloudProviderMenu ? 'border-primary/50 bg-hover/60' : 'hover:bg-hover/50'
                          )}
                          aria-haspopup="listbox"
                          aria-expanded={showCloudProviderMenu}
                        >
                          <span className="flex items-center justify-between gap-3">
                            <span className="text-xs font-medium text-text">
                              {CLOUD_PROVIDER_OPTIONS.find((provider) => provider.value === cloudProvider)?.label}
                            </span>
                            <ChevronDown
                              size={14}
                              className={cn('text-text-secondary transition-transform', showCloudProviderMenu && 'rotate-180')}
                            />
                          </span>
                        </button>

                        {showCloudProviderMenu && (
                          <div className="absolute left-0 right-0 top-[calc(100%+0.4rem)] z-20 overflow-hidden rounded-lg bg-surface-elevated shadow-2xl ring-1 ring-black/15 dark:ring-white/20">
                            {CLOUD_PROVIDER_OPTIONS.map((provider) => {
                              const active = provider.value === cloudProvider;
                              return (
                                <button
                                  key={provider.value}
                                  type="button"
                                  onClick={() => {
                                    setCloudProvider(provider.value);
                                    setShowCloudProviderMenu(false);
                                    setOmniSubmitted(false);
                                    setAwsSubmitted(false);
                                    setDigitaloceanSubmitted(false);
                                  }}
                                  className={cn(
                                    'w-full border-b border-black/10 px-3 py-1.5 text-left last:border-b-0 transition-colors dark:border-white/15',
                                    active ? 'bg-primary/10' : 'hover:bg-hover/70'
                                  )}
                                >
                                  <span className={cn('text-xs font-medium', active ? 'text-primary' : 'text-text')}>
                                    {provider.label}
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>

                    </div>

                    {cloudProvider === 'gcp' && (
                      <div className="rounded-md border border-border bg-surface px-3 py-3 text-xs text-text-secondary space-y-3">
                        <div>Sign in to Google to continue with Google Cloud Platform provider setup.</div>
                        <div className="flex items-center justify-end">
                          <button
                            type="button"
                            onClick={() => void handleProviderSignIn()}
                            className="rounded-md border border-border px-4 py-2 text-sm font-medium text-text-secondary hover:bg-hover"
                          >
                            Sign In With Google
                          </button>
                        </div>
                      </div>
                    )}

                    {cloudProvider === 'azure' && (
                      <div className="rounded-md border border-border bg-surface px-3 py-3 text-xs text-text-secondary space-y-3">
                        <div>Use web sign-in to authenticate with Microsoft Azure.</div>
                        <div className="flex items-center justify-end">
                          <button
                            type="button"
                            onClick={() => void handleProviderSignIn()}
                            className="rounded-md border border-border px-4 py-2 text-sm font-medium text-text-secondary hover:bg-hover"
                          >
                            Web Sign In Azure
                          </button>
                        </div>
                      </div>
                    )}

                    {cloudProvider === 'aws' && (
                      <div className="rounded-md border border-border bg-surface px-3 py-3 text-xs text-text-secondary space-y-3">
                        <div className="space-y-2">
                          <label htmlFor="aws-account-id" className="block text-sm font-medium text-text-secondary">
                            AWS account ID (optional)
                          </label>
                          <input
                            id="aws-account-id"
                            value={awsAccountId}
                            onChange={(e) => setAwsAccountId(e.target.value.replace(/\D/g, '').slice(0, 12))}
                            placeholder="123456789012"
                            autoCapitalize="none"
                            autoCorrect="off"
                            spellCheck={false}
                            className={cn(
                              'w-full rounded-md border bg-surface px-3 py-2 text-sm',
                              awsSubmitted && awsAccountIdError ? 'border-red-500/70' : 'border-border'
                            )}
                          />
                          {awsSubmitted && awsAccountIdError && <p className="text-xs text-red-400">{awsAccountIdError}</p>}
                        </div>
                        <div className="space-y-2">
                          <label htmlFor="aws-access-key" className="block text-sm font-medium text-text-secondary">
                            Access key
                          </label>
                          <input
                            id="aws-access-key"
                            value={awsAccessKey}
                            onChange={(e) => setAwsAccessKey(e.target.value)}
                            placeholder="AKIA..."
                            autoCapitalize="none"
                            autoCorrect="off"
                            spellCheck={false}
                            className={cn(
                              'w-full rounded-md border bg-surface px-3 py-2 text-sm',
                              awsSubmitted && awsAccessKeyError ? 'border-red-500/70' : 'border-border'
                            )}
                          />
                          {awsSubmitted && awsAccessKeyError && <p className="text-xs text-red-400">{awsAccessKeyError}</p>}
                        </div>
                        <div className="space-y-2">
                          <label htmlFor="aws-secret-key" className="block text-sm font-medium text-text-secondary">
                            Secret key
                          </label>
                          <input
                            id="aws-secret-key"
                            type="password"
                            value={awsSecretKey}
                            onChange={(e) => setAwsSecretKey(e.target.value)}
                            placeholder="Enter secret key"
                            autoCapitalize="none"
                            autoCorrect="off"
                            spellCheck={false}
                            className={cn(
                              'w-full rounded-md border bg-surface px-3 py-2 text-sm',
                              awsSubmitted && awsSecretKeyError ? 'border-red-500/70' : 'border-border'
                            )}
                          />
                          {awsSubmitted && awsSecretKeyError && <p className="text-xs text-red-400">{awsSecretKeyError}</p>}
                        </div>
                        <div className="space-y-2">
                          <label htmlFor="aws-session-token" className="block text-sm font-medium text-text-secondary">
                            Session token (optional)
                          </label>
                          <input
                            id="aws-session-token"
                            type="password"
                            value={awsSessionToken}
                            onChange={(e) => setAwsSessionToken(e.target.value)}
                            placeholder="Required for temporary STS credentials"
                            autoCapitalize="none"
                            autoCorrect="off"
                            spellCheck={false}
                            className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm"
                          />
                        </div>
                        <div className="space-y-2">
                          <label htmlFor="aws-region" className="block text-sm font-medium text-text-secondary">
                            Region
                          </label>
                          <input
                            id="aws-region"
                            value={awsRegion}
                            onChange={(e) => setAwsRegion(e.target.value)}
                            placeholder="ap-southeast-1"
                            autoCapitalize="none"
                            autoCorrect="off"
                            spellCheck={false}
                            className={cn(
                              'w-full rounded-md border bg-surface px-3 py-2 text-sm',
                              awsSubmitted && awsRegionError ? 'border-red-500/70' : 'border-border'
                            )}
                          />
                          {awsSubmitted && awsRegionError && <p className="text-xs text-red-400">{awsRegionError}</p>}
                        </div>
                      </div>
                    )}

                    {cloudProvider === 'digitalocian' && (
                      <div className="rounded-md border border-border bg-surface px-3 py-3 text-xs text-text-secondary space-y-3">
                        <div className="space-y-2">
                          <label htmlFor="digitalocean-api-token" className="block text-sm font-medium text-text-secondary">
                            API token
                          </label>
                          <input
                            id="digitalocean-api-token"
                            type="password"
                            value={digitaloceanApiToken}
                            onChange={(e) => setDigitaloceanApiToken(e.target.value)}
                            placeholder="dop_v1_..."
                            autoCapitalize="none"
                            autoCorrect="off"
                            spellCheck={false}
                            className={cn(
                              'w-full rounded-md border bg-surface px-3 py-2 text-sm',
                              digitaloceanSubmitted && digitaloceanTokenError ? 'border-red-500/70' : 'border-border'
                            )}
                          />
                          {digitaloceanSubmitted && digitaloceanTokenError && <p className="text-xs text-red-400">{digitaloceanTokenError}</p>}
                        </div>
                      </div>
                    )}

                    {cloudProvider === 'gcp' && (
                      <div className="rounded-md border border-border bg-surface px-3 py-3 text-xs text-text-secondary space-y-3">
                        <div className="space-y-2">
                          <label htmlFor="gcp-project-id" className="block text-sm font-medium text-text-secondary">
                            GCP Project ID
                          </label>
                          <input
                            id="gcp-project-id"
                            value={gcpProjectId}
                            onChange={(e) => setGcpProjectId(e.target.value)}
                            placeholder="my-project-id"
                            autoCapitalize="none"
                            autoCorrect="off"
                            spellCheck={false}
                            className={cn(
                              'w-full rounded-md border bg-surface px-3 py-2 text-sm',
                              gcpSubmitted && gcpProjectIdError ? 'border-red-500/70' : 'border-border'
                            )}
                          />
                          {gcpSubmitted && gcpProjectIdError && <p className="text-xs text-red-400">{gcpProjectIdError}</p>}
                        </div>
                        <p className="text-xs text-text-secondary">Make sure gcloud CLI is installed and configured with appropriate credentials.</p>
                      </div>
                    )}

                    {cloudProvider === 'azure' && (
                      <div className="rounded-md border border-border bg-surface px-3 py-3 text-xs text-text-secondary space-y-3">
                        <div className="space-y-2">
                          <label htmlFor="azure-subscription-id" className="block text-sm font-medium text-text-secondary">
                            Azure Subscription ID
                          </label>
                          <input
                            id="azure-subscription-id"
                            value={azureSubscriptionId}
                            onChange={(e) => setAzureSubscriptionId(e.target.value)}
                            placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                            autoCapitalize="none"
                            autoCorrect="off"
                            spellCheck={false}
                            className={cn(
                              'w-full rounded-md border bg-surface px-3 py-2 text-sm',
                              azureSubmitted && azureSubscriptionIdError ? 'border-red-500/70' : 'border-border'
                            )}
                          />
                          {azureSubmitted && azureSubscriptionIdError && <p className="text-xs text-red-400">{azureSubscriptionIdError}</p>}
                        </div>
                        <p className="text-xs text-text-secondary">Make sure az CLI is installed and configured with appropriate credentials.</p>
                      </div>
                    )}

                    {cloudProvider === 'talos-omni' && (
                      <div className="rounded-md border border-border bg-surface px-3 py-3 space-y-3">
                        <p className="text-xs text-text-secondary">Talos Omni settings (editable)</p>
                        <div className="space-y-2">
                          <label htmlFor="omni-url" className="block text-sm font-medium text-text-secondary">
                            Omni URL
                          </label>
                          <input
                            id="omni-url"
                            value={omniUrl}
                            onChange={(e) => setOmniUrl(e.target.value)}
                            placeholder="https://omni.example.com"
                            autoCapitalize="none"
                            autoCorrect="off"
                            spellCheck={false}
                            className={cn(
                              'w-full rounded-md border bg-surface px-3 py-2 text-sm',
                              omniSubmitted && omniUrlError ? 'border-red-500/70' : 'border-border'
                            )}
                          />
                          {omniSubmitted && omniUrlError && <p className="text-xs text-red-400">{omniUrlError}</p>}
                        </div>

                        <div className="space-y-2">
                          <label htmlFor="omni-email" className="block text-sm font-medium text-text-secondary">
                            Email address
                          </label>
                          <input
                            id="omni-email"
                            type="email"
                            value={omniEmail}
                            onChange={(e) => setOmniEmail(e.target.value)}
                            placeholder="you@company.com"
                            autoCapitalize="none"
                            autoCorrect="off"
                            spellCheck={false}
                            className={cn(
                              'w-full rounded-md border bg-surface px-3 py-2 text-sm',
                              omniSubmitted && omniEmailError ? 'border-red-500/70' : 'border-border'
                            )}
                          />
                          {omniSubmitted && omniEmailError && <p className="text-xs text-red-400">{omniEmailError}</p>}
                        </div>
                      </div>
                    )}

                    {cloudProvider === 'talos-omni' && (
                      <div className="rounded-md border border-border bg-surface-elevated px-3 py-3 space-y-3">
                        <div className="text-[11px] uppercase tracking-wide text-text-secondary">Omni flow</div>
                        <p className="text-xs text-text-secondary">
                          {omniConnectLoading
                            ? 'Opening browser for Omni login...'
                            : cloudListReady
                              ? 'Login started. After completing browser auth, click List Omni Clusters.'
                              : 'Step 1: Connect in Browser. Step 2: List Omni Clusters.'}
                        </p>
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                          <button
                            type="button"
                            onClick={() => void handleTalosOmniConnect()}
                            disabled={omniConnectLoading}
                            className="rounded-md bg-primary px-3 py-2 text-xs sm:text-sm font-semibold text-white hover:opacity-95 disabled:opacity-60"
                          >
                            {omniConnectLoading ? 'Connecting...' : cloudListReady ? 'Connect Again' : 'Connect in Browser'}
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleOmniListClusters()}
                            disabled={omniLoading}
                            className="rounded-md border border-border px-3 py-2 text-xs sm:text-sm font-medium text-text-secondary hover:bg-hover disabled:opacity-60"
                          >
                            {omniLoading ? 'Loading...' : 'List Omni Clusters'}
                          </button>
                        </div>
                      </div>
                    )}

                    {cloudProvider === 'aws' && (
                      <div className="flex items-center justify-end">
                        <button
                          type="button"
                          onClick={() => void handleAwsApplyCredentials()}
                          disabled={false}
                          className="rounded-md border border-border px-4 py-2 text-sm font-medium text-text-secondary hover:bg-hover disabled:opacity-60"
                        >
                          Apply AWS Credentials
                        </button>
                      </div>
                    )}

                    {cloudProvider === 'gcp' && (
                      <div className="flex items-center justify-end">
                        <button
                          type="button"
                          onClick={() => void handleGcpApplyCredentials()}
                          disabled={gcpLoading}
                          className="rounded-md border border-border px-4 py-2 text-sm font-medium text-text-secondary hover:bg-hover disabled:opacity-60"
                        >
                          {gcpLoading ? 'Loading...' : 'List GCP Clusters'}
                        </button>
                      </div>
                    )}

                    {cloudProvider === 'azure' && (
                      <div className="flex items-center justify-end">
                        <button
                          type="button"
                          onClick={() => void handleAzureApplyCredentials()}
                          disabled={azureLoading}
                          className="rounded-md border border-border px-4 py-2 text-sm font-medium text-text-secondary hover:bg-hover disabled:opacity-60"
                        >
                          {azureLoading ? 'Loading...' : 'List Azure Clusters'}
                        </button>
                      </div>
                    )}

                    {cloudProvider === 'digitalocian' && (
                      <div className="flex items-center justify-end">
                        <button
                          type="button"
                          onClick={() => void handleDigitaloceanApplyToken()}
                          disabled={false}
                          className="rounded-md border border-border px-4 py-2 text-sm font-medium text-text-secondary hover:bg-hover disabled:opacity-60"
                        >
                          Apply DigitalOcian Token
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {clusterImportTab === 'kubeconfig' && (
                  <div className="shrink-0 space-y-2">
                    <label htmlFor="modal-kubeconfig-path" className="block text-sm font-medium text-text-secondary">
                      Kubeconfig source
                    </label>
                    <select
                      id="modal-kubeconfig-path"
                      value={kubeconfigInput}
                      onChange={(e) => {
                        const selected = e.target.value;
                        setKubeconfigInput(selected);
                        setSelectedClusterContext('');
                        setClusterSearch('');
                        void refreshClustersForKubeconfig(selected);
                      }}
                      className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm"
                    >
                      <option value="">All discovered kubeconfigs (default)</option>
                      {kubeconfigCandidates.map((candidate) => (
                        <option key={candidate} value={candidate}>{candidate}</option>
                      ))}
                    </select>
                  </div>
                )}

                {clusterImportTab === 'cloud' && !cloudListReady ? (
                  <div className="shrink-0 rounded-lg border border-border bg-surface-elevated px-3 py-3 text-sm text-text-secondary">
                    Apply provider credentials/action first, then cluster contexts will be listed here.
                  </div>
                ) : (
                <div className="shrink-0 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <label htmlFor="modal-cluster-dropdown" className="block text-sm font-medium text-text-secondary">
                      {clusterImportTab === 'cloud' ? 'Cloud cluster' : 'Cluster context'}
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        setShowCloudProviderMenu(false);
                        setShowClusterMenu(false);
                        if (clusterImportTab === 'cloud') {
                          void handleCloudProviderRefresh();
                          return;
                        }
                        void handleManualClusterRefresh();
                      }}
                      disabled={kubeconfigLoading}
                      className="inline-flex items-center gap-1 rounded border border-border px-2 py-1 text-[11px] text-text-secondary hover:bg-hover disabled:opacity-60"
                    >
                      <RotateCw size={12} />
                      Refresh
                    </button>
                  </div>

                  <div ref={clusterMenuRef} className="relative">
                    <button
                      id="modal-cluster-dropdown"
                      type="button"
                      onClick={() => {
                        setShowCloudProviderMenu(false);
                        setShowClusterMenu((previous) => {
                          const next = !previous;
                          if (next) {
                            setClusterSearch('');
                          }
                          return next;
                        });
                      }}
                      className={cn(
                        'w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-left transition-colors',
                        showClusterMenu ? 'border-primary/50 bg-hover/60' : 'hover:bg-hover/50'
                      )}
                      aria-haspopup="listbox"
                      aria-expanded={showClusterMenu}
                    >
                      <span className="flex items-start justify-between gap-3">
                        <span className="min-w-0">
                          <span
                            className={classNames(
                              'block truncate text-sm font-medium',
                              selectedClusterItem ? 'text-text' : 'text-text-secondary',
                              { 'text-left': (selectedClusterItem?.namespace?.length ?? 0) > 20 }
                            )}
                          >
                            {selectedClusterItem?.context ?? (clusterImportTab === 'cloud' ? 'Select a cloud cluster' : 'Select a kubeconfig context')}
                          </span>
                          <span
                            className={classNames(
                              'block truncate text-xs text-text-secondary',
                              'text-left' // Always force left alignment for the second line
                            )}
                          >
                            {selectedClusterItem
                              ? `cluster: ${selectedClusterItem.cluster ?? '-'}${selectedClusterItem.namespace ? ` • ns: ${selectedClusterItem.namespace}` : ''}`
                              : (clusterImportTab === 'cloud' ? 'Search and choose from imported provider clusters.' : 'Search and choose from local kubeconfig contexts.')}
                          </span>
                        </span>
                        <ChevronDown
                          size={14}
                          className={cn('mt-0.5 shrink-0 text-text-secondary transition-transform', showClusterMenu && 'rotate-180')}
                        />
                      </span>
                    </button>

                    {showClusterMenu && (
                      <div className="mt-2 overflow-hidden rounded-lg border border-border bg-surface-elevated shadow-lg ring-1 ring-black/15 dark:ring-white/20">
                        <div className="space-y-2 border-b border-border p-3">
                          <input
                            autoFocus
                            value={clusterSearch}
                            onChange={(e) => setClusterSearch(e.target.value)}
                            placeholder={clusterImportTab === 'cloud' ? 'Search cloud clusters...' : 'Search context, cluster, namespace...'}
                            className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm"
                          />
                          <div className="text-[11px] text-text-secondary">
                            {kubeconfigLoading ? 'Loading contexts...' : `${visibleClusters.length} result${visibleClusters.length === 1 ? '' : 's'}`}
                          </div>
                        </div>

                        <div className="max-h-[min(40vh,20rem)] overflow-auto">
                          {kubeconfigLoading && (
                            <div className="px-3 py-3 text-sm text-text-secondary">Loading contexts...</div>
                          )}

                          {!kubeconfigLoading && visibleClusters.length === 0 && (
                            <div className="space-y-2 px-3 py-3 text-sm text-text-secondary">
                              <div>
                                {clusterImportTab === 'cloud'
                                  ? (cloudProvider === 'talos-omni'
                                    ? 'No Talos Omni clusters found from provider.'
                                    : cloudProvider === 'aws'
                                      ? 'No Amazon Web Services clusters found from provider.'
                                      : cloudProvider === 'azure'
                                        ? 'No Microsoft Azure clusters found from provider.'
                                        : cloudProvider === 'gcp'
                                          ? 'No Google Cloud Platform clusters found from provider.'
                                          : 'No DigitalOcian clusters found from provider.')
                                  : 'No cluster contexts found for this kubeconfig.'}
                              </div>
                              {clusterImportTab === 'kubeconfig' && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setKubeconfigInput('');
                                    setSelectedClusterContext('');
                                    setClusterSearch('');
                                    void refreshClustersForKubeconfig('');
                                  }}
                                  className="rounded border border-border px-2 py-1 text-xs hover:bg-hover"
                                >
                                  Load from all discovered kubeconfigs
                                </button>
                              )}
                            </div>
                          )}

                          {visibleClusters.map((item) => (
                            <button
                              key={`${item.kubeconfigPath}:${item.context}`}
                              type="button"
                              onClick={() => {
                                setSelectedClusterContext(item.context);
                                setKubeconfigInput(item.kubeconfigPath);
                                setShowClusterMenu(false);
                              }}
                              className={cn(
                                'w-full border-t border-border px-3 py-2 text-left first:border-t-0 hover:bg-hover',
                                selectedClusterContext === item.context ? 'bg-hover text-primary' : 'text-text-secondary'
                              )}
                              title={item.context}
                            >
                              <div className="flex min-w-0 items-center justify-between gap-2">
                                <span className="truncate text-sm font-medium" title={item.context}>{item.context}</span>
                                <span className="shrink-0 text-[11px] text-text-secondary">
                                  {selectedClusterContext === item.context ? 'selected' : item.isCurrent ? 'current' : ''}
                                </span>
                              </div>
                              <div className="truncate text-xs text-text-secondary">
                                cluster: {item.cluster ?? '-'}{item.namespace ? ` • ns: ${item.namespace}` : ''}
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                )}
              </div>
            </section>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-4">
          <button
            type="button"
            onClick={() => setShowKubeconfigModal(false)}
            className="rounded-md border border-border px-4 py-2 text-sm font-medium text-text-secondary hover:bg-hover"
            disabled={mustSelectCluster}
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={kubeconfigSwitching || !selectedClusterContext}
            onClick={() => {
              if (clusterImportTab === 'cloud' && cloudProvider === 'aws') {
                // For AWS EKS: run update-kubeconfig first, then switch
                const clusterArn = selectedClusterContext;
                // Extract cluster name from ARN: arn:aws:eks:<region>:<account>:cluster/<name>
                const clusterName = clusterArn.split('/').pop() ?? clusterArn;
                void (async () => {
                  setKubeconfigSwitching(true);
                  try {
                    const contextName = await awsEksUpdateKubeconfig(
                      awsAccessKey.trim(),
                      awsSecretKey.trim(),
                      awsSessionToken.trim(),
                      awsRegion.trim() || 'us-east-1',
                      clusterName,
                    );
                    // Reload default kubeconfig and switch to the new context
                    await applyClusterSelection('', contextName);
                  } catch (err) {
                    toast.error(`Failed to import EKS cluster: ${getErrorMessage(err) ?? String(err)}`);
                    setKubeconfigSwitching(false);
                  }
                })();
              } else if (clusterImportTab === 'cloud' && cloudProvider === 'talos-omni') {
                // For Talos Omni: download/merge kubeconfig first, then switch to that context.
                const clusterName = selectedClusterContext;
                void (async () => {
                  setKubeconfigSwitching(true);
                  try {
                    const contextName = await omniUpdateKubeconfig(clusterName, normalizedOmniUrl);
                    await applyClusterSelection('', contextName);
                  } catch (err) {
                    toast.error(`Failed to import Omni cluster: ${getErrorMessage(err) ?? String(err)}`);
                    setKubeconfigSwitching(false);
                  }
                })();
              } else {
                const selectedItem = visibleClusters.find((item) => item.context === selectedClusterContext);
                const sourcePath = selectedItem?.kubeconfigPath || kubeconfigInput;
                void applyClusterSelection(sourcePath, selectedClusterContext);
              }
            }}
            className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            {kubeconfigSwitching
              ? (clusterImportTab === 'kubeconfig' ? 'Applying...' : 'Importing/Applying...')
              : (clusterImportTab === 'kubeconfig' ? 'Apply' : 'Import/Apply')}
          </button>
        </div>
      </div>
    </div>
  );

  if (mustSelectCluster) {
    return <div className="h-screen bg-bg">{clusterSelectionDialog}</div>;
  }

  if (desktopMode && showKubeconfigModal) {
    return <div className="h-screen bg-bg">{clusterSelectionDialog}</div>;
  }

  // Show loading screen on desktop during initialization
  if (desktopMode && !kubeconfigInitialized && kubeconfigLoading) {
    return (
      <div className="h-screen bg-bg flex items-center justify-center">
        <div className="text-center">
          <div className="text-sm text-text-secondary mb-4">Initializing desktop app...</div>
          <div className="h-1 w-32 bg-border rounded-full overflow-hidden mx-auto">
            <div className="h-full bg-primary animate-pulse"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-bg text-text">
      <SidecarLogsPanel open={showSidecarLogs} onClose={() => setShowSidecarLogs(false)} />
      {desktopMode && (
        <div
          data-tauri-drag-region
          className="h-9 min-h-[36px] border-b border-border bg-surface select-none flex items-center justify-between"
          onMouseDown={handleDesktopTitleBarMouseDown}
        >
          <div data-tauri-drag-region className="flex items-center gap-3 pl-20 pr-4">
            <button
              type="button"
              onClick={() => {
                setCloudProvider('talos-omni');
                setKubeconfigInput(kubeconfigPath);
                setSelectedClusterContext(kubeContext);
                setClusterSearch('');
                setKubeconfigError(null);
                void refreshClustersForKubeconfig(kubeconfigPath);
                setShowKubeconfigModal(true);
              }}
              disabled={kubeconfigSwitching}
              className={cn(
                'inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border text-sm hover:bg-hover',
                showKubeconfigModal ? 'bg-hover' : 'bg-surface',
                kubeconfigSwitching && 'opacity-60 cursor-not-allowed'
              )}
              title={kubeContext || kubeconfigPath || 'Select cluster'}
            >
              <Server size={14} className="flex-shrink-0" />
              <span>
                {kubeContext || `Cluster (${kubeconfigDisplayName(kubeconfigPath)})`}
              </span>
              <ChevronDown size={14} className="text-text-secondary" />
            </button>
          </div>
          <div data-tauri-drag-region className="flex items-center gap-3 px-4">
            <span className="text-[13px] font-medium tracking-wide text-text-secondary whitespace-nowrap">
              {topRightTitle}
            </span>
            <span className="text-[11px] text-text-muted whitespace-nowrap">v{APP_VERSION}</span>
          </div>
        </div>
      )}
      <div
        className="flex flex-1 min-h-0 relative"
        style={{ '--layout-sidebar-width': `${effectiveSidebarWidth}px` } as CSSProperties}
      >
      {/* Mobile menu overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 bg-sidebar border-r border-border shadow-lg overflow-hidden md:relative md:translate-x-0 flex flex-col shrink-0',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full',
          !sidebarCollapsed && 'transition-[width] duration-300'
        )}
        style={{ width: effectiveSidebarWidth }}
      >
        <div
          className={cn(
            'flex h-[45px] min-h-[45px] items-center border-b border-border shrink-0',
            sidebarCollapsed ? 'justify-between px-2' : 'justify-between px-3'
          )}
        >
          <div className="flex items-center gap-3 min-w-0">
            {!sidebarCollapsed && (
              <>
                <Link
                  to="/"
                  className="flex items-center gap-2.5 min-w-0 rounded-lg transition-colors hover:bg-hover px-3 py-1"
                  aria-label="PTKublet home"
                >
                  <img
                    src="/favicon.svg"
                    alt=""
                    className="h-7 w-7 shrink-0"
                  />
                  <h1 className="truncate text-[0.98rem] font-[650] tracking-[-0.02em] text-text">PTKublet</h1>
                </Link>
              </>
            )}
          </div>
          <div className={cn('flex items-center gap-1', !sidebarCollapsed && 'ml-auto')}>
            <button
              onClick={() => setSidebarCollapsed((previous) => !previous)}
              className="hidden md:inline-flex p-1.5 hover:bg-hover rounded text-text-secondary"
              title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              {sidebarCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
            </button>
            <button
              onClick={() => setSidebarOpen(false)}
              className="md:hidden p-1 hover:bg-hover rounded"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        <div className="flex-1 p-3 overflow-y-auto">
          <nav className="flex flex-col gap-2">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const active = isActive(item.path);
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  onClick={() => setSidebarOpen(false)}
                  className={cn(
                    'flex items-center gap-2.5 px-3 py-1.5 rounded-lg transition-colors text-[13px] font-medium',
                    'order-1',
                    sidebarCollapsed && 'justify-center px-2',
                    active
                      ? 'bg-hover text-[var(--color-primary)] font-semibold'
                      : 'text-text-secondary hover:bg-hover hover:text-text'
                  )}
                  title={item.label}
                >
                  {!sidebarCollapsed && <span className="h-4 w-4 shrink-0" aria-hidden="true" />}
                  <Icon size={18} className="flex-shrink-0" />
                  {!sidebarCollapsed && <span>{item.label}</span>}
                </Link>
              );
            })}

            <div className="space-y-1 order-3">
              <button
                type="button"
                onClick={() => {
                  if (sidebarCollapsed) {
                    setSidebarCollapsed(false);
                  }
                  setConfigOpen((previous) => !previous);
                }}
                className={cn(
                  'w-full flex items-center gap-2.5 px-3 py-1.5 rounded-lg transition-colors text-[13px] font-medium',
                  sidebarCollapsed && 'justify-center px-2',
                  hasActiveConfig
                    ? 'bg-hover text-[var(--color-primary)] font-semibold'
                    : 'text-text-secondary hover:bg-hover hover:text-text'
                )}
                title="Config"
              >
                {!sidebarCollapsed && (
                  <>
                    {configOpen ? <ChevronDown size={16} className="flex-shrink-0" /> : <ChevronRight size={16} className="flex-shrink-0" />}
                  </>
                )}
                <Settings size={18} className="flex-shrink-0" />
                {!sidebarCollapsed && <span className="flex-1 text-left">Config</span>}
              </button>

              {!sidebarCollapsed && configOpen && (
                <div className="space-y-1">
                  {CONFIG_ITEMS.map((item) => {
                    const Icon = item.icon;
                    const active = isActive(item.path);
                    return (
                      <Link
                        key={item.path}
                        to={item.path}
                        onClick={() => setSidebarOpen(false)}
                        className={cn(
                          'flex items-center gap-2.5 px-3 py-1.5 pl-8 rounded-lg transition-colors text-[11px] font-medium',
                          active
                            ? 'bg-hover text-[var(--color-primary)] font-semibold'
                            : 'text-text-secondary hover:bg-hover hover:text-text'
                        )}
                        title={item.label}
                      >
                        <span className="h-4 w-4 shrink-0" aria-hidden="true" />
                        <Icon size={16} className="flex-shrink-0" />
                        <span>{item.label}</span>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="space-y-1 order-4">
              <button
                type="button"
                onClick={() => {
                  if (sidebarCollapsed) {
                    setSidebarCollapsed(false);
                  }
                  setNetworkOpen((previous) => !previous);
                }}
                className={cn(
                  'w-full flex items-center gap-2.5 px-3 py-1.5 rounded-lg transition-colors text-[13px] font-medium',
                  sidebarCollapsed && 'justify-center px-2',
                  hasActiveNetwork
                    ? 'bg-hover text-[var(--color-primary)] font-semibold'
                    : 'text-text-secondary hover:bg-hover hover:text-text'
                )}
                title="Networks"
              >
                {!sidebarCollapsed && (
                  <>
                    {networkOpen ? <ChevronDown size={16} className="flex-shrink-0" /> : <ChevronRight size={16} className="flex-shrink-0" />}
                  </>
                )}
                <Globe size={18} className="flex-shrink-0" />
                {!sidebarCollapsed && <span className="flex-1 text-left">Networks</span>}
              </button>

              {!sidebarCollapsed && networkOpen && (
                <div className="space-y-1">
                  {NETWORK_ITEMS.map((item) => {
                    const Icon = item.icon;
                    const active = isActive(item.path);
                    return (
                      <Link
                        key={item.path}
                        to={item.path}
                        onClick={() => setSidebarOpen(false)}
                        className={cn(
                          'flex items-center gap-2.5 px-3 py-1.5 pl-8 rounded-lg transition-colors text-[11px] font-medium',
                          active
                            ? 'bg-hover text-[var(--color-primary)] font-semibold'
                            : 'text-text-secondary hover:bg-hover hover:text-text'
                        )}
                        title={item.label}
                      >
                        <span className="h-4 w-4 shrink-0" aria-hidden="true" />
                        <Icon size={16} className="flex-shrink-0" />
                        <span>{item.label}</span>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="space-y-1 order-5">
              <button
                type="button"
                onClick={() => {
                  if (sidebarCollapsed) {
                    setSidebarCollapsed(false);
                  }
                  setStorageOpen((previous) => !previous);
                }}
                className={cn(
                  'w-full flex items-center gap-2.5 px-3 py-1.5 rounded-lg transition-colors text-[13px] font-medium',
                  sidebarCollapsed && 'justify-center px-2',
                  hasActiveStorage
                    ? 'bg-hover text-[var(--color-primary)] font-semibold'
                    : 'text-text-secondary hover:bg-hover hover:text-text'
                )}
                title="Storage"
              >
                {!sidebarCollapsed && (
                  <>
                    {storageOpen ? <ChevronDown size={16} className="flex-shrink-0" /> : <ChevronRight size={16} className="flex-shrink-0" />}
                  </>
                )}
                <HardDrive size={18} className="flex-shrink-0" />
                {!sidebarCollapsed && <span className="flex-1 text-left">Storage</span>}
              </button>

              {!sidebarCollapsed && storageOpen && (
                <div className="space-y-1">
                  {STORAGE_ITEMS.map((item) => {
                    const Icon = item.icon;
                    const active = isActive(item.path);
                    return (
                      <Link
                        key={item.path}
                        to={item.path}
                        onClick={() => setSidebarOpen(false)}
                        className={cn(
                          'flex items-center gap-2.5 px-3 py-1.5 pl-8 rounded-lg transition-colors text-[11px] font-medium',
                          active
                            ? 'bg-hover text-[var(--color-primary)] font-semibold'
                            : 'text-text-secondary hover:bg-hover hover:text-text'
                        )}
                        title={item.label}
                      >
                        <span className="h-4 w-4 shrink-0" aria-hidden="true" />
                        <Icon size={16} className="flex-shrink-0" />
                        <span>{item.label}</span>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="space-y-1 order-2">
              <button
                type="button"
                onClick={() => {
                  if (sidebarCollapsed) {
                    setSidebarCollapsed(false);
                  }
                  setWorkloadsOpen((previous) => !previous);
                }}
                className={cn(
                  'w-full flex items-center gap-2.5 px-3 py-1.5 rounded-lg transition-colors text-[13px] font-medium',
                  sidebarCollapsed && 'justify-center px-2',
                  hasActiveWorkload
                    ? 'bg-hover text-[var(--color-primary)] font-semibold'
                    : 'text-text-secondary hover:bg-hover hover:text-text'
                )}
                title="Workloads"
              >
                {!sidebarCollapsed && (
                  <>
                    {workloadsOpen ? <ChevronDown size={16} className="flex-shrink-0" /> : <ChevronRight size={16} className="flex-shrink-0" />}
                  </>
                )}
                <Archive size={18} className="flex-shrink-0" />
                {!sidebarCollapsed && <span className="flex-1 text-left">Workloads</span>}
              </button>

              {!sidebarCollapsed && workloadsOpen && (
                <div className="space-y-1">
                  {WORKLOAD_ITEMS.map((item) => {
                    const Icon = item.icon;
                    const active = isActive(item.path);
                    return (
                      <Link
                        key={item.path}
                        to={item.path}
                        onClick={() => setSidebarOpen(false)}
                        className={cn(
                          'flex items-center gap-2.5 px-3 py-1.5 pl-8 rounded-lg transition-colors text-[11px] font-medium',
                          active
                            ? 'bg-hover text-[var(--color-primary)] font-semibold'
                            : 'text-text-secondary hover:bg-hover hover:text-text'
                        )}
                        title={item.label}
                      >
                        <span className="h-4 w-4 shrink-0" aria-hidden="true" />
                        <Icon size={16} className="flex-shrink-0" />
                        <span>{item.label}</span>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>

            <Link
              to={NAMESPACE_ITEM.path}
              onClick={() => setSidebarOpen(false)}
              className={cn(
                'flex items-center gap-2.5 px-3 py-1.5 rounded-lg transition-colors text-[13px] font-medium',
                'order-6',
                sidebarCollapsed && 'justify-center px-2',
                isActive(NAMESPACE_ITEM.path)
                  ? 'bg-hover text-[var(--color-primary)] font-semibold'
                  : 'text-text-secondary hover:bg-hover hover:text-text'
              )}
              title={NAMESPACE_ITEM.label}
            >
              {!sidebarCollapsed && <span className="h-4 w-4 shrink-0" aria-hidden="true" />}
              <NAMESPACE_ITEM.icon size={18} className="flex-shrink-0" />
              {!sidebarCollapsed && <span>{NAMESPACE_ITEM.label}</span>}
            </Link>

            <Link
              to={EVENTS_ITEM.path}
              onClick={() => setSidebarOpen(false)}
              className={cn(
                'flex items-center gap-2.5 px-3 py-1.5 rounded-lg transition-colors text-[13px] font-medium',
                'order-7',
                sidebarCollapsed && 'justify-center px-2',
                isActive(EVENTS_ITEM.path)
                  ? 'bg-hover text-[var(--color-primary)] font-semibold'
                  : 'text-text-secondary hover:bg-hover hover:text-text'
              )}
              title={EVENTS_ITEM.label}
            >
              {!sidebarCollapsed && <span className="h-4 w-4 shrink-0" aria-hidden="true" />}
              <EVENTS_ITEM.icon size={18} className="flex-shrink-0" />
              {!sidebarCollapsed && <span>{EVENTS_ITEM.label}</span>}
            </Link>

            <div className="space-y-1 order-8">
              <button
                type="button"
                onClick={() => {
                  if (sidebarCollapsed) {
                    setSidebarCollapsed(false);
                  }
                  setHelmOpen((previous) => !previous);
                }}
                className={cn(
                  'w-full flex items-center gap-2.5 px-3 py-1.5 rounded-lg transition-colors text-[13px] font-medium',
                  sidebarCollapsed && 'justify-center px-2',
                  hasActiveHelm
                    ? 'bg-hover text-[var(--color-primary)] font-semibold'
                    : 'text-text-secondary hover:bg-hover hover:text-text'
                )}
                title="Helm"
              >
                {!sidebarCollapsed && (
                  <>
                    {helmOpen ? <ChevronDown size={16} className="flex-shrink-0" /> : <ChevronRight size={16} className="flex-shrink-0" />}
                  </>
                )}
                <Boxes size={18} className="flex-shrink-0" />
                {!sidebarCollapsed && <span className="flex-1 text-left">Helm</span>}
              </button>

              {!sidebarCollapsed && helmOpen && (
                <div className="space-y-1">
                  {HELM_ITEMS.map((item) => {
                    const Icon = item.icon;
                    const active = isActive(item.path);
                    return (
                      <Link
                        key={item.path}
                        to={item.path}
                        onClick={() => setSidebarOpen(false)}
                        className={cn(
                          'flex items-center gap-2.5 px-3 py-1.5 pl-8 rounded-lg transition-colors text-[11px] font-medium',
                          active
                            ? 'bg-hover text-[var(--color-primary)] font-semibold'
                            : 'text-text-secondary hover:bg-hover hover:text-text'
                        )}
                        title={item.label}
                      >
                        <span className="h-4 w-4 shrink-0" aria-hidden="true" />
                        <Icon size={16} className="flex-shrink-0" />
                        <span>{item.label}</span>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="space-y-1 order-9">
              <button
                type="button"
                onClick={() => {
                  if (sidebarCollapsed) {
                    setSidebarCollapsed(false);
                  }
                  setAccessControlOpen((previous) => !previous);
                }}
                className={cn(
                  'w-full flex items-center gap-2.5 px-3 py-1.5 rounded-lg transition-colors text-[13px] font-medium',
                  sidebarCollapsed && 'justify-center px-2',
                  hasActiveAccessControl
                    ? 'bg-hover text-[var(--color-primary)] font-semibold'
                    : 'text-text-secondary hover:bg-hover hover:text-text'
                )}
                title="Access Control"
              >
                {!sidebarCollapsed && (
                  <>
                    {accessControlOpen ? <ChevronDown size={16} className="flex-shrink-0" /> : <ChevronRight size={16} className="flex-shrink-0" />}
                  </>
                )}
                <Shield size={18} className="flex-shrink-0" />
                {!sidebarCollapsed && <span className="flex-1 text-left">Access Control</span>}
              </button>

              {!sidebarCollapsed && accessControlOpen && (
                <div className="space-y-1">
                  {ACCESS_CONTROL_ITEMS.map((item) => {
                    const Icon = item.icon;
                    const active = isActive(item.path);
                    return (
                      <Link
                        key={item.path}
                        to={item.path}
                        onClick={() => setSidebarOpen(false)}
                        className={cn(
                          'flex items-center gap-2.5 px-3 py-1.5 pl-8 rounded-lg transition-colors text-[11px] font-medium',
                          active
                            ? 'bg-hover text-[var(--color-primary)] font-semibold'
                            : 'text-text-secondary hover:bg-hover hover:text-text'
                        )}
                        title={item.label}
                      >
                        <span className="h-4 w-4 shrink-0" aria-hidden="true" />
                        <Icon size={16} className="flex-shrink-0" />
                        <span>{item.label}</span>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Custom Resources — dynamic, grouped by API group */}
            <div className="space-y-1 order-10">
                <button
                  type="button"
                  onClick={() => {
                    if (sidebarCollapsed) setSidebarCollapsed(false);
                    setCustomResourcesOpen((p) => !p);
                  }}
                  className={cn(
                    'w-full flex items-center gap-2.5 px-3 py-1.5 rounded-lg transition-colors text-[13px] font-medium',
                    sidebarCollapsed && 'justify-center px-2',
                    hasActiveCustomResources
                      ? 'bg-hover text-[var(--color-primary)] font-semibold'
                      : 'text-text-secondary hover:bg-hover hover:text-text'
                  )}
                  title="Custom Resources"
                >
                  {!sidebarCollapsed && (
                    <>
                      {customResourcesOpen ? <ChevronDown size={16} className="flex-shrink-0" /> : <ChevronRight size={16} className="flex-shrink-0" />}
                    </>
                  )}
                  <Layers size={18} className="flex-shrink-0" />
                  {!sidebarCollapsed && <span className="flex-1 text-left">Custom Resources</span>}
                </button>

                {!sidebarCollapsed && customResourcesOpen && (
                  <div className="space-y-1">
                    {(!crdsHasFetched || crdsLoading || (!crdsEmptyListConfirmed && crdGroups.length === 0)) && (
                      <div className="flex items-center gap-2.5 px-3 py-1.5 pl-6 text-[11px] text-text-secondary">
                        <Layers size={16} className="flex-shrink-0" />
                        Loading custom resources...
                      </div>
                    )}
                    {crdsEmptyListConfirmed && crdGroups.length === 0 && (
                      <div className="flex items-center gap-2.5 px-3 py-1.5 pl-6 text-[11px] text-text-secondary">
                        <Layers size={16} className="flex-shrink-0" />
                        No custom resources found
                      </div>
                    )}
                    {/* Sidebar font hierarchy: level 1 = 14px, level 2 = 13px, level 3 = 12px */}
                    {crdGroups.length > 0 && crdGroups.map(({ group, crds: groupCrds }) => {
                      const isGroupExpanded = expandedCrdGroups.has(group);
                      return (
                        <div key={group} className="space-y-0.5">
                          <button
                            type="button"
                            onClick={() => {
                              setExpandedCrdGroups((prev) => {
                                const next = new Set(prev);
                                if (next.has(group)) next.delete(group);
                                else next.add(group);
                                return next;
                              });
                            }}
                            className="w-full flex items-center gap-2.5 px-3 py-1.5 pl-6 rounded-lg transition-colors text-[12px] font-medium text-text-secondary hover:bg-hover hover:text-text text-left"
                            title={group}
                          >
                            {isGroupExpanded ? <ChevronDown size={16} className="flex-shrink-0" /> : <ChevronRight size={16} className="flex-shrink-0" />}
                            <Layers size={16} className="flex-shrink-0" />
                            <span className="flex-1 text-left truncate">{group}</span>
                          </button>
                          {isGroupExpanded && (
                            <div className="space-y-0.5">
                              {groupCrds.map((crd) => {
                                const crdPath = `/crds/${encodeURIComponent(crd.name)}`;
                                const active = location.pathname === crdPath;
                                return (
                                  <Link
                                    key={crd.name}
                                    to={crdPath}
                                    onClick={() => setSidebarOpen(false)}
                                    className={cn(
                                      'flex items-center gap-2.5 px-3 py-1.5 pl-8 rounded-lg transition-colors text-[11px] font-medium',
                                      active
                                        ? 'bg-hover text-[var(--color-primary)] font-semibold'
                                        : 'text-text-secondary hover:bg-hover hover:text-text'
                                    )}
                                    title={crd.name}
                                  >
                                    <span className="h-4 w-4 shrink-0" aria-hidden="true" />
                                    <FileText size={16} className="flex-shrink-0" />
                                    <span className="truncate">{crd.kind}</span>
                                  </Link>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

            {BOTTOM_NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const active = isActive(item.path);
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  onClick={() => setSidebarOpen(false)}
                  className={cn(
                    'flex items-center gap-2.5 px-3 py-1.5 rounded-lg transition-colors text-[13px] font-medium',
                    'order-11',
                    sidebarCollapsed && 'justify-center px-2',
                    active
                      ? 'bg-hover text-[var(--color-primary)] font-semibold'
                      : 'text-text-secondary hover:bg-hover hover:text-text'
                  )}
                  title={item.label}
                >
                  {!sidebarCollapsed && <span className="h-4 w-4 shrink-0" aria-hidden="true" />}
                  <Icon size={18} className="flex-shrink-0" />
                  {!sidebarCollapsed && <span>{item.label}</span>}
                </Link>
              );
            })}

          </nav>
        </div>

        <div className="border-t border-border p-2">
          <Link
            to="/desktop/settings"
            onClick={() => setSidebarOpen(false)}
            className={cn(
              'flex items-center gap-2.5 rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors',
              sidebarCollapsed && 'justify-center px-2',
              isActive('/desktop/settings')
                ? 'bg-hover text-[var(--color-primary)] font-semibold'
                : 'text-text-secondary hover:bg-hover hover:text-text'
            )}
            title="Settings"
          >
            {!sidebarCollapsed && <span className="h-4 w-4 shrink-0" aria-hidden="true" />}
            <Settings size={18} className="flex-shrink-0" />
            {!sidebarCollapsed && <span>Settings</span>}
          </Link>
        </div>
      </aside>

      {/* Resize handle - between sidebar and main, desktop only when expanded */}
      {!sidebarCollapsed && (
        <div
          role="separator"
          aria-label="Resize sidebar"
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            handleSidebarResizeStart(e);
          }}
          className="absolute top-0 bottom-0 z-[80] w-2 cursor-col-resize hover:bg-primary/25 active:bg-primary/40 hidden md:block"
          style={{
            left: effectiveSidebarWidth - 4,
            touchAction: 'none',
          }}
        />
      )}

      {/* Main content */}
      <div className="flex flex-col flex-1 overflow-hidden">
        {/* Top bar */}
        <header className="relative z-[70] bg-surface border-b border-border px-4 h-[45px] min-h-[45px] flex items-center justify-between">
          <div className="flex items-center gap-4 flex-1">
            <button
              onClick={() => setSidebarOpen(true)}
              className="md:hidden p-2 hover:bg-hover rounded"
            >
              <Menu size={20} />
            </button>
            <nav className="text-sm text-text-secondary" aria-label="Breadcrumb">
              <ol className="flex items-center flex-wrap gap-2">
                {breadcrumbs.map((crumb, index) => {
                  const isLast = index === breadcrumbs.length - 1;
                  const Icon = crumb.icon;
                  return (
                    <li key={`${crumb.label}-${index}`} className="inline-flex items-center gap-2">
                      {index > 0 && <span>/</span>}
                      <div className="flex items-center gap-1.5">
                        {Icon && <Icon size={16} className="flex-shrink-0" />}
                        {crumb.path && !isLast ? (
                          <Link to={crumb.path} className="hover:text-text transition-colors">
                            {crumb.label}
                          </Link>
                        ) : (
                          <span className={cn(isLast && 'text-text font-medium')}>{crumb.label}</span>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ol>
            </nav>
          </div>
          <div className="flex items-center gap-2">
            {shouldShowNamespaceFilter && (
              <input
                type="text"
                placeholder="Filter by name..."
                value={resourceNameFilter}
                onChange={(e) => setResourceNameFilter(e.target.value)}
                className="w-40 px-3 py-1.5 rounded-lg border border-border bg-surface text-sm text-text placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                aria-label="Filter resources by name"
              />
            )}
            {namespaces.length > 0 && shouldShowNamespaceFilter && (
              <div ref={namespaceMenuRef} className="relative z-[80]">
                <button
                  type="button"
                  onClick={() => setShowNamespaceMenu((previous) => !previous)}
                  className={cn(
                    'inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border text-sm hover:bg-hover',
                    showNamespaceMenu ? 'bg-hover' : 'bg-surface'
                  )}
                >
                  <Database size={14} className="flex-shrink-0" />
                  <span className="max-w-40 truncate text-left">
                    {selectedNamespaces.length === 0
                      ? 'All Namespaces'
                      : selectedNamespaces.length === 1
                      ? selectedNamespaces[0]
                      : `${selectedNamespaces.length} selected`}
                  </span>
                  <ChevronDown
                    size={14}
                    className={cn('text-text-secondary transition-transform', showNamespaceMenu && 'rotate-180')}
                  />
                </button>

                {showNamespaceMenu && (
                  <div className="absolute right-0 mt-1 w-56 bg-surface border border-border rounded-lg shadow-md z-[90] max-h-64 overflow-y-auto">
                    <button
                      type="button"
                      onClick={() => {
                        clearNamespaces();
                        setShowNamespaceMenu(false);
                      }}
                      className={cn(
                        'w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-hover transition-colors',
                        selectedNamespaces.length === 0
                          ? 'bg-hover text-primary'
                          : 'text-text-secondary'
                      )}
                    >
                      <Checkbox
                        checked={selectedNamespaces.length === 0}
                        onChange={() => {
                          clearNamespaces();
                          setShowNamespaceMenu(false);
                        }}
                      />
                      <span>All Namespaces</span>
                    </button>
                    {namespaces.map((ns) => (
                      <button
                        key={ns}
                        type="button"
                        onClick={() => toggleNamespace(ns)}
                        className={cn(
                          'w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-hover transition-colors border-t border-border',
                          selectedNamespaces.includes(ns)
                            ? 'bg-hover text-primary'
                            : 'text-text-secondary'
                        )}
                      >
                        <Checkbox
                          checked={selectedNamespaces.includes(ns)}
                          onChange={() => toggleNamespace(ns)}
                        />
                        <span className="text-left w-full">{ns}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

          </div>
        </header>

        {/* Error banner for desktop startup issues */}
        {desktopMode && kubeconfigError && (
          <div className="bg-red-900/20 border-b border-red-700/50 px-4 py-3 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="text-red-600 font-semibold">⚠</div>
              <div className="flex flex-col gap-1">
                <div className="text-sm font-medium text-red-700">Backend configuration error</div>
                <div className="text-xs text-red-600">{kubeconfigError}</div>
              </div>
            </div>
            <Link
              to="/desktop/settings"
              className="flex-shrink-0 rounded-md bg-red-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-600 transition-colors"
            >
              Configure
            </Link>
          </div>
        )}

        {/* Content */}
        <main className="flex-1 overflow-auto bg-bg p-4 min-h-0 text-[14px] leading-5">
          <Suspense fallback={null}>
            <Outlet />
          </Suspense>
        </main>
        {/* Bottom panel — VS Code style tabs for shells, logs, YAML */}
        <BottomPanel />

        {isAppSettingsOpen && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 p-4" onClick={closeAppSettings}>
            <div
              className="relative flex h-[min(88vh,900px)] w-[min(96vw,1100px)] flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-2xl"
              role="dialog"
              aria-modal="true"
              aria-label="Settings"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-border px-5 py-3">
                <h2 className="inline-flex items-center gap-2 text-base font-semibold text-text">
                  <Settings size={18} className="text-text-secondary" />
                  <span>Settings</span>
                </h2>
                <button
                  type="button"
                  onClick={closeAppSettings}
                  className="inline-flex rounded-md border border-border bg-surface-elevated p-2 text-text-secondary hover:bg-hover"
                  aria-label="Close settings"
                  title="Close"
                >
                  <X size={16} />
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-auto">
                <DesktopSettingsPage />
              </div>
            </div>
          </div>
        )}

      </div>

      {desktopMode && showKubeconfigModal && clusterSelectionDialog}
      </div>
    </div>
  );
};
