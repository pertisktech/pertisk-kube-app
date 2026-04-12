import { useMemo } from 'react';
import { usePods, useNodes } from '../hooks/useKubernetes';
import { useRealtimePods } from '../hooks/useRealtimePods';
import { useRealtimeNodes } from '../hooks/useRealtimeResources';
import type { Pod } from '../types';
import { Card } from './Card';
import { CheckCircle, AlertCircle, XCircle } from './Icons';
import { LoadingState } from './LoadingState';

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
  const { data: apiPods, isLoading: apiPodsLoading } = usePods();
  const { data: apiNodes, isLoading: apiNodesLoading } = useNodes();
  const { data: realtimePods, isLoading: realtimePodsLoading } = useRealtimePods<Pod>({ enabled: true });
  const { data: realtimeNodes, isLoading: realtimeNodesLoading } = useRealtimeNodes();

  const pods = useMemo(() => {
    const realtime = realtimePods ?? [];
    const api = apiPods ?? [];
    return realtime.length > 0 ? realtime : api;
  }, [realtimePods, apiPods]);

  const nodes = useMemo(() => {
    const realtime = realtimeNodes ?? [];
    const api = apiNodes ?? [];
    return realtime.length > 0 ? realtime : api;
  }, [realtimeNodes, apiNodes]);

  const isLoading = (realtimePodsLoading && apiPodsLoading) || (realtimeNodesLoading && apiNodesLoading);

  if (isLoading) {
    return (
      <Card title="Cluster Health">
        <LoadingState className="h-32" />
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
      <CheckCircle className="w-5 h-5 text-dashboard-success" />
    ) : clusterHealth.status === 'warning' ? (
      <AlertCircle className="w-5 h-5 text-dashboard-warning" />
    ) : (
      <XCircle className="w-5 h-5 text-dashboard-danger" />
    );

  const statusBgColor =
    clusterHealth.status === 'healthy'
      ? 'bg-dashboard-success-bg'
      : clusterHealth.status === 'warning'
        ? 'bg-dashboard-warning-bg'
        : 'bg-dashboard-danger-bg';

  const statusTextColor =
    clusterHealth.status === 'healthy'
      ? 'text-dashboard-success'
      : clusterHealth.status === 'warning'
        ? 'text-dashboard-warning'
        : 'text-dashboard-danger';

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
            <p className="text-xl font-bold text-dashboard-success">{clusterHealth.runningPods}</p>
          </div>

          <div className="bg-surface-elevated border border-border rounded-lg p-3">
            <p className="text-xs text-text-secondary">Failed Pods</p>
            <p className={`text-xl font-bold ${clusterHealth.failedPods > 0 ? 'text-dashboard-danger' : 'text-text'}`}>
              {clusterHealth.failedPods}
            </p>
          </div>

          <div className="bg-surface-elevated border border-border rounded-lg p-3">
            <p className="text-xs text-text-secondary">Pending Pods</p>
            <p className={`text-xl font-bold ${clusterHealth.pendingPods > 0 ? 'text-dashboard-warning' : 'text-text'}`}>
              {clusterHealth.pendingPods}
            </p>
          </div>
        </div>
      </div>
    </Card>
  );
};
