import { usePods, useNodes } from '../hooks/useKubernetes';
import { Card } from './Card';
import { Loader } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import { Bar, Doughnut } from 'react-chartjs-2';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend
);

export const MetricsCharts = () => {
  const { data: pods, isLoading: podsLoading } = usePods();
  const { data: nodes, isLoading: nodesLoading } = useNodes();
  const theme = useTheme();

  if (podsLoading || nodesLoading) {
    return (
      <Card title="Metrics">
        <div className="flex items-center justify-center h-64">
          <Loader size={24} className="animate-spin text-primary" />
        </div>
      </Card>
    );
  }

  // Calculate theme colors
  const isDark = theme?.isDark;
  const textColor = isDark ? '#d4d4d4' : '#000000';
  const gridColor = isDark ? '#333333' : '#e5e5e5';
  const backgroundColor = isDark ? '#1e1e1e' : '#ffffff';

  // Pod Status Distribution
  const podStatusCounts = {
    running: pods?.filter((p) => (p.status || p.phase || '').toLowerCase() === 'running').length || 0,
    pending: pods?.filter((p) => (p.status || p.phase || '').toLowerCase() === 'pending').length || 0,
    failed: pods?.filter((p) => (p.status || p.phase || '').toLowerCase() === 'failed').length || 0,
    succeeded: pods?.filter((p) => (p.status || p.phase || '').toLowerCase() === 'succeeded').length || 0,
    unknown: pods?.filter((p) => (p.status || p.phase || '').toLowerCase() === 'unknown').length || 0,
  };

  const podStatusData = {
    labels: ['Running', 'Pending', 'Failed', 'Succeeded', 'Unknown'],
    datasets: [
      {
        label: 'Pod Status',
        data: [
          podStatusCounts.running,
          podStatusCounts.pending,
          podStatusCounts.failed,
          podStatusCounts.succeeded,
          podStatusCounts.unknown,
        ],
        backgroundColor: [
          '#10b981',
          '#f59e0b',
          '#ef4444',
          '#6366f1',
          '#8b5cf6',
        ],
        borderColor: backgroundColor,
        borderWidth: 2,
      },
    ],
  };

  // Node Status Distribution
  const readyNodes = nodes?.filter((n) => {
    if (typeof n.ready === 'boolean') return n.ready;
    return String(n.ready).toLowerCase() === 'true';
  }).length || 0;
  const notReadyNodes = (nodes?.length || 0) - readyNodes;

  const nodeStatusData = {
    labels: ['Ready', 'Not Ready'],
    datasets: [
      {
        label: 'Node Status',
        data: [readyNodes, notReadyNodes],
        backgroundColor: ['#10b981', '#ef4444'],
        borderColor: backgroundColor,
        borderWidth: 2,
      },
    ],
  };

  // Pod Distribution by Node (simulate with namespace distribution)
  const podsByNamespace: { [key: string]: number } = {};
  pods?.forEach((pod) => {
    const ns = pod.namespace || 'default';
    podsByNamespace[ns] = (podsByNamespace[ns] || 0) + 1;
  });

  const topNamespaces = Object.entries(podsByNamespace)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  const podDistributionData = {
    labels: topNamespaces.map(([ns]) => ns),
    datasets: [
      {
        label: 'Pods per Namespace',
        data: topNamespaces.map(([, count]) => count),
        backgroundColor: '#3b82f6',
        borderColor: textColor,
        borderWidth: 1,
      },
    ],
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: true,
    plugins: {
      legend: {
        labels: {
          color: textColor,
        },
      },
    },
    scales: {
      y: {
        ticks: {
          color: textColor,
        },
        grid: {
          color: gridColor,
        },
      },
      x: {
        ticks: {
          color: textColor,
        },
        grid: {
          color: gridColor,
        },
      },
    },
  };

  const doughnutOptions = {
    responsive: true,
    maintainAspectRatio: true,
    plugins: {
      legend: {
        labels: {
          color: textColor,
        },
        position: 'bottom' as const,
      },
    },
  };

  return (
    <div className="space-y-6">
      <Card title="Metrics Overview">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Pod Status Distribution */}
          <div className="flex flex-col items-center">
            <h3 className="text-lg font-semibold text-text mb-4">Pod Status Distribution</h3>
            <div style={{ position: 'relative', height: '300px', width: '100%' }}>
              <Doughnut data={podStatusData} options={doughnutOptions} />
            </div>
          </div>

          {/* Node Status Distribution */}
          <div className="flex flex-col items-center">
            <h3 className="text-lg font-semibold text-text mb-4">Node Status</h3>
            <div style={{ position: 'relative', height: '300px', width: '100%' }}>
              <Doughnut data={nodeStatusData} options={doughnutOptions} />
            </div>
          </div>
        </div>
      </Card>

      {/* Pod Distribution by Namespace */}
      <Card title="Pod Distribution by Namespace">
        <div style={{ position: 'relative', height: '350px', width: '100%' }}>
          <Bar data={podDistributionData} options={chartOptions} />
        </div>
      </Card>
    </div>
  );
};
