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
  Network,
  Database,
  Archive,
  Copy,
  Clock,
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
  PanelLeftClose,
  PanelLeftOpen,
} from './Icons';
import { cn } from '../utils';
import {
  type DesktopAuthStatus,
  type DesktopKubeconfigCluster,
  getDesktopAuthStatus,
  getDesktopSidecarConfig,
  listDesktopKubeconfigClusters,
  listDesktopKubeconfigCandidates,
  saveDesktopSidecarConfig,
  triggerKubeBrowserLogin,
  waitDesktopClusterSwitchResult,
} from '../utils/tauriDesktop';
import { isDesktopRuntime } from '../utils/desktopBridge';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { APP_VERSION } from '../utils/version';
import { DesktopSettingsPage } from '../pages/DesktopSettingsPage';

const appWindow = getCurrentWindow();

interface NavItem {
  label: string;
  path: string;
  icon: IconComponent;
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', path: '/', icon: LayoutDashboard },
  { label: 'Nodes', path: '/nodes', icon: Network },
];

const BOTTOM_NAV_ITEMS: NavItem[] = [
  { label: 'Cluster', path: '/cluster', icon: Server },
  { label: 'Resource Map', path: '/resource-map', icon: Share2 },
];

const NAMESPACE_ITEM: NavItem = {
  label: 'Namespace',
  path: '/namespaces',
  icon: Database,
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

const HELM_ITEMS: NavItem[] = [
  { label: 'Charts', path: '/helm/charts', icon: Archive },
  { label: 'Releases', path: '/helm/releases', icon: Boxes },
];

const ACCESS_CONTROL_ITEMS: NavItem[] = [
  { label: 'Service Accounts', path: '/access-control/serviceaccounts', icon: KeyRound },
  { label: 'Cluster Roles', path: '/access-control/clusterroles', icon: Shield },
  { label: 'Roles', path: '/access-control/roles', icon: Shield },
  { label: 'Cluster Role Bindings', path: '/access-control/clusterrolebindings', icon: Boxes },
  { label: 'Role Bindings', path: '/access-control/rolebindings', icon: Boxes },
];

const NETWORK_ITEMS: NavItem[] = [
  { label: 'Services', path: '/network/services', icon: Network },
  { label: 'Endpoints', path: '/network/endpoints', icon: Network },
  { label: 'Ingresses', path: '/network/ingresses', icon: Globe },
  { label: 'Ingress Classes', path: '/network/ingressclasses', icon: Globe },
  { label: 'Network Policies', path: '/network/networkpolicies', icon: Shield },
  { label: 'Port Forwarding', path: '/network/portforwarding', icon: RotateCw },
];

const STORAGE_ITEMS: NavItem[] = [
  { label: 'PVC', path: '/storage/pvc', icon: HardDrive },
  { label: 'PV', path: '/storage/pv', icon: HardDrive },
  { label: 'Storage Classes', path: '/storage/storageclasses', icon: Database },
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
    || normalized.includes('no kubernetes cluster configuration found');
}

const CONFIG_ITEMS: NavItem[] = [
  { label: 'Config Maps', path: '/config/configmaps', icon: FileText },
  { label: 'Secrets', path: '/config/secrets', icon: KeyRound },
  { label: 'Resource Quotas', path: '/config/resourcequotas', icon: Gauge },
  { label: 'Limit Ranges', path: '/config/limitranges', icon: SlidersHorizontal },
  { label: 'HPA', path: '/config/hpa', icon: Gauge },
  { label: 'PDB', path: '/config/pdb', icon: Shield },
  { label: 'Priority Classes', path: '/config/priorityclasses', icon: Flag },
  { label: 'Runtime Classes', path: '/config/runtimeclasses', icon: Settings },
  { label: 'Leases', path: '/config/leases', icon: Timer },
  { label: 'MWC', path: '/config/mwc', icon: Shield },
  { label: 'VWC', path: '/config/vwc', icon: Shield },
];

const WORKLOAD_ITEMS: NavItem[] = [
  { label: 'Overview', path: '/workloads', icon: LayoutGrid },
  { label: 'Pods', path: '/pods', icon: Copy },
  { label: 'Deployment', path: '/deployments', icon: Archive },
  { label: 'StatefulSet', path: '/statefulsets', icon: Archive },
  { label: 'DaemonSet', path: '/daemonsets', icon: RotateCw },
  { label: 'ReplicaSet', path: '/replicasets', icon: Boxes },
  { label: 'Jobs', path: '/jobs', icon: Clock },
  { label: 'CronJob', path: '/cronjobs', icon: Clock },
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
  const [startupClusterSelectionDone, setStartupClusterSelectionDone] = useState(false);
  const [authStatus, setAuthStatus] = useState<DesktopAuthStatus | null>(null);
  const [browserLoginLoading, setBrowserLoginLoading] = useState(false);
  const [workloadsOpen, setWorkloadsOpen] = useState(false);
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

        // Check if no kubeconfig files were found
        if (!candidates || candidates.length === 0) {
          setKubeconfigError(null);
          setKubeClusters([]);
          setSelectedClusterContext('');
          setKubeconfigLoading(false);
          setKubeconfigInitialized(true);
          return;
        }

        const currentPath = config.kubeconfigPath ?? '';
        const currentContext = config.kubeContext ?? '';
        setKubeconfigPath(currentPath);
        setKubeContext(currentContext);
        setStartupClusterSelectionDone(Boolean(currentContext.trim()));
        setKubeconfigInput(currentPath);
        setSelectedClusterContext(currentContext);

        const merged = new Set(candidates);
        if (currentPath) merged.add(currentPath);
        const sortedCandidates = Array.from(merged).sort((a, b) => a.localeCompare(b));
        setKubeconfigCandidates(sortedCandidates);

        const clusters = await listDesktopKubeconfigClusters(currentPath || null);
        if (cancelled) return;
        setKubeClusters(clusters);

        if (!currentContext) {
          const currentCluster = clusters.find((item) => item.isCurrent)?.context ?? '';
          setSelectedClusterContext(currentCluster);
          if (currentCluster.trim()) {
            // current-context in kubeconfig is a valid selected cluster,
            // even when sidecar config does not persist kubeContext explicitly.
            setStartupClusterSelectionDone(true);
          }
        }
      } catch (err) {
        if (cancelled) return;
        const rawMessage = getErrorMessage(err);
        const auth = await getDesktopAuthStatus();
        const resolvedMessage =
          rawMessage
          || auth.message
          || 'No Kubernetes cluster configuration found. Add a kubeconfig at ~/.kube/config or set KUBECONFIG, then restart the app.';

        if (isNoKubeconfigError(resolvedMessage)) {
          setKubeconfigError(null);
          setKubeClusters([]);
          setSelectedClusterContext('');
          return;
        }

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

  const handleBrowserLogin = async () => {
    setBrowserLoginLoading(true);
    try {
      await triggerKubeBrowserLogin();
      toast.success('Authenticated successfully. Cluster connection restored.');
      setAuthStatus(null);
    } catch (err) {
      toast.error(getErrorMessage(err) ?? 'Browser login failed.');
    } finally {
      setBrowserLoginLoading(false);
    }
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
      if (clusters.length === 0) {
        setSelectedClusterContext('');
      } else {
        const currentCluster = clusters.find((item) => item.isCurrent)?.context ?? '';
        setSelectedClusterContext((prev) => prev || currentCluster);
      }
    } catch (err) {
      if (requestId !== kubeconfigRefreshRequestRef.current) {
        return;
      }

      const rawMessage = getErrorMessage(err);
      if (isNoKubeconfigError(rawMessage)) {
        setKubeClusters([]);
        setSelectedClusterContext('');
        return;
      }
      setKubeClusters([]);
      toast.error(err instanceof Error ? err.message : 'Failed to load clusters for kubeconfig.');
    } finally {
      if (requestId === kubeconfigRefreshRequestRef.current) {
        setKubeconfigLoading(false);
      }
    }
  };

  const applyClusterSelection = async (path: string, context: string) => {
    if (!desktopMode) return;

    setKubeconfigSwitching(true);
    try {
      const current = await getDesktopSidecarConfig();
      const nextPath = path.trim();
      const nextContext = context.trim();
      await saveDesktopSidecarConfig({
        ...current,
        kubeconfigPath: nextPath || null,
        kubeContext: nextContext || null,
      });

      // Clear stale old-cluster content immediately while switch is in progress.
      window.dispatchEvent(new CustomEvent('cluster:switched'));

      const switchResult = await waitDesktopClusterSwitchResult(nextContext, 65_000);
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
      setClusterSearch('');
      setShowKubeconfigModal(true);
    }
  }, [mustSelectCluster]);

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

    if (namespaceNames.length > 0) {
      setNamespaces(namespaceNames);
    }

    if (selectedNamespaces.length > 0 && namespaceNames.length > 0) {
      const validSelected = selectedNamespaces.filter((ns) => namespaceNames.includes(ns));
      if (validSelected.length !== selectedNamespaces.length) {
        setSelectedNamespaces(validSelected);
      }
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
    const target = e.target as HTMLElement;
    if (target.closest('button, a, input, select, textarea, [role="button"]')) return;
    if (e.detail === 2) {
      appWindow.toggleMaximize();
    } else {
      appWindow.startDragging();
    }
  };

  const clusterSelectionDialog = (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/50 px-4"
      onClick={() => {
        if (!mustSelectCluster) {
          setShowKubeconfigModal(false);
        }
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Select cluster"
        className="w-full max-w-3xl rounded-xl border border-border bg-surface shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h3 className="text-base font-semibold text-text">Select Cluster</h3>
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

        <div className="space-y-4 px-5 py-4">
          {mustSelectCluster && (
            <div className="rounded-md border border-border bg-surface-elevated px-3 py-2 text-sm text-text-secondary">
              Select a cluster context to continue to the dashboard.
            </div>
          )}
          <div className="space-y-2">
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
              <option value="">Default kubeconfig</option>
              {kubeconfigCandidates.map((candidate) => (
                <option key={candidate} value={candidate}>{candidate}</option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label htmlFor="modal-cluster-search" className="block text-sm font-medium text-text-secondary">
              Search cluster context
            </label>
            <input
              id="modal-cluster-search"
              value={clusterSearch}
              onChange={(e) => setClusterSearch(e.target.value)}
              placeholder="Type context, cluster, namespace..."
              className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm"
            />
          </div>

          <div className="rounded-lg border border-border">
            <div className="px-3 py-2 text-xs text-text-secondary border-b border-border">
              Available cluster contexts
            </div>
            <div className="max-h-56 overflow-y-auto">
              {kubeconfigLoading && (
                <div className="px-3 py-2 text-sm text-text-secondary">Loading contexts...</div>
              )}
              {!kubeconfigLoading && filteredClusters.length === 0 && (
                <div className="px-3 py-2 text-sm text-text-secondary">No cluster contexts found for this kubeconfig.</div>
              )}
              {filteredClusters.map((item) => (
                <button
                  key={`${item.kubeconfigPath}:${item.context}`}
                  type="button"
                  onClick={() => setSelectedClusterContext(item.context)}
                  className={cn(
                    'w-full px-3 py-2 text-left text-sm border-t border-border first:border-t-0 hover:bg-hover',
                    selectedClusterContext === item.context ? 'bg-hover text-primary font-medium' : 'text-text-secondary'
                  )}
                  title={item.context}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate">{item.context}</span>
                    {item.isCurrent && <span className="text-xs text-primary">current</span>}
                  </div>
                  <div className="text-xs text-text-secondary truncate">
                    cluster: {item.cluster ?? '-'}{item.namespace ? ` • ns: ${item.namespace}` : ''}
                  </div>
                </button>
              ))}
            </div>
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
            onClick={() => void applyClusterSelection(kubeconfigInput, selectedClusterContext)}
            className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            {kubeconfigSwitching ? 'Switching...' : 'Apply'}
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
            sidebarCollapsed ? 'justify-center px-2' : 'justify-between px-4'
          )}
        >
          <div className="flex items-center gap-3 min-w-0">
            {!sidebarCollapsed && (
              <>
                <Link
                  to="/"
                  className="flex items-center gap-3 min-w-0 rounded-lg transition-colors hover:bg-hover px-4 py-1"
                  aria-label="PTKublet home"
                >
                  <img
                    src="/favicon.svg"
                    alt=""
                    className="h-8 w-8 shrink-0"
                  />
                  <h1 className="truncate text-[1.05rem] font-[650] tracking-[-0.02em] text-text">PTKublet</h1>
                </Link>
              </>
            )}
          </div>
          <div className={cn('flex items-center gap-1', !sidebarCollapsed && 'ml-auto')}>
            <button
              onClick={() => setSidebarCollapsed((previous) => !previous)}
              className="hidden md:inline-flex p-2 hover:bg-hover rounded text-text-secondary"
              title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              {sidebarCollapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
            </button>
            <button
              onClick={() => setSidebarOpen(false)}
              className="md:hidden p-1 hover:bg-hover rounded"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        <div className="flex-1 p-4 overflow-y-auto">
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
                    'flex items-center gap-3 px-4 py-2 rounded-lg transition-colors text-[14px] font-medium',
                    'order-1',
                    sidebarCollapsed && 'justify-center px-2',
                    active
                      ? 'bg-hover text-[var(--color-primary)] font-semibold'
                      : 'text-text-secondary hover:bg-hover hover:text-text'
                  )}
                  title={item.label}
                >
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
                  'w-full flex items-center gap-3 px-4 py-2 rounded-lg transition-colors text-[14px] font-medium',
                  sidebarCollapsed && 'justify-center px-2',
                  hasActiveConfig
                    ? 'bg-hover text-[var(--color-primary)] font-semibold'
                    : 'text-text-secondary hover:bg-hover hover:text-text'
                )}
                title="Config"
              >
                <Settings size={18} className="flex-shrink-0" />
                {!sidebarCollapsed && (
                  <>
                    <span className="flex-1 text-left">Config</span>
                    <ChevronDown
                      size={16}
                      className={cn('transition-transform', configOpen && 'rotate-180')}
                    />
                  </>
                )}
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
                          'flex items-center gap-3 px-4 py-2 pl-10 rounded-lg transition-colors text-[12px] font-medium',
                          active
                            ? 'bg-hover text-[var(--color-primary)] font-semibold'
                            : 'text-text-secondary hover:bg-hover hover:text-text'
                        )}
                        title={item.label}
                      >
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
                  'w-full flex items-center gap-3 px-4 py-2 rounded-lg transition-colors text-[14px] font-medium',
                  sidebarCollapsed && 'justify-center px-2',
                  hasActiveNetwork
                    ? 'bg-hover text-[var(--color-primary)] font-semibold'
                    : 'text-text-secondary hover:bg-hover hover:text-text'
                )}
                title="Networks"
              >
                <Globe size={18} className="flex-shrink-0" />
                {!sidebarCollapsed && (
                  <>
                    <span className="flex-1 text-left">Networks</span>
                    <ChevronDown
                      size={16}
                      className={cn('transition-transform', networkOpen && 'rotate-180')}
                    />
                  </>
                )}
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
                          'flex items-center gap-3 px-4 py-2 pl-10 rounded-lg transition-colors text-[12px] font-medium',
                          active
                            ? 'bg-hover text-[var(--color-primary)] font-semibold'
                            : 'text-text-secondary hover:bg-hover hover:text-text'
                        )}
                        title={item.label}
                      >
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
                  'w-full flex items-center gap-3 px-4 py-2 rounded-lg transition-colors text-[14px] font-medium',
                  sidebarCollapsed && 'justify-center px-2',
                  hasActiveStorage
                    ? 'bg-hover text-[var(--color-primary)] font-semibold'
                    : 'text-text-secondary hover:bg-hover hover:text-text'
                )}
                title="Storage"
              >
                <HardDrive size={18} className="flex-shrink-0" />
                {!sidebarCollapsed && (
                  <>
                    <span className="flex-1 text-left">Storage</span>
                    <ChevronDown
                      size={16}
                      className={cn('transition-transform', storageOpen && 'rotate-180')}
                    />
                  </>
                )}
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
                          'flex items-center gap-3 px-4 py-2 pl-10 rounded-lg transition-colors text-[12px] font-medium',
                          active
                            ? 'bg-hover text-[var(--color-primary)] font-semibold'
                            : 'text-text-secondary hover:bg-hover hover:text-text'
                        )}
                        title={item.label}
                      >
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
                  'w-full flex items-center gap-3 px-4 py-2 rounded-lg transition-colors text-[14px] font-medium',
                  sidebarCollapsed && 'justify-center px-2',
                  hasActiveWorkload
                    ? 'bg-hover text-[var(--color-primary)] font-semibold'
                    : 'text-text-secondary hover:bg-hover hover:text-text'
                )}
                title="Workloads"
              >
                <Archive size={18} className="flex-shrink-0" />
                {!sidebarCollapsed && (
                  <>
                    <span className="flex-1 text-left">Workloads</span>
                    <ChevronDown
                      size={16}
                      className={cn('transition-transform', workloadsOpen && 'rotate-180')}
                    />
                  </>
                )}
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
                          'flex items-center gap-3 px-4 py-2 pl-10 rounded-lg transition-colors text-[12px] font-medium',
                          active
                            ? 'bg-hover text-[var(--color-primary)] font-semibold'
                            : 'text-text-secondary hover:bg-hover hover:text-text'
                        )}
                        title={item.label}
                      >
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
                'flex items-center gap-3 px-4 py-2 rounded-lg transition-colors text-[14px] font-medium',
                'order-6',
                sidebarCollapsed && 'justify-center px-2',
                isActive(NAMESPACE_ITEM.path)
                  ? 'bg-hover text-[var(--color-primary)] font-semibold'
                  : 'text-text-secondary hover:bg-hover hover:text-text'
              )}
              title={NAMESPACE_ITEM.label}
            >
              <NAMESPACE_ITEM.icon size={18} className="flex-shrink-0" />
              {!sidebarCollapsed && <span>{NAMESPACE_ITEM.label}</span>}
            </Link>

            <Link
              to={EVENTS_ITEM.path}
              onClick={() => setSidebarOpen(false)}
              className={cn(
                'flex items-center gap-3 px-4 py-2 rounded-lg transition-colors text-[14px] font-medium',
                'order-7',
                sidebarCollapsed && 'justify-center px-2',
                isActive(EVENTS_ITEM.path)
                  ? 'bg-hover text-[var(--color-primary)] font-semibold'
                  : 'text-text-secondary hover:bg-hover hover:text-text'
              )}
              title={EVENTS_ITEM.label}
            >
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
                  'w-full flex items-center gap-3 px-4 py-2 rounded-lg transition-colors text-[14px] font-medium',
                  sidebarCollapsed && 'justify-center px-2',
                  hasActiveHelm
                    ? 'bg-hover text-[var(--color-primary)] font-semibold'
                    : 'text-text-secondary hover:bg-hover hover:text-text'
                )}
                title="Helm"
              >
                <Boxes size={18} className="flex-shrink-0" />
                {!sidebarCollapsed && (
                  <>
                    <span className="flex-1 text-left">Helm</span>
                    <ChevronDown
                      size={16}
                      className={cn('transition-transform', helmOpen && 'rotate-180')}
                    />
                  </>
                )}
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
                          'flex items-center gap-3 px-4 py-2 pl-10 rounded-lg transition-colors text-[12px] font-medium',
                          active
                            ? 'bg-hover text-[var(--color-primary)] font-semibold'
                            : 'text-text-secondary hover:bg-hover hover:text-text'
                        )}
                        title={item.label}
                      >
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
                  'w-full flex items-center gap-3 px-4 py-2 rounded-lg transition-colors text-[14px] font-medium',
                  sidebarCollapsed && 'justify-center px-2',
                  hasActiveAccessControl
                    ? 'bg-hover text-[var(--color-primary)] font-semibold'
                    : 'text-text-secondary hover:bg-hover hover:text-text'
                )}
                title="Access Control"
              >
                <Shield size={18} className="flex-shrink-0" />
                {!sidebarCollapsed && (
                  <>
                    <span className="flex-1 text-left">Access Control</span>
                    <ChevronDown
                      size={16}
                      className={cn('transition-transform', accessControlOpen && 'rotate-180')}
                    />
                  </>
                )}
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
                          'flex items-center gap-3 px-4 py-2 pl-10 rounded-lg transition-colors text-[12px] font-medium',
                          active
                            ? 'bg-hover text-[var(--color-primary)] font-semibold'
                            : 'text-text-secondary hover:bg-hover hover:text-text'
                        )}
                        title={item.label}
                      >
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
                    'w-full flex items-center gap-3 px-4 py-2 rounded-lg transition-colors text-[14px] font-medium',
                    sidebarCollapsed && 'justify-center px-2',
                    hasActiveCustomResources
                      ? 'bg-hover text-[var(--color-primary)] font-semibold'
                      : 'text-text-secondary hover:bg-hover hover:text-text'
                  )}
                  title="Custom Resources"
                >
                  <Layers size={18} className="flex-shrink-0" />
                  {!sidebarCollapsed && (
                    <>
                      <span className="flex-1 text-left">Custom Resources</span>
                      <ChevronDown
                        size={16}
                        className={cn('transition-transform', customResourcesOpen && 'rotate-180')}
                      />
                    </>
                  )}
                </button>

                {!sidebarCollapsed && customResourcesOpen && (
                  <div className="space-y-1">
                    {(!crdsHasFetched || crdsLoading || (!crdsEmptyListConfirmed && crdGroups.length === 0)) && (
                      <div className="flex items-center gap-3 px-4 py-2 pl-7 text-[13px] text-text-secondary">
                        <Layers size={16} className="flex-shrink-0" />
                        Loading custom resources...
                      </div>
                    )}
                    {crdsEmptyListConfirmed && crdGroups.length === 0 && (
                      <div className="flex items-center gap-3 px-4 py-2 pl-7 text-[13px] text-text-secondary">
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
                            className="w-full flex items-center gap-3 px-4 py-2 pl-7 rounded-lg transition-colors text-[13px] font-medium text-text-secondary hover:bg-hover hover:text-text text-left"
                            title={group}
                          >
                            <Layers size={16} className="flex-shrink-0" />
                            <span className="flex-1 text-left truncate">{group}</span>
                            <ChevronDown
                              size={16}
                              className={cn('flex-shrink-0 transition-transform', isGroupExpanded && 'rotate-180')}
                            />
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
                                      'flex items-center gap-3 px-4 py-2 pl-10 rounded-lg transition-colors text-[12px] font-medium',
                                      active
                                        ? 'bg-hover text-[var(--color-primary)] font-semibold'
                                        : 'text-text-secondary hover:bg-hover hover:text-text'
                                    )}
                                    title={crd.name}
                                  >
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
                    'flex items-center gap-3 px-4 py-2 rounded-lg transition-colors text-[14px] font-medium',
                    'order-11',
                    sidebarCollapsed && 'justify-center px-2',
                    active
                      ? 'bg-hover text-[var(--color-primary)] font-semibold'
                      : 'text-text-secondary hover:bg-hover hover:text-text'
                  )}
                  title={item.label}
                >
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
              'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
              sidebarCollapsed && 'justify-center px-2',
              isActive('/desktop/settings')
                ? 'bg-hover text-[var(--color-primary)] font-semibold'
                : 'text-text-secondary hover:bg-hover hover:text-text'
            )}
            title="Settings"
          >
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
            {/* Desktop sidebar toggle */}
            <button
              onClick={() => setSidebarCollapsed((prev) => !prev)}
              className="hidden md:inline-flex p-2 hover:bg-hover rounded text-text-secondary flex-shrink-0"
              title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              {sidebarCollapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
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
                  <span className="max-w-40 truncate">
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
                        <span>{ns}</span>
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

        {/* Auth placeholder banner — shown when sidecar started with a placeholder kube client */}
        {desktopMode && authStatus?.placeholder && (
          <div className="bg-amber-900/20 border-b border-amber-700/50 px-4 py-2.5 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <div className="text-amber-500 font-semibold shrink-0">⚠</div>
              <div className="flex flex-col gap-0.5 min-w-0">
                <div className="text-sm font-medium text-amber-600">Authentication required</div>
                <div className="text-xs text-amber-500">
                  {authStatus.message
                    || 'Credentials are expired or the OIDC provider was unreachable at startup. Click Login with Browser to re-authenticate.'}
                </div>
              </div>
            </div>
            <button
              type="button"
              disabled={browserLoginLoading}
              onClick={() => {
                void handleBrowserLogin();
              }}
              className="flex-shrink-0 rounded-md bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-500 disabled:opacity-50 transition-colors"
            >
              {browserLoginLoading ? 'Logging in…' : 'Login with Browser'}
            </button>
          </div>
        )}

        {/* Content */}
        <main className="flex-1 overflow-auto bg-bg p-4 min-h-0">
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
