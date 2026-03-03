import { useDashboard, useNodes, usePods } from '../hooks/useKubernetes';
import { Card, Stat } from '../components/Card';
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

  const readyNodeCount = nodes?.filter((n) => n.ready).length || 0;
  const runningPodCount = pods?.filter((p) => p.status === 'Running').length || 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-text">Dashboard</h1>
        <p className="text-text-secondary mt-1">Cluster Overview</p>
      </div>

      {/* Cluster Overview */}
      <Card title="Cluster Overview">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Stat label="Total Nodes" value={dashboard?.total_nodes || 0} />
          <Stat label="Ready Nodes" value={readyNodeCount} />
          <Stat label="Total Pods" value={dashboard?.total_pods || 0} />
          <Stat label="Running Pods" value={runningPodCount} />
        </div>
      </Card>

      {/* Resource Summary */}
      <Card title="Resource Summary">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Stat label="Deployments" value={dashboard?.total_deployments || 0} />
          <div className="flex flex-col gap-1 p-3">
            <span className="text-sm text-text-secondary">Cluster Version</span>
            <span className="text-lg font-semibold text-text">
              {dashboard?.cluster_version || 'Unknown'}
            </span>
          </div>
        </div>
      </Card>

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
                        node.ready
                          ? 'text-icon-success font-medium'
                          : 'text-icon-danger font-medium'
                      }
                    >
                      {node.ready ? 'Ready' : 'NotReady'}
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
