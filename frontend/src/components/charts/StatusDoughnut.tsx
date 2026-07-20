import { SvgDonutChart, type PieSlice } from './SvgCharts';

type StatusDoughnutProps = {
  slices: PieSlice[];
  total: number;
  className?: string;
};

export const StatusDoughnut = ({
  slices,
  total,
  className = 'mx-auto w-[180px] h-[180px]',
}: StatusDoughnutProps) => {
  return (
    <div className={className}>
      <SvgDonutChart
        slices={slices}
        size={180}
        innerRatio={0.55}
        formatValue={(value) => {
          const pct = total > 0 ? ((value / total) * 100).toFixed(1) : '0';
          return `${value} (${pct}%)`;
        }}
      />
    </div>
  );
};
