import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import { useTheme } from "../context/ThemeContext";

interface GaugeChartProps {
  value: number; // 0-100
  color: string;
  label: string;
  used: string;
  total: string;
  icon: React.ReactNode;
}

export const GaugeChart = ({ value, color, label, used, total, icon }: GaugeChartProps) => {
  const theme = useTheme();
  const isDark = theme?.isDark ?? true;
  const percent = Math.min(Math.max(value, 0), 100);

  // Determine status color based on usage
  const statusColor = percent > 90 ? "#ef4444" : percent > 70 ? "#eab308" : color;

  // Create data for the gauge - used portion and remaining portion
  const usedValue = percent;
  const remainingValue = 100 - percent;

  // Use a subtle background color that works with both light and dark themes
  const remainingColor = isDark ? "rgba(107, 114, 128, 0.15)" : "rgba(209, 213, 219, 0.15)";

  const data = [
    { name: "used", value: usedValue, color: statusColor },
    { name: "remaining", value: remainingValue, color: remainingColor },
  ];

  return (
    <div className="mb-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          {icon}
          <span
            className="text-sm font-semibold"
            style={{ color: isDark ? "#e5e7eb" : "#1f2937" }}
          >
            {label}
          </span>
        </div>
        <span className="text-sm font-bold" style={{ color: statusColor }}>
          {percent.toFixed(1)}%
        </span>
      </div>
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xs" style={{ color: isDark ? "#9ca3af" : "#6b7280" }}>
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
