import { Link2, LogOut } from 'lucide-react';
import type { AuthUser } from '../types';

export type ActiveView = 'home' | 'dashboard' | 'analytics' | 'cluster';

interface NavbarProps {
  activeView: ActiveView;
  user: AuthUser;
  onNavigate: (view: ActiveView) => void;
  onLogout: () => void;
}

const NAV_ITEMS: Array<{ id: ActiveView; label: string }> = [
  { id: 'home', label: 'Shortener' },
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'analytics', label: 'Analytics' },
  { id: 'cluster', label: 'Cluster' },
];

export function Navbar({
  activeView,
  user,
  onNavigate,
  onLogout,
}: NavbarProps) {
  return (
    <header className="md:sticky md:top-0 z-30 border-b border-slate-800/80 bg-[#080A10]/90 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3.5 sm:px-6 lg:gap-8">
        {/* Zone 1: Single-line Brand Wordmark */}
        <button
          type="button"
          onClick={() => onNavigate('home')}
          className="flex items-center gap-2.5 text-lg font-bold tracking-tight text-slate-50 whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 rounded-md"
        >
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 text-white">
            <Link2 className="h-4 w-4" aria-hidden="true" />
          </span>
          <span>Short.ly</span>
        </button>

        {/* Zone 2: Concise single-line navigation links */}
        <nav
          aria-label="Primary navigation"
          className="hidden md:flex items-center gap-7 text-sm font-medium"
        >
          {NAV_ITEMS.map((item) => {
            const isActive = activeView === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onNavigate(item.id)}
                aria-current={isActive ? 'page' : undefined}
                className={`relative py-1.5 whitespace-nowrap shrink-0 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 rounded-sm ${
                  isActive
                    ? 'text-slate-50'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {item.label}
                {isActive && (
                  <span
                    aria-hidden="true"
                    className="absolute inset-x-0 -bottom-[15px] h-0.5 bg-gradient-to-r from-violet-500 to-indigo-500"
                  />
                )}
              </button>
            );
          })}
        </nav>

        {/* Zone 3: Account Identity + Sign Out Action */}
        <div className="flex items-center gap-3.5 shrink-0">
          <div className="hidden sm:flex items-center gap-1.5 text-xs text-slate-400 whitespace-nowrap">
            <span className="max-w-[160px] truncate font-medium text-slate-200">
              {user.name.trim().toLowerCase() === user.role.toLowerCase()
                ? user.email
                : user.name}
            </span>
            <span aria-hidden="true">·</span>
            <span
              data-testid="active-user-role"
              className={
                user.role === 'admin'
                  ? 'font-semibold text-violet-300'
                  : 'text-slate-400'
              }
            >
              {user.role === 'admin' ? 'Admin' : 'User'}
            </span>
          </div>

          <button
            type="button"
            onClick={onLogout}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700/90 bg-[#131826] px-3 py-1.5 text-xs font-semibold text-slate-200 transition-colors hover:border-slate-600 hover:text-white whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
          >
            <LogOut className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
            <span>Sign Out</span>
          </button>
        </div>
      </div>

      {/* Compact mobile navigation row */}
      <nav
        aria-label="Mobile navigation"
        className="flex md:hidden items-center justify-around border-t border-slate-800/70 px-2 py-1.5 text-xs font-medium"
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
                  ? 'bg-slate-800/80 text-slate-50'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {item.label}
            </button>
          );
        })}
      </nav>
    </header>
  );
}
