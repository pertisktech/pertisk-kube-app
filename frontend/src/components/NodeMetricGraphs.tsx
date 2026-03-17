import { useEffect, useMemo, useState } from 'react';
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
import { Cpu, Database, HardDrive, Boxes } from './Icons';
import type { K8sNode, Pod } from '../types';
import { parseK8sMemoryToGB } from '../utils';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend, Filler);

type NodeMetricTab = 'CPU' | 'Memory' | 'Disk' | 'Pods';

const NODE_METRIC_TABS: readonly MetricTab<NodeMetricTab>[] = [
  { id: 'CPU',    label: 'CPU Usage',     icon: Cpu,       color: '#00a7a0' },
  { id: 'Memory', label: 'Memory Usage',  icon: Database,  color: '#c93dce' },
  { id: 'Disk',   label: 'Disk Usage',    icon: HardDrive, color: '#f59e0b' },
  { id: 'Pods',   label: 'Pod Capacity',  icon: Boxes,     color: '#30b24d' },
];

interface NodeMetricGraphsProps {
  nodes: K8sNode[];
  pods: Pod[];
}

interface TrendPoint {
  timestamp: number;
  value: number;
}

interface TrendHistory {
  CPU: TrendPoint[];
  Memory: TrendPoint[];
  Disk: TrendPoint[];
  Pods: TrendPoint[];
}

// Keep up to 24 h of history at 15 s intervals
const MAX_POINTS = 5760;
const SAMPLE_INTERVAL_MS = 15_000;

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

const toPercent = (value?: number) => {
  if (value == null || Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(100, value));
};

const parseQuantity = (value?: string): number => {
  if (!value) return 0;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const resolveNodeMemoryUsedGb = (node: K8sNode): number => {
  const directUsedGb = parseK8sMemoryToGB(node.memory_used);
  if (directUsedGb > 0) return directUsedGb;

  const totalGb = parseK8sMemoryToGB(node.memory);
  const usagePercent = toPercent(node.memory_usage_percent);
  if (totalGb > 0 && usagePercent > 0) return (totalGb * usagePercent) / 100;

  return 0;
};

const formatTimestampLabel = (unixMs: number, durationHours: number) => {
  const dt = new Date(unixMs);
  if (durationHours <= 4) {
    return dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }
  if (durationHours <= 48) {
    return dt.toLocaleTimeString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  }
  return dt.toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
};

export const NodeMetricGraphs = ({ nodes, pods }: NodeMetricGraphsProps) => {
  const [activeTab, setActiveTab] = useState<NodeMetricTab>('CPU');
  const [durationHours, setDurationHours] = useState<number>(1);
  const selectedRangeLabel = useMemo(() => getDurationLabel(durationHours), [durationHours]);
  const [history, setHistory] = useState<TrendHistory>({
    CPU: [],
    Memory: [],
    Disk: [],
    Pods: [],
  });

  const currentSnapshot = useMemo(() => {
    const cpuSamples = nodes
      .map((node) => node.cpu_usage_percent)
      .filter((value): value is number => value != null && Number.isFinite(value));
    const memoryUsedGbSamples = nodes
      .map((node) => resolveNodeMemoryUsedGb(node))
      .filter((value): value is number => value > 0 && Number.isFinite(value));
    const diskSamples = nodes
      .map((node) => node.ephemeral_storage_usage_percent)
      .filter((value): value is number => value != null && Number.isFinite(value));

    const avg = (values: number[]) => {
      if (values.length === 0) return 0;
      return values.reduce((sum, value) => sum + value, 0) / values.length;
    };

    const totalPodCapacity = nodes.reduce((sum, node) => sum + parseQuantity(node.pods), 0);
    const podUsagePercent = totalPodCapacity > 0 ? (pods.length / totalPodCapacity) * 100 : 0;

    return {
      CPU: Number(toPercent(avg(cpuSamples)).toFixed(2)),
      Memory: Number(avg(memoryUsedGbSamples).toFixed(2)),
      Disk: Number(toPercent(avg(diskSamples)).toFixed(2)),
      Pods: Number(toPercent(podUsagePercent).toFixed(2)),
    };
  }, [nodes, pods.length]);

  useEffect(() => {
    const appendSnapshot = () => {
      const timestamp = Date.now();
      setHistory((prev) => {
        const next: TrendHistory = {
          CPU: [...prev.CPU, { timestamp, value: currentSnapshot.CPU }],
          Memory: [...prev.Memory, { timestamp, value: currentSnapshot.Memory }],
          Disk: [...prev.Disk, { timestamp, value: currentSnapshot.Disk }],
          Pods: [...prev.Pods, { timestamp, value: currentSnapshot.Pods }],
        };

        return {
          CPU: next.CPU.slice(-MAX_POINTS),
          Memory: next.Memory.slice(-MAX_POINTS),
          Disk: next.Disk.slice(-MAX_POINTS),
          Pods: next.Pods.slice(-MAX_POINTS),
        };
      });
    };

    appendSnapshot();
    const timer = window.setInterval(appendSnapshot, SAMPLE_INTERVAL_MS);

    return () => window.clearInterval(timer);
  }, [currentSnapshot]);

  const chartPayload = useMemo(() => {
    const cutoff = Date.now() - durationHours * 3600 * 1000;
    const points = history[activeTab].filter((p) => p.timestamp >= cutoff);
    const labels = points.map((point) => formatTimestampLabel(point.timestamp, durationHours));

    if (activeTab === 'CPU') {
      return {
        labels,
        data: points.map((point) => point.value),
        datasetLabel: 'Cluster avg CPU usage %',
        color: '#00a7a0',
        yLabel: '%',
      };
    }

    if (activeTab === 'Memory') {
      return {
        labels,
        data: points.map((point) => point.value),
        datasetLabel: 'Node memory used (GB)',
        color: '#c93dce',
        yLabel: ' GB',
      };
    }

    if (activeTab === 'Disk') {
      return {
        labels,
        data: points.map((point) => point.value),
        datasetLabel: 'Cluster avg disk usage %',
        color: '#f59e0b',
        yLabel: '%',
      };
    }

    return {
      labels,
      data: points.map((point) => point.value),
      datasetLabel: 'Pod usage % of total node capacity',
      color: '#30b24d',
      yLabel: '%',
    };
  }, [activeTab, history, durationHours]);

  const data: ChartData<'line'> = {
    labels: chartPayload.labels,
    datasets: [
      {
        label: chartPayload.datasetLabel,
        data: chartPayload.data,
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
          label: (ctx) => `${ctx.dataset.label}: ${ctx.parsed.y}${chartPayload.yLabel}`,
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
        suggestedMax: activeTab === 'Memory' ? undefined : 100,
        grid: { color: 'rgba(120,120,120,0.2)' },
        ticks: {
          color: '#9ca3af',
          callback: (value) => {
            const numericValue = Number(value);
            return activeTab === 'Memory'
              ? `${numericValue.toFixed(numericValue >= 10 ? 1 : 2)} GB`
              : `${numericValue}${chartPayload.yLabel}`;
          },
        },
      },
    },
  };

  const noData = nodes.length === 0;

  return (
    <ResourceMetricsPanel
      tabs={NODE_METRIC_TABS}
      activeTab={activeTab}
      onTabChange={setActiveTab}
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
      {noData ? (
        <div className="h-52 flex items-center justify-center text-sm text-text-secondary">Waiting for node metric samples...</div>
      ) : (
        <div className="h-52">
          <Line data={data} options={options} />
        </div>
      )}
    </ResourceMetricsPanel>
  );
};
