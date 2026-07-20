import { useMemo } from 'react';
import { usePods, useNodes } from '../hooks/useKubernetes';
import { useRealtimePods } from '../hooks/useRealtimePods';
import { useRealtimeNodes } from '../hooks/useRealtimeResources';
import type { Pod } from '../types';
import { Card } from './Card';
import { LoadingState } from './LoadingState';
import { SvgDonutChart, type PieSlice } from './charts/SvgCharts';

const CHART_PRIMARY = '#25a7a0';

const POD_STATUS_COLORS: Record<string, string> = {
  Running: CHART_PRIMARY,
  Pending: '#f59e0b',
  Failed: '#ef4444',
  Succeeded: '#6366f1',
  Unknown: '#8b5cf6',
};

function ChartLegend({ items }: { items: PieSlice[] }) {
  return (
    <div className="mt-4 flex flex-wrap justify-center gap-x-4 gap-y-2">
      {items.map((item) => (
        <div key={item.name} className="flex items-center gap-2 text-xs text-text-secondary">
          <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
          <span>
            {item.name}: <span className="text-text font-medium tabular-nums">{item.value}</span>
          </span>
        </div>
      ))}
    </div>
  );
}

export const MetricsCharts = () => {
  const { data: apiPods, isLoading: apiPodsLoading } = usePods();
  const { data: apiNodes, isLoading: apiNodesLoading } = useNodes();
  const { data: realtimePods, isLoading: realtimePodsLoading } = useRealtimePods<Pod>({ enabled: true });
  const { data: realtimeNodes, isLoading: realtimeNodesLoading } = useRealtimeNodes();

  const pods = useMemo(() => {
    const realtime = realtimePods ?? [];
    const api = apiPods ?? [];
    return realtime.length > 0 ? realtime : api;
  }, [realtimePods, apiPods]);

  const nodes = useMemo(() => {
    const realtime = realtimeNodes ?? [];
    const api = apiNodes ?? [];
    return realtime.length > 0 ? realtime : api;
  }, [realtimeNodes, apiNodes]);

  const podStatusSlices = useMemo<PieSlice[]>(() => {
    const counts = {
      Running: 0,
      Pending: 0,
      Failed: 0,
      Succeeded: 0,
      Unknown: 0,
    };

    for (const pod of pods ?? []) {
      const status = (pod.status || pod.phase || 'Unknown').trim();
      const normalized = status.toLowerCase();
      if (normalized === 'running') counts.Running += 1;
      else if (normalized === 'pending') counts.Pending += 1;
      else if (normalized === 'failed') counts.Failed += 1;
      else if (normalized === 'succeeded' || normalized === 'completed') counts.Succeeded += 1;
      else counts.Unknown += 1;
    }

    return Object.entries(counts)
      .filter(([, value]) => value > 0)
      .map(([name, value]) => ({
        name,
        value,
        color: POD_STATUS_COLORS[name] || POD_STATUS_COLORS.Unknown,
      }));
  }, [pods]);

  const nodeStatusSlices = useMemo<PieSlice[]>(() => {
    const readyNodes = nodes?.filter((node) => {
      if (typeof node.ready === 'boolean') return node.ready;
      return String(node.ready).toLowerCase() === 'true';
    }).length || 0;
    const notReadyNodes = (nodes?.length || 0) - readyNodes;

    return [
      { name: 'Ready', value: readyNodes, color: CHART_PRIMARY },
      { name: 'Not Ready', value: notReadyNodes, color: '#ef4444' },
    ].filter((slice) => slice.value > 0);
  }, [nodes]);

  const podsByNamespace = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const pod of pods ?? []) {
      const ns = pod.namespace || 'default';
      counts[ns] = (counts[ns] || 0) + 1;
    }
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([label, value]) => ({ label, value, color: CHART_PRIMARY }));
  }, [pods]);

  if ((realtimePodsLoading && apiPodsLoading) || (realtimeNodesLoading && apiNodesLoading)) {
    return (
      <Card title="Metrics Overview">
        <LoadingState className="h-64" />
      </Card>
    );
  }

  return (
    <Card title="Metrics Overview">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="flex flex-col items-center">
          <h3 className="text-lg font-semibold text-text mb-4">Pod Status Distribution</h3>
          <div className="w-full max-w-[240px]">
            {podStatusSlices.length > 0 ? (
              <SvgDonutChart slices={podStatusSlices} size={220} innerRatio={0.58} />
            ) : (
              <p className="text-sm text-text-secondary text-center py-16">No pods found</p>
            )}
          </div>
          <ChartLegend items={podStatusSlices} />
        </div>

        <div className="flex flex-col items-center">
          <h3 className="text-lg font-semibold text-text mb-4">Node Status</h3>
          <div className="w-full max-w-[240px]">
            {nodeStatusSlices.length > 0 ? (
              <SvgDonutChart slices={nodeStatusSlices} size={220} innerRatio={0.58} />
            ) : (
              <p className="text-sm text-text-secondary text-center py-16">No nodes found</p>
            )}
          </div>
          <ChartLegend items={nodeStatusSlices} />
        </div>

        <div className="flex flex-col items-center w-full">
          <h3 className="text-lg font-semibold text-text mb-4">Pods by Namespace</h3>
          <div className="w-full max-w-[240px]">
            {podsByNamespace.length > 0 ? (
              <div className="space-y-3 pt-2">
                {podsByNamespace.map((item) => {
                  const max = Math.max(1, ...podsByNamespace.map((entry) => entry.value));
                  const widthPct = Math.max(4, (item.value / max) * 100);
                  return (
                    <div key={item.label} className="space-y-1.5">
                      <div className="flex items-center justify-between gap-2 text-xs text-text-secondary">
                        <span className="truncate" title={item.label}>{item.label}</span>
                        <span className="text-text font-medium tabular-nums shrink-0">{item.value}</span>
                      </div>
                      <div className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--color-border)' }}>
                        <div
                          className="h-full rounded-full transition-[width]"
                          style={{ width: `${widthPct}%`, backgroundColor: item.color || CHART_PRIMARY }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-text-secondary text-center py-16">No pods found</p>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
};
