import { useEffect, useRef, useState } from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import {
  ChevronDown,
  Menu,
  Moon,
  X,
  PanelLeft,
  PanelLeftClose,
  Sun,
  LayoutDashboard,
  Network,
  Database,
  Archive,
  LucideIcon,
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
} from 'lucide-react';
import { cn } from '../utils';
import { useTheme } from '../context/ThemeContext';

interface NavItem {
  label: string;
  path: string;
  icon: LucideIcon;
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
  { label: 'Pods', path: '/pods', icon: Copy },
  { label: 'Deployment', path: '/deployments', icon: Archive },
  { label: 'StatefulSet', path: '/statefulsets', icon: Archive },
  { label: 'DaemonSet', path: '/daemonsets', icon: RotateCw },
  { label: 'Replica', path: '/replicasets', icon: Boxes },
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
}

export const Layout = ({ username, onLogout }: LayoutProps) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [workloadsOpen, setWorkloadsOpen] = useState(false);
  const [configOpen, setConfigOpen] = useState(false);
  const [storageOpen, setStorageOpen] = useState(false);
  const [networkOpen, setNetworkOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const theme = useTheme();
  const location = useLocation();

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setShowUserMenu(false);
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
  }, [location.pathname]);

  const isActive = (path: string) => {
    if (path === '/') return location.pathname === '/';
    return location.pathname.startsWith(path);
  };

  const hasActiveWorkload = WORKLOAD_ITEMS.some((item) => isActive(item.path));
  const hasActiveConfig = CONFIG_ITEMS.some((item) => isActive(item.path));
  const hasActiveStorage = STORAGE_ITEMS.some((item) => isActive(item.path));
  const hasActiveNetwork = NETWORK_ITEMS.some((item) => isActive(item.path));

  const breadcrumbs = (() => {
    const pathname = location.pathname;

    if (pathname === '/') {
      return [{ label: 'Dashboard', path: '/' }] as BreadcrumbItem[];
    }

    if (pathname === NAMESPACE_ITEM.path || pathname.startsWith(`${NAMESPACE_ITEM.path}/`)) {
      return [{ label: NAMESPACE_ITEM.label, path: NAMESPACE_ITEM.path }] as BreadcrumbItem[];
    }

    const navItem = NAV_ITEMS.find(
      (item) => item.path !== '/' && (pathname === item.path || pathname.startsWith(`${item.path}/`))
    );
    if (navItem) {
      return [{ label: navItem.label, path: navItem.path }] as BreadcrumbItem[];
    }

    const workloadItem = WORKLOAD_ITEMS.find(
      (item) => pathname === item.path || pathname.startsWith(`${item.path}/`)
    );
    if (workloadItem) {
      return [{ label: 'Workloads' }, { label: workloadItem.label }] as BreadcrumbItem[];
    }

    const configItem = CONFIG_ITEMS.find(
      (item) => pathname === item.path || pathname.startsWith(`${item.path}/`)
    );
    if (configItem) {
      return [{ label: 'Config' }, { label: configItem.label }] as BreadcrumbItem[];
    }

    const networkItem = NETWORK_ITEMS.find(
      (item) => pathname === item.path || pathname.startsWith(`${item.path}/`)
    );
    if (networkItem) {
      return [{ label: 'Networks', path: '/network' }, { label: networkItem.label }] as BreadcrumbItem[];
    }
    if (pathname === '/network') {
      return [{ label: 'Networks', path: '/network' }] as BreadcrumbItem[];
    }

    const storageItem = STORAGE_ITEMS.find(
      (item) => pathname === item.path || pathname.startsWith(`${item.path}/`)
    );
    if (storageItem) {
      return [{ label: 'Storage', path: '/storage' }, { label: storageItem.label }] as BreadcrumbItem[];
    }
    if (pathname === '/storage') {
      return [{ label: 'Storage', path: '/storage' }] as BreadcrumbItem[];
    }

    return [{ label: 'Dashboard', path: '/' }] as BreadcrumbItem[];
  })();

  const initial = username ? username.charAt(0).toUpperCase() : 'U';

  return (
    <div className="flex h-screen bg-bg text-text">
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
          'fixed inset-y-0 left-0 z-50 bg-sidebar border-r border-border shadow-lg overflow-y-auto transition-all duration-300 md:relative md:translate-x-0',
          sidebarCollapsed ? 'w-[72px]' : 'w-64',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="p-4">
          <div className="flex items-center justify-between mb-8">
            {!sidebarCollapsed && <h1 className="text-lg font-bold text-primary">Pertisk Kube</h1>}
            <div className="flex items-center gap-1 ml-auto">
              <button
                onClick={() => setSidebarCollapsed((previous) => !previous)}
                className="hidden md:inline-flex p-2 hover:bg-hover rounded text-text-secondary"
                title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              >
                {sidebarCollapsed ? <PanelLeft size={18} /> : <PanelLeftClose size={18} />}
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
                      ? 'bg-hover text-primary'
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
                    ? 'bg-hover text-primary'
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
                            ? 'bg-hover text-primary'
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
                    ? 'bg-hover text-primary'
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
                            ? 'bg-hover text-primary'
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
                    ? 'bg-hover text-primary'
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
                            ? 'bg-hover text-primary'
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
                    ? 'bg-hover text-primary'
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
                            ? 'bg-hover text-primary'
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
                  ? 'bg-hover text-primary'
                  : 'text-text-secondary hover:bg-hover hover:text-text'
              )}
              title={NAMESPACE_ITEM.label}
            >
              <NAMESPACE_ITEM.icon size={18} className="flex-shrink-0" />
              {!sidebarCollapsed && <span>{NAMESPACE_ITEM.label}</span>}
            </Link>
          </nav>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex flex-col flex-1 overflow-hidden">
        {/* Top bar */}
        <header className="bg-surface border-b border-border px-4 py-3 flex items-center">
          <button
            onClick={() => setSidebarOpen(true)}
            className="md:hidden p-2 hover:bg-hover rounded"
          >
            <Menu size={20} />
          </button>
          <div className="ml-auto flex items-center gap-2">
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
        <main className="flex-1 overflow-auto bg-bg p-6">
          <nav className="mb-4 text-sm text-text-secondary" aria-label="Breadcrumb">
            <ol className="flex items-center flex-wrap gap-2">
              {breadcrumbs.map((crumb, index) => {
                const isLast = index === breadcrumbs.length - 1;
                return (
                  <li key={`${crumb.label}-${index}`} className="inline-flex items-center gap-2">
                    {index > 0 && <span>/</span>}
                    {crumb.path && !isLast ? (
                      <Link to={crumb.path} className="hover:text-text transition-colors">
                        {crumb.label}
                      </Link>
                    ) : (
                      <span className={cn(isLast && 'text-text font-medium')}>{crumb.label}</span>
                    )}
                  </li>
                );
              })}
            </ol>
          </nav>
          <Outlet />
        </main>
      </div>
    </div>
  );
};
