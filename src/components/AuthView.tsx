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

export type AuthMode = 'login' | 'signup';

interface AuthViewProps {
  mode: AuthMode;
  onModeChange: (mode: AuthMode) => void;
  onAuthSuccess: (user: AuthUser) => void;
  databaseEngine?: string;
}

export function AuthView({
  mode,
  onModeChange,
  onAuthSuccess,
  databaseEngine = 'MongoDB Atlas',
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
    <div className="flex min-h-screen flex-col text-slate-100">
      <header className="border-b border-slate-800/80 bg-[#080A10]/90">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-8 px-4 py-4 sm:px-6">
          <div className="flex items-center gap-2.5 text-lg font-bold tracking-tight text-slate-50 whitespace-nowrap shrink-0">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 text-white">
              <Link2 className="h-4 w-4" aria-hidden="true" />
            </span>
            <span>Short.ly</span>
          </div>

          <div className="flex items-center gap-4 text-xs sm:text-sm text-slate-400">
            <button
              type="button"
              onClick={() => switchMode('login')}
              className={`whitespace-nowrap shrink-0 transition-colors ${
                mode === 'login'
                  ? 'font-semibold text-slate-100'
                  : 'hover:text-slate-200'
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => switchMode('signup')}
              className="rounded-lg bg-gradient-to-r from-violet-600 to-indigo-600 px-3.5 py-2 text-xs font-semibold text-white transition-all hover:from-violet-500 hover:to-indigo-500 whitespace-nowrap shrink-0"
            >
              Create Account
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-6xl flex-1 items-center px-4 py-10 sm:px-6">
        <div className="grid w-full gap-10 lg:grid-cols-12 lg:items-stretch">
          {/* Left Column: Platform Overview & Default Accounts */}
          <div className="flex flex-col justify-between space-y-8 lg:col-span-6 lg:pr-6">
            <div>
              <p className="text-xs sm:text-sm font-medium text-violet-300">
                {databaseEngine} · Werkzeug Scrypt Auth · Role-Based Access
              </p>
              <h1 className="mt-3 text-balance text-3xl font-extrabold tracking-tight text-slate-50 sm:text-4xl lg:text-5xl">
                Secure, distributed{' '}
                <span className="bg-gradient-to-r from-violet-400 via-indigo-400 to-blue-400 bg-clip-text text-transparent">
                  URL shortening
                </span>
              </h1>
              <p className="mt-4 max-w-xl text-sm sm:text-base leading-relaxed text-slate-400">
                Shorten links with Base62 counter encoding, partitioned A–M / N–Z sharding, Redis cache simulation, click device/browser analytics, and automatic malicious URL filtering.
              </p>

              <dl className="mt-8 space-y-4 border-t border-slate-800/80 pt-6 text-sm">
                <div className="flex items-start gap-3">
                  <ShieldCheck
                    className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400"
                    aria-hidden="true"
                  />
                  <div>
                    <dt className="font-semibold text-slate-200">
                      Malicious URL Blocking
                    </dt>
                    <dd className="mt-0.5 text-xs text-slate-400">
                      Automatically blocks destinations containing phishing, malware, or .exe payloads before storage.
                    </dd>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <KeyRound
                    className="mt-0.5 h-4 w-4 shrink-0 text-violet-400"
                    aria-hidden="true"
                  />
                  <div>
                    <dt className="font-semibold text-slate-200">
                      Role-Based Permissions & Sessions
                    </dt>
                    <dd className="mt-0.5 text-xs text-slate-400">
                      Admins manage, edit, and remove any link. Standard users can view analytics and shorten new links.
                    </dd>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <Database
                    className="mt-0.5 h-4 w-4 shrink-0 text-indigo-400"
                    aria-hidden="true"
                  />
                  <div>
                    <dt className="font-semibold text-slate-200">
                      MongoDB Persistence (users · links · clicks)
                    </dt>
                    <dd className="mt-0.5 text-xs text-slate-400">
                      Backed by persistent collections with password hashing, expiry dates, and click telemetry.
                    </dd>
                  </div>
                </div>
              </dl>
            </div>

            {/* Default Test Accounts Table */}
            <div className="rounded-xl border border-slate-800/90 bg-[#0F131E] p-5">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-xs font-semibold text-slate-200">
                  Default Accounts
                </h2>
                <span className="text-xs text-slate-500">
                  Click Fill to populate login fields
                </span>
              </div>

              <div className="mt-3 divide-y divide-slate-800/70 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <span className="font-semibold text-violet-300">Admin</span>
                    <span aria-hidden="true" className="mx-1.5 text-slate-600">
                      ·
                    </span>
                    <span className="font-mono text-slate-200">
                      admin@short.ly
                    </span>
                    <span aria-hidden="true" className="mx-1.5 text-slate-600">
                      /
                    </span>
                    <span className="font-mono text-slate-400">admin123</span>
                    <p className="mt-0.5 text-slate-500">
                      Full access: shorten, edit, delete, and evict cache
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      fillDemoCredentials('admin@short.ly', 'admin123')
                    }
                    className="rounded-md border border-slate-700 bg-[#141927] px-3 py-1.5 text-xs font-medium text-slate-200 transition-colors hover:border-violet-500/60 hover:text-violet-200 whitespace-nowrap shrink-0"
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
                    <span className="font-mono text-slate-200">
                      user@short.ly
                    </span>
                    <span aria-hidden="true" className="mx-1.5 text-slate-600">
                      /
                    </span>
                    <span className="font-mono text-slate-400">user123</span>
                    <p className="mt-0.5 text-slate-500">
                      Standard access: view links and shorten new URLs only
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      fillDemoCredentials('user@short.ly', 'user123')
                    }
                    className="rounded-md border border-slate-700 bg-[#141927] px-3 py-1.5 text-xs font-medium text-slate-200 transition-colors hover:border-violet-500/60 hover:text-violet-200 whitespace-nowrap shrink-0"
                  >
                    Fill User
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Login / Signup Form */}
          <div className="flex items-center lg:col-span-6">
            <div className="w-full rounded-2xl border border-slate-800/90 bg-[#0F131E] p-6 sm:p-8">
              {/* Mode Segmented Control */}
              <div
                role="tablist"
                aria-label="Authentication mode"
                className="grid grid-cols-2 gap-1 rounded-lg border border-slate-800 bg-[#080A10] p-1"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={mode === 'login'}
                  onClick={() => switchMode('login')}
                  className={`rounded-md py-2 text-xs sm:text-sm font-semibold transition-colors whitespace-nowrap ${
                    mode === 'login'
                      ? 'bg-gradient-to-r from-violet-600 to-indigo-600 text-white'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Login
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={mode === 'signup'}
                  onClick={() => switchMode('signup')}
                  className={`rounded-md py-2 text-xs sm:text-sm font-semibold transition-colors whitespace-nowrap ${
                    mode === 'signup'
                      ? 'bg-gradient-to-r from-violet-600 to-indigo-600 text-white'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Sign Up
                </button>
              </div>

              <div className="mt-6">
                <h2 className="text-xl font-bold tracking-tight text-slate-50">
                  {mode === 'login'
                    ? 'Sign in to Short.ly'
                    : 'Create your Short.ly account'}
                </h2>
                <p className="mt-1 text-xs sm:text-sm text-slate-400">
                  {mode === 'login'
                    ? 'Enter your email and password to start a secure session.'
                    : 'Register with your name, email, and password to shorten and track URLs.'}
                </p>
              </div>

              <form onSubmit={handleSubmit} noValidate className="mt-6 space-y-4">
                {mode === 'signup' && (
                  <div>
                    <label
                      htmlFor="auth-name"
                      className="block text-xs font-medium text-slate-300"
                    >
                      Name
                    </label>
                    <input
                      id="auth-name"
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      autoComplete="name"
                      placeholder="Alex Rivera"
                      className="mt-1.5 h-11 w-full rounded-xl border border-slate-800 bg-[#080A10] px-3.5 text-sm text-slate-100 placeholder:text-slate-500 focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/30"
                    />
                  </div>
                )}

                <div>
                  <label
                    htmlFor="auth-email"
                    className="block text-xs font-medium text-slate-300"
                  >
                    Email
                  </label>
                  <input
                    id="auth-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                    placeholder="you@short.ly"
                    className="mt-1.5 h-11 w-full rounded-xl border border-slate-800 bg-[#080A10] px-3.5 text-sm text-slate-100 placeholder:text-slate-500 focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/30"
                  />
                </div>

                <div>
                  <label
                    htmlFor="auth-password"
                    className="block text-xs font-medium text-slate-300"
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
                        ? 'At least 6 characters'
                        : 'Enter your password'
                    }
                    className="mt-1.5 h-11 w-full rounded-xl border border-slate-800 bg-[#080A10] px-3.5 text-sm text-slate-100 placeholder:text-slate-500 focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/30"
                  />
                </div>

                {error && (
                  <div
                    role="alert"
                    className="flex items-center gap-2 rounded-lg border border-red-500/40 bg-red-500/10 px-3.5 py-2.5 text-xs sm:text-sm text-red-200"
                  >
                    <AlertCircle
                      className="h-4 w-4 shrink-0 text-red-400"
                      aria-hidden="true"
                    />
                    <span>{error}</span>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 px-5 text-sm font-semibold text-white transition-all hover:from-violet-500 hover:to-indigo-500 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
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

              <p className="mt-5 text-center text-xs text-slate-400">
                {mode === 'login' ? (
                  <>
                    Need an account?{' '}
                    <button
                      type="button"
                      onClick={() => switchMode('signup')}
                      className="font-semibold text-violet-300 hover:text-violet-200"
                    >
                      Sign up here
                    </button>
                  </>
                ) : (
                  <>
                    Already registered?{' '}
                    <button
                      type="button"
                      onClick={() => switchMode('login')}
                      className="font-semibold text-violet-300 hover:text-violet-200"
                    >
                      Sign in
                    </button>
                  </>
                )}
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
