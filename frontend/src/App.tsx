import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { Toaster } from 'sonner';
import { Layout } from './components';
import { NamespaceProvider } from './context/NamespaceContext';
import { clearAuth, getAuthUser, getTokenExpiry, isAuthenticated, refreshToken } from './utils/auth';

const Dashboard = lazy(() => import('./pages/Dashboard').then(m => ({ default: m.Dashboard })));
const NamespacesPage = lazy(() => import('./pages/NamespacesPage').then(m => ({ default: m.NamespacesPage })));
const NodesPage = lazy(() => import('./pages/NodesPage').then(m => ({ default: m.NodesPage })));
const PodsPage = lazy(() => import('./pages/PodsPage').then(m => ({ default: m.PodsPage })));
const DeploymentsPage = lazy(() => import('./pages/DeploymentsPage').then(m => ({ default: m.DeploymentsPage })));
const StatefulSetsPage = lazy(() => import('./pages/StatefulSetsPage').then(m => ({ default: m.StatefulSetsPage })));
const DaemonSetsPage = lazy(() => import('./pages/DaemonSetsPage').then(m => ({ default: m.DaemonSetsPage })));
const ReplicaSetsPage = lazy(() => import('./pages/ReplicaSetsPage').then(m => ({ default: m.ReplicaSetsPage })));
const JobsPage = lazy(() => import('./pages/JobsPage').then(m => ({ default: m.JobsPage })));
const CronJobsPage = lazy(() => import('./pages/CronJobsPage').then(m => ({ default: m.CronJobsPage })));
const WorkloadsOverviewPage = lazy(() => import('./pages/WorkloadsOverviewPage').then(m => ({ default: m.WorkloadsOverviewPage })));
const EventsPage = lazy(() => import('./pages/EventsPage').then(m => ({ default: m.EventsPage })));
const HelmChartsPage = lazy(() => import('./pages/HelmChartsPage').then(m => ({ default: m.HelmChartsPage })));
const HelmReleasesPage = lazy(() => import('./pages/HelmReleasesPage').then(m => ({ default: m.HelmReleasesPage })));
const LoginPage = lazy(() => import('./pages/LoginPage').then(m => ({ default: m.LoginPage })));
const ConfigMapsPage = lazy(() => import('./pages/ConfigMapsPage').then(m => ({ default: m.ConfigMapsPage })));
const SecretsPage = lazy(() => import('./pages/SecretsPage').then(m => ({ default: m.SecretsPage })));
const ResourceQuotasPage = lazy(() => import('./pages/ResourceQuotasPage').then(m => ({ default: m.ResourceQuotasPage })));
const LimitRangesPage = lazy(() => import('./pages/LimitRangesPage').then(m => ({ default: m.LimitRangesPage })));
const HPAPage = lazy(() => import('./pages/HPAPage').then(m => ({ default: m.HPAPage })));
const PDBPage = lazy(() => import('./pages/PDBPage').then(m => ({ default: m.PDBPage })));
const PriorityClassesPage = lazy(() => import('./pages/PriorityClassesPage').then(m => ({ default: m.PriorityClassesPage })));
const RuntimeClassesPage = lazy(() => import('./pages/RuntimeClassesPage').then(m => ({ default: m.RuntimeClassesPage })));
const LeasesPage = lazy(() => import('./pages/LeasesPage').then(m => ({ default: m.LeasesPage })));
const MWCPage = lazy(() => import('./pages/MWCPage').then(m => ({ default: m.MWCPage })));
const VWCPage = lazy(() => import('./pages/VWCPage').then(m => ({ default: m.VWCPage })));
const ServicesPage = lazy(() => import('./pages/ServicesPage').then(m => ({ default: m.ServicesPage })));
const EndpointsPage = lazy(() => import('./pages/EndpointsPage').then(m => ({ default: m.EndpointsPage })));
const IngressesPage = lazy(() => import('./pages/IngressesPage').then(m => ({ default: m.IngressesPage })));
const IngressClassesPage = lazy(() => import('./pages/IngressClassesPage').then(m => ({ default: m.IngressClassesPage })));
const NetworkPoliciesPage = lazy(() => import('./pages/NetworkPoliciesPage').then(m => ({ default: m.NetworkPoliciesPage })));
const PortForwardingPage = lazy(() => import('./pages/PortForwardingPage').then(m => ({ default: m.PortForwardingPage })));
const NetworkPage = lazy(() => import('./pages/NetworkPage').then(m => ({ default: m.NetworkPage })));
const StoragePage = lazy(() => import('./pages/StoragePage').then(m => ({ default: m.StoragePage })));
const PersistentVolumesPage = lazy(() => import('./pages/PersistentVolumesPage').then(m => ({ default: m.PersistentVolumesPage })));
const PersistentVolumeClaimsPage = lazy(() => import('./pages/PersistentVolumeClaimsPage').then(m => ({ default: m.PersistentVolumeClaimsPage })));
const StorageClassesPage = lazy(() => import('./pages/StorageClassesPage').then(m => ({ default: m.StorageClassesPage })));
const AccessControlPage = lazy(() => import('./pages/AccessControlPage').then(m => ({ default: m.AccessControlPage })));
const ServiceAccountsPage = lazy(() => import('./pages/ServiceAccountsPage').then(m => ({ default: m.ServiceAccountsPage })));
const RolesPage = lazy(() => import('./pages/RolesPage').then(m => ({ default: m.RolesPage })));
const RoleBindingsPage = lazy(() => import('./pages/RoleBindingsPage').then(m => ({ default: m.RoleBindingsPage })));
const ClusterRolesPage = lazy(() => import('./pages/ClusterRolesPage').then(m => ({ default: m.ClusterRolesPage })));
const ClusterRoleBindingsPage = lazy(() => import('./pages/ClusterRoleBindingsPage').then(m => ({ default: m.ClusterRoleBindingsPage })));
const CustomResourcesPage = lazy(() => import('./pages/CustomResourcesPage').then(m => ({ default: m.CustomResourcesPage })));


export const App = () => {
  const [authenticated, setAuthenticated] = useState(() => isAuthenticated());
  const [authUser, setAuthUser] = useState(() => getAuthUser() ?? '');
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleLogout = useCallback(() => {
    clearAuth();
    setAuthenticated(false);
    setAuthUser('');
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
  }, []);

  const scheduleRefresh = useCallback((expiryMs: number) => {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    // Refresh 5 minutes before expiry, minimum 10 seconds from now
    const msUntilExpiry = expiryMs - Date.now();
    const delay = Math.max(10_000, msUntilExpiry - 5 * 60 * 1000);
    refreshTimerRef.current = setTimeout(async () => {
      const newExpiry = await refreshToken();
      if (newExpiry) {
        scheduleRefresh(newExpiry);
      } else {
        handleLogout();
      }
    }, delay);
  }, [handleLogout]);

  const handleLogin = useCallback(() => {
    setAuthenticated(true);
    setAuthUser(getAuthUser() ?? '');
    const expiry = getTokenExpiry();
    if (expiry) scheduleRefresh(expiry);
  }, [scheduleRefresh]);

  // On mount: schedule refresh if already authenticated, listen for 401 events
  useEffect(() => {
    if (authenticated) {
      const expiry = getTokenExpiry();
      if (expiry) scheduleRefresh(expiry);
    }
    const onExpired = () => handleLogout();
    window.addEventListener('auth:expired', onExpired);
    return () => {
      window.removeEventListener('auth:expired', onExpired);
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    };
  }, []);

  if (!authenticated) {
    return (
      <Suspense fallback={null}>
        <LoginPage onLogin={handleLogin} />
      </Suspense>
    );
  }

  return (
    <NamespaceProvider>
      <Toaster
        position="top-right"
        closeButton
        toastOptions={{
          style: {
            background: 'var(--color-naturals-n3)',
            border: '1px solid var(--color-naturals-n6)',
            color: 'var(--color-naturals-n13)',
            borderRadius: 'var(--radius-lg)',
            fontSize: '13px',
            fontFamily: 'var(--font-sans)',
            boxShadow: '0 8px 24px rgba(0,0,0,0.45)',
          },
        }}
      />
      <Router>
          <Routes>
            <Route element={<Layout username={authUser} onLogout={handleLogout} />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/terminal" element={null} />
          <Route path="/workloads" element={<WorkloadsOverviewPage />} />
          <Route path="/namespaces" element={<NamespacesPage />} />
          <Route path="/nodes" element={<NodesPage />} />
          <Route path="/pods" element={<PodsPage />} />
          <Route path="/deployments" element={<DeploymentsPage />} />
          <Route path="/statefulsets" element={<StatefulSetsPage />} />
          <Route path="/daemonsets" element={<DaemonSetsPage />} />
          <Route path="/replicasets" element={<ReplicaSetsPage />} />
          <Route path="/jobs" element={<JobsPage />} />
          <Route path="/cronjobs" element={<CronJobsPage />} />
          <Route path="/config/configmaps" element={<ConfigMapsPage />} />
          <Route path="/config/secrets" element={<SecretsPage />} />
          <Route path="/config/resourcequotas" element={<ResourceQuotasPage />} />
          <Route path="/config/limitranges" element={<LimitRangesPage />} />
          <Route path="/config/hpa" element={<HPAPage />} />
          <Route path="/config/pdb" element={<PDBPage />} />
          <Route path="/config/priorityclasses" element={<PriorityClassesPage />} />
          <Route path="/config/runtimeclasses" element={<RuntimeClassesPage />} />
          <Route path="/config/leases" element={<LeasesPage />} />
          <Route path="/config/mwc" element={<MWCPage />} />
          <Route path="/config/vwc" element={<VWCPage />} />
          <Route path="/network" element={<NetworkPage />} />
          <Route path="/network/services" element={<ServicesPage />} />
          <Route path="/network/endpoints" element={<EndpointsPage />} />
          <Route path="/network/ingresses" element={<IngressesPage />} />
          <Route path="/network/ingressclasses" element={<IngressClassesPage />} />
          <Route path="/network/networkpolicies" element={<NetworkPoliciesPage />} />
          <Route path="/network/portforwarding" element={<PortForwardingPage />} />
          <Route path="/storage" element={<StoragePage />} />
          <Route path="/storage/pvc" element={<PersistentVolumeClaimsPage />} />
          <Route path="/storage/pv" element={<PersistentVolumesPage />} />
          <Route path="/storage/storageclasses" element={<StorageClassesPage />} />
          <Route path="/helm/charts" element={<HelmChartsPage />} />
          <Route path="/helm/releases" element={<HelmReleasesPage />} />
          <Route path="/access-control" element={<AccessControlPage />} />
          <Route path="/access-control/serviceaccounts" element={<ServiceAccountsPage />} />
          <Route path="/access-control/clusterroles" element={<ClusterRolesPage />} />
          <Route path="/access-control/roles" element={<RolesPage />} />
          <Route path="/access-control/clusterrolebindings" element={<ClusterRoleBindingsPage />} />
          <Route path="/access-control/rolebindings" element={<RoleBindingsPage />} />
          <Route path="/events" element={<EventsPage />} />
          <Route path="/crds/:crdName" element={<CustomResourcesPage />} />
        </Route>
      </Routes>
      </Router>
    </NamespaceProvider>
  );
};
