import { useState } from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import {
  Menu,
  X,
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

export const Layout = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();

  const isActive = (path: string) => {
    if (path === '/') return location.pathname === '/';
    return location.pathname.startsWith(path);
  };

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
          'fixed inset-y-0 left-0 z-50 w-64 bg-sidebar border-r border-border shadow-lg overflow-y-auto transition-transform duration-300 md:relative md:translate-x-0',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="p-4">
          <div className="flex items-center justify-between mb-8">
            <h1 className="text-lg font-bold text-primary">Pertisk Kube</h1>
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
                    active
                      ? 'bg-hover text-primary'
                      : 'text-text-secondary hover:bg-hover hover:text-text'
                  )}
                >
                  <Icon size={18} className="flex-shrink-0" />
                  <span>{item.label}</span>
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
          <div className="ml-auto text-sm text-text-secondary">
            Kubernetes Dashboard
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
