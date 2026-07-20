import {
  Chart as ChartJS,
  ArcElement,
  Tooltip,
  Legend,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
} from 'chart.js';

let registered = false;

/** Register Chart.js controllers/elements once for the whole app. */
export function ensureChartJsRegistered() {
  if (registered) return;
  ChartJS.register(
    ArcElement,
    Tooltip,
    Legend,
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    BarElement,
    Title,
  );
  registered = true;
}

/** Resolve CSS colors (including nested `var(...)`) to a canvas-safe value. */
export function resolveCssColor(color: string, fallback = '#737373'): string {
  if (!color) return fallback;
  if (typeof window === 'undefined') {
    return color.includes('var(') ? fallback : color;
  }
  if (!color.includes('var(') && !color.includes('color-mix(')) {
    return color;
  }

  const probe = document.createElement('span');
  probe.style.cssText = 'position:absolute;left:-9999px;top:0;visibility:hidden;pointer-events:none;';
  probe.style.color = color;
  document.body.appendChild(probe);
  const resolved = getComputedStyle(probe).color;
  document.body.removeChild(probe);

  if (!resolved || resolved === 'rgba(0, 0, 0, 0)' || resolved === 'transparent') {
    return fallback;
  }
  return resolved;
}

export type DoughnutSlice = {
  name: string;
  value: number;
  color: string;
};
