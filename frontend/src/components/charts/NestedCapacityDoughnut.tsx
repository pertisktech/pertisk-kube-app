import { SvgNestedDonutChart, type PieSlice } from './SvgCharts';

export type NestedRing = {
  slices: PieSlice[];
};

type NestedCapacityDoughnutProps = {
  rings: NestedRing[];
  formatValue?: (value: number, name: string) => string;
  formatTitle?: () => string;
  className?: string;
};

export const NestedCapacityDoughnut = ({
  rings,
  formatValue,
  className = 'mx-auto w-[144px] h-[144px]',
}: NestedCapacityDoughnutProps) => {
  return (
    <div className={className}>
      <SvgNestedDonutChart
        rings={rings.map((ring) => ring.slices)}
        size={144}
        formatValue={formatValue}
      />
    </div>
  );
};
