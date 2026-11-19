import {
  BarChart3,
  LayoutList,
  Link2,
  LogOut,
  Plus,
  Server,
} from 'lucide-react';
import type { AuthUser } from '../types';
import type { ThemeMode } from '../lib/theme';
import { ThemeToggle } from './ThemeToggle';

export type ActiveView = 'home' | 'dashboard' | 'analytics' | 'cluster';

interface WorkspaceNavigationProps {
  activeView: ActiveView;
  user: AuthUser;
  databaseEngine: string;
  onNavigate: (view: ActiveView) => void;
  onFocusCreate: () => void;
  onLogout: () => void;
}

interface TopWorkspaceBarProps
  extends Omit<WorkspaceNavigationProps, 'databaseEngine'> {
  theme: ThemeMode;
  onThemeChange: (theme: ThemeMode) => void;
}

const NAV_ITEMS: Array<{
  id: ActiveView;
  label: string;
  mobileLabel: string;
  breadcrumb: string;
  icon: typeof Link2;
}> = [
  {
    id: 'home',
    label: 'Shortener',
    mobileLabel: 'Shortener',
    breadcrumb: 'URL Shortener',
    icon: Link2,
  },
  {
    id: 'dashboard',
    label: 'Links',
    mobileLabel: 'Links',
    breadcrumb: 'Links Directory',
    icon: LayoutList,
  },
  {
    id: 'analytics',
    label: 'Analytics',
    mobileLabel: 'Analytics',
    breadcrumb: 'Traffic Analytics',
    icon: BarChart3,
  },
  {
    id: 'cluster',
    label: 'Cluster',
    mobileLabel: 'Cluster',
    breadcrumb: 'Distributed Cluster',
    icon: Server,
  },
];

export function SidebarNav({
  activeView,
  user,
  databaseEngine,
  onNavigate,
  onLogout,
}: Omit<WorkspaceNavigationProps, 'onFocusCreate'>) {
  const displayName =
    user.name.trim().toLowerCase() === 'admin'
      ? 'Administrator'
      : user.name.trim() || user.email;
  const initials = displayName.slice(0, 2).toUpperCase();

  return (
    <aside className="hidden lg:flex lg:w-64 lg:flex-col lg:fixed lg:inset-y-0 border-r border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      {/* Brand Header */}
      <div className="flex h-16 items-center border-b border-slate-200 px-5 dark:border-slate-800">
        <button
          type="button"
          onClick={() => onNavigate('home')}
          className="flex items-center gap-2.5 text-base font-bold tracking-tight text-slate-950 dark:text-white whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 rounded-md"
        >
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-950 text-white dark:bg-blue-600">
            <Link2 className="h-4 w-4" aria-hidden="true" />
          </span>
          <span>Short.ly</span>
        </button>
      </div>

      {/* Primary Navigation */}
      <nav aria-label="Primary navigation" className="flex-1 space-y-1 px-3 py-5">
        <p className="px-3 pb-2 text-xs font-medium text-slate-400 dark:text-slate-500">
          Workspace
        </p>
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = activeView === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onNavigate(item.id)}
              aria-current={isActive ? 'page' : undefined}
              className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${
                isActive
                  ? 'bg-slate-900 text-white dark:bg-slate-800 dark:text-white'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-950 dark:text-slate-400 dark:hover:bg-slate-800/60 dark:hover:text-slate-100'
              }`}
            >
              <Icon
                className={`h-4 w-4 shrink-0 ${
                  isActive
                    ? 'text-blue-400'
                    : 'text-slate-400 dark:text-slate-500'
                }`}
                aria-hidden="true"
              />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Account Footer */}
      <div className="border-t border-slate-200 p-4 dark:border-slate-800">
        <div className="text-xs text-slate-500 pb-3 mb-3 border-b border-slate-100 dark:border-slate-800 dark:text-slate-400">
          Storage:{' '}
          <span className="font-medium text-slate-700 dark:text-slate-200">
            {databaseEngine}
          </span>
        </div>

        <div className="flex items-center gap-3">
          <div
            aria-hidden="true"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-xs font-semibold text-slate-700 border border-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
          >
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-semibold text-slate-900 dark:text-slate-100">
              {displayName}
            </p>
            <p className="truncate text-xs text-slate-500 dark:text-slate-400">
              <span
                data-testid="active-user-role"
                className={
                  user.role === 'admin'
                    ? 'font-semibold text-blue-700 dark:text-blue-400'
                    : 'text-slate-600 dark:text-slate-300'
                }
              >
                {user.role === 'admin' ? 'Admin' : 'User'}
              </span>
              <span aria-hidden="true" className="mx-1 text-slate-300 dark:text-slate-600">
                ·
              </span>
              <span>{user.email}</span>
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onLogout}
          className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 hover:text-slate-950 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
        >
          <LogOut className="h-3.5 w-3.5 text-slate-400 dark:text-slate-500" aria-hidden="true" />
          <span>Sign Out</span>
        </button>
      </div>
    </aside>
  );
}

export function TopWorkspaceBar({
  activeView,
  user,
  theme,
  onThemeChange,
  onNavigate,
  onFocusCreate,
  onLogout,
}: TopWorkspaceBarProps) {
  const current =
    NAV_ITEMS.find((item) => item.id === activeView) ?? NAV_ITEMS[0];

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur-xs dark:border-slate-800 dark:bg-slate-900/95">
      <div className="flex h-16 items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
        {/* Left: Mobile Brand OR Desktop Contextual Breadcrumb */}
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={() => onNavigate('home')}
            className="flex lg:hidden items-center gap-2 text-base font-bold tracking-tight text-slate-950 dark:text-white whitespace-nowrap shrink-0"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-950 text-white dark:bg-blue-600">
              <Link2 className="h-4 w-4" aria-hidden="true" />
            </span>
            <span>Short.ly</span>
          </button>

          <div className="hidden lg:flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 whitespace-nowrap">
            <span>Workspace</span>
            <span aria-hidden="true" className="text-slate-300 dark:text-slate-600">
              /
            </span>
            <span className="font-semibold text-slate-900 dark:text-slate-100">
              {current.breadcrumb}
            </span>
          </div>
        </div>

        {/* Right: Light/Dark Switcher + Primary Action + Mobile Sign Out */}
        <div className="flex items-center gap-2 sm:gap-2.5 shrink-0">
          <ThemeToggle
            theme={theme}
            onChange={onThemeChange}
            compactOnMobile
          />

          <button
            type="button"
            onClick={onFocusCreate}
            className="inline-flex items-center gap-1.5 rounded-lg bg-slate-950 px-3 sm:px-3.5 py-2 text-xs sm:text-sm font-semibold text-white transition-colors hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200 whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            <span>New Link</span>
          </button>

          <button
            type="button"
            onClick={onLogout}
            aria-label="Sign out"
            className="inline-flex lg:hidden items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800 whitespace-nowrap shrink-0"
          >
            <LogOut className="h-3.5 w-3.5 text-slate-500 dark:text-slate-400" aria-hidden="true" />
            <span className="hidden sm:inline">Sign Out</span>
          </button>
        </div>
      </div>

      {/* Mobile & Tablet Navigation Row */}
      <nav
        aria-label="Mobile navigation"
        className="flex lg:hidden items-center justify-around border-t border-slate-100 bg-slate-50/70 px-2 py-1.5 text-xs font-medium dark:border-slate-800 dark:bg-slate-950/70"
      >
        {NAV_ITEMS.map((item) => {
          const isActive = activeView === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onNavigate(item.id)}
              aria-current={isActive ? 'page' : undefined}
              className={`px-3 py-1.5 rounded-md whitespace-nowrap shrink-0 transition-colors ${
                isActive
                  ? 'bg-slate-900 text-white dark:bg-slate-800 dark:text-white'
                  : 'text-slate-600 hover:text-slate-950 dark:text-slate-400 dark:hover:text-slate-100'
              }`}
            >
              {item.mobileLabel}
            </button>
          );
        })}
        <span className="hidden sm:inline text-slate-400 dark:text-slate-500 text-xs whitespace-nowrap">
          {user.role === 'admin' ? 'Admin' : 'User'}
        </span>
      </nav>
    </header>
  );
}
