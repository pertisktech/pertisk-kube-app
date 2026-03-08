import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
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
  Moon,
  X,
  Sun,
  LayoutDashboard,
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
} from './Icons';
import { cn } from '../utils';
import { APP_VERSION } from '../utils/version';
import { useTheme } from '../context/ThemeContext';


interface NavItem {
  label: string;
  path: string;
  icon: IconComponent;
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', path: '/', icon: LayoutDashboard },
  { label: 'Nodes', path: '/nodes', icon: Network },
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

interface LayoutProps {
  username?: string;
  onLogout: () => void;
}

interface BreadcrumbItem {
  label: string;
  path?: string;
  icon?: IconComponent;
}

export const Layout = ({ username, onLogout }: LayoutProps) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showNamespaceMenu, setShowNamespaceMenu] = useState(false);
  const [workloadsOpen, setWorkloadsOpen] = useState(false);
  const [configOpen, setConfigOpen] = useState(false);
  const [storageOpen, setStorageOpen] = useState(false);
  const [networkOpen, setNetworkOpen] = useState(false);
  const [helmOpen, setHelmOpen] = useState(false);
  const [accessControlOpen, setAccessControlOpen] = useState(false);
  const [customResourcesOpen, setCustomResourcesOpen] = useState(false);

  const location = useLocation();
  const { data: crds, isLoading: crdsLoading } = useRealtimeCrds();

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

  const userMenuRef = useRef<HTMLDivElement>(null);
  const namespaceMenuRef = useRef<HTMLDivElement>(null);
  const theme = useTheme();
  const { selectedNamespaces, setSelectedNamespaces, toggleNamespace, clearNamespaces, namespaces, setNamespaces } = useNamespace();
  const { data: realtimeNamespaces } = useRealtimeNamespaces();
  const { data: apiNamespaces } = useNamespaces();

  // Hide namespace filter on Dashboard, Nodes, and Namespaces pages
  const shouldShowNamespaceFilter = location.pathname !== '/' && location.pathname !== '/nodes' && location.pathname !== '/namespaces';

  // Connect to host machine or Kubernetes pod
  // (handled by BottomPanel via openPanelTab)

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setShowUserMenu(false);
      }
      if (namespaceMenuRef.current && !namespaceMenuRef.current.contains(event.target as Node)) {
        setShowNamespaceMenu(false);
      }
    }

    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

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
    if (pathname.startsWith('/crds')) {
      setCustomResourcesOpen(true);
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

    const navItem = NAV_ITEMS.find(
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

  const initial = username ? username.charAt(0).toUpperCase() : 'U';

  return (
    <div
      className="flex h-screen bg-bg text-text"
      style={{ '--layout-sidebar-width': sidebarCollapsed ? '72px' : '16rem' } as CSSProperties}
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
          'fixed inset-y-0 left-0 z-50 bg-sidebar border-r border-border shadow-lg overflow-y-auto transition-all duration-300 md:relative md:translate-x-0 flex flex-col',
          sidebarCollapsed ? 'w-[72px]' : 'w-64',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="flex-1 p-4 overflow-y-auto">
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-2">
              {!sidebarCollapsed && (
                <>
                  <h1 className="text-lg font-bold text-primary">Pertisk Kube</h1>
                  <span className="text-xs font-medium text-text-secondary">v{APP_VERSION}</span>
                </>
              )}
            </div>
            <div className="flex items-center gap-1 ml-auto">
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
                    'flex items-center gap-3 px-4 py-2 rounded-lg transition-colors text-sm font-medium',
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
                  'w-full flex items-center gap-3 px-4 py-2 rounded-lg transition-colors text-sm font-medium',
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
                          'flex items-center gap-3 px-4 py-2 pl-10 rounded-lg transition-colors text-sm font-medium',
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
                  'w-full flex items-center gap-3 px-4 py-2 rounded-lg transition-colors text-sm font-medium',
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
                          'flex items-center gap-3 px-4 py-2 pl-10 rounded-lg transition-colors text-sm font-medium',
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
                  'w-full flex items-center gap-3 px-4 py-2 rounded-lg transition-colors text-sm font-medium',
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
                          'flex items-center gap-3 px-4 py-2 pl-10 rounded-lg transition-colors text-sm font-medium',
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
                  'w-full flex items-center gap-3 px-4 py-2 rounded-lg transition-colors text-sm font-medium',
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
                          'flex items-center gap-3 px-4 py-2 pl-10 rounded-lg transition-colors text-sm font-medium',
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
                'flex items-center gap-3 px-4 py-2 rounded-lg transition-colors text-sm font-medium',
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
                'flex items-center gap-3 px-4 py-2 rounded-lg transition-colors text-sm font-medium',
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
                  'w-full flex items-center gap-3 px-4 py-2 rounded-lg transition-colors text-sm font-medium',
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
                          'flex items-center gap-3 px-4 py-2 pl-10 rounded-lg transition-colors text-sm font-medium',
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
                  'w-full flex items-center gap-3 px-4 py-2 rounded-lg transition-colors text-sm font-medium',
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
                          'flex items-center gap-3 px-4 py-2 pl-10 rounded-lg transition-colors text-sm font-medium',
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
                    'w-full flex items-center gap-3 px-4 py-2 rounded-lg transition-colors text-sm font-medium',
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
                    {crdsLoading && (
                      <div className="px-4 py-2 pl-7 text-xs text-text-secondary">Loading custom resources...</div>
                    )}
                    {!crdsLoading && crdGroups.length === 0 && (
                      <div className="px-4 py-2 pl-7 text-xs text-text-secondary">No custom resources found</div>
                    )}
                    {/* Realtime: show all groups and CRDs without level-2/3 click */}
                    {!crdsLoading && crdGroups.map(({ group, crds: groupCrds }) => (
                      <div key={group} className="space-y-0.5">
                        <div className="px-4 py-1.5 pl-7 text-xs font-medium text-text-secondary truncate" title={group}>
                          {group}
                        </div>
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
                                  'flex items-center gap-3 px-4 py-2 pl-10 rounded-lg transition-colors text-sm font-medium',
                                  active
                                    ? 'bg-hover text-[var(--color-primary)] font-semibold'
                                    : 'text-text-secondary hover:bg-hover hover:text-text'
                                )}
                                title={crd.name}
                              >
                                <span className="truncate">{crd.kind}</span>
                              </Link>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
          </nav>
        </div>

      </aside>

      {/* Main content */}
      <div className="flex flex-col flex-1 overflow-hidden">
        {/* Top bar */}
        <header className="relative z-[70] bg-surface border-b border-border px-4 py-3 flex items-center justify-between">
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
            {theme && (
              <button
                type="button"
                onClick={theme.toggleTheme}
                title={theme.isDark ? 'Light mode' : 'Dark mode'}
                aria-label={theme.isDark ? 'Switch to light mode' : 'Switch to dark mode'}
                className="inline-flex items-center justify-center p-2 rounded-lg hover:bg-hover text-text-secondary"
              >
                {theme.isDark ? <Sun size={16} /> : <Moon size={16} />}
              </button>
            )}

            <div ref={userMenuRef} className="relative">
              <button
                type="button"
                onClick={() => setShowUserMenu((previous) => !previous)}
                className={cn(
                  'inline-flex items-center gap-2 px-2 py-1.5 rounded-lg border border-border text-sm hover:bg-hover',
                  showUserMenu ? 'bg-hover' : 'bg-surface'
                )}
              >
                <span className="w-7 h-7 rounded-full bg-primary text-bg font-semibold text-xs inline-flex items-center justify-center">
                  {initial}
                </span>
                <span className="text-text-secondary max-w-28 truncate">{username || 'User'}</span>
                <ChevronDown
                  size={14}
                  className={cn('text-text-secondary transition-transform', showUserMenu && 'rotate-180')}
                />
              </button>

              {showUserMenu && (
                <div className="absolute right-0 mt-1 w-40 bg-surface border border-border rounded-lg p-1 shadow-md z-50">
                  <button
                    type="button"
                    onClick={() => {
                      setShowUserMenu(false);
                      onLogout();
                    }}
                    className="w-full text-left px-3 py-2 text-sm rounded-md hover:bg-hover text-text-secondary"
                  >
                    Logout
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-auto bg-bg p-4 min-h-0">
          <Suspense fallback={null}>
            <Outlet />
          </Suspense>
        </main>
        {/* Bottom panel — VS Code style tabs for shells, logs, YAML */}
        <BottomPanel />
      </div>
    </div>
  );
};
