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
import { Cpu, Database } from './Icons';
import type { Pod } from '../types';
import { parseK8sMemoryToGB } from '../utils';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend, Filler);

type PodMetricTab = 'CPU' | 'Memory';

interface PodMetricGraphsProps {
  pod: Pod;
}

interface TrendPoint {
  timestamp: number;
  value: number;
}

interface TrendHistory {
  CPU: TrendPoint[];
  Memory: TrendPoint[];
}

const POD_METRIC_TABS: readonly MetricTab<PodMetricTab>[] = [
  { id: 'CPU', label: 'CPU Usage', icon: Cpu, color: '#00a7a0' },
  { id: 'Memory', label: 'Memory Usage', icon: Database, color: '#c93dce' },
];

const DURATION_OPTIONS: { label: string; hours: number }[] = [
  { label: '1h', hours: 1 },
  { label: '2h', hours: 2 },
  { label: '4h', hours: 4 },
  { label: '24h', hours: 24 },
  { label: '48h', hours: 48 },
  { label: '1w', hours: 168 },
  { label: '1m', hours: 720 },
];

const MAX_POINTS = 5760;
const SAMPLE_INTERVAL_MS = 15_000;

const toPercent = (value?: number) => {
  if (value == null || Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(100, value));
};

const formatTimestampLabel = (unixMs: number, durationHours: number) => {
  const dt = new Date(unixMs);
  if (durationHours <= 4) {
    return dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }
  if (durationHours <= 48) {
    return dt.toLocaleTimeString([], {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }
  return dt.toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const getDurationLabel = (hours: number): string => {
  if (hours === 168) return '1w';
  if (hours === 720) return '1m';
  return `${hours}h`;
};

export const PodMetricGraphs = ({ pod }: PodMetricGraphsProps) => {
  const [activeTab, setActiveTab] = useState<PodMetricTab>('CPU');
  const [durationHours, setDurationHours] = useState<number>(1);
  const [history, setHistory] = useState<TrendHistory>({ CPU: [], Memory: [] });

  const selectedRangeLabel = useMemo(() => getDurationLabel(durationHours), [durationHours]);

  const currentSnapshot = useMemo(() => {
    const cpu = Number(toPercent(pod.cpu_usage_percent).toFixed(2));
    const memoryGb = Number(parseK8sMemoryToGB(pod.memory).toFixed(2));

    return {
      CPU: cpu,
      Memory: memoryGb,
    };
  }, [pod.cpu_usage_percent, pod.memory]);

  useEffect(() => {
    const appendSnapshot = () => {
      const timestamp = Date.now();
      setHistory((prev) => {
        const next: TrendHistory = {
          CPU: [...prev.CPU, { timestamp, value: currentSnapshot.CPU }],
          Memory: [...prev.Memory, { timestamp, value: currentSnapshot.Memory }],
        };

        return {
          CPU: next.CPU.slice(-MAX_POINTS),
          Memory: next.Memory.slice(-MAX_POINTS),
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
        datasetLabel: `Pod ${pod.name} CPU usage %`,
        color: '#00a7a0',
        yLabel: '%',
      };
    }

    return {
      labels,
      data: points.map((point) => point.value),
      datasetLabel: `Pod ${pod.name} memory used (GB)`,
      color: '#c93dce',
      yLabel: ' GB',
    };
  }, [activeTab, durationHours, history, pod.name]);

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
        suggestedMax: activeTab === 'CPU' ? 100 : undefined,
        grid: { color: 'rgba(120,120,120,0.2)' },
        ticks: {
          color: '#9ca3af',
          callback: (value) => {
            const numericValue = Number(value);
            return activeTab === 'Memory'
              ? `${numericValue.toFixed(numericValue >= 10 ? 1 : 2)} GB`
              : `${numericValue}%`;
          },
        },
      },
    },
  };

  return (
    <ResourceMetricsPanel tabs={POD_METRIC_TABS} activeTab={activeTab} onTabChange={setActiveTab}>
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
      <div className="h-52">
        <Line data={data} options={options} />
      </div>
    </ResourceMetricsPanel>
  );
};
