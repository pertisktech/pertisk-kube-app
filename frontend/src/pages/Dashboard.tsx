import { useEffect } from 'react';
import { useDashboard, useNodes, usePods } from '../hooks/useKubernetes';
import { useNamespace } from '../context/NamespaceContext';
import { Card, Stat } from '../components/Card';
import { Loader } from 'lucide-react';

export const Dashboard = () => {
  const { data: dashboard, isLoading: dashLoading } = useDashboard();
  const { data: nodes, isLoading: nodesLoading } = useNodes();
  const { data: pods, isLoading: podsLoading } = usePods();
  const { setNamespaces } = useNamespace();

  useEffect(() => {
    if (pods && pods.length > 0) {
      const uniqueNamespaces = Array.from(new Set(pods.map((pod) => pod.namespace)));
      setNamespaces(uniqueNamespaces);
    }
  }, [pods, setNamespaces]);

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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Stat label="Total Nodes" value={totalNodeCount} />
          <Stat label="Ready Nodes" value={readyNodeCount} />
          <Stat label="Total Pods" value={dashboard?.pods || 0} />
          <Stat label="Running Pods" value={runningPodCount} />
        </div>
      </Card>

      {/* Resource Summary */}
      <Card title="Resource Summary">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Stat label="Deployments" value={dashboard?.deployments || 0} />
          <Stat label="Namespaces" value={dashboard?.namespaces || 0} />
          <Stat label="StatefulSets" value={dashboard?.statefulsets || 0} />
          <div className="flex flex-col gap-1 p-3">
            <span className="text-sm text-text-secondary">Events</span>
            <span className="text-lg font-semibold text-text">
              {dashboard?.events || 0}
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
