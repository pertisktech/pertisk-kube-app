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
  AlertCircle,
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
  { label: 'Namespaces', path: '/namespaces', icon: Database },
  { label: 'Nodes', path: '/nodes', icon: Network },
  { label: 'Pods', path: '/pods', icon: Copy },
  { label: 'Deployments', path: '/deployments', icon: Archive },
  { label: 'StatefulSets', path: '/statefulsets', icon: Archive },
  { label: 'DaemonSets', path: '/daemonsets', icon: RotateCw },
  { label: 'ReplicaSets', path: '/replicasets', icon: Boxes },
  { label: 'Jobs', path: '/jobs', icon: Clock },
  { label: 'CronJobs', path: '/cronjobs', icon: Clock },
  { label: 'Events', path: '/events', icon: AlertCircle },
];

interface LayoutProps {
  username?: string;
  onLogout: () => void;
}

export const Layout = ({ username, onLogout }: LayoutProps) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
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

  const isActive = (path: string) => {
    if (path === '/') return location.pathname === '/';
    return location.pathname.startsWith(path);
  };

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
            <button
              onClick={() => setSidebarOpen(false)}
              className="md:hidden p-1 hover:bg-hover rounded"
            >
              <X size={20} />
            </button>
          </div>

          <nav className="space-y-2">
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
          <button
            onClick={() => setSidebarCollapsed((previous) => !previous)}
            className="hidden md:inline-flex p-2 hover:bg-hover rounded text-text-secondary"
            title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {sidebarCollapsed ? <PanelLeft size={18} /> : <PanelLeftClose size={18} />}
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
          <Outlet />
        </main>
      </div>
    </div>
  );
};
