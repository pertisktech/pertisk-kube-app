import { useMemo, useState } from 'react';
import {
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip,
  type ChartData,
  type ChartOptions,
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import { ResourceMetricsPanel } from './ResourceMetricsPanel';
import { useWorkloadMetricSeries } from '../hooks/useKubernetes';
import type { MetricSeriesPoint } from '../types';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend);

type WorkloadMetricTab = 'CPU' | 'Memory' | 'Network' | 'Filesystem';

const WORKLOAD_METRIC_TABS: readonly WorkloadMetricTab[] = ['CPU', 'Memory', 'Network', 'Filesystem'];

const formatTimestampLabel = (unixSeconds: number) => {
  const dt = new Date(unixSeconds * 1000);
  return dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
};

const toSeriesData = (points: MetricSeriesPoint[]) => ({
  labels: points.map((point) => formatTimestampLabel(point.timestamp)),
  values: points.map((point) => Number(point.value.toFixed(2))),
});

export const WorkloadMetricGraphs = () => {
  const [activeTab, setActiveTab] = useState<WorkloadMetricTab>('CPU');
  const { data, isLoading, error } = useWorkloadMetricSeries();

  const chartPayload = useMemo(() => {
    if (activeTab === 'CPU') {
      const series = toSeriesData(data?.cpu ?? []);
      return {
        labels: series.labels,
        values: series.values,
        datasetLabel: 'Workload CPU (millicores)',
        color: '#00a7a0',
        ySuffix: 'm',
      };
    }

    if (activeTab === 'Memory') {
      const series = toSeriesData(data?.memory ?? []);
      return {
        labels: series.labels,
        values: series.values,
        datasetLabel: 'Workload memory (bytes)',
        color: '#c93dce',
        ySuffix: 'B',
      };
    }

    if (activeTab === 'Network') {
      const series = toSeriesData(data?.network ?? []);
      return {
        labels: series.labels,
        values: series.values,
        datasetLabel: 'Workload network (bytes)',
        color: '#64c5d6',
        ySuffix: 'B',
      };
    }

    const series = toSeriesData(data?.filesystem ?? []);
    return {
      labels: series.labels,
      values: series.values,
      datasetLabel: 'Workload filesystem (bytes)',
      color: '#f59e0b',
      ySuffix: 'B',
    };
  }, [activeTab, data]);

  const lineData: ChartData<'line'> = {
    labels: chartPayload.labels,
    datasets: [
      {
        label: chartPayload.datasetLabel,
        data: chartPayload.values,
        borderColor: chartPayload.color,
        backgroundColor: `${chartPayload.color}33`,
        pointRadius: 2,
        pointHoverRadius: 4,
        borderWidth: 2,
        fill: true,
        tension: 0.25,
      },
    ],
  };

  const options: ChartOptions<'line'> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (ctx) => `${ctx.dataset.label}: ${ctx.parsed.y}${chartPayload.ySuffix}`,
        },
      },
    },
    scales: {
      x: {
        grid: { color: 'rgba(120,120,120,0.15)' },
        ticks: { color: '#9ca3af' },
      },
      y: {
        beginAtZero: true,
        grid: { color: 'rgba(120,120,120,0.2)' },
        ticks: {
          color: '#9ca3af',
          callback: (value) => `${value}${chartPayload.ySuffix}`,
        },
      },
    },
  };

  const noSeries = chartPayload.values.length === 0;

  return (
    <ResourceMetricsPanel
      title="Workload Metrics"
      tabs={WORKLOAD_METRIC_TABS}
      activeTab={activeTab}
      onTabChange={setActiveTab}
      isLoading={isLoading}
      error={error instanceof Error ? error.message : null}
    >
      {noSeries ? (
        <div className="h-64 flex items-center justify-center text-sm text-text-secondary">Waiting for workload metric samples...</div>
      ) : (
        <div className="h-64">
          <Line data={lineData} options={options} />
        </div>
      )}
    </ResourceMetricsPanel>
  );
};
