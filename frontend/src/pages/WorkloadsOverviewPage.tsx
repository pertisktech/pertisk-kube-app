import { Link } from 'react-router-dom';
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  Legend,
} from 'recharts';
import {
  Box,
  Layers,
  Database,
  Copy,
  Briefcase,
  Clock,
  LucideIcon,
  RefreshCw,
  LayoutGrid,
  Network,
  Globe,
  Shield,
  FileCode,
  FileText,
  KeyRound,
  HardDrive,
  Circle,
} from 'lucide-react';
import {
  useServices,
  useEndpoints,
  useIngresses,
  useIngressClasses,
  useNetworkPolicies,
  useConfigMaps,
  useSecrets,
  usePersistentVolumeClaims,
  usePersistentVolumes,
  useStorageClasses,
  useCrds,
} from '../hooks/useKubernetes';
import {
  useRealtimePods,
} from '../hooks/useRealtimePods';
import {
  useRealtimeDeployments,
  useRealtimeStatefulSets,
  useRealtimeDaemonSets,
  useRealtimeReplicaSets,
  useRealtimeJobs,
  useRealtimeCronJobs,
} from '../hooks/useRealtimeResources';
import { useNamespace } from '../context/NamespaceContext';
import type { Pod, Deployment, StatefulSet, DaemonSet, ReplicaSet, Job, CronJob } from '../types';

// Chart/status colors from base theme (dashboard-success, warning, danger, muted)
// Use CSS variables so charts follow light/dark and theme overrides.
const CHART_SUCCESS = 'var(--color-dashboard-success)';
const CHART_WARNING = 'var(--color-dashboard-warning)';
const CHART_DANGER = 'var(--color-dashboard-danger)';
const CHART_MUTED = 'var(--color-muted)';

const STATUS_COLORS: Record<string, string> = {
  Running: CHART_SUCCESS,
  Healthy: CHART_SUCCESS,
  Active: CHART_SUCCESS,
  Complete: CHART_SUCCESS,
  Succeeded: CHART_SUCCESS,
  Completed: CHART_SUCCESS,
  Pending: CHART_WARNING,
  Warning: CHART_WARNING,
  Progressing: CHART_WARNING,
  Degraded: CHART_WARNING,
  Suspended: CHART_MUTED,
  Stopped: CHART_MUTED,
  Unknown: CHART_MUTED,
  Failed: CHART_DANGER,
  Error: CHART_DANGER,
  CrashLoopBackOff: CHART_DANGER,
};

// Parse "ready/total" string to [ready, total]
function parseReady(ready: string): [number, number] {
  const parts = (ready || '0/0').split('/').map((s) => parseInt(s.trim(), 10));
  const a = Number.isNaN(parts[0]) ? 0 : parts[0];
  const b = Number.isNaN(parts[1]) ? 0 : parts[1];
  return [a, b];
}

function getPodStatusData(pods: Pod[]): { name: string; value: number; color: string }[] {
  const statusCounts: Record<string, number> = {};
  pods.forEach((pod) => {
    const status = (pod.status || pod.phase || 'Unknown').trim();
    statusCounts[status] = (statusCounts[status] || 0) + 1;
  });
  return Object.entries(statusCounts).map(([name, value]) => ({
    name,
    value,
    color: STATUS_COLORS[name] || STATUS_COLORS.Unknown,
  }));
}

function getDeploymentStatusData(
  deployments: Deployment[]
): { name: string; value: number; color: string }[] {
  const statusCounts = { Healthy: 0, Progressing: 0, Degraded: 0 };
  deployments.forEach((dep) => {
    const [ready, total] = parseReady(dep.ready);
    if (total > 0 && ready === total) statusCounts.Healthy++;
    else if (ready > 0) statusCounts.Progressing++;
    else statusCounts.Degraded++;
  });
  return Object.entries(statusCounts)
    .filter(([, value]) => value > 0)
    .map(([name, value]) => ({
      name,
      value,
      color: STATUS_COLORS[name] || STATUS_COLORS.Unknown,
    }));
}

function getDaemonSetStatusData(
  daemonsets: DaemonSet[]
): { name: string; value: number; color: string }[] {
  const statusCounts = { Healthy: 0, Progressing: 0, Degraded: 0 };
  daemonsets.forEach((ds) => {
    if (ds.desired > 0 && ds.ready === ds.desired) statusCounts.Healthy++;
    else if (ds.ready > 0) statusCounts.Progressing++;
    else statusCounts.Degraded++;
  });
  return Object.entries(statusCounts)
    .filter(([, value]) => value > 0)
    .map(([name, value]) => ({
      name,
      value,
      color: STATUS_COLORS[name] || STATUS_COLORS.Unknown,
    }));
}

function getStatefulSetStatusData(
  statefulsets: StatefulSet[]
): { name: string; value: number; color: string }[] {
  const statusCounts = { Healthy: 0, Progressing: 0, Degraded: 0 };
  statefulsets.forEach((sts) => {
    const [ready, total] = parseReady(sts.ready);
    if (total > 0 && ready === total) statusCounts.Healthy++;
    else if (ready > 0) statusCounts.Progressing++;
    else statusCounts.Degraded++;
  });
  return Object.entries(statusCounts)
    .filter(([, value]) => value > 0)
    .map(([name, value]) => ({
      name,
      value,
      color: STATUS_COLORS[name] || STATUS_COLORS.Unknown,
    }));
}

function getReplicaSetStatusData(
  replicasets: ReplicaSet[]
): { name: string; value: number; color: string }[] {
  const statusCounts = { Healthy: 0, Progressing: 0, Degraded: 0 };
  replicasets.forEach((rs) => {
    if (rs.desired > 0 && rs.ready === rs.desired) statusCounts.Healthy++;
    else if (rs.desired === 0) statusCounts.Healthy++;
    else if (rs.ready > 0) statusCounts.Progressing++;
    else statusCounts.Degraded++;
  });
  return Object.entries(statusCounts)
    .filter(([, value]) => value > 0)
    .map(([name, value]) => ({
      name,
      value,
      color: STATUS_COLORS[name] || STATUS_COLORS.Unknown,
    }));
}

function getJobStatusData(jobs: Job[]): { name: string; value: number; color: string }[] {
  const statusCounts = { Complete: 0, Running: 0, Failed: 0 };
  jobs.forEach((job) => {
    const s = (job.status || '').toLowerCase();
    if (s === 'completed' || s === 'succeeded') statusCounts.Complete++;
    else if (s === 'failed') statusCounts.Failed++;
    else statusCounts.Running++;
  });
  return Object.entries(statusCounts)
    .filter(([, value]) => value > 0)
    .map(([name, value]) => ({
      name,
      value,
      color: STATUS_COLORS[name === 'Complete' ? 'Complete' : name] || STATUS_COLORS.Unknown,
    }));
}

function getCronJobStatusData(
  cronjobs: CronJob[]
): { name: string; value: number; color: string }[] {
  const statusCounts = { Active: 0, Suspended: 0, Running: 0 };
  cronjobs.forEach((cj) => {
    if (cj.suspend) statusCounts.Suspended++;
    else if (cj.active > 0) statusCounts.Running++;
    else statusCounts.Active++;
  });
  return Object.entries(statusCounts)
    .filter(([, value]) => value > 0)
    .map(([name, value]) => ({
      name,
      value,
      color: STATUS_COLORS[name] || STATUS_COLORS.Unknown,
    }));
}

interface ChartCardProps {
  title: string;
  icon: LucideIcon;
  data: { name: string; value: number; color: string }[];
  total: number;
  linkTo: string;
  isLoading: boolean;
}

function ChartCard({ title, icon: Icon, data, total, linkTo, isLoading }: ChartCardProps) {
  const hasData = data.length > 0 && total > 0;

  return (
    <div className="bg-surface border border-border rounded-xl p-6 transition-all hover:shadow-lg backdrop-blur-sm">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-dashboard-metric-primary/20">
            <Icon size={20} className="text-dashboard-metric-primary" />
          </div>
          <div>
            <h3 className="font-semibold text-text">{title}</h3>
            <p className="text-sm text-text-secondary">Total: {total}</p>
          </div>
        </div>
        <Link
          to={linkTo}
          className="text-sm px-3 py-1 rounded-lg hover:bg-hover transition-colors text-[var(--color-primary)]"
        >
          View All →
        </Link>
      </div>

      {isLoading ? (
        <div className="h-48 flex items-center justify-center">
          <RefreshCw size={24} className="animate-spin text-text-secondary" />
        </div>
      ) : !hasData ? (
        <div className="h-48 flex items-center justify-center">
          <p className="text-text-secondary">No resources found</p>
        </div>
      ) : (
        <div className="h-48 chart-theme-text">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius={40}
                outerRadius={70}
                paddingAngle={2}
                dataKey="value"
                label={({ name, percent }) =>
                  (percent ?? 0) > 0.05 ? `${name ?? ''} (${((percent ?? 0) * 100).toFixed(0)}%)` : ''
                }
                labelLine={false}
              >
                {data.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  backgroundColor: 'var(--color-surface)',
                  color: 'var(--color-text)',
                  borderRadius: '8px',
                  padding: '10px 12px',
                }}
                labelStyle={{ color: 'var(--color-text)' }}
                itemStyle={{ color: 'var(--color-text)' }}
                wrapperStyle={{ outline: 'none' }}
                formatter={(value, name) => [
                  `${value} (${total > 0 ? ((Number(value) / total) * 100).toFixed(1) : 0}%)`,
                  name,
                ]}
              />
              <Legend
                wrapperStyle={{ fontSize: '12px', color: 'var(--color-text)' }}
                formatter={(value) => <span style={{ color: 'var(--color-text)' }}>{value}</span>}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      )}

      {hasData && (
        <div className="mt-4 grid grid-cols-2 gap-2">
          {data.map((item) => (
            <div key={item.name} className="flex items-center gap-2">
              <div
                className="w-3 h-3 rounded-full flex-shrink-0"
                style={{ backgroundColor: item.color }}
              />
              <span className="text-sm text-text-secondary truncate">
                {item.name}: {item.value}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

interface SummaryRowProps {
  name: string;
  icon: LucideIcon;
  total: number;
  healthy: number;
  warning: number;
  critical: number;
  linkTo: string;
}

function SummaryRow({
  name,
  icon: Icon,
  total,
  healthy,
  warning,
  critical,
  linkTo,
}: SummaryRowProps) {
  const cellContent = (
    <span className="flex items-center gap-2 text-text">
      <Icon size={16} className="text-dashboard-metric-primary flex-shrink-0" />
      <span>{name}</span>
    </span>
  );
  return (
    <tr className="border-b border-border hover:bg-hover/50 transition-colors">
      <td className="py-3 px-4">
        {linkTo && linkTo !== '#' ? (
          <Link
            to={linkTo}
            className="flex items-center gap-2 hover:text-[var(--color-primary)] transition-colors text-text"
          >
            <Icon size={16} className="text-dashboard-metric-primary flex-shrink-0" />
            <span>{name}</span>
          </Link>
        ) : (
          cellContent
        )}
      </td>
      <td className="text-center py-3 px-4 text-text tabular-nums">{total}</td>
      <td className="text-center py-3 px-4">
        <span
          className={`px-2 py-1 rounded-full text-sm ${
            healthy > 0 ? 'bg-dashboard-success/20 text-dashboard-success' : ''
          }`}
        >
          {healthy}
        </span>
      </td>
      <td className="text-center py-3 px-4">
        <span
          className={`px-2 py-1 rounded-full text-sm ${
            warning > 0 ? 'bg-dashboard-warning/20 text-dashboard-warning' : ''
          }`}
        >
          {warning}
        </span>
      </td>
      <td className="text-center py-3 px-4">
        <span
          className={`px-2 py-1 rounded-full text-sm ${
            critical > 0 ? 'bg-dashboard-danger/20 text-dashboard-danger' : ''
          }`}
        >
          {critical}
        </span>
      </td>
    </tr>
  );
}

export const WorkloadsOverviewPage = () => {
  const { selectedNamespaces } = useNamespace();

  // Realtime workload data (WebSocket)
  const { data: pods, isConnected: podsConnected } = useRealtimePods<Pod>();
  const { data: deployments, isLoading: deploymentsLoading } = useRealtimeDeployments();
  const { data: statefulsets, isLoading: statefulsetsLoading } = useRealtimeStatefulSets();
  const { data: daemonsets, isLoading: daemonsetsLoading } = useRealtimeDaemonSets();
  const { data: replicasets, isLoading: replicasetsLoading } = useRealtimeReplicaSets();
  const { data: jobs, isLoading: jobsLoading } = useRealtimeJobs();
  const { data: cronjobs, isLoading: cronjobsLoading } = useRealtimeCronJobs();

  const podsLoading = !podsConnected && pods.length === 0;
  const workloadRealtimeConnected =
    podsConnected &&
    !deploymentsLoading &&
    !statefulsetsLoading &&
    !daemonsetsLoading &&
    !replicasetsLoading &&
    !jobsLoading &&
    !cronjobsLoading;

  const { data: services } = useServices();
  const { data: endpoints } = useEndpoints();
  const { data: ingresses } = useIngresses();
  const { data: ingressClasses } = useIngressClasses();
  const { data: networkPolicies } = useNetworkPolicies();
  const { data: configmaps } = useConfigMaps();
  const { data: secrets } = useSecrets();
  const { data: pvcs } = usePersistentVolumeClaims();
  const { data: pvs } = usePersistentVolumes();
  const { data: storageClasses } = useStorageClasses();
  const { data: crds } = useCrds();

  const filterByNs = <T extends { namespace?: string }>(list: T[] | undefined): T[] => {
    if (!list) return [];
    if (selectedNamespaces.length === 0) return list;
    return list.filter((x) => selectedNamespaces.includes(x.namespace ?? ''));
  };

  const filteredPods = filterByNs(pods ?? []);
  const filteredDeployments = filterByNs(deployments ?? []);
  const filteredStatefulSets = filterByNs(statefulsets ?? []);
  const filteredDaemonSets = filterByNs(daemonsets ?? []);
  const filteredReplicaSets = filterByNs(replicasets ?? []);
  const filteredJobs = filterByNs(jobs ?? []);
  const filteredCronJobs = filterByNs(cronjobs ?? []);
  const filteredServices = filterByNs(services);
  const filteredEndpoints = filterByNs(endpoints);
  const filteredIngresses = filterByNs(ingresses);
  const filteredIngressClasses = ingressClasses ?? []; // cluster-scoped
  const filteredNetworkPolicies = filterByNs(networkPolicies);
  const filteredConfigMaps = filterByNs(configmaps);
  const filteredSecrets = filterByNs(secrets);
  const filteredPvcs = filterByNs(pvcs);
  const filteredPvs = pvs ?? []; // cluster-scoped
  const filteredStorageClasses = storageClasses ?? []; // cluster-scoped

  const totalWorkloads =
    filteredPods.length +
    filteredDeployments.length +
    filteredStatefulSets.length +
    filteredDaemonSets.length +
    filteredReplicaSets.length +
    filteredJobs.length +
    filteredCronJobs.length;

  const healthyCount =
    filteredPods.filter((p) => (p.status || p.phase || '').toLowerCase() === 'running').length +
    filteredDeployments.filter((d) => {
      const [ready, total] = parseReady(d.ready);
      return total > 0 && ready === total;
    }).length +
    filteredDaemonSets.filter((ds) => ds.desired > 0 && ds.ready === ds.desired).length +
    filteredStatefulSets.filter((sts) => {
      const [ready, total] = parseReady(sts.ready);
      return total > 0 && ready === total;
    }).length;

  const healthPercentage =
    totalWorkloads > 0 ? ((healthyCount / totalWorkloads) * 100).toFixed(1) : '0';
  const healthNum = parseFloat(healthPercentage);
  const healthColor =
    healthNum >= 80 ? 'text-dashboard-success' : healthNum >= 50 ? 'text-dashboard-warning' : 'text-dashboard-danger';

  return (
    <div className="space-y-6">
      {/* Header - same as pertisk-kube */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text flex items-center gap-2">
            <LayoutGrid size={28} className="text-dashboard-metric-primary" />
            Workload Overview
          </h1>
          <p className="text-text-secondary mt-1">
            Monitor all workload resources across your cluster
          </p>
        </div>
        <div className="flex items-center gap-4 flex-wrap">
          {workloadRealtimeConnected && (
            <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-dashboard-success/15 text-dashboard-success text-sm font-medium">
              <Circle size={8} className="fill-current animate-pulse" />
              Live
            </span>
          )}
          <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-surface border border-border">
            <span className="text-text-secondary">Total Workloads: </span>
            <span className="font-bold text-text tabular-nums">{totalWorkloads}</span>
            <span className="text-border mx-2">|</span>
            <span className="text-text-secondary">Health: </span>
            <span className={`font-bold tabular-nums ${healthColor}`}>{healthPercentage}%</span>
          </div>
        </div>
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        <ChartCard
          title="Pods"
          icon={Box}
          data={getPodStatusData(filteredPods)}
          total={filteredPods.length}
          linkTo="/pods"
          isLoading={podsLoading}
        />
        <ChartCard
          title="Deployments"
          icon={Layers}
          data={getDeploymentStatusData(filteredDeployments)}
          total={filteredDeployments.length}
          linkTo="/deployments"
          isLoading={deploymentsLoading}
        />
        <ChartCard
          title="DaemonSets"
          icon={Layers}
          data={getDaemonSetStatusData(filteredDaemonSets)}
          total={filteredDaemonSets.length}
          linkTo="/daemonsets"
          isLoading={daemonsetsLoading}
        />
        <ChartCard
          title="StatefulSets"
          icon={Database}
          data={getStatefulSetStatusData(filteredStatefulSets)}
          total={filteredStatefulSets.length}
          linkTo="/statefulsets"
          isLoading={statefulsetsLoading}
        />
        <ChartCard
          title="ReplicaSets"
          icon={Copy}
          data={getReplicaSetStatusData(filteredReplicaSets)}
          total={filteredReplicaSets.length}
          linkTo="/replicasets"
          isLoading={replicasetsLoading}
        />
        <ChartCard
          title="Jobs"
          icon={Briefcase}
          data={getJobStatusData(filteredJobs)}
          total={filteredJobs.length}
          linkTo="/jobs"
          isLoading={jobsLoading}
        />
        <ChartCard
          title="CronJobs"
          icon={Clock}
          data={getCronJobStatusData(filteredCronJobs)}
          total={filteredCronJobs.length}
          linkTo="/cronjobs"
          isLoading={cronjobsLoading}
        />
      </div>

      {/* Resource Summary Table - same as pertisk-kube */}
      <div className="bg-surface border border-border rounded-xl p-6 backdrop-blur-sm">
        <h2 className="text-lg font-semibold text-text mb-4">Resource Summary</h2>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-3 px-4 text-text-secondary font-medium">
                  Resource Type
                </th>
                <th className="text-center py-3 px-4 text-text-secondary font-medium">Total</th>
                <th className="text-center py-3 px-4 text-dashboard-success font-medium">
                  Healthy
                </th>
                <th className="text-center py-3 px-4 text-dashboard-warning font-medium">
                  Warning
                </th>
                <th className="text-center py-3 px-4 text-dashboard-danger font-medium">
                  Critical
                </th>
              </tr>
            </thead>
            <tbody>
              <SummaryRow
                name="Pods"
                icon={Box}
                total={filteredPods.length}
                healthy={filteredPods.filter((p) => (p.status || p.phase || '').toLowerCase() === 'running').length}
                warning={filteredPods.filter((p) => (p.status || p.phase || '').toLowerCase() === 'pending').length}
                critical={filteredPods.filter((p) =>
                  ['failed', 'crashloopbackoff', 'error'].includes((p.status || p.phase || '').toLowerCase())
                ).length}
                linkTo="/pods"
              />
              <SummaryRow
                name="Deployments"
                icon={Layers}
                total={filteredDeployments.length}
                healthy={filteredDeployments.filter((d) => {
                  const [ready, total] = parseReady(d.ready);
                  return total > 0 && ready === total;
                }).length}
                warning={filteredDeployments.filter((d) => {
                  const [ready, total] = parseReady(d.ready);
                  return total > 0 && ready > 0 && ready < total;
                }).length}
                critical={filteredDeployments.filter((d) => {
                  const [ready, total] = parseReady(d.ready);
                  return total > 0 && ready === 0;
                }).length}
                linkTo="/deployments"
              />
              <SummaryRow
                name="DaemonSets"
                icon={Layers}
                total={filteredDaemonSets.length}
                healthy={filteredDaemonSets.filter((ds) => ds.desired > 0 && ds.ready === ds.desired).length}
                warning={filteredDaemonSets.filter((ds) => ds.ready > 0 && ds.ready < ds.desired).length}
                critical={filteredDaemonSets.filter((ds) => ds.desired > 0 && ds.ready === 0).length}
                linkTo="/daemonsets"
              />
              <SummaryRow
                name="StatefulSets"
                icon={Database}
                total={filteredStatefulSets.length}
                healthy={filteredStatefulSets.filter((sts) => {
                  const [ready, total] = parseReady(sts.ready);
                  return total > 0 && ready === total;
                }).length}
                warning={filteredStatefulSets.filter((sts) => {
                  const [ready, total] = parseReady(sts.ready);
                  return total > 0 && ready > 0 && ready < total;
                }).length}
                critical={filteredStatefulSets.filter((sts) => {
                  const [ready, total] = parseReady(sts.ready);
                  return total > 0 && ready === 0;
                }).length}
                linkTo="/statefulsets"
              />
              <SummaryRow
                name="ReplicaSets"
                icon={Copy}
                total={filteredReplicaSets.length}
                healthy={filteredReplicaSets.filter((rs) => rs.desired === 0 || rs.ready === rs.desired).length}
                warning={filteredReplicaSets.filter((rs) => rs.ready > 0 && rs.ready < rs.desired).length}
                critical={filteredReplicaSets.filter((rs) => rs.desired > 0 && rs.ready === 0).length}
                linkTo="/replicasets"
              />
              <SummaryRow
                name="Jobs"
                icon={Briefcase}
                total={filteredJobs.length}
                healthy={filteredJobs.filter((j) => (j.status || '').toLowerCase() === 'completed').length}
                warning={filteredJobs.filter((j) => (j.status || '').toLowerCase() === 'running').length}
                critical={filteredJobs.filter((j) => (j.status || '').toLowerCase() === 'failed').length}
                linkTo="/jobs"
              />
              <SummaryRow
                name="CronJobs"
                icon={Clock}
                total={filteredCronJobs.length}
                healthy={filteredCronJobs.filter((cj) => !cj.suspend).length}
                warning={0}
                critical={filteredCronJobs.filter((cj) => cj.suspend).length}
                linkTo="/cronjobs"
              />
              {/* Network */}
              <SummaryRow
                name="Services"
                icon={Network}
                total={filteredServices.length}
                healthy={0}
                warning={0}
                critical={0}
                linkTo="/network/services"
              />
              <SummaryRow
                name="Endpoints"
                icon={Network}
                total={filteredEndpoints.length}
                healthy={0}
                warning={0}
                critical={0}
                linkTo="/network/endpoints"
              />
              <SummaryRow
                name="Ingresses"
                icon={Globe}
                total={filteredIngresses.length}
                healthy={0}
                warning={0}
                critical={0}
                linkTo="/network/ingresses"
              />
              <SummaryRow
                name="Ingress Classes"
                icon={Globe}
                total={filteredIngressClasses.length}
                healthy={0}
                warning={0}
                critical={0}
                linkTo="/network/ingressclasses"
              />
              <SummaryRow
                name="Network Policies"
                icon={Shield}
                total={filteredNetworkPolicies.length}
                healthy={0}
                warning={0}
                critical={0}
                linkTo="/network/networkpolicies"
              />
              {/* Config */}
              <SummaryRow
                name="Config Maps"
                icon={FileText}
                total={filteredConfigMaps.length}
                healthy={0}
                warning={0}
                critical={0}
                linkTo="/config/configmaps"
              />
              <SummaryRow
                name="Secrets"
                icon={KeyRound}
                total={filteredSecrets.length}
                healthy={0}
                warning={0}
                critical={0}
                linkTo="/config/secrets"
              />
              {/* Storage */}
              <SummaryRow
                name="PVC"
                icon={HardDrive}
                total={filteredPvcs.length}
                healthy={0}
                warning={0}
                critical={0}
                linkTo="/storage/pvc"
              />
              <SummaryRow
                name="PV"
                icon={HardDrive}
                total={filteredPvs.length}
                healthy={0}
                warning={0}
                critical={0}
                linkTo="/storage/pv"
              />
              <SummaryRow
                name="Storage Classes"
                icon={HardDrive}
                total={filteredStorageClasses.length}
                healthy={0}
                warning={0}
                critical={0}
                linkTo="/storage/storageclasses"
              />
              {/* Custom resources */}
              <SummaryRow
                name="CRDs"
                icon={FileCode}
                total={crds?.length ?? 0}
                healthy={0}
                warning={0}
                critical={0}
                linkTo="#"
              />
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
