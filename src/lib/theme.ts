export type ThemeMode = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'shortly-theme';

export function resolveInitialTheme(storedValue?: string | null): ThemeMode {
  if (storedValue === 'dark') {
    return 'dark';
  }
  return 'light';
}

export function toggleThemeMode(current: ThemeMode): ThemeMode {
  return current === 'dark' ? 'light' : 'dark';
}
