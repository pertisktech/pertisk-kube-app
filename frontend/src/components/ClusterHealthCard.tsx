import { usePods, useNodes } from '../hooks/useKubernetes';
import { Card } from './Card';
import { CheckCircle, AlertCircle, XCircle, Loader } from 'lucide-react';

interface ClusterHealth {
  status: 'healthy' | 'warning' | 'critical';
  readyNodes: number;
  totalNodes: number;
  runningPods: number;
  totalPods: number;
  failedPods: number;
  pendingPods: number;
}

export const ClusterHealthCard = () => {
  const { data: pods, isLoading: podsLoading } = usePods();
  const { data: nodes, isLoading: nodesLoading } = useNodes();

  const isLoading = podsLoading || nodesLoading;

  if (isLoading) {
    return (
      <Card title="Cluster Health">
        <div className="flex items-center justify-center h-32">
          <Loader size={24} className="animate-spin text-primary" />
        </div>
      </Card>
    );
  }

  const clusterHealth: ClusterHealth = (() => {
    const readyNodes = nodes?.filter((n) => {
      if (typeof n.ready === 'boolean') return n.ready;
      return String(n.ready).toLowerCase() === 'true';
    }).length || 0;
    const totalNodes = nodes?.length || 0;

    const runningPods = pods?.filter((p) => (p.status || p.phase || '').toLowerCase() === 'running').length || 0;
    const failedPods = pods?.filter((p) => {
      const status = (p.status || p.phase || '').toLowerCase();
      return status === 'failed' || status === 'crashloopbackoff';
    }).length || 0;
    const pendingPods = pods?.filter((p) => (p.status || p.phase || '').toLowerCase() === 'pending').length || 0;
    const totalPods = pods?.length || 0;

    let status: 'healthy' | 'warning' | 'critical' = 'healthy';
    const nodeHealthPercent = totalNodes > 0 ? (readyNodes / totalNodes) * 100 : 0;
    const podFailurePercent = totalPods > 0 ? (failedPods / totalPods) * 100 : 0;

    if (nodeHealthPercent < 80 || podFailurePercent > 20) {
      status = 'critical';
    } else if (nodeHealthPercent < 95 || podFailurePercent > 5) {
      status = 'warning';
    }

    return {
      status,
      readyNodes,
      totalNodes,
      runningPods,
      totalPods,
      failedPods,
      pendingPods,
    };
  })();

  const statusIcon =
    clusterHealth.status === 'healthy' ? (
      <CheckCircle className="w-5 h-5 text-green-500" />
    ) : clusterHealth.status === 'warning' ? (
      <AlertCircle className="w-5 h-5 text-yellow-500" />
    ) : (
      <XCircle className="w-5 h-5 text-red-500" />
    );

  const statusBgColor =
    clusterHealth.status === 'healthy'
      ? 'bg-green-500/10'
      : clusterHealth.status === 'warning'
        ? 'bg-yellow-500/10'
        : 'bg-red-500/10';

  const statusTextColor =
    clusterHealth.status === 'healthy'
      ? 'text-green-500'
      : clusterHealth.status === 'warning'
        ? 'text-yellow-500'
        : 'text-red-500';

  return (
    <Card title="Cluster Health">
      <div className="space-y-4">
        <div className={`flex items-center gap-3 px-4 py-3 rounded-lg ${statusBgColor}`}>
          {statusIcon}
          <span className={`font-semibold capitalize ${statusTextColor}`}>
            {clusterHealth.status}
          </span>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-surface-elevated border border-border rounded-lg p-3">
            <p className="text-xs text-text-secondary">Ready Nodes</p>
            <p className="text-xl font-bold text-text">
              {clusterHealth.readyNodes}/{clusterHealth.totalNodes}
            </p>
          </div>

          <div className="bg-surface-elevated border border-border rounded-lg p-3">
            <p className="text-xs text-text-secondary">Running Pods</p>
            <p className="text-xl font-bold text-text">{clusterHealth.runningPods}</p>
          </div>

          <div className="bg-surface-elevated border border-border rounded-lg p-3">
            <p className="text-xs text-text-secondary">Failed Pods</p>
            <p className={`text-xl font-bold ${clusterHealth.failedPods > 0 ? 'text-red-500' : 'text-text'}`}>
              {clusterHealth.failedPods}
            </p>
          </div>

          <div className="bg-surface-elevated border border-border rounded-lg p-3">
            <p className="text-xs text-text-secondary">Pending Pods</p>
            <p className={`text-xl font-bold ${clusterHealth.pendingPods > 0 ? 'text-yellow-500' : 'text-text'}`}>
              {clusterHealth.pendingPods}
            </p>
          </div>
        </div>
      </div>
    </Card>
  );
};
