import { useDashboard, useNodes, usePods } from '../hooks/useKubernetes';
import { WorkloadSummary } from '../components/WorkloadSummary';
import { MetricsCharts } from '../components/MetricsCharts';
import { NodeGroups } from '../components/NodeGroups';
import { ClusterHealthCard } from '../components/ClusterHealthCard';
import { GaugeChart } from '../components/GaugeChart';
import { useTheme } from '../context/ThemeContext';
import {
  Box,
  Server,
  Cpu,
  HardDrive,
  TrendingUp,
  Monitor,
  CheckCircle,
  XCircle,
  AlertCircle,
} from 'lucide-react';
import { Loader } from 'lucide-react';
import { K8sNode } from '../types';
import clsx from 'clsx';

// Helper to format node IPs
function formatNodeIPs(node: K8sNode): string {
  const ips: string[] = [];

  if (node.internal_ip) {
    const internalIps = node.internal_ip
      .split(',')
      .map((ip) => ip.trim())
      .filter((ip) => ip);
    ips.push(...internalIps);
  }

  if (node.external_ip && node.external_ip !== node.internal_ip) {
    const externalIps = node.external_ip
      .split(',')
      .map((ip) => ip.trim())
      .filter((ip) => ip);
    externalIps.forEach((ip) => {
      if (!ips.includes(ip)) {
        ips.push(ip);
      }
    });
  }

  if (ips.length === 0) {
    return 'No IP';
  }

  const ipv4s = ips.filter((ip) => !ip.includes(':'));
  const ipv6s = ips.filter((ip) => ip.includes(':'));

  const parts: string[] = [];
  if (ipv4s.length > 0) {
    parts.push(ipv4s.join(', '));
  }
  if (ipv6s.length > 0) {
    parts.push(ipv6s.join(', '));
  }

  return parts.join(' | ');
}

// Get the styling vars for theme
function getThemeVars(isDark: boolean) {
  return {
    surface: isDark ? '#1f2937' : '#ffffff',
    bg: isDark ? '#111827' : '#f9fafb',
    border: isDark ? '#374151' : '#e5e7eb',
    text: isDark ? '#f3f4f6' : '#111827',
    muted: isDark ? '#9ca3af' : '#6b7280',
  };
}

export const Dashboard = () => {
  const theme = useTheme();
  const isDark = theme?.isDark ?? true;
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

  const themeVars = getThemeVars(isDark);

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

  const failedPodCount =
    pods?.filter((pod) => {
      const state = (pod.status || pod.phase || '').toLowerCase();
      return state === 'failed' || state === 'crashloopbackoff';
    }).length || 0;

  // Calculate health status
  const nodeHealthPercent = totalNodeCount > 0 ? (readyNodeCount / totalNodeCount) * 100 : 0;
  const podFailurePercent =
    (dashboard?.pods || 0) > 0 ? (failedPodCount / (dashboard?.pods || 1)) * 100 : 0;

  let healthStatus: 'healthy' | 'warning' | 'critical' = 'healthy';
  if (nodeHealthPercent < 80 || podFailurePercent > 20) {
    healthStatus = 'critical';
  } else if (nodeHealthPercent < 95 || podFailurePercent > 5) {
    healthStatus = 'warning';
  }

  return (
    <div className="space-y-6">
      {/* Enhanced Cluster Overview - matching pertisk-kube style */}
      <div
        className="backdrop-blur-sm rounded-xl p-6"
        style={{
          backgroundColor: themeVars.surface,
          border: `1px solid ${themeVars.border}`,
        }}
      >
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Monitor size={24} className="text-blue-400" />
            <h2 className="text-2xl font-bold text-blue-300">Cluster Overview</h2>
          </div>
          <div className="flex items-center gap-2">
            {healthStatus === 'healthy' ? (
              <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-green-500/20 text-green-400">
                <CheckCircle size={16} />
                <span className="text-sm font-medium">Healthy</span>
              </div>
            ) : healthStatus === 'warning' ? (
              <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-yellow-500/20 text-yellow-400">
                <AlertCircle size={16} />
                <span className="text-sm font-medium">Warning</span>
              </div>
            ) : (
              <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-red-500/20 text-red-400">
                <XCircle size={16} />
                <span className="text-sm font-medium">Critical</span>
              </div>
            )}
          </div>
        </div>

        <div className="space-y-4">
          {/* Cluster Info */}
          <div
            className="flex items-center justify-between text-sm"
            style={{ color: themeVars.muted }}
          >
            <span>
              <span className="font-medium" style={{ color: themeVars.text }}>
                {dashboard?.cluster_name || 'kubernetes-cluster'}
              </span>
              {' • '}
              <span style={{ color: '#06b6d4' }} title={dashboard?.api_endpoint || ''}>
                {dashboard?.api_endpoint
                  ? dashboard.api_endpoint.length > 40
                    ? dashboard.api_endpoint.substring(0, 40) + '...'
                    : dashboard.api_endpoint
                  : 'Unknown'}
              </span>
              {' • '}
              <span className="font-medium" style={{ color: themeVars.text }}>
                {dashboard?.kube_version || 'Unknown'}
              </span>
            </span>
            <span>Updated {new Date().toLocaleTimeString()}</span>
          </div>

          {/* Resource Grid - CPU, Memory, etc */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mt-4">
            {/* CPU Resources */}
            <div
              className="p-3 rounded-lg"
              style={{
                backgroundColor: themeVars.bg,
                border: `1px solid ${themeVars.border}`,
              }}
            >
              <div className="flex items-center gap-2 mb-2">
                <Cpu size={16} className="text-blue-400" />
                <span className="text-sm font-semibold" style={{ color: themeVars.text }}>
                  CPU
                </span>
              </div>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between">
                  <span style={{ color: themeVars.muted }}>Allocatable</span>
                  <span className="font-medium text-blue-400">--</span>
                </div>
              </div>
            </div>

            {/* Memory Resources */}
            <div
              className="p-3 rounded-lg"
              style={{
                backgroundColor: themeVars.bg,
                border: `1px solid ${themeVars.border}`,
              }}
            >
              <div className="flex items-center gap-2 mb-2">
                <HardDrive size={16} className="text-purple-400" />
                <span className="text-sm font-semibold" style={{ color: themeVars.text }}>
                  Memory
                </span>
              </div>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between">
                  <span style={{ color: themeVars.muted }}>Allocatable</span>
                  <span className="font-medium text-purple-400">--</span>
                </div>
              </div>
            </div>

            {/* Pod Capacity */}
            <div
              className="p-3 rounded-lg"
              style={{
                backgroundColor: themeVars.bg,
                border: `1px solid ${themeVars.border}`,
              }}
            >
              <div className="flex items-center gap-2 mb-2">
                <Box size={16} className="text-orange-400" />
                <span className="text-sm font-semibold" style={{ color: themeVars.text }}>
                  Pods
                </span>
              </div>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between">
                  <span style={{ color: themeVars.muted }}>Current</span>
                  <span className="font-medium text-orange-400">{dashboard?.pods || 0}</span>
                </div>
              </div>
            </div>

            {/* Nodes */}
            <div
              className="p-3 rounded-lg"
              style={{
                backgroundColor: themeVars.bg,
                border: `1px solid ${themeVars.border}`,
              }}
            >
              <div className="flex items-center gap-2 mb-2">
                <Server size={16} className="text-cyan-400" />
                <span className="text-sm font-semibold" style={{ color: themeVars.text }}>
                  Nodes
                </span>
              </div>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between">
                  <span style={{ color: themeVars.muted }}>Ready</span>
                  <span className="font-medium text-cyan-400">
                    {readyNodeCount}/{totalNodeCount}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Stats Grid - below resources */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="text-center p-3 rounded" style={{ backgroundColor: themeVars.bg }}>
              <div className="text-2xl font-bold text-blue-400 mb-1">{totalNodeCount}</div>
              <div className="text-xs" style={{ color: themeVars.muted }}>
                Total Nodes
              </div>
            </div>
            <div className="text-center p-3 rounded" style={{ backgroundColor: themeVars.bg }}>
              <div className="text-2xl font-bold text-green-400 mb-1">{readyNodeCount}</div>
              <div className="text-xs" style={{ color: themeVars.muted }}>
                Ready Nodes
              </div>
            </div>
            <div className="text-center p-3 rounded" style={{ backgroundColor: themeVars.bg }}>
              <div className="text-2xl font-bold text-green-400 mb-1">{dashboard?.pods || 0}</div>
              <div className="text-xs" style={{ color: themeVars.muted }}>
                Total Pods
              </div>
            </div>
            <div className="text-center p-3 rounded" style={{ backgroundColor: themeVars.bg }}>
              <div className="text-2xl font-bold text-green-400 mb-1">{runningPodCount}</div>
              <div className="text-xs" style={{ color: themeVars.muted }}>
                Running Pods
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Cluster Health Card */}
      <ClusterHealthCard />

      {/* Workload Summary */}
      <WorkloadSummary />

      {/* Node Groups */}
      <NodeGroups />

      {/* Metrics Charts */}
      <MetricsCharts />

      {/* Resource Usage Section - 3 Gauge Charts */}
      <div
        className="backdrop-blur-sm rounded-xl p-6"
        style={{
          backgroundColor: themeVars.surface,
          border: `1px solid ${themeVars.border}`,
        }}
      >
        <div className="flex items-center gap-3 mb-6">
          <TrendingUp size={24} className="text-blue-400" />
          <h2 className="text-2xl font-bold text-blue-300">Resource Usage</h2>
        </div>

        {!nodes || nodes.length === 0 ? (
          <div className="text-center py-8" style={{ color: themeVars.muted }}>
            No nodes found
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* CPU Panel */}
            <div
              className="rounded-lg p-6 transition-all hover:shadow-lg"
              style={{
                backgroundColor: themeVars.bg,
                border: `1px solid ${themeVars.border}`,
              }}
            >
              <GaugeChart
                value={45}
                color="#3b82f6"
                label="CPU"
                used="4.5 cores"
                total="10 cores"
                icon={<Cpu size={20} className="text-blue-400" />}
              />
            </div>

            {/* Memory Panel */}
            <div
              className="rounded-lg p-6 transition-all hover:shadow-lg"
              style={{
                backgroundColor: themeVars.bg,
                border: `1px solid ${themeVars.border}`,
              }}
            >
              <GaugeChart
                value={62}
                color="#a855f7"
                label="Memory"
                used="24 Gi"
                total="40 Gi"
                icon={<HardDrive size={20} className="text-purple-400" />}
              />
            </div>

            {/* Disk Panel */}
            <div
              className="rounded-lg p-6 transition-all hover:shadow-lg"
              style={{
                backgroundColor: themeVars.bg,
                border: `1px solid ${themeVars.border}`,
              }}
            >
              <GaugeChart
                value={38}
                color="#f97316"
                label="Disk"
                used="19 Gi"
                total="50 Gi"
                icon={<HardDrive size={20} className="text-orange-400" />}
              />
            </div>
          </div>
        )}
      </div>

      {/* Enhanced Node Groups Section */}
      <div
        className="backdrop-blur-sm rounded-xl p-6"
        style={{
          backgroundColor: themeVars.surface,
          border: `1px solid ${themeVars.border}`,
        }}
      >
        <div className="flex items-center gap-3 mb-6">
          <Server size={24} className="text-blue-400" />
          <h2 className="text-2xl font-bold text-blue-300">Nodes</h2>
          <span className="text-sm ml-auto" style={{ color: themeVars.muted }}>
            {nodes?.length ?? 0} nodes
          </span>
        </div>

        {nodes && nodes.length > 0 ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
            {nodes.map((node) => {
              const isReady =
                typeof node.ready === 'boolean'
                  ? node.ready
                  : String(node.ready).toLowerCase() === 'true';

              return (
                <div
                  key={node.name}
                  className="rounded-lg p-4 transition-all hover:shadow-lg"
                  style={{
                    backgroundColor: themeVars.bg,
                    border: `1px solid ${themeVars.border}`,
                  }}
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div
                        className={clsx('w-3 h-3 rounded-full', isReady ? 'bg-green-500' : 'bg-red-500')}
                      />
                      <h3 className="text-lg font-bold" style={{ color: themeVars.text }}>
                        {node.name}
                      </h3>
                    </div>
                    {isReady ? (
                      <span className="px-2 py-0.5 rounded-full text-xs bg-green-500/20 text-green-400 flex items-center gap-1">
                        <CheckCircle size={12} /> Ready
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full text-xs bg-red-500/20 text-red-400 flex items-center gap-1">
                        <XCircle size={12} /> NotReady
                      </span>
                    )}
                  </div>

                  <div className="space-y-2 text-sm">
                    <div>
                      <span style={{ color: themeVars.muted }}>Roles: </span>
                      <span style={{ color: themeVars.text }}>
                        {node.roles.join(', ') || 'None'}
                      </span>
                    </div>
                    <div>
                      <span style={{ color: themeVars.muted }}>IP: </span>
                      <span style={{ color: themeVars.text }} className="text-xs font-mono">
                        {formatNodeIPs(node)}
                      </span>
                    </div>
                    <div>
                      <span style={{ color: themeVars.muted }}>Kubelet: </span>
                      <span style={{ color: themeVars.text }} className="text-xs">
                        {node.kubelet_version}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-8" style={{ color: themeVars.muted }}>
            No nodes found
          </div>
        )}
      </div>
    </div>
  );
};
