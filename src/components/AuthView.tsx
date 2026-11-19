import { useState, type FormEvent } from 'react';
import {
  AlertCircle,
  ArrowRight,
  Database,
  KeyRound,
  Link2,
  ShieldCheck,
} from 'lucide-react';
import type { AuthUser } from '../types';
import type { ThemeMode } from '../lib/theme';
import { ThemeToggle } from './ThemeToggle';

export type AuthMode = 'login' | 'signup';

interface AuthViewProps {
  mode: AuthMode;
  onModeChange: (mode: AuthMode) => void;
  onAuthSuccess: (user: AuthUser) => void;
  databaseEngine?: string;
  theme: ThemeMode;
  onThemeChange: (theme: ThemeMode) => void;
}

export function AuthView({
  mode,
  onModeChange,
  onAuthSuccess,
  databaseEngine = 'MongoDB Atlas',
  theme,
  onThemeChange,
}: AuthViewProps) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function switchMode(nextMode: AuthMode) {
    setError(null);
    onModeChange(nextMode);
  }

  function fillDemoCredentials(demoEmail: string, demoPassword: string) {
    setError(null);
    if (mode !== 'login') {
      onModeChange('login');
    }
    setEmail(demoEmail);
    setPassword(demoPassword);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const trimmedEmail = email.trim();
    if (mode === 'signup' && name.trim().length < 2) {
      setError('Please enter your full name (at least 2 characters).');
      return;
    }
    if (!trimmedEmail || !trimmedEmail.includes('@')) {
      setError('Please enter a valid email address.');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    setIsSubmitting(true);
    try {
      const endpoint =
        mode === 'signup' ? '/api/auth/signup' : '/api/auth/login';
      const body =
        mode === 'signup'
          ? { name: name.trim(), email: trimmedEmail, password }
          : { email: trimmedEmail, password };

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(body),
      });

      const payload = (await res.json()) as {
        user?: AuthUser;
        error?: string;
      };

      if (!res.ok || !payload.user) {
        setError(payload.error ?? 'Authentication failed. Please try again.');
        return;
      }

      onAuthSuccess(payload.user);
    } catch {
      setError('Network error while contacting Short.ly authentication server.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-12">
      {/* Left Institutional Brand Column */}
      <aside className="enterprise-grid-dark flex flex-col justify-between border-b border-slate-800 px-6 py-8 text-slate-100 sm:px-10 lg:col-span-5 lg:border-b-0 lg:border-r lg:px-12 lg:py-12">
        <div>
          <div className="flex items-center gap-2.5 text-lg font-bold tracking-tight text-white">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-white">
              <Link2 className="h-4 w-4" aria-hidden="true" />
            </span>
            <span>Short.ly</span>
          </div>

          <div className="mt-12 lg:mt-16">
            <p className="text-xs font-medium text-blue-400">
              {databaseEngine} · Werkzeug Scrypt Auth · Role-Based Access
            </p>
            <h1 className="mt-3 text-balance text-3xl font-bold tracking-tight text-white sm:text-4xl">
              Enterprise link routing, engineered for scale.
            </h1>
            <p className="mt-4 max-w-md text-sm leading-relaxed text-slate-400">
              Manage short links with deterministic Base62 encoding, A–M / N–Z sharding, cache-aside Redis simulation, real-time click telemetry, and automated threat blocking.
            </p>

            <dl className="mt-8 space-y-5 border-t border-slate-800 pt-7 text-sm">
              <div className="flex items-start gap-3">
                <ShieldCheck
                  className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400"
                  aria-hidden="true"
                />
                <div>
                  <dt className="font-semibold text-slate-100">
                    Malicious URL Protection
                  </dt>
                  <dd className="mt-0.5 text-xs leading-relaxed text-slate-400">
                    Automatically inspects and rejects destinations containing phishing, malware, or .exe payloads.
                  </dd>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <KeyRound
                  className="mt-0.5 h-4 w-4 shrink-0 text-blue-400"
                  aria-hidden="true"
                />
                <div>
                  <dt className="font-semibold text-slate-100">
                    Session Auth & Granular Roles
                  </dt>
                  <dd className="mt-0.5 text-xs leading-relaxed text-slate-400">
                    Administrators edit, expire, protect, and delete links. Standard users shorten URLs and view analytics.
                  </dd>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <Database
                  className="mt-0.5 h-4 w-4 shrink-0 text-slate-300"
                  aria-hidden="true"
                />
                <div>
                  <dt className="font-semibold text-slate-100">
                    Persistent MongoDB Collections
                  </dt>
                  <dd className="mt-0.5 text-xs leading-relaxed text-slate-400">
                    Structured users, links, and clicks collections tracking device, browser, shard, and expiry state.
                  </dd>
                </div>
              </div>
            </dl>
          </div>
        </div>

        {/* Default Workspace Credentials */}
        <div className="mt-10 rounded-xl border border-slate-800 bg-slate-900/80 p-4 sm:p-5">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-xs font-semibold text-slate-200">
              Default Workspace Accounts
            </h2>
            <span className="text-xs text-slate-500">One-click fill</span>
          </div>

          <div className="mt-3 divide-y divide-slate-800 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-3 py-2.5">
              <div className="min-w-0">
                <span className="font-semibold text-blue-400">Admin</span>
                <span aria-hidden="true" className="mx-1.5 text-slate-600">
                  ·
                </span>
                <span className="font-mono text-slate-200">admin@short.ly</span>
                <span aria-hidden="true" className="mx-1.5 text-slate-600">
                  /
                </span>
                <span className="font-mono text-slate-400">admin123</span>
                <p className="mt-0.5 text-slate-400">
                  Full edit, delete, and cache control
                </p>
              </div>
              <button
                type="button"
                onClick={() =>
                  fillDemoCredentials('admin@short.ly', 'admin123')
                }
                className="rounded-md border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-100 transition-colors hover:border-slate-500 hover:bg-slate-700 whitespace-nowrap shrink-0"
              >
                Fill Admin
              </button>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-2.5">
              <div className="min-w-0">
                <span className="font-semibold text-slate-200">User</span>
                <span aria-hidden="true" className="mx-1.5 text-slate-600">
                  ·
                </span>
                <span className="font-mono text-slate-200">user@short.ly</span>
                <span aria-hidden="true" className="mx-1.5 text-slate-600">
                  /
                </span>
                <span className="font-mono text-slate-400">user123</span>
                <p className="mt-0.5 text-slate-400">
                  View links and shorten URLs only
                </p>
              </div>
              <button
                type="button"
                onClick={() =>
                  fillDemoCredentials('user@short.ly', 'user123')
                }
                className="rounded-md border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-100 transition-colors hover:border-slate-500 hover:bg-slate-700 whitespace-nowrap shrink-0"
              >
                Fill User
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* Right Authentication Panel (Adapts to Light / Dark Theme) */}
      <main className="relative flex flex-col justify-center bg-white px-6 py-12 sm:px-12 lg:col-span-7 lg:px-20 dark:bg-[#090D16]">
        <div className="mb-8 flex justify-end lg:absolute lg:right-8 lg:top-6 lg:mb-0">
          <ThemeToggle theme={theme} onChange={onThemeChange} />
        </div>

        <div className="mx-auto w-full max-w-md">
          {/* Segmented Mode Switch */}
          <div
            role="tablist"
            aria-label="Authentication mode"
            className="grid grid-cols-2 gap-1 rounded-lg border border-slate-200 bg-slate-100 p-1 dark:border-slate-800 dark:bg-slate-900"
          >
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'login'}
              onClick={() => switchMode('login')}
              className={`rounded-md py-2 text-xs sm:text-sm font-semibold transition-all whitespace-nowrap ${
                mode === 'login'
                  ? 'bg-white text-slate-950 shadow-xs dark:bg-slate-800 dark:text-white'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'signup'}
              onClick={() => switchMode('signup')}
              className={`rounded-md py-2 text-xs sm:text-sm font-semibold transition-all whitespace-nowrap ${
                mode === 'signup'
                  ? 'bg-white text-slate-950 shadow-xs dark:bg-slate-800 dark:text-white'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
              }`}
            >
              Create Account
            </button>
          </div>

          <div className="mt-8">
            <h2 className="text-2xl font-bold tracking-tight text-slate-950 dark:text-white">
              {mode === 'login'
                ? 'Sign in to your workspace'
                : 'Create a Short.ly account'}
            </h2>
            <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-400">
              {mode === 'login'
                ? 'Enter your credentials to access your links and cluster telemetry.'
                : 'Enter your name, email, and password to start shortening URLs.'}
            </p>
          </div>

          <form onSubmit={handleSubmit} noValidate className="mt-7 space-y-4">
            {mode === 'signup' && (
              <div>
                <label
                  htmlFor="auth-name"
                  className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
                >
                  Full Name
                </label>
                <input
                  id="auth-name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoComplete="name"
                  placeholder="Alex Rivera"
                  className="mt-1.5 h-11 w-full rounded-lg border border-slate-300 bg-white px-3.5 text-sm text-slate-950 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-blue-500"
                />
              </div>
            )}

            <div>
              <label
                htmlFor="auth-email"
                className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
              >
                Work Email
              </label>
              <input
                id="auth-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                placeholder="name@company.com"
                className="mt-1.5 h-11 w-full rounded-lg border border-slate-300 bg-white px-3.5 text-sm text-slate-950 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-blue-500"
              />
            </div>

            <div>
              <label
                htmlFor="auth-password"
                className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
              >
                Password
              </label>
              <input
                id="auth-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={
                  mode === 'signup' ? 'new-password' : 'current-password'
                }
                placeholder={
                  mode === 'signup'
                    ? 'Minimum 6 characters'
                    : 'Enter your password'
                }
                className="mt-1.5 h-11 w-full rounded-lg border border-slate-300 bg-white px-3.5 text-sm text-slate-950 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-blue-500"
              />
            </div>

            {error && (
              <div
                role="alert"
                className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs sm:text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/50 dark:text-red-300"
              >
                <AlertCircle
                  className="h-4 w-4 shrink-0 text-red-600 dark:text-red-400"
                  aria-hidden="true"
                />
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="mt-2 inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-slate-950 px-5 text-sm font-semibold text-white transition-colors hover:bg-slate-800 disabled:opacity-60 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-950"
            >
              <span>
                {isSubmitting
                  ? mode === 'login'
                    ? 'Signing in...'
                    : 'Creating account...'
                  : mode === 'login'
                    ? 'Sign In'
                    : 'Create Account'}
              </span>
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </form>

          <p className="mt-6 text-center text-xs text-slate-500 dark:text-slate-400">
            {mode === 'login' ? (
              <>
                New to Short.ly?{' '}
                <button
                  type="button"
                  onClick={() => switchMode('signup')}
                  className="font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
                >
                  Create an account
                </button>
              </>
            ) : (
              <>
                Already have an account?{' '}
                <button
                  type="button"
                  onClick={() => switchMode('login')}
                  className="font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
                >
                  Sign in
                </button>
              </>
            )}
          </p>
        </div>
      </main>
    </div>
  );
}
