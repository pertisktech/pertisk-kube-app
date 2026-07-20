import { LoadingState } from './LoadingState';
import { GaugeDoughnut } from './charts/GaugeDoughnut';

interface ResourceGaugeChartProps {
  label: string;
  value: number; // 0-100
  used: string;
  total: string;
  icon: React.ReactNode;
  isLoading?: boolean;
}

export const ResourceGaugeChart = ({
  label,
  value,
  used,
  total,
  icon,
  isLoading = false,
}: ResourceGaugeChartProps) => {
  if (isLoading) {
    return (
      <LoadingState className="h-64" />
    );
  }

  const percent = Math.min(Math.max(value, 0), 100);
  const statusColor = percent > 90 ? '#ef4444' : percent > 70 ? '#eab308' : '#3b82f6';
  const remainingColor = 'var(--color-border)';

  return (
    <div className="bg-surface-elevated border border-border rounded-lg p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          {icon}
          <span className="text-sm font-semibold text-text">{label}</span>
        </div>
        <span className="text-sm font-bold" style={{ color: statusColor }}>
          {percent.toFixed(1)}%
        </span>
      </div>
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xs text-text-secondary">
          {used} / {total}
        </span>
      </div>
      <div className="relative mx-auto w-full max-w-[180px]">
        <GaugeDoughnut
          percent={percent}
          usedColor={statusColor}
          remainingColor={remainingColor}
          className="w-full"
        />
        <div className="absolute inset-x-0 bottom-1 flex justify-center pointer-events-none">
          <span className="text-2xl font-bold" style={{ color: statusColor }}>
            {percent.toFixed(0)}%
          </span>
        </div>
      </div>
    </div>
  );
};
