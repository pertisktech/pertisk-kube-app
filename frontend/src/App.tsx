import { useState } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { Layout } from './components';
import { NamespaceProvider } from './context/NamespaceContext';
import { clearAuth, getAuthUser, isAuthenticated } from './utils/auth';
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
  AccessControlResourcePage,
  ConfigResourcePage,
  NetworkResourcePage,
  StorageResourcePage,
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
} from './pages';

export const App = () => {
  const [authenticated, setAuthenticated] = useState(() => isAuthenticated());
  const [authUser, setAuthUser] = useState(() => getAuthUser() ?? '');

  const handleLogin = () => {
    setAuthenticated(true);
    setAuthUser(getAuthUser() ?? '');
  };

  const handleLogout = () => {
    clearAuth();
    setAuthenticated(false);
    setAuthUser('');
  };

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
          <Route path="/network" element={<NetworkResourcePage title="Network" />} />
          <Route path="/network/services" element={<NetworkResourcePage title="Services" />} />
          <Route path="/network/endpoints" element={<NetworkResourcePage title="Endpoints" />} />
          <Route path="/network/ingresses" element={<NetworkResourcePage title="Ingresses" />} />
          <Route path="/network/ingressclasses" element={<NetworkResourcePage title="Ingress Classes" />} />
          <Route path="/network/networkpolicies" element={<NetworkResourcePage title="Network Policies" />} />
          <Route path="/network/portforwarding" element={<NetworkResourcePage title="Port Forwarding" />} />
          <Route path="/storage" element={<StorageResourcePage title="Storage" />} />
          <Route path="/storage/pvc" element={<StorageResourcePage title="PVC" />} />
          <Route path="/storage/pv" element={<StorageResourcePage title="PV" />} />
          <Route path="/storage/storageclasses" element={<StorageResourcePage title="Storage Classes" />} />
          <Route path="/helm/charts" element={<HelmResourcePage title="Charts" />} />
          <Route path="/helm/releases" element={<HelmResourcePage title="Releases" />} />
          <Route path="/access-control/serviceaccounts" element={<AccessControlResourcePage title="Service Accounts" />} />
          <Route path="/access-control/clusterroles" element={<AccessControlResourcePage title="Cluster Roles" />} />
          <Route path="/access-control/roles" element={<AccessControlResourcePage title="Roles" />} />
          <Route path="/access-control/clusterrolebindings" element={<AccessControlResourcePage title="Cluster Role Bindings" />} />
          <Route path="/access-control/rolebindings" element={<AccessControlResourcePage title="Role Bindings" />} />
          <Route path="/events" element={<EventsPage />} />
        </Route>
      </Routes>
    </Router>
    </NamespaceProvider>
  );
};
