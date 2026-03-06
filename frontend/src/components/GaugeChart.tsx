import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";

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

  // Determine status color based on usage
  const getStatusColor = (): string => {
    if (percent > 90) {
      return 'var(--color-dashboard-danger)';
    } else if (percent > 70) {
      return 'var(--color-dashboard-warning)';
    }
    return color;
  };

  const statusColor = getStatusColor();

  // Create data for the gauge - used portion and remaining portion
  const usedValue = percent;
  const remainingValue = 100 - percent;

  // Use theme-aware background color
  const remainingColor = 'var(--color-border)';

  const data = [
    { name: "used", value: usedValue, color: statusColor },
    { name: "remaining", value: remainingValue, color: remainingColor },
  ];

  return (
    <div className="mb-4">
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
      <div className="h-36 -mx-2 relative">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="95%"
              startAngle={180}
              endAngle={0}
              innerRadius={55}
              outerRadius={75}
              paddingAngle={2}
              dataKey="value"
              stroke="none"
            >
              {data.map((entry, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={entry.color}
                  style={{
                    transition: "all 0.3s ease",
                  }}
                />
              ))}
            </Pie>
            {/* Center text showing percentage */}
            <text
              x="50%"
              y="78%"
              textAnchor="middle"
              dominantBaseline="middle"
              style={{
                fontSize: "28px",
                fontWeight: "bold",
                fill: statusColor,
                fontFamily: "system-ui, -apple-system, sans-serif",
              }}
            >
              {percent.toFixed(0)}%
            </text>
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
