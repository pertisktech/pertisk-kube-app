import { SvgGaugeChart } from './SvgCharts';

type GaugeDoughnutProps = {
  percent: number;
  usedColor: string;
  remainingColor: string;
  className?: string;
};

export const GaugeDoughnut = ({
  percent,
  usedColor,
  remainingColor,
  className = 'w-full',
}: GaugeDoughnutProps) => {
  return (
    <div className={className}>
      <SvgGaugeChart
        percent={percent}
        usedColor={usedColor}
        remainingColor={remainingColor}
        size={160}
        thickness={16}
        className="w-full h-auto"
      />
    </div>
  );
};
