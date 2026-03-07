import { useDashboard, useNodes, usePods } from '../hooks/useKubernetes';
import { WorkloadSummary } from '../components/WorkloadSummary';
import { MetricsCharts } from '../components/MetricsCharts';
import { GaugeChart } from '../components/GaugeChart';
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

// Helper to parse CPU string (e.g., "4" or "4000m")
function parseCPU(cpuStr?: string): number {
  if (!cpuStr) return 0;
  if (cpuStr.endsWith('m')) {
    return parseInt(cpuStr) / 1000;
  }
  return parseFloat(cpuStr);
}

// Helper to parse Memory string (e.g., "16Gi", "16384Mi")
function parseMemory(memStr?: string): number {
  if (!memStr) return 0;
  const num = parseFloat(memStr);
  if (memStr.endsWith('Gi')) return num;
  if (memStr.endsWith('Mi')) return num / 1024;
  if (memStr.endsWith('Ki')) return num / (1024 * 1024);
  return num;
}

// Helper to format CPU display
function formatCPU(cores: number): string {
  if (cores === 0) return '0';
  return cores % 1 === 0 ? cores.toString() : cores.toFixed(2);
}

// Helper to format Memory display
function formatMemory(gb: number): string {
  if (gb === 0) return '0 Gi';
  return gb % 1 === 0 ? `${gb} Gi` : `${gb.toFixed(2)} Gi`;
}

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

  const failedPodCount =
    pods?.filter((pod) => {
      const state = (pod.status || pod.phase || '').toLowerCase();
      return state === 'failed' || state === 'crashloopbackoff';
    }).length || 0;

  // Calculate total CPU and Memory allocatable
  let totalCPU = 0;
  let totalMemory = 0;
  if (nodes) {
    nodes.forEach((node) => {
      totalCPU += parseCPU(node.cpu);
      totalMemory += parseMemory(node.memory);
    });
  }

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
    <div className="space-y-4">
      {/* Enhanced Cluster Overview - matching pertisk-kube style */}
      <div className="bg-surface border border-border rounded-lg p-6 backdrop-blur-sm">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Monitor size={24} className="text-dashboard-metric-primary" />
            <h2 className="text-2xl font-bold text-text">Cluster Overview</h2>
          </div>
          <div className="flex items-center gap-2">
            {healthStatus === 'healthy' ? (
              <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-dashboard-success-bg text-dashboard-success">
                <CheckCircle size={16} />
                <span className="text-sm font-medium">Healthy</span>
              </div>
            ) : healthStatus === 'warning' ? (
              <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-dashboard-warning-bg text-dashboard-warning">
                <AlertCircle size={16} />
                <span className="text-sm font-medium">Warning</span>
              </div>
            ) : (
              <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-dashboard-danger-bg text-dashboard-danger">
                <XCircle size={16} />
                <span className="text-sm font-medium">Critical</span>
              </div>
            )}
          </div>
        </div>

        <div className="space-y-4">
          {/* Cluster Info */}
          <div className="flex items-center justify-between text-sm text-text-secondary">
            <span>
              <span className="font-medium text-text">
                {dashboard?.cluster_name || 'kubernetes-cluster'}
              </span>
              {' • '}
              <span className="text-dashboard-info" title={dashboard?.api_endpoint || ''}>
                {dashboard?.api_endpoint
                  ? dashboard.api_endpoint.length > 40
                    ? dashboard.api_endpoint.substring(0, 40) + '...'
                    : dashboard.api_endpoint
                  : 'Unknown'}
              </span>
              {' • '}
              <span className="font-medium text-text">
                {dashboard?.kube_version || 'Unknown'}
              </span>
            </span>
            <span>Updated {new Date().toLocaleTimeString()}</span>
          </div>

          {/* Resource Grid - CPU, Memory, etc */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mt-4">
            {/* CPU Resources */}
            <div className="bg-bg border border-border rounded-lg p-3">
              <div className="flex items-center gap-2 mb-2">
                <Cpu size={16} className="text-dashboard-metric-primary" />
                <span className="text-sm font-semibold text-text">CPU</span>
              </div>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-text-secondary">Allocatable</span>
                  <span className="font-medium text-dashboard-metric-primary">{formatCPU(totalCPU)} cores</span>
                </div>
              </div>
            </div>

            {/* Memory Resources */}
            <div className="bg-bg border border-border rounded-lg p-3">
              <div className="flex items-center gap-2 mb-2">
                <HardDrive size={16} className="text-dashboard-metric-secondary" />
                <span className="text-sm font-semibold text-text">Memory</span>
              </div>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-text-secondary">Allocatable</span>
                  <span className="font-medium text-dashboard-metric-secondary">{formatMemory(totalMemory)}</span>
                </div>
              </div>
            </div>

            {/* Pod Capacity */}
            <div className="bg-bg border border-border rounded-lg p-3">
              <div className="flex items-center gap-2 mb-2">
                <Box size={16} className="text-dashboard-metric-tertiary" />
                <span className="text-sm font-semibold text-text">Pods</span>
              </div>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-text-secondary">Current</span>
                  <span className="font-medium text-dashboard-metric-tertiary">{dashboard?.pods || 0}</span>
                </div>
              </div>
            </div>

            {/* Nodes */}
            <div className="bg-bg border border-border rounded-lg p-3">
              <div className="flex items-center gap-2 mb-2">
                <Server size={16} className="text-dashboard-metric-quaternary" />
                <span className="text-sm font-semibold text-text">Nodes</span>
              </div>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-text-secondary">Ready</span>
                  <span className="font-medium text-dashboard-metric-quaternary">
                    {readyNodeCount}/{totalNodeCount}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Enhanced Node Groups Section */}
      <div className="bg-surface border border-border rounded-lg p-6 backdrop-blur-sm">
        <div className="flex items-center gap-3 mb-6">
          <Server size={24} className="text-dashboard-metric-primary" />
          <h2 className="text-2xl font-bold text-text">Nodes</h2>
          <span className="text-sm ml-auto text-text-secondary">{nodes?.length ?? 0} nodes</span>
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
                  className="bg-bg border border-border rounded-lg p-4 transition-all hover:shadow-md"
                >
                  {/* Node Header */}
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <div
                        className={clsx(
                          'w-2 h-2 rounded-full flex-shrink-0',
                          isReady ? 'bg-dashboard-success' : 'bg-dashboard-danger'
                        )}
                      />
                      <h3 className="text-base font-bold text-text truncate">{node.name}</h3>
                    </div>
                    {isReady ? (
                      <span className="px-2 py-0.5 rounded-full text-xs bg-dashboard-success-bg text-dashboard-success flex items-center gap-1 flex-shrink-0">
                        <CheckCircle size={12} /> Ready
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full text-xs bg-dashboard-danger-bg text-dashboard-danger flex items-center gap-1 flex-shrink-0">
                        <XCircle size={12} /> NotReady
                      </span>
                    )}
                  </div>

                  {/* Roles */}
                  {node.roles && node.roles.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-3">
                      {node.roles.map((role) => (
                        <span
                          key={role}
                          className="px-2 py-0.5 rounded text-xs bg-dashboard-metric-primary-bg text-dashboard-metric-primary border border-dashboard-metric-primary/20"
                        >
                          {role}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Resource Capacity */}
                  <div className="grid grid-cols-2 gap-2 mb-3">
                    <div className="bg-surface border border-border rounded p-2">
                      <div className="flex items-center gap-1 mb-1">
                        <Cpu size={12} className="text-dashboard-metric-primary" />
                        <span className="text-xs font-semibold text-text-secondary">CPU</span>
                      </div>
                      <div className="text-sm font-bold text-dashboard-metric-primary">
                        {node.cpu ? formatCPU(parseCPU(node.cpu)) : '-'}
                      </div>
                    </div>
                    <div className="bg-surface border border-border rounded p-2">
                      <div className="flex items-center gap-1 mb-1">
                        <HardDrive size={12} className="text-dashboard-metric-secondary" />
                        <span className="text-xs font-semibold text-text-secondary">Memory</span>
                      </div>
                      <div className="text-sm font-bold text-dashboard-metric-secondary">
                        {node.memory ? formatMemory(parseMemory(node.memory)) : '-'}
                      </div>
                    </div>
                  </div>

                  {/* Node Details */}
                  <div className="space-y-1.5 text-xs">
                    <div className="flex justify-between items-start">
                      <span className="text-text-secondary">IP:</span>
                      <span className="text-text font-mono text-right break-all max-w-[60%]">
                        {formatNodeIPs(node)}
                      </span>
                    </div>
                    <div className="flex justify-between items-start">
                      <span className="text-text-secondary">Version:</span>
                      <span className="text-text text-right">{node.kubelet_version || '-'}</span>
                    </div>
                    {node.os_image && (
                      <div className="flex justify-between items-start">
                        <span className="text-text-secondary">OS:</span>
                        <span className="text-text text-right break-words max-w-[60%]">{node.os_image}</span>
                      </div>
                    )}
                    {node.runtime && (
                      <div className="flex justify-between items-start">
                        <span className="text-text-secondary">Runtime:</span>
                        <span className="text-text text-right break-words max-w-[60%]">{node.runtime}</span>
                      </div>
                    )}
                    {node.taints && node.taints.length > 0 && (
                      <div className="pt-1">
                        <span className="text-text-secondary block mb-1">Taints:</span>
                        <div className="flex flex-wrap gap-1">
                          {node.taints.map((taint, idx) => (
                            <span
                              key={idx}
                              className="px-1.5 py-0.5 rounded text-xs bg-dashboard-warning-bg text-dashboard-warning border border-dashboard-warning/20"
                            >
                              {taint}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-8 text-text-secondary">No nodes found</div>
        )}
      </div>

      {/* Workload Summary */}
      <WorkloadSummary />

      {/* Metrics Charts */}
      <MetricsCharts />

      {/* Resource Usage Section - 3 Gauge Charts */}
      <div className="bg-surface border border-border rounded-lg p-6 backdrop-blur-sm">
        <div className="flex items-center gap-3 mb-6">
          <TrendingUp size={24} className="text-dashboard-metric-primary" />
          <h2 className="text-2xl font-bold text-text">Resource Usage</h2>
        </div>

        {!nodes || nodes.length === 0 ? (
          <div className="text-center py-8 text-text-secondary">No nodes found</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* CPU Panel */}
            <div className="bg-bg border border-border rounded-lg p-6 transition-all hover:shadow-md">
              <GaugeChart
                value={45}
                color="var(--color-dashboard-metric-primary)"
                label="CPU"
                used="4.5 cores"
                total="10 cores"
                icon={<Cpu size={20} className="text-dashboard-metric-primary" />}
              />
            </div>

            {/* Memory Panel */}
            <div className="bg-bg border border-border rounded-lg p-6 transition-all hover:shadow-md">
              <GaugeChart
                value={62}
                color="var(--color-dashboard-metric-secondary)"
                label="Memory"
                used="24 Gi"
                total="40 Gi"
                icon={<HardDrive size={20} className="text-dashboard-metric-secondary" />}
              />
            </div>

            {/* Disk Panel */}
            <div className="bg-bg border border-border rounded-lg p-6 transition-all hover:shadow-md">
              <GaugeChart
                value={38}
                color="var(--color-dashboard-metric-tertiary)"
                label="Disk"
                used="19 Gi"
                total="50 Gi"
                icon={<HardDrive size={20} className="text-dashboard-metric-tertiary" />}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
