import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Card } from '../components/Card';
import {
  useDashboard,
  useEndpoints,
  useIngressClasses,
  useIngresses,
  useNetworkPolicies,
  useNodes,
  useServices,
} from '../hooks/useKubernetes';
import {
  AlertCircle,
  CheckCircle,
  ExternalLink,
  HardDrive,
  Layers,
  Loader,
  Network,
  Server,
  Shield,
} from '../components/Icons';

const summarizeCounts = (items: string[]) => {
  const counts = new Map<string, number>();
  items.forEach((item) => {
    const key = item && item.trim() ? item.trim() : 'Unknown';
    counts.set(key, (counts.get(key) ?? 0) + 1);
  });
  return Array.from(counts.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
};

const formatRuntime = (runtime?: string) => {
  if (!runtime) return 'Unknown';
  const normalized = runtime.trim();
  return normalized || 'Unknown';
};

const clusterLinks = [
  { title: 'Nodes', path: '/nodes', description: 'Node capacity, kubelet versions, runtime, and readiness.', icon: Server },
  { title: 'Network', path: '/network', description: 'Services, endpoints, ingresses, and policies.', icon: Network },
  { title: 'Storage', path: '/storage', description: 'Persistent volumes, claims, and storage classes.', icon: HardDrive },
  { title: 'Access Control', path: '/access-control', description: 'Cluster-wide roles, bindings, and service accounts.', icon: Shield },
  { title: 'Resource Map', path: '/resource-map', description: 'Topology view across cluster resources and relations.', icon: Layers },
  { title: 'Events', path: '/events', description: 'Recent cluster events and failure signals.', icon: AlertCircle },
];

export const ClusterPage = () => {
  const { data: dashboard, isLoading: dashboardLoading, error: dashboardError } = useDashboard();
  const { data: nodes, isLoading: nodesLoading, error: nodesError } = useNodes({ refetchInterval: 30_000 });
  const { data: services, isLoading: servicesLoading } = useServices();
  const { data: endpoints, isLoading: endpointsLoading } = useEndpoints();
  const { data: ingresses, isLoading: ingressesLoading } = useIngresses();
  const { data: ingressClasses, isLoading: ingressClassesLoading } = useIngressClasses();
  const { data: networkPolicies, isLoading: networkPoliciesLoading } = useNetworkPolicies();

  const isLoading = dashboardLoading || nodesLoading || servicesLoading || endpointsLoading || ingressesLoading || ingressClassesLoading || networkPoliciesLoading;
  const errorMessage = (dashboardError as Error | undefined)?.message || (nodesError as Error | undefined)?.message || null;

  const readyNodeCount = useMemo(() => {
    return (nodes || []).filter((node) => {
      if (typeof node.ready === 'boolean') return node.ready;
      return String(node.ready).toLowerCase() === 'true';
    }).length;
  }, [nodes]);

  const kubeletVersions = useMemo(() => summarizeCounts((nodes || []).map((node) => node.kubelet_version || 'Unknown')), [nodes]);
  const containerRuntimes = useMemo(() => summarizeCounts((nodes || []).map((node) => formatRuntime(node.runtime))), [nodes]);
  const roleSummary = useMemo(() => summarizeCounts((nodes || []).flatMap((node) => node.roles?.length ? node.roles : ['Unassigned'])), [nodes]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="flex flex-col items-center gap-2">
          <Loader size={32} className="text-primary animate-spin" />
          <p className="text-text-secondary">Loading cluster overview...</p>
        </div>
      </div>
    );
  }

  if (errorMessage) {
    return (
      <div className="space-y-4">
        <div>
          <h1 className="text-xl font-semibold text-text">Cluster <span className="text-base font-normal text-text-secondary">(Cluster-wide overview and entry points)</span></h1>
        </div>
        <Card title="Unable to load cluster overview">
          <p className="text-sm text-text-secondary">{errorMessage}</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-text">Cluster <span className="text-base font-normal text-text-secondary">(Cluster-wide overview, kubelet status, and network surface)</span></h1>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Card title="Cluster Info">
          <div className="space-y-4 text-sm">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <p className="text-text-secondary mb-1">Cluster Name</p>
                <p className="font-semibold text-text">{dashboard?.cluster_name || 'kubernetes-cluster'}</p>
              </div>
              <div>
                <p className="text-text-secondary mb-1">Kubernetes</p>
                <p className="font-semibold text-text">{dashboard?.kube_version || 'Unknown'}</p>
              </div>
              <div className="sm:col-span-2">
                <p className="text-text-secondary mb-1">API Endpoint</p>
                <p className="font-mono text-xs text-text break-all">{dashboard?.api_endpoint || 'Unknown'}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 pt-2 border-t border-border">
              <div className="rounded-lg border border-border bg-bg px-3 py-3">
                <p className="text-xs text-text-secondary">Nodes</p>
                <p className="text-lg font-semibold text-text">{nodes?.length ?? 0}</p>
              </div>
              <div className="rounded-lg border border-border bg-bg px-3 py-3">
                <p className="text-xs text-text-secondary">Namespaces</p>
                <p className="text-lg font-semibold text-text">{dashboard?.namespaces ?? 0}</p>
              </div>
              <div className="rounded-lg border border-border bg-bg px-3 py-3">
                <p className="text-xs text-text-secondary">Pods</p>
                <p className="text-lg font-semibold text-text">{dashboard?.pods ?? 0}</p>
              </div>
              <div className="rounded-lg border border-border bg-bg px-3 py-3">
                <p className="text-xs text-text-secondary">Events</p>
                <p className="text-lg font-semibold text-text">{dashboard?.events ?? 0}</p>
              </div>
            </div>
          </div>
        </Card>

        <Card title="Kubelet & Runtime">
          <div className="space-y-4 text-sm">
            <div className="flex items-center justify-between rounded-lg border border-border bg-bg px-4 py-3">
              <div>
                <p className="text-text-secondary text-xs">Node Readiness</p>
                <p className="font-semibold text-text">{readyNodeCount} / {nodes?.length ?? 0} Ready</p>
              </div>
              <div className="flex items-center gap-2 text-sm">
                {readyNodeCount === (nodes?.length ?? 0) ? (
                  <CheckCircle size={18} className="text-[var(--color-icon-success)]" />
                ) : (
                  <AlertCircle size={18} className="text-[var(--color-icon-warning)]" />
                )}
              </div>
            </div>

            <div>
              <p className="text-text-secondary text-xs mb-2">Kubelet Versions</p>
              <div className="space-y-2">
                {kubeletVersions.slice(0, 4).map(([version, count]) => (
                  <div key={version} className="flex items-center justify-between rounded-lg border border-border bg-bg px-3 py-2">
                    <span className="font-mono text-xs text-text">{version}</span>
                    <span className="text-text-secondary">{count} node{count === 1 ? '' : 's'}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <p className="text-text-secondary text-xs mb-2">Container Runtime</p>
                <div className="space-y-2">
                  {containerRuntimes.slice(0, 3).map(([runtime, count]) => (
                    <div key={runtime} className="flex items-center justify-between rounded-lg border border-border bg-bg px-3 py-2">
                      <span className="font-mono text-xs text-text truncate pr-3">{runtime}</span>
                      <span className="text-text-secondary shrink-0">{count}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-text-secondary text-xs mb-2">Roles</p>
                <div className="space-y-2">
                  {roleSummary.slice(0, 3).map(([role, count]) => (
                    <div key={role} className="flex items-center justify-between rounded-lg border border-border bg-bg px-3 py-2">
                      <span className="text-text">{role}</span>
                      <span className="text-text-secondary">{count}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </Card>

        <Card title="Network Surface">
          <div className="space-y-4 text-sm">
            <div className="grid grid-cols-2 xl:grid-cols-5 gap-3">
              <div className="rounded-lg border border-border bg-bg px-3 py-3">
                <p className="text-xs text-text-secondary">Services</p>
                <p className="text-lg font-semibold text-text">{services?.length ?? 0}</p>
              </div>
              <div className="rounded-lg border border-border bg-bg px-3 py-3">
                <p className="text-xs text-text-secondary">Endpoints</p>
                <p className="text-lg font-semibold text-text">{endpoints?.length ?? 0}</p>
              </div>
              <div className="rounded-lg border border-border bg-bg px-3 py-3">
                <p className="text-xs text-text-secondary">Ingresses</p>
                <p className="text-lg font-semibold text-text">{ingresses?.length ?? 0}</p>
              </div>
              <div className="rounded-lg border border-border bg-bg px-3 py-3">
                <p className="text-xs text-text-secondary">Ingress Classes</p>
                <p className="text-lg font-semibold text-text">{ingressClasses?.length ?? 0}</p>
              </div>
              <div className="rounded-lg border border-border bg-bg px-3 py-3">
                <p className="text-xs text-text-secondary">Policies</p>
                <p className="text-lg font-semibold text-text">{networkPolicies?.length ?? 0}</p>
              </div>
            </div>
            <div className="rounded-lg border border-border bg-bg px-4 py-3 flex items-center justify-between gap-4">
              <div>
                <p className="font-semibold text-text">Open network resources</p>
                <p className="text-xs text-text-secondary">Inspect cluster networking, ingress, policy coverage, and port-forward access.</p>
              </div>
              <Link to="/network" className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline shrink-0">
                Open Network
                <ExternalLink size={16} />
              </Link>
            </div>
          </div>
        </Card>

        <Card title="Cluster Areas">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {clusterLinks.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className="rounded-xl border border-border bg-bg px-4 py-4 transition-colors hover:bg-hover"
                >
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 rounded-lg p-2 bg-surface-elevated border border-border">
                      <Icon size={18} className="text-primary" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-text">{item.title}</p>
                        <ExternalLink size={14} className="text-text-secondary" />
                      </div>
                      <p className="mt-1 text-sm text-text-secondary">{item.description}</p>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </Card>
      </div>
    </div>
  );
};
