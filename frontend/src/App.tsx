import { useState } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { Layout } from './components';
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
  ConfigResourcePage,
  NetworkResourcePage,
  StorageResourcePage,
  LoginPage,
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
    <Router>
      <Routes>
        <Route element={<Layout username={authUser} onLogout={handleLogout} />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/namespaces" element={<NamespacesPage />} />
          <Route path="/nodes" element={<NodesPage />} />
          <Route path="/pods" element={<PodsPage />} />
          <Route path="/deployments" element={<DeploymentsPage />} />
          <Route path="/statefulsets" element={<StatefulSetsPage />} />
          <Route path="/daemonsets" element={<DaemonSetsPage />} />
          <Route path="/replicasets" element={<ReplicaSetsPage />} />
          <Route path="/jobs" element={<JobsPage />} />
          <Route path="/cronjobs" element={<CronJobsPage />} />
          <Route path="/config/configmaps" element={<ConfigResourcePage title="Config Maps" />} />
          <Route path="/config/secrets" element={<ConfigResourcePage title="Secrets" />} />
          <Route path="/config/resourcequotas" element={<ConfigResourcePage title="Resource Quotas" />} />
          <Route path="/config/limitranges" element={<ConfigResourcePage title="Limit Ranges" />} />
          <Route path="/config/hpa" element={<ConfigResourcePage title="HPA" />} />
          <Route path="/config/pdb" element={<ConfigResourcePage title="PDB" />} />
          <Route path="/config/priorityclasses" element={<ConfigResourcePage title="Priority CLasses" />} />
          <Route path="/config/runtimeclasses" element={<ConfigResourcePage title="Runtime Classes" />} />
          <Route path="/config/leases" element={<ConfigResourcePage title="Leases" />} />
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
          <Route path="/events" element={<EventsPage />} />
        </Route>
      </Routes>
    </Router>
  );
};
