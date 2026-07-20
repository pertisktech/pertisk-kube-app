import { useId, useMemo } from 'react';

export type PieSlice = {
  name: string;
  value: number;
  color: string;
};

function polarToCartesian(cx: number, cy: number, radius: number, angleDeg: number) {
  // 0° at 12 o'clock, clockwise positive.
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return {
    x: cx + radius * Math.cos(rad),
    y: cy + radius * Math.sin(rad),
  };
}

function describeDonutSlice(
  cx: number,
  cy: number,
  innerRadius: number,
  outerRadius: number,
  startAngle: number,
  endAngle: number,
) {
  const sweep = Math.max(0, endAngle - startAngle);
  if (sweep <= 0) return '';

  // Full circle needs a tiny gap or SVG arc collapses.
  const safeEnd = sweep >= 359.999 ? startAngle + 359.999 : endAngle;
  const largeArc = safeEnd - startAngle > 180 ? 1 : 0;

  const startOuter = polarToCartesian(cx, cy, outerRadius, startAngle);
  const endOuter = polarToCartesian(cx, cy, outerRadius, safeEnd);
  const startInner = polarToCartesian(cx, cy, innerRadius, safeEnd);
  const endInner = polarToCartesian(cx, cy, innerRadius, startAngle);

  return [
    `M ${startOuter.x} ${startOuter.y}`,
    `A ${outerRadius} ${outerRadius} 0 ${largeArc} 1 ${endOuter.x} ${endOuter.y}`,
    `L ${startInner.x} ${startInner.y}`,
    `A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${endInner.x} ${endInner.y}`,
    'Z',
  ].join(' ');
}

function describeSemiArc(
  cx: number,
  cy: number,
  radius: number,
  startAngle: number,
  endAngle: number,
) {
  const start = polarToCartesian(cx, cy, radius, startAngle);
  const end = polarToCartesian(cx, cy, radius, endAngle);
  const largeArc = Math.abs(endAngle - startAngle) > 180 ? 1 : 0;
  // Sweep flag 1 = clockwise (matches our angle convention).
  return `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArc} 1 ${end.x} ${end.y}`;
}

type SvgDonutChartProps = {
  slices: PieSlice[];
  size?: number;
  innerRatio?: number;
  className?: string;
  formatValue?: (value: number, name: string) => string;
};

/** Circular donut pie (SVG). Never stretches into a rectangle. */
export const SvgDonutChart = ({
  slices,
  size = 144,
  innerRatio = 0.62,
  className = '',
  formatValue,
}: SvgDonutChartProps) => {
  const titleId = useId();
  const cx = size / 2;
  const cy = size / 2;
  const outerRadius = size / 2 - 2;
  const innerRadius = outerRadius * innerRatio;

  const arcs = useMemo(() => {
    const total = slices.reduce((sum, slice) => sum + Math.max(0, slice.value), 0);
    if (total <= 0) {
      return [
        {
          name: 'Empty',
          color: 'var(--color-border)',
          value: 0,
          path: describeDonutSlice(cx, cy, innerRadius, outerRadius, 0, 360),
        },
      ];
    }

    let angle = 0;
    return slices.map((slice) => {
      const sweep = (Math.max(0, slice.value) / total) * 360;
      const startAngle = angle;
      const endAngle = angle + sweep;
      angle = endAngle;
      return {
        name: slice.name,
        color: slice.color,
        value: slice.value,
        path: describeDonutSlice(cx, cy, innerRadius, outerRadius, startAngle, endAngle),
      };
    }).filter((arc) => arc.path);
  }, [cx, cy, innerRadius, outerRadius, slices]);

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      preserveAspectRatio="xMidYMid meet"
      className={`w-full h-auto aspect-square ${className}`}
      role="img"
      aria-labelledby={titleId}
    >
      <title id={titleId}>Capacity chart</title>
      {arcs.map((arc) => (
        <path key={`${arc.name}-${arc.value}-${arc.color}`} d={arc.path} fill={arc.color}>
          <title>
            {formatValue
              ? `${arc.name}: ${formatValue(arc.value, arc.name)}`
              : `${arc.name}: ${arc.value}`}
          </title>
        </path>
      ))}
    </svg>
  );
};

type SvgNestedDonutChartProps = {
  rings: PieSlice[][];
  size?: number;
  className?: string;
  formatValue?: (value: number, name: string) => string;
};

/** Concentric donut rings for usage / requests / limits. */
export const SvgNestedDonutChart = ({
  rings,
  size = 144,
  className = '',
  formatValue,
}: SvgNestedDonutChartProps) => {
  const titleId = useId();
  const cx = size / 2;
  const cy = size / 2;
  const maxRadius = size / 2 - 2;
  const ringCount = Math.max(rings.length, 1);
  const ringWidth = maxRadius / (ringCount + 0.35);

  const ringArcs = useMemo(() => {
    return rings.map((slices, ringIndex) => {
      const outerRadius = maxRadius - ringIndex * ringWidth;
      const innerRadius = Math.max(2, outerRadius - ringWidth * 0.82);
      const total = slices.reduce((sum, slice) => sum + Math.max(0, slice.value), 0);
      if (total <= 0) return [];

      let angle = 0;
      return slices.map((slice) => {
        const sweep = (Math.max(0, slice.value) / total) * 360;
        const startAngle = angle;
        const endAngle = angle + sweep;
        angle = endAngle;
        return {
          key: `${ringIndex}-${slice.name}`,
          name: slice.name,
          color: slice.color,
          value: slice.value,
          path: describeDonutSlice(cx, cy, innerRadius, outerRadius, startAngle, endAngle),
        };
      }).filter((arc) => arc.path);
    });
  }, [cx, cy, maxRadius, ringWidth, rings]);

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      preserveAspectRatio="xMidYMid meet"
      className={`w-full h-auto aspect-square ${className}`}
      role="img"
      aria-labelledby={titleId}
    >
      <title id={titleId}>Nested capacity chart</title>
      {ringArcs.flat().map((arc) => (
        <path key={arc.key} d={arc.path} fill={arc.color}>
          <title>
            {formatValue
              ? `${arc.name}: ${formatValue(arc.value, arc.name)}`
              : `${arc.name}: ${arc.value}`}
          </title>
        </path>
      ))}
    </svg>
  );
};

type SvgGaugeChartProps = {
  percent: number;
  usedColor: string;
  remainingColor: string;
  size?: number;
  thickness?: number;
  className?: string;
};

/** Semicircle usage gauge (SVG). */
export const SvgGaugeChart = ({
  percent,
  usedColor,
  remainingColor,
  size = 160,
  thickness = 16,
  className = '',
}: SvgGaugeChartProps) => {
  const titleId = useId();
  const clamped = Math.min(Math.max(percent, 0), 100);
  const width = size;
  const height = size / 2 + 8;
  const cx = width / 2;
  const cy = height - 4;
  const radius = width / 2 - thickness / 2 - 2;

  // Left (270°) → right (450°/90°) through the top.
  const usedEnd = 270 + (clamped / 100) * 180;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="xMidYMid meet"
      className={`w-full h-auto ${className}`}
      style={{ aspectRatio: `${width} / ${height}` }}
      role="img"
      aria-labelledby={titleId}
    >
      <title id={titleId}>{`${clamped.toFixed(0)}% usage`}</title>
      <path
        d={describeSemiArc(cx, cy, radius, 270, 450)}
        fill="none"
        stroke={remainingColor}
        strokeWidth={thickness}
        strokeLinecap="butt"
      />
      {clamped > 0 && (
        <path
          d={describeSemiArc(cx, cy, radius, 270, usedEnd)}
          fill="none"
          stroke={usedColor}
          strokeWidth={thickness}
          strokeLinecap="butt"
        />
      )}
    </svg>
  );
};

export type BarDatum = {
  label: string;
  value: number;
  color?: string;
};

type SvgBarChartProps = {
  data: BarDatum[];
  height?: number;
  barColor?: string;
  className?: string;
};

/** Simple vertical bar chart (SVG). */
export const SvgBarChart = ({
  data,
  height = 220,
  barColor = '#25a7a0',
  className = '',
}: SvgBarChartProps) => {
  const titleId = useId();
  const width = 360;
  const padding = { top: 16, right: 12, bottom: 56, left: 36 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const maxValue = Math.max(1, ...data.map((item) => item.value));
  const barGap = 8;
  const barWidth =
    data.length > 0 ? Math.max(12, (plotWidth - barGap * (data.length - 1)) / data.length) : 12;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="xMidYMid meet"
      className={`w-full h-auto ${className}`}
      style={{ aspectRatio: `${width} / ${height}` }}
      role="img"
      aria-labelledby={titleId}
    >
      <title id={titleId}>Bar chart</title>
      {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
        const y = padding.top + plotHeight * (1 - ratio);
        const label = Math.round(maxValue * ratio);
        return (
          <g key={ratio}>
            <line
              x1={padding.left}
              x2={width - padding.right}
              y1={y}
              y2={y}
              stroke="var(--color-border)"
              strokeWidth={1}
            />
            <text
              x={padding.left - 8}
              y={y + 4}
              textAnchor="end"
              fontSize="10"
              fill="var(--color-text-secondary)"
            >
              {label}
            </text>
          </g>
        );
      })}

      {data.map((item, index) => {
        const barHeight = (item.value / maxValue) * plotHeight;
        const x = padding.left + index * (barWidth + barGap);
        const y = padding.top + plotHeight - barHeight;
        const label = item.label.length > 10 ? `${item.label.slice(0, 9)}…` : item.label;
        return (
          <g key={`${item.label}-${index}`}>
            <rect
              x={x}
              y={y}
              width={barWidth}
              height={Math.max(barHeight, item.value > 0 ? 2 : 0)}
              rx={4}
              fill={item.color || barColor}
            >
              <title>{`${item.label}: ${item.value}`}</title>
            </rect>
            <text
              x={x + barWidth / 2}
              y={height - padding.bottom + 14}
              textAnchor="middle"
              fontSize="10"
              fill="var(--color-text-secondary)"
              transform={`rotate(-35 ${x + barWidth / 2} ${height - padding.bottom + 14})`}
            >
              {label}
            </text>
          </g>
        );
      })}
    </svg>
  );
};
