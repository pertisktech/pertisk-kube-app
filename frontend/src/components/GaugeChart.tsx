import { GaugeDoughnut } from './charts/GaugeDoughnut';

interface GaugeChartProps {
  value: number; // 0-100
  color: string;
  label: string;
  used: string;
  total: string;
  icon: React.ReactNode;
}

export const GaugeChart = ({ value, color, label, used, total, icon }: GaugeChartProps) => {
  const percent = Math.min(Math.max(value, 0), 100);

  const getStatusColor = (): string => {
    if (percent > 90) {
      return 'var(--color-dashboard-danger)';
    }
    if (percent > 70) {
      return 'var(--color-dashboard-warning)';
    }
    return color;
  };

  const statusColor = getStatusColor();
  const remainingColor = 'var(--color-border)';

  return (
    <div className="mb-1 w-full flex flex-col items-center">
      <div className="flex items-center justify-between mb-2 w-full gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {icon}
          <span className="text-sm font-semibold text-text truncate">{label}</span>
        </div>
        <span className="text-sm font-bold shrink-0" style={{ color: statusColor }}>
          {percent.toFixed(1)}%
        </span>
      </div>
      <div className="flex items-center gap-2 mb-2 w-full">
        <span className="text-xs text-text-secondary truncate">
          {used} / {total}
        </span>
      </div>
      <div className="relative w-full max-w-[160px]">
        <GaugeDoughnut
          percent={percent}
          usedColor={statusColor}
          remainingColor={remainingColor}
          className="w-full"
        />
        <div className="absolute inset-x-0 bottom-0 flex justify-center pointer-events-none pb-0.5">
          <span
            className="text-[26px] leading-none font-bold"
            style={{
              color: statusColor,
              fontFamily: 'system-ui, -apple-system, sans-serif',
            }}
          >
            {percent.toFixed(0)}%
          </span>
        </div>
      </div>
    </div>
  );
};
