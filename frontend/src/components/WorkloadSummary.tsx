import { 
  useDeployments, 
  useStatefulSets, 
  useDaemonSets, 
  useJobs, 
  useCronJobs,
  useReplicaSets 
} from '../hooks/useKubernetes';
import { Card } from './Card';
import { Loader } from './Icons';

export const WorkloadSummary = () => {
  const { data: deployments, isLoading: deploymentsLoading } = useDeployments();
  const { data: statefulsets, isLoading: statefulsetsLoading } = useStatefulSets();
  const { data: daemonsets, isLoading: daemonsetsLoading } = useDaemonSets();
  const { data: jobs, isLoading: jobsLoading } = useJobs();
  const { data: cronjobs, isLoading: cronjobsLoading } = useCronJobs();
  const { data: replicas, isLoading: replicasLoading } = useReplicaSets();

  const isLoading = deploymentsLoading || statefulsetsLoading || daemonsetsLoading || jobsLoading || cronjobsLoading || replicasLoading;

  if (isLoading) {
    return (
      <Card title="Workload Summary">
        <div className="flex items-center justify-center h-32">
          <Loader size={24} className="animate-spin text-primary" />
        </div>
      </Card>
    );
  }

  const workloadCounts = {
    deployments: deployments?.length || 0,
    statefulsets: statefulsets?.length || 0,
    daemonsets: daemonsets?.length || 0,
    jobs: jobs?.length || 0,
    cronjobs: cronjobs?.length || 0,
    replicas: replicas?.length || 0,
  };

  const workloadItems = [
    { label: 'Deployments', value: workloadCounts.deployments, color: 'bg-dashboard-metric-primary' },
    { label: 'StatefulSets', value: workloadCounts.statefulsets, color: 'bg-dashboard-metric-secondary' },
    { label: 'DaemonSets', value: workloadCounts.daemonsets, color: 'bg-dashboard-success' },
    { label: 'Jobs', value: workloadCounts.jobs, color: 'bg-dashboard-metric-tertiary' },
    { label: 'CronJobs', value: workloadCounts.cronjobs, color: 'bg-dashboard-warning' },
    { label: 'ReplicaSets', value: workloadCounts.replicas, color: 'bg-dashboard-metric-quaternary' },
  ];

  const totalWorkloads = Object.values(workloadCounts).reduce((a, b) => a + b, 0);

  return (
    <Card title="Workload Summary">
      <div className="space-y-4">
        <div className="text-3xl font-bold text-text">
          {totalWorkloads}
          <span className="text-sm font-normal text-text-secondary ml-2">Total Workloads</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {workloadItems.map((item) => (
            <div
              key={item.label}
              className="bg-surface-elevated border border-border rounded-lg p-3 flex items-center gap-3"
            >
              <div className={`${item.color} w-3 h-3 rounded-full flex-shrink-0`} />
              <div className="flex-1">
                <p className="text-sm text-text-secondary">{item.label}</p>
                <p className="text-lg font-semibold text-text">{item.value}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
};
