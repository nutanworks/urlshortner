import { Moon, Sun } from 'lucide-react';
import type { ThemeMode } from '../lib/theme';

interface ThemeToggleProps {
  theme: ThemeMode;
  onChange: (theme: ThemeMode) => void;
  compactOnMobile?: boolean;
}

export function ThemeToggle({
  theme,
  onChange,
  compactOnMobile = false,
}: ThemeToggleProps) {
  return (
    <div
      role="radiogroup"
      aria-label="Color theme"
      data-testid="theme-toggle"
      className="inline-flex items-center rounded-lg border border-slate-200 bg-slate-100 p-0.5 dark:border-slate-800 dark:bg-slate-900 shrink-0"
    >
      <button
        type="button"
        role="radio"
        aria-checked={theme === 'light'}
        aria-label="Light theme"
        onClick={() => onChange('light')}
        className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-semibold transition-all whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${
          theme === 'light'
            ? 'bg-white text-slate-950 shadow-xs'
            : 'text-slate-600 hover:text-slate-950 dark:text-slate-400 dark:hover:text-slate-100'
        }`}
      >
        <Sun className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span className={compactOnMobile ? 'hidden sm:inline' : ''}>Light</span>
      </button>
      <button
        type="button"
        role="radio"
        aria-checked={theme === 'dark'}
        aria-label="Dark theme"
        onClick={() => onChange('dark')}
        className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-semibold transition-all whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${
          theme === 'dark'
            ? 'bg-slate-800 text-white shadow-xs'
            : 'text-slate-600 hover:text-slate-950 dark:text-slate-400 dark:hover:text-slate-100'
        }`}
      >
        <Moon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span className={compactOnMobile ? 'hidden sm:inline' : ''}>Dark</span>
      </button>
    </div>
  );
}
