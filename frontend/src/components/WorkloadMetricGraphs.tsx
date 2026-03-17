import { useMemo, useState } from 'react';
import {
  CategoryScale,
  Chart as ChartJS,
  Filler,
  Legend,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip,
  type ChartData,
  type ChartOptions,
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import { ResourceMetricsPanel, type MetricTab } from './ResourceMetricsPanel';
import { useWorkloadMetricSeries } from '../hooks/useKubernetes';
import { Cpu, Database, Network, Archive } from './Icons';
import type { MetricSeriesPoint } from '../types';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend, Filler);

type WorkloadMetricTab = 'CPU' | 'Memory' | 'Network' | 'Filesystem';

const DURATION_OPTIONS: { label: string; hours: number }[] = [
  { label: '1h',  hours: 1 },
  { label: '2h',  hours: 2 },
  { label: '4h',  hours: 4 },
  { label: '24h', hours: 24 },
  { label: '48h', hours: 48 },
  { label: '1w',  hours: 168 },
  { label: '1m',  hours: 720 },
];

const getDurationLabel = (hours: number): string => {
  if (hours === 168) return '1w';
  if (hours === 720) return '1m';
  return `${hours}h`;
};

const WORKLOAD_METRIC_TABS: readonly MetricTab<WorkloadMetricTab>[] = [
  { id: 'CPU',        label: 'CPU Usage',       icon: Cpu,      color: '#00a7a0' },
  { id: 'Memory',     label: 'Memory Usage',    icon: Database, color: '#c93dce' },
  { id: 'Network',    label: 'Network I/O',     icon: Network,  color: '#64c5d6' },
  { id: 'Filesystem', label: 'Filesystem I/O',  icon: Archive,  color: '#f59e0b' },
];

const formatTimestampLabel = (unixSeconds: number, durationHours: number) => {
  const dt = new Date(unixSeconds * 1000);
  if (durationHours <= 4) {
    return dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }
  if (durationHours <= 48) {
    return dt.toLocaleTimeString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  }
  return dt.toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
};

const toSeriesData = (points: MetricSeriesPoint[], durationHours: number) => ({
  labels: points.map((point) => formatTimestampLabel(point.timestamp, durationHours)),
  values: points.map((point) => Number(point.value.toFixed(2))),
});

const formatBytes = (value: number): string => {
  if (!Number.isFinite(value)) return '0 B';
  const absValue = Math.abs(value);
  if (absValue < 1024) return `${value.toFixed(0)} B`;

  const units = ['KB', 'MB', 'GB', 'TB', 'PB'];
  let scaled = value / 1024;
  let unitIndex = 0;

  while (Math.abs(scaled) >= 1024 && unitIndex < units.length - 1) {
    scaled /= 1024;
    unitIndex += 1;
  }

  const precision = Math.abs(scaled) >= 10 ? 1 : 2;
  return `${scaled.toFixed(precision)} ${units[unitIndex]}`;
};

export const WorkloadMetricGraphs = () => {
  const [activeTab, setActiveTab] = useState<WorkloadMetricTab>('CPU');
  const [durationHours, setDurationHours] = useState<number>(1);
  const { data, isLoading, error } = useWorkloadMetricSeries(durationHours);
  const selectedRangeLabel = useMemo(() => getDurationLabel(durationHours), [durationHours]);

  const chartPayload = useMemo(() => {
    if (activeTab === 'CPU') {
      const series = toSeriesData(data?.cpu ?? [], durationHours);
      return {
        labels: series.labels,
        values: series.values,
        datasetLabel: 'Workload CPU (millicores)',
        color: '#00a7a0',
        isBytes: false,
        ySuffix: 'm',
      };
    }

    if (activeTab === 'Memory') {
      const series = toSeriesData(data?.memory ?? [], durationHours);
      return {
        labels: series.labels,
        values: series.values,
        datasetLabel: 'Workload memory (bytes)',
        color: '#c93dce',
        isBytes: true,
        ySuffix: 'B',
      };
    }

    if (activeTab === 'Network') {
      const series = toSeriesData(data?.network ?? [], durationHours);
      return {
        labels: series.labels,
        values: series.values,
        datasetLabel: 'Workload network (bytes)',
        color: '#64c5d6',
        isBytes: true,
        ySuffix: 'B',
      };
    }

    const series = toSeriesData(data?.filesystem ?? [], durationHours);
    return {
      labels: series.labels,
      values: series.values,
      datasetLabel: 'Workload filesystem (bytes)',
      color: '#f59e0b',
      isBytes: true,
      ySuffix: 'B',
    };
  }, [activeTab, data, durationHours]);

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
          label: (ctx) => {
            const value = Number(ctx.parsed.y ?? 0);
            const formattedValue = chartPayload.isBytes
              ? formatBytes(value)
              : `${value}${chartPayload.ySuffix}`;
            return `${ctx.dataset.label}: ${formattedValue}`;
          },
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
          callback: (value) => {
            const numericValue = Number(value);
            return chartPayload.isBytes
              ? formatBytes(numericValue)
              : `${numericValue}${chartPayload.ySuffix}`;
          },
        },
      },
    },
  };

  const noSeries = chartPayload.values.length === 0;

  return (
    <ResourceMetricsPanel
      tabs={WORKLOAD_METRIC_TABS}
      activeTab={activeTab}
      onTabChange={setActiveTab}
      isLoading={isLoading}
      error={error instanceof Error ? error.message : null}
    >
      {/* Duration filter */}
      <div className="flex items-center gap-1 mb-2">
        {DURATION_OPTIONS.map((opt) => (
          <button
            key={opt.hours}
            type="button"
            onClick={() => setDurationHours(opt.hours)}
            className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${
              durationHours === opt.hours
                ? 'bg-primary text-white'
                : 'text-text-secondary hover:text-text hover:bg-hover'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
      <div className="mb-2 text-[11px] text-text-secondary">
        Showing: now-{selectedRangeLabel} to now (realtime)
      </div>
      {noSeries ? (
        <div className="h-52 flex items-center justify-center text-sm text-text-secondary">Waiting for workload metric samples...</div>
      ) : (
        <div className="h-52">
          <Line data={lineData} options={options} />
        </div>
      )}
    </ResourceMetricsPanel>
  );
};
