import { createContext, useContext, useEffect, useMemo, useState } from 'react';

const FEATURE_SETTINGS_KEY = 'pertisk_feature_settings_v1';

export type FeatureThemePreference = 'auto' | 'light' | 'dark';

export interface EditorVisualSettings {
  fontName: string;
  fontSize: number;
  theme: FeatureThemePreference;
}

export interface FeatureSettings {
  terminal: EditorVisualSettings;
  yamlEditor: EditorVisualSettings;
  helmRepoUrl: string;
}

interface FeatureSettingsContextValue {
  settings: FeatureSettings;
  setSettings: (next: FeatureSettings) => void;
}

const DEFAULT_SETTINGS: FeatureSettings = {
  terminal: {
    fontName: 'JetBrains Mono',
    fontSize: 13,
    theme: 'auto',
  },
  yamlEditor: {
    fontName: 'JetBrains Mono',
    fontSize: 13,
    theme: 'auto',
  },
  helmRepoUrl: '',
};

const FeatureSettingsContext = createContext<FeatureSettingsContextValue | null>(null);

function clampFontSize(value: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(32, Math.max(10, Math.round(value)));
}

function normalizeTheme(value: unknown): FeatureThemePreference {
  if (value === 'light' || value === 'dark' || value === 'auto') return value;
  return 'auto';
}

function normalizeVisualSettings(value: unknown, fallback: EditorVisualSettings): EditorVisualSettings {
  if (!value || typeof value !== 'object') return fallback;
  const source = value as Partial<EditorVisualSettings>;

  const fontName = typeof source.fontName === 'string' && source.fontName.trim()
    ? source.fontName.trim()
    : fallback.fontName;

  return {
    fontName,
    fontSize: clampFontSize(Number(source.fontSize), fallback.fontSize),
    theme: normalizeTheme(source.theme),
  };
}

function normalizeSettings(value: unknown): FeatureSettings {
  if (!value || typeof value !== 'object') return DEFAULT_SETTINGS;
  const source = value as Partial<FeatureSettings>;

  return {
    terminal: normalizeVisualSettings(source.terminal, DEFAULT_SETTINGS.terminal),
    yamlEditor: normalizeVisualSettings(source.yamlEditor, DEFAULT_SETTINGS.yamlEditor),
    helmRepoUrl: typeof source.helmRepoUrl === 'string' ? source.helmRepoUrl.trim() : '',
  };
}

function readStoredSettings(): FeatureSettings {
  if (typeof window === 'undefined') return DEFAULT_SETTINGS;

  try {
    const raw = window.localStorage.getItem(FEATURE_SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    return normalizeSettings(JSON.parse(raw));
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function FeatureSettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettingsState] = useState<FeatureSettings>(() => readStoredSettings());

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(FEATURE_SETTINGS_KEY, JSON.stringify(settings));
  }, [settings]);

  const value = useMemo<FeatureSettingsContextValue>(() => ({
    settings,
    setSettings: (next) => setSettingsState(normalizeSettings(next)),
  }), [settings]);

  return (
    <FeatureSettingsContext.Provider value={value}>
      {children}
    </FeatureSettingsContext.Provider>
  );
}

export function useFeatureSettings() {
  const ctx = useContext(FeatureSettingsContext);
  if (!ctx) {
    throw new Error('useFeatureSettings must be used within FeatureSettingsProvider');
  }
  return ctx;
}
