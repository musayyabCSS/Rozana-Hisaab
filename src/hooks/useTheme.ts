import { useSyncExternalStore, useCallback } from 'react';
import { Capacitor, SystemBars, SystemBarsStyle } from '@capacitor/core';

export type ThemePreference = 'light' | 'dark' | 'system';
type ResolvedTheme = 'light' | 'dark';

const STORAGE_KEY = 'rozana-hisaab-theme';
// Browser UI color per theme; dark keeps the original index.html value.
const THEME_COLORS: Record<ResolvedTheme, string> = {
  dark: '#0f172a',
  light: '#f1f5f9',
};

function getSavedPreference(): ThemePreference {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved === 'light' || saved === 'dark' ? saved : 'system';
  } catch {
    return 'system';
  }
}

const systemDarkQuery =
  typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-color-scheme: dark)')
    : null;

function resolveTheme(preference: ThemePreference): ResolvedTheme {
  if (preference !== 'system') return preference;
  return systemDarkQuery?.matches === false ? 'light' : 'dark';
}

let currentPreference = getSavedPreference();
const listeners = new Set<() => void>();

function applyTheme() {
  const theme = resolveTheme(currentPreference);
  const root = document.documentElement;
  if (theme === 'light') root.dataset.theme = 'light';
  else delete root.dataset.theme;

  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLORS[theme]);

  if (Capacitor.isNativePlatform()) {
    // Dark style = light status/navigation bar icons, for the dark theme.
    void SystemBars.setStyle({
      style: theme === 'dark' ? SystemBarsStyle.Dark : SystemBarsStyle.Light,
    }).catch((error: unknown) => {
      console.error('Could not update system bar style:', error);
    });
  }
}

function notify() {
  listeners.forEach((listener) => listener());
}

systemDarkQuery?.addEventListener('change', () => {
  if (currentPreference !== 'system') return;
  applyTheme();
  notify();
});

// Apply before React renders so the first paint uses the saved theme.
if (typeof document !== 'undefined') applyTheme();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function setThemePreference(preference: ThemePreference) {
  currentPreference = preference;
  try {
    localStorage.setItem(STORAGE_KEY, preference);
  } catch (error) {
    console.error('Could not save theme preference:', error);
  }
  applyTheme();
  notify();
}

export function useTheme() {
  const preference = useSyncExternalStore<ThemePreference>(
    subscribe,
    () => currentPreference,
    () => 'system',
  );

  const setPreference = useCallback((next: ThemePreference) => {
    setThemePreference(next);
  }, []);

  return { preference, setPreference };
}
