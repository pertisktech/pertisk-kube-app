import { lazy } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { ToastContainer, Bounce } from 'react-toastify';
import { Layout } from './components';
import { NamespaceProvider } from './context/NamespaceContext';

const Dashboard = lazy(() => import('./pages/Dashboard').then(m => ({ default: m.Dashboard })));
const ClusterPage = lazy(() => import('./pages/ClusterPage').then(m => ({ default: m.ClusterPage })));
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
const ResourceMapPage = lazy(() => import('./pages/ResourceMapPage').then(m => ({ default: m.ResourceMapPage })));


export const App = () => {
  return (
    <NamespaceProvider>
      <ToastContainer
        position="top-right"
        autoClose={4000}
        hideProgressBar={false}
        newestOnTop
        closeOnClick={false}
        pauseOnFocusLoss
        draggable={false}
        pauseOnHover
        theme="dark"
        transition={Bounce}
      />
      <Router>
          <Routes>
            <Route element={<Layout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/cluster" element={<ClusterPage />} />
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
          <Route path="/resource-map" element={<ResourceMapPage />} />
          <Route path="/desktop/settings" element={null} />
        </Route>
      </Routes>
      </Router>
    </NamespaceProvider>
  );
};
