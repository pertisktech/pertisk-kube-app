import { SvgDonutChart, type PieSlice } from './SvgCharts';

type CapacityDoughnutProps = {
  slices: PieSlice[];
  formatValue?: (value: number, name: string) => string;
  formatTitle?: () => string;
  cutout?: string;
  className?: string;
};

export const CapacityDoughnut = ({
  slices,
  formatValue,
  className = 'mx-auto w-[144px] h-[144px]',
}: CapacityDoughnutProps) => {
  return (
    <div className={className} title={undefined}>
      <SvgDonutChart slices={slices} size={144} formatValue={formatValue} />
    </div>
  );
};
