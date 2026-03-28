import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';
import { useTheme } from '../context/ThemeContext';
import { LoadingState } from './LoadingState';

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
  const theme = useTheme();
  const isDark = theme?.isDark;

  if (isLoading) {
    return (
      <LoadingState className="h-64" />
    );
  }

  const percent = Math.min(Math.max(value, 0), 100);

  // Determine status color based on usage
  const statusColor = percent > 90 ? '#ef4444' : percent > 70 ? '#eab308' : '#3b82f6';

  const usedValue = percent;
  const remainingValue = 100 - percent;

  const remainingColor = isDark ? 'rgba(107, 114, 128, 0.2)' : 'rgba(107, 114, 128, 0.15)';

  const data = [
    { name: 'used', value: usedValue },
    { name: 'remaining', value: remainingValue },
  ];

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
      <div className="h-40 -mx-4 relative">
        <ResponsiveContainer width="100%" height={160} minHeight={160} aspect={undefined}>
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="95%"
              startAngle={180}
              endAngle={0}
              innerRadius={45}
              outerRadius={65}
              paddingAngle={2}
              dataKey="value"
              stroke="none"
            >
              <Cell fill={statusColor} />
              <Cell fill={remainingColor} />
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        {/* Center text */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <span
            className="text-2xl font-bold"
            style={{ color: statusColor }}
          >
            {percent.toFixed(0)}%
          </span>
        </div>
      </div>
    </div>
  );
};
