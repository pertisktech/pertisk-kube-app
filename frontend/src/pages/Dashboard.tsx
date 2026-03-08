import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { useDashboard, useNodes, usePods } from '../hooks/useKubernetes';
import { DataTable } from '../components/DataTable';
import { StatusBadge } from '../components/StatusBadge';
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
  ExternalLink,
} from 'lucide-react';
import { Loader } from 'lucide-react';
import { timeAgo, formatMemoryUsedAlloc } from '../utils';
import { K8sNode } from '../types';

const CHART_USED = 'var(--color-dashboard-metric-primary)';
const CHART_AVAILABLE = 'var(--color-muted)';

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

// Helper to format Memory display (unit: GB)
function formatMemory(gb: number): string {
  if (gb === 0) return '0 GB';
  return gb % 1 === 0 ? `${gb} GB` : `${gb.toFixed(2)} GB`;
}

// Helper to parse allocatable pods (integer string per node)
function parsePods(podsStr?: string): number {
  if (!podsStr) return 0;
  const n = parseInt(podsStr, 10);
  return Number.isNaN(n) ? 0 : n;
}

const usageBarWidth = (percent: number) => (percent <= 0 ? 0 : Math.max(percent, 6));
const toPercent = (value?: number) =>
  value == null || Number.isNaN(value) ? 0 : Math.max(0, Math.min(100, value));

type NodeSortKey = 'name' | 'status' | 'ip' | 'cpu' | 'memory' | 'roles' | 'age';

export const Dashboard = () => {
  const { data: dashboard, isLoading: dashLoading } = useDashboard();
  const { data: nodes, isLoading: nodesLoading } = useNodes({ refetchInterval: 30_000 });
  const { data: pods, isLoading: podsLoading } = usePods();

  const [nodeSortState, setNodeSortState] = useState<{ key: NodeSortKey; direction: 'asc' | 'desc' }>({
    key: 'name',
    direction: 'asc',
  });

  const isLoading = dashLoading || nodesLoading || podsLoading;

  const sortedNodes = useMemo(() => {
    const list = [...(nodes ?? [])];
    const f = nodeSortState.direction === 'asc' ? 1 : -1;
    list.sort((a, b) => {
      switch (nodeSortState.key) {
        case 'name':
          return a.name.localeCompare(b.name) * f;
        case 'status': {
          const ra = String(a.ready).toLowerCase() === 'true' ? 1 : 0;
          const rb = String(b.ready).toLowerCase() === 'true' ? 1 : 0;
          return (ra - rb) * f;
        }
        case 'ip':
          return (formatNodeIPs(a) || '').localeCompare(formatNodeIPs(b) || '') * f;
        case 'cpu':
          return ((a.cpu_usage_percent ?? 0) - (b.cpu_usage_percent ?? 0)) * f;
        case 'memory':
          return ((a.memory_usage_percent ?? 0) - (b.memory_usage_percent ?? 0)) * f;
        case 'roles':
          return (a.roles?.join(', ') ?? '').localeCompare(b.roles?.join(', ') ?? '') * f;
        case 'age':
          return (new Date(a.age ?? 0).getTime() - new Date(b.age ?? 0).getTime()) * f;
        default:
          return 0;
      }
    });
    return list;
  }, [nodes, nodeSortState]);

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

  // Calculate total allocatable and used (from metrics) for pie charts
  let totalCPU = 0;
  let totalMemory = 0;
  let totalPodsAllocatable = 0;
  let usedCPU = 0;
  let usedMemory = 0;
  if (nodes) {
    nodes.forEach((node) => {
      totalCPU += parseCPU(node.cpu);
      totalMemory += parseMemory(node.memory);
      totalPodsAllocatable += parsePods(node.pods);
      usedCPU += parseCPU(node.cpu_used);
      usedMemory += parseMemory(node.memory_used);
    });
  }
  const podCount = dashboard?.pods ?? pods?.length ?? 0;

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

  const nodeColumns = [
    {
      header: 'Name',
      accessor: (row: K8sNode) => (
        <span className="font-medium text-text truncate block max-w-[180px]" title={row.name}>
          {row.name}
        </span>
      ),
      width: '18%',
      sortable: true,
      sortKey: 'name' as NodeSortKey,
    },
    {
      header: 'Status',
      accessor: (row: K8sNode) => (
        <StatusBadge status={String(row.ready).toLowerCase() === 'true' ? 'Ready' : 'NotReady'} />
      ),
      width: '7%',
      sortable: true,
      sortKey: 'status' as NodeSortKey,
    },
    {
      header: 'IP',
      accessor: (row: K8sNode) => (
        <span className="text-text-secondary text-xs font-mono truncate block max-w-[140px]" title={formatNodeIPs(row)}>
          {formatNodeIPs(row) || '-'}
        </span>
      ),
      width: '14%',
      sortable: true,
      sortKey: 'ip' as NodeSortKey,
    },
    {
      header: 'CPU',
      accessor: (row: K8sNode) => {
        const used = row.cpu_used ?? '-';
        const alloc = row.cpu ?? '-';
        const label = alloc !== '-' ? `${used}/${alloc}` : '-';
        const percent = toPercent(row.cpu_usage_percent);
        const hasMetrics = row.cpu_usage_percent != null;
        return (
          <div className="flex items-center gap-2 w-full">
            <span className="text-xs text-text-secondary w-[5rem] flex-shrink-0 truncate" title={label}>
              {label}
            </span>
            {hasMetrics ? (
              <>
                <div className="h-1.5 w-16 flex-shrink-0 rounded-full bg-hover overflow-hidden">
                  <div
                    className="h-full rounded-full bg-blue-500"
                    style={{ width: `${usageBarWidth(percent)}%` }}
                  />
                </div>
                <span className="text-xs font-medium text-text w-9 text-right flex-shrink-0">{Math.round(percent)}%</span>
              </>
            ) : (
              <span className="text-xs text-text-secondary">-</span>
            )}
          </div>
        );
      },
      width: '20%',
      sortable: true,
      sortKey: 'cpu' as NodeSortKey,
    },
    {
      header: 'Memory',
      accessor: (row: K8sNode) => {
        const label = formatMemoryUsedAlloc(row.memory_used, row.memory);
        const percent = toPercent(row.memory_usage_percent);
        const hasMetrics = row.memory_usage_percent != null;
        return (
          <div className="flex items-center gap-2 w-full">
            <span className="text-xs text-text-secondary min-w-[11rem] flex-shrink-0 whitespace-nowrap" title={label}>
              {label}
            </span>
            {hasMetrics ? (
              <>
                <div className="h-1.5 w-16 flex-shrink-0 rounded-full bg-hover overflow-hidden">
                  <div
                    className="h-full rounded-full bg-purple-500"
                    style={{ width: `${usageBarWidth(percent)}%` }}
                  />
                </div>
                <span className="text-xs font-medium text-text w-9 text-right flex-shrink-0">{Math.round(percent)}%</span>
              </>
            ) : (
              <span className="text-xs text-text-secondary">-</span>
            )}
          </div>
        );
      },
      width: '20%',
      sortable: true,
      sortKey: 'memory' as NodeSortKey,
    },
    {
      header: 'Roles',
      accessor: (row: K8sNode) => (
        <span className="text-xs text-text-secondary truncate block max-w-[100px]" title={row.roles?.join(', ')}>
          {row.roles?.length ? row.roles.join(', ') : '-'}
        </span>
      ),
      width: '11%',
      sortable: true,
      sortKey: 'roles' as NodeSortKey,
    },
    {
      header: 'Age',
      accessor: (row: K8sNode) => (
        <span className="text-xs text-text-secondary">{row.age ? timeAgo(row.age) : '-'}</span>
      ),
      width: '10%',
      sortable: true,
      sortKey: 'age' as NodeSortKey,
    },
  ];

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

          {/* Cluster resource pie charts (freelens-style: CPU, Memory, Pods) */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-6">
            {/* CPU pie */}
            <div className="bg-bg border border-border rounded-xl p-4 flex flex-col items-center chart-theme-text">
              <div className="flex items-center gap-2 mb-3">
                <Cpu size={20} className="text-dashboard-metric-primary" />
                <span className="font-semibold text-text">CPU</span>
              </div>
              <div className="w-full h-44">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={[
                        { name: 'Used', value: Math.max(0, usedCPU) || 0.01, color: CHART_USED },
                        {
                          name: 'Available',
                          value: Math.max(0, totalCPU - usedCPU) || (totalCPU || 0.01),
                          color: CHART_AVAILABLE,
                        },
                      ]}
                      cx="50%"
                      cy="50%"
                      innerRadius={44}
                      outerRadius={64}
                      paddingAngle={0}
                      dataKey="value"
                    >
                      {[{ color: CHART_USED }, { color: CHART_AVAILABLE }].map((entry, i) => (
                        <Cell key={i} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'var(--color-surface)',
                        color: 'var(--color-text)',
                        borderRadius: '8px',
                        padding: '10px 12px',
                        border: '1px solid var(--color-border)',
                      }}
                      formatter={(value: number | undefined, name: string | undefined) => [`${formatCPU(Number(value ?? 0))} cores`, name ?? '']}
                      labelFormatter={() => `Total: ${formatCPU(totalCPU)} cores`}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <p className="text-xs text-text-secondary mt-2">
                {formatCPU(usedCPU)} / {formatCPU(totalCPU)} cores
              </p>
            </div>

            {/* Memory pie */}
            <div className="bg-bg border border-border rounded-xl p-4 flex flex-col items-center chart-theme-text">
              <div className="flex items-center gap-2 mb-3">
                <HardDrive size={20} className="text-dashboard-metric-secondary" />
                <span className="font-semibold text-text">Memory</span>
              </div>
              <div className="w-full h-44">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={[
                        { name: 'Used', value: Math.max(0, usedMemory) || 0.01, color: CHART_USED },
                        {
                          name: 'Available',
                          value: Math.max(0, totalMemory - usedMemory) || (totalMemory || 0.01),
                          color: CHART_AVAILABLE,
                        },
                      ]}
                      cx="50%"
                      cy="50%"
                      innerRadius={44}
                      outerRadius={64}
                      paddingAngle={0}
                      dataKey="value"
                    >
                      {[{ color: CHART_USED }, { color: CHART_AVAILABLE }].map((entry, i) => (
                        <Cell key={i} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'var(--color-surface)',
                        color: 'var(--color-text)',
                        borderRadius: '8px',
                        padding: '10px 12px',
                        border: '1px solid var(--color-border)',
                      }}
                      formatter={(value: number | undefined, name: string | undefined) => [formatMemory(Number(value ?? 0)), name ?? '']}
                      labelFormatter={() => `Total: ${formatMemory(totalMemory)}`}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <p className="text-xs text-text-secondary mt-2">
                {formatMemory(usedMemory)} / {formatMemory(totalMemory)}
              </p>
            </div>

            {/* Pods pie */}
            <div className="bg-bg border border-border rounded-xl p-4 flex flex-col items-center chart-theme-text">
              <div className="flex items-center gap-2 mb-3">
                <Box size={20} className="text-dashboard-metric-tertiary" />
                <span className="font-semibold text-text">Pods</span>
              </div>
              <div className="w-full h-44">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={[
                        { name: 'Used', value: podCount || 0.01, color: CHART_USED },
                        {
                          name: 'Available',
                          value: Math.max(0, (totalPodsAllocatable || 1) - podCount) || 0.01,
                          color: CHART_AVAILABLE,
                        },
                      ]}
                      cx="50%"
                      cy="50%"
                      innerRadius={44}
                      outerRadius={64}
                      paddingAngle={0}
                      dataKey="value"
                    >
                      {[{ color: CHART_USED }, { color: CHART_AVAILABLE }].map((entry, i) => (
                        <Cell key={i} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'var(--color-surface)',
                        color: 'var(--color-text)',
                        borderRadius: '8px',
                        padding: '10px 12px',
                        border: '1px solid var(--color-border)',
                      }}
                      formatter={(value: number | undefined, name: string | undefined) => [
                        `${Math.round(Number(value ?? 0))} pods`,
                        name ?? '',
                      ]}
                      labelFormatter={() => `Capacity: ${totalPodsAllocatable} pods`}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <p className="text-xs text-text-secondary mt-2">
                {podCount} / {totalPodsAllocatable || 0} pods
              </p>
            </div>
          </div>

          {/* Nodes summary line below pies */}
          <div className="mt-4 pt-4 border-t border-border flex items-center gap-4 text-sm text-text-secondary">
            <span className="flex items-center gap-1.5">
              <Server size={14} className="text-dashboard-metric-quaternary" />
              Nodes: {readyNodeCount}/{totalNodeCount} ready
            </span>
            <span>
              {dashboard?.cluster_name || 'kubernetes-cluster'} • {dashboard?.kube_version || 'Unknown'}
            </span>
          </div>
        </div>
      </div>

      {/* Nodes table (same style as Nodes page) */}
      <div className="bg-surface border border-border rounded-lg p-6 backdrop-blur-sm">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <Server size={24} className="text-dashboard-metric-primary" />
            <h2 className="text-2xl font-bold text-text">Nodes</h2>
            <span className="text-sm text-text-secondary">{nodes?.length ?? 0} nodes</span>
          </div>
          <Link
            to="/nodes"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--color-primary)] hover:underline"
          >
            View all
            <ExternalLink size={14} />
          </Link>
        </div>
        <DataTable<K8sNode>
          columns={nodeColumns}
          data={sortedNodes}
          isLoading={nodesLoading}
          error={null}
          rowKey="name"
          sortState={nodeSortState}
          onSortChange={(s) => setNodeSortState(s as { key: NodeSortKey; direction: 'asc' | 'desc' })}
        />
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
                used="24 GB"
                total="40 GB"
                icon={<HardDrive size={20} className="text-dashboard-metric-secondary" />}
              />
            </div>

            {/* Disk Panel */}
            <div className="bg-bg border border-border rounded-lg p-6 transition-all hover:shadow-md">
              <GaugeChart
                value={38}
                color="var(--color-dashboard-metric-tertiary)"
                label="Disk"
                used="19 GB"
                total="50 GB"
                icon={<HardDrive size={20} className="text-dashboard-metric-tertiary" />}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
