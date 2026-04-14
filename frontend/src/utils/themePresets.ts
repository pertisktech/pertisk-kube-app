import { PTERM_TERMINAL_THEME_PRESETS } from './ptermTerminalThemes';

export type AppThemePresetId = 'flux-violet' | 'ocean-blue' | 'forest-teal' | 'ember-rose';

export type TerminalThemeMode = 'light' | 'dark';

export interface TerminalPalette {
  background: string;
  foreground: string;
  cursor: string;
  selectionBackground: string;
  black: string;
  red: string;
  green: string;
  yellow: string;
  blue: string;
  magenta: string;
  cyan: string;
  white: string;
  brightBlack: string;
  brightRed: string;
  brightGreen: string;
  brightYellow: string;
  brightBlue: string;
  brightMagenta: string;
  brightCyan: string;
  brightWhite: string;
}

export type TerminalThemePresetId = string;

type AppThemePreset = {
  id: AppThemePresetId;
  label: string;
  description: string;
  tokens: Record<string, string>;
};

export type TerminalThemePreset = {
  id: TerminalThemePresetId;
  label: string;
  description: string;
  dark: TerminalPalette;
  light: TerminalPalette;
};

export const APP_THEME_PRESETS: readonly AppThemePreset[] = [
  {
    id: 'flux-violet',
    label: 'Flux Violet',
    description: 'The existing violet desktop palette used across the app.',
    tokens: {
      '--color-primary-p1': '#d8c8fd',
      '--color-primary-p2': '#b89ef9',
      '--color-primary-p3': '#9a7bf7',
      '--color-primary-p4': '#7c59f0',
      '--color-primary-p5': '#5f3fd4',
      '--color-primary-p6': '#281a5e',
      '--color-primary': '#9a7bf7',
      '--color-primary-hover': '#b89ef9',
      '--color-sidebar': '#090a14',
      '--color-bg-gradient-start': '#0c0d18',
      '--color-bg-gradient-end': '#10111e',
      '--color-icon-primary': '#9a7bf7',
      '--color-dashboard-metric-secondary': '#a855f7',
      '--color-dashboard-metric-secondary-bg': 'rgba(168, 85, 247, 0.12)',
      '--color-workload-accent': '#14b8a6',
      '--color-workload-accent-strong': '#0f766e',
    },
  },
  {
    id: 'ocean-blue',
    label: 'Ocean Blue',
    description: 'Cool cobalt accents with a brighter, terminal-like blue edge.',
    tokens: {
      '--color-primary-p1': '#cbe4ff',
      '--color-primary-p2': '#9fcbff',
      '--color-primary-p3': '#71b3ff',
      '--color-primary-p4': '#3e8fff',
      '--color-primary-p5': '#1b68d8',
      '--color-primary-p6': '#10274f',
      '--color-primary': '#71b3ff',
      '--color-primary-hover': '#9fcbff',
      '--color-sidebar': '#08111d',
      '--color-bg-gradient-start': '#08111d',
      '--color-bg-gradient-end': '#0d1728',
      '--color-icon-primary': '#71b3ff',
      '--color-dashboard-metric-secondary': '#38bdf8',
      '--color-dashboard-metric-secondary-bg': 'rgba(56, 189, 248, 0.12)',
      '--color-workload-accent': '#0ea5e9',
      '--color-workload-accent-strong': '#0369a1',
    },
  },
  {
    id: 'forest-teal',
    label: 'Forest Teal',
    description: 'A greener preset with softer mint and teal emphasis.',
    tokens: {
      '--color-primary-p1': '#c9f2e1',
      '--color-primary-p2': '#95e0c1',
      '--color-primary-p3': '#5fcaa2',
      '--color-primary-p4': '#2ca17d',
      '--color-primary-p5': '#14634d',
      '--color-primary-p6': '#0b2e24',
      '--color-primary': '#5fcaa2',
      '--color-primary-hover': '#95e0c1',
      '--color-sidebar': '#07120f',
      '--color-bg-gradient-start': '#091512',
      '--color-bg-gradient-end': '#0d1c17',
      '--color-icon-primary': '#5fcaa2',
      '--color-dashboard-metric-secondary': '#14b8a6',
      '--color-dashboard-metric-secondary-bg': 'rgba(20, 184, 166, 0.12)',
      '--color-workload-accent': '#34d399',
      '--color-workload-accent-strong': '#047857',
    },
  },
  {
    id: 'ember-rose',
    label: 'Ember Rose',
    description: 'Warm red and amber accents for a higher-contrast color story.',
    tokens: {
      '--color-primary-p1': '#ffd5df',
      '--color-primary-p2': '#ffabc0',
      '--color-primary-p3': '#ff7b9c',
      '--color-primary-p4': '#ef5476',
      '--color-primary-p5': '#b9354f',
      '--color-primary-p6': '#4a1622',
      '--color-primary': '#ff7b9c',
      '--color-primary-hover': '#ffabc0',
      '--color-sidebar': '#14090b',
      '--color-bg-gradient-start': '#130c11',
      '--color-bg-gradient-end': '#1b1016',
      '--color-icon-primary': '#ff7b9c',
      '--color-dashboard-metric-secondary': '#fb7185',
      '--color-dashboard-metric-secondary-bg': 'rgba(251, 113, 133, 0.14)',
      '--color-workload-accent': '#f59e0b',
      '--color-workload-accent-strong': '#b45309',
    },
  },
] as const;

export const TERMINAL_THEME_PRESETS: readonly TerminalThemePreset[] = PTERM_TERMINAL_THEME_PRESETS as readonly TerminalThemePreset[];

export function normalizeAppThemePreset(value: unknown): AppThemePresetId {
  return APP_THEME_PRESETS.some((preset) => preset.id === value)
    ? (value as AppThemePresetId)
    : 'flux-violet';
}

export function normalizeTerminalThemePreset(value: unknown): TerminalThemePresetId {
  return TERMINAL_THEME_PRESETS.some((preset) => preset.id === value)
    ? (value as TerminalThemePresetId)
    : 'wild-cherry';
}

export function applyAppThemePreset(root: HTMLElement, presetId: AppThemePresetId) {
  const preset = APP_THEME_PRESETS.find((item) => item.id === presetId) ?? APP_THEME_PRESETS[0];
  Object.entries(preset.tokens).forEach(([token, value]) => {
    root.style.setProperty(token, value);
  });
}

export function resolveTerminalThemePreset(
  presetId: TerminalThemePresetId,
  mode: TerminalThemeMode,
): TerminalPalette {
  const preset = TERMINAL_THEME_PRESETS.find((item) => item.id === presetId) ?? TERMINAL_THEME_PRESETS[0];
  return mode === 'light' ? preset.light : preset.dark;
}