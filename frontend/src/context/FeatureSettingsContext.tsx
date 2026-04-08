import { createContext, useContext, useEffect, useMemo, useState } from 'react';

const FEATURE_SETTINGS_KEY = 'pertisk_feature_settings_v1';

export type FeatureThemePreference = 'auto' | 'light' | 'dark';

export interface EditorVisualSettings {
  fontName: string;
  fontSize: number;
  theme: FeatureThemePreference;
}

export interface FeatureSettings {
  general: EditorVisualSettings;
  terminal: EditorVisualSettings;
  yamlEditor: EditorVisualSettings;
  helmRepoUrl: string;
  helmRepositories: HelmRepository[];
}

export interface HelmRepository {
  id: string;
  name: string;
  url: string;
  enabled: boolean;
}

interface FeatureSettingsContextValue {
  settings: FeatureSettings;
  setSettings: (next: FeatureSettings) => void;
}

const DEFAULT_SETTINGS: FeatureSettings = {
  general: {
    fontName: 'Inter',
    fontSize: 15,
    theme: 'dark',
  },
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
  helmRepositories: [
    {
      id: 'bitnami',
      name: 'Bitnami',
      url: 'https://charts.bitnami.com/bitnami',
      enabled: true,
    },
    {
      id: 'prometheus-community',
      name: 'Prometheus Community',
      url: 'https://prometheus-community.github.io/helm-charts',
      enabled: true,
    },
    {
      id: 'ingress-nginx',
      name: 'ingress-nginx',
      url: 'https://kubernetes.github.io/ingress-nginx',
      enabled: true,
    },
  ],
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

  const repos = Array.isArray(source.helmRepositories)
    ? source.helmRepositories
      .map((repo, index) => {
        if (!repo || typeof repo !== 'object') return null;
        const item = repo as Partial<HelmRepository>;
        const name = typeof item.name === 'string' ? item.name.trim() : '';
        const url = typeof item.url === 'string' ? item.url.trim() : '';
        if (!url) return null;
        return {
          id: typeof item.id === 'string' && item.id.trim() ? item.id.trim() : `repo-${index + 1}`,
          name: name || `Repo ${index + 1}`,
          url,
          enabled: item.enabled !== false,
        } satisfies HelmRepository;
      })
      .filter((repo): repo is HelmRepository => Boolean(repo))
    : [];

  const legacyHelmRepoUrl = typeof source.helmRepoUrl === 'string' ? source.helmRepoUrl.trim() : '';
  if (repos.length === 0 && legacyHelmRepoUrl) {
    repos.push({
      id: 'legacy-repo',
      name: 'Custom Repository',
      url: legacyHelmRepoUrl,
      enabled: true,
    });
  }

  const normalizedRepos = repos.length > 0 ? repos : DEFAULT_SETTINGS.helmRepositories;

  return {
    general: normalizeVisualSettings(source.general, DEFAULT_SETTINGS.general),
    terminal: normalizeVisualSettings(source.terminal, DEFAULT_SETTINGS.terminal),
    yamlEditor: normalizeVisualSettings(source.yamlEditor, DEFAULT_SETTINGS.yamlEditor),
    helmRepoUrl: legacyHelmRepoUrl,
    helmRepositories: normalizedRepos,
  };
}

function toFontFamily(fontName: string): string {
  const cleaned = fontName.trim().replace(/"/g, '');
  return cleaned
    ? `"${cleaned}", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`
    : '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
}

function readStoredSettings(): FeatureSettings {
  if (globalThis.window === undefined) return DEFAULT_SETTINGS;

  try {
    const raw = globalThis.window.localStorage.getItem(FEATURE_SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    return normalizeSettings(JSON.parse(raw));
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function FeatureSettingsProvider({ children }: Readonly<{ children: React.ReactNode }>) {
  const [settings, setSettings] = useState(readStoredSettings);

  useEffect(() => {
    if (globalThis.window === undefined) return;
    globalThis.window.localStorage.setItem(FEATURE_SETTINGS_KEY, JSON.stringify(settings));
  }, [settings]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    root.style.setProperty('--font-sans', toFontFamily(settings.general.fontName));
    root.style.fontSize = `${clampFontSize(settings.general.fontSize, DEFAULT_SETTINGS.general.fontSize)}px`;
  }, [settings.general.fontName, settings.general.fontSize]);

  const value = useMemo<FeatureSettingsContextValue>(() => ({
    settings,
    setSettings: (next) => setSettings(normalizeSettings(next)),
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
