import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { Layout } from './components';
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
} from './pages';

export const App = () => {
  return (
    <Router>
      <Routes>
        <Route element={<Layout />}>
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
