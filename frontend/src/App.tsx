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
          <Route path="/events" element={<EventsPage />} />
        </Route>
      </Routes>
    </Router>
  );
};
