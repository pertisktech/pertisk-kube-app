import { useCallback, useEffect, useRef, useState } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { Layout } from './components';
import { NamespaceProvider } from './context/NamespaceContext';
import { clearAuth, getAuthUser, getTokenExpiry, isAuthenticated, refreshToken } from './utils/auth';
import {
  Dashboard,
  NamespacesPage,
  NodesPage,
  PodsPage,
  DeploymentsPage,
  StatefulSetsPage,
  DaemonSetsPage,
  ReplicaSetsPage,
  JobsPage,
  CronJobsPage,
  EventsPage,
  HelmResourcePage,
  ConfigResourcePage,
  LoginPage,
  ConfigMapsPage,
  SecretsPage,
  ResourceQuotasPage,
  LimitRangesPage,
  HPAPage,
  PDBPage,
  PriorityClassesPage,
  RuntimeClassesPage,
  LeasesPage,
  ServicesPage,
  EndpointsPage,
  IngressesPage,
  IngressClassesPage,
  NetworkPoliciesPage,
  PortForwardingPage,
  NetworkPage,
  StoragePage,
  PersistentVolumesPage,
  PersistentVolumeClaimsPage,
  StorageClassesPage,
  AccessControlPage,
  ServiceAccountsPage,
  RolesPage,
  RoleBindingsPage,
  ClusterRolesPage,
  ClusterRoleBindingsPage,
} from './pages';

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
    return <LoginPage onLogin={handleLogin} />;
  }

  return (
    <NamespaceProvider>
      <Router>
        <Routes>
          <Route element={<Layout username={authUser} onLogout={handleLogout} />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/terminal" element={null} />
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
          <Route path="/config/mwc" element={<ConfigResourcePage title="MWC" />} />
          <Route path="/config/vwc" element={<ConfigResourcePage title="VWC" />} />
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
          <Route path="/helm/charts" element={<HelmResourcePage title="Charts" />} />
          <Route path="/helm/releases" element={<HelmResourcePage title="Releases" />} />
          <Route path="/access-control" element={<AccessControlPage />} />
          <Route path="/access-control/serviceaccounts" element={<ServiceAccountsPage />} />
          <Route path="/access-control/clusterroles" element={<ClusterRolesPage />} />
          <Route path="/access-control/roles" element={<RolesPage />} />
          <Route path="/access-control/clusterrolebindings" element={<ClusterRoleBindingsPage />} />
          <Route path="/access-control/rolebindings" element={<RoleBindingsPage />} />
          <Route path="/events" element={<EventsPage />} />
        </Route>
      </Routes>
    </Router>
    </NamespaceProvider>
  );
};
