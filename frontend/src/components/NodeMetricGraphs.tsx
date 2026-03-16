import { useEffect, useMemo, useState } from 'react';
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
import { ResourceMetricsPanel, type MetricTab } from './ResourceMetricsPanel';
import { Cpu, Database, HardDrive, Boxes } from './Icons';
import type { K8sNode, Pod } from '../types';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend);

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

const MAX_POINTS = 60;
const SAMPLE_INTERVAL_MS = 15_000;

const toPercent = (value?: number) => {
  if (value == null || Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(100, value));
};

const parseQuantity = (value?: string): number => {
  if (!value) return 0;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const formatTimestampLabel = (unixMs: number) => {
  const dt = new Date(unixMs);
  return dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
};

export const NodeMetricGraphs = ({ nodes, pods }: NodeMetricGraphsProps) => {
  const [activeTab, setActiveTab] = useState<NodeMetricTab>('CPU');
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
    const memorySamples = nodes
      .map((node) => node.memory_usage_percent)
      .filter((value): value is number => value != null && Number.isFinite(value));
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
      Memory: Number(toPercent(avg(memorySamples)).toFixed(2)),
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
    const points = history[activeTab];
    const labels = points.map((point) => formatTimestampLabel(point.timestamp));

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
        datasetLabel: 'Cluster avg memory usage %',
        color: '#c93dce',
        yLabel: '%',
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
  }, [activeTab, history]);

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
        suggestedMax: 100,
        grid: { color: 'rgba(120,120,120,0.2)' },
        ticks: {
          color: '#9ca3af',
          callback: (value) => `${value}${chartPayload.yLabel}`,
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
