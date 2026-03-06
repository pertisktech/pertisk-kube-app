import { useDashboard, useNodes, usePods } from '../hooks/useKubernetes';
import { Card, Stat } from '../components/Card';
import { WorkloadSummary } from '../components/WorkloadSummary';
import { MetricsCharts } from '../components/MetricsCharts';
import { NodeGroups } from '../components/NodeGroups';
import { Loader } from 'lucide-react';

export const Dashboard = () => {
  const { data: dashboard, isLoading: dashLoading } = useDashboard();
  const { data: nodes, isLoading: nodesLoading } = useNodes();
  const { data: pods, isLoading: podsLoading } = usePods();

  const isLoading = dashLoading || nodesLoading || podsLoading;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="flex flex-col items-center gap-2">
          <Loader size={32} className="text-primary animate-spin" />
          <p className="text-text-secondary">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  const totalNodeCount = nodes?.length || 0;
  const readyNodeCount =
    nodes?.filter((node) => {
      if (typeof node.ready === 'boolean') return node.ready;
      return String(node.ready).toLowerCase() === 'true';
    }).length || 0;
  const runningPodCount =
    pods?.filter((pod) => {
      const state = (pod.status || pod.phase || '').toLowerCase();
      return state === 'running';
    }).length || 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-text">Dashboard</h1>
        <p className="text-text-secondary mt-1">Cluster Overview</p>
      </div>

      {/* Cluster Overview */}
      <Card title="Cluster Overview">
        <div className="space-y-4">
          {/* Cluster Info */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pb-4 border-b border-border">
            <div className="flex flex-col gap-1">
              <span className="text-sm text-text-secondary">Cluster Name</span>
              <span className="text-lg font-semibold text-text">
                {dashboard?.cluster_name || 'kubernetes-cluster'}
              </span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-sm text-text-secondary">API Endpoint</span>
              <span className="text-sm font-mono text-text break-all">
                {dashboard?.api_endpoint || 'kubernetes.default.svc'}
              </span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-sm text-text-secondary">Kube Version</span>
              <span className="text-lg font-semibold text-text">
                {dashboard?.kube_version || 'unknown'}
              </span>
            </div>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Stat label="Total Nodes" value={totalNodeCount} />
            <Stat label="Ready Nodes" value={readyNodeCount} />
            <Stat label="Total Pods" value={dashboard?.pods || 0} />
            <Stat label="Running Pods" value={runningPodCount} />
          </div>
        </div>
      </Card>

      {/* Workload Summary */}
      <WorkloadSummary />

      {/* Node Groups */}
      <NodeGroups />

      {/* Metrics Charts */}
      <MetricsCharts />

      {/* Node Status */}
      {nodes && nodes.length > 0 && (
        <Card title="Node Status">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {nodes.map((node) => (
              <div
                key={node.name}
                className="bg-surface-elevated border border-border rounded-lg p-4"
              >
                <h3 className="font-semibold text-text truncate">
                  {node.name}
                </h3>
                <div className="mt-2 space-y-1 text-sm text-text-secondary">
                  <p>
                    Status:{' '}
                    <span
                      className={
                        (typeof node.ready === 'boolean'
                          ? node.ready
                          : String(node.ready).toLowerCase() === 'true')
                          ? 'text-icon-success font-medium'
                          : 'text-icon-danger font-medium'
                      }
                    >
                      {(typeof node.ready === 'boolean'
                        ? node.ready
                        : String(node.ready).toLowerCase() === 'true')
                        ? 'Ready'
                        : 'NotReady'}
                    </span>
                  </p>
                  <p>Roles: {node.roles.join(', ') || 'None'}</p>
                  <p className="text-xs text-muted">
                    {node.kubelet_version}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
};
