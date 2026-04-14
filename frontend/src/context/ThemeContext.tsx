import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useFeatureSettings } from './FeatureSettingsContext';

type Theme = 'dark'; // Light theme disabled - app only supports dark mode

type ThemeContextValue = {
  theme: Theme;
  isDark: boolean;
  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  root.classList.remove('light', 'dark');
  root.classList.add(theme);
}

export function ThemeProvider({ children }: Readonly<{ children: React.ReactNode }>) {
  const { settings } = useFeatureSettings();
  const [systemPrefersDark] = useState(() => true); // Always dark

  // Force dark theme - light mode disabled
  const theme: Theme = 'dark';

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  // No-op functions since theme is locked to dark
  function toggleTheme() {
    // Light theme disabled
  }

  function setTheme(_nextTheme: Theme) {
    // Light theme disabled
  }

  const value = useMemo<ThemeContextValue>(() => ({
    theme,
    isDark: true,
    toggleTheme,
    setTheme,
  }), [theme]);

  return (
    <ThemeContext.Provider
      value={value}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  return ctx;
}
