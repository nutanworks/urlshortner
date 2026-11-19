import { useCallback, useEffect, useRef, useState } from 'react';
import { AnalyticsView } from './components/AnalyticsView';
import { AuthView, type AuthMode } from './components/AuthView';
import { DashboardView, type EditLinkPayload } from './components/DashboardView';
import { DistributedCluster } from './components/DistributedCluster';
import {
  HomeShortener,
  type ShortenFormOptions,
} from './components/HomeShortener';
import {
  SidebarNav,
  TopWorkspaceBar,
  type ActiveView,
} from './components/Navbar';
import type {
  AnalyticsSummary,
  AuthUser,
  ClusterState,
  RequestTrace,
  ShortLinkRecord,
  ShortenResponse,
} from './types';
import {
  THEME_STORAGE_KEY,
  resolveInitialTheme,
  type ThemeMode,
} from './lib/theme';

function viewFromPath(pathname: string): ActiveView {
  const clean = pathname.replace(/^\/+|\/+$/g, '').toLowerCase();
  if (clean === 'dashboard') return 'dashboard';
  if (clean === 'analytics') return 'analytics';
  if (clean === 'cluster') return 'cluster';
  return 'home';
}

function authModeFromPath(pathname: string): AuthMode {
  const clean = pathname.replace(/^\/+|\/+$/g, '').toLowerCase();
  return clean === 'signup' ? 'signup' : 'login';
}

export default function App() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [authChecking, setAuthChecking] = useState(true);
  const [authMode, setAuthMode] = useState<AuthMode>(() =>
    typeof window !== 'undefined'
      ? authModeFromPath(window.location.pathname)
      : 'login',
  );
  const [databaseEngine, setDatabaseEngine] = useState<string>('MongoDB Atlas');
  const [theme, setTheme] = useState<ThemeMode>(() => {
    if (typeof window === 'undefined') return 'light';
    try {
      return resolveInitialTheme(window.localStorage.getItem(THEME_STORAGE_KEY));
    } catch {
      return 'light';
    }
  });

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', theme === 'dark');
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // Ignore storage quota or privacy restrictions
    }
  }, [theme]);

  const [activeView, setActiveView] = useState<ActiveView>(() =>
    typeof window !== 'undefined' ? viewFromPath(window.location.pathname) : 'home',
  );
  const [links, setLinks] = useState<ShortLinkRecord[]>([]);
  const [analytics, setAnalytics] = useState<AnalyticsSummary | null>(null);
  const [cluster, setCluster] = useState<ClusterState | null>(null);
  const [latestLink, setLatestLink] = useState<ShortLinkRecord | null>(null);
  const [latestTrace, setLatestTrace] = useState<RequestTrace | null>(null);
  const [isLoadingLinks, setIsLoadingLinks] = useState(true);
  const [isLoadingAnalytics, setIsLoadingAnalytics] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const urlInputRef = useRef<HTMLInputElement | null>(null);
  const lastRefreshRef = useRef<number>(0);

  const fetchGetWithRetry = useCallback(
    async <T,>(url: string, retries = 2): Promise<T | null> => {
      for (let attempt = 0; attempt <= retries; attempt += 1) {
        try {
          const res = await fetch(url, { credentials: 'same-origin' });
          if (res.status === 401) {
            setUser(null);
            return null;
          }
          if (!res.ok) return null;
          return (await res.json()) as T;
        } catch {
          if (attempt === retries) {
            return null;
          }
          await new Promise((resolve) =>
            setTimeout(resolve, 350 * (attempt + 1)),
          );
        }
      }
      return null;
    },
    [],
  );

  // Hydrate existing session on initial load
  useEffect(() => {
    let active = true;
    async function checkSession() {
      try {
        const res = await fetch('/api/auth/me', { credentials: 'same-origin' });
        if (!res.ok) return;
        const data = (await res.json()) as {
          user: AuthUser | null;
          databaseEngine?: string;
        };
        if (!active) return;
        if (data.databaseEngine) {
          setDatabaseEngine(data.databaseEngine);
        }
        setUser(data.user);
      } catch {
        // Handled cleanly
      } finally {
        if (active) setAuthChecking(false);
      }
    }
    void checkSession();
    return () => {
      active = false;
    };
  }, []);

  const fetchLinksAndCluster = useCallback(async () => {
    try {
      const data = await fetchGetWithRetry<{
        links: ShortLinkRecord[];
        cluster: ClusterState;
      }>('/api/links');
      if (!data) return;
      setLinks(data.links);
      setCluster(data.cluster);
      lastRefreshRef.current = Date.now();
    } catch {
      // Handled gracefully
    } finally {
      setIsLoadingLinks(false);
    }
  }, [fetchGetWithRetry]);

  const fetchAnalytics = useCallback(async () => {
    try {
      const data = await fetchGetWithRetry<{
        analytics: AnalyticsSummary;
        cluster: ClusterState;
      }>('/api/analytics');
      if (!data) return;
      setAnalytics(data.analytics);
      setCluster(data.cluster);
      lastRefreshRef.current = Date.now();
    } catch {
      // Handled gracefully
    } finally {
      setIsLoadingAnalytics(false);
    }
  }, [fetchGetWithRetry]);

  const refreshClusterOnly = useCallback(async () => {
    try {
      const data = await fetchGetWithRetry<{ cluster: ClusterState }>(
        '/api/cluster',
      );
      if (!data) return;
      setCluster(data.cluster);
    } catch {
      // Handled gracefully
    }
  }, [fetchGetWithRetry]);

  // Fetch protected workspace data whenever a user logs in
  useEffect(() => {
    if (!user) return;
    setIsLoadingLinks(true);
    setIsLoadingAnalytics(true);
    void fetchLinksAndCluster();
    void fetchAnalytics();
  }, [user, fetchLinksAndCluster, fetchAnalytics]);

  // Refresh state when user returns from opening a 301 redirect in another tab
  useEffect(() => {
    if (!user) return;
    function handleFocus() {
      if (document.visibilityState !== 'visible') return;
      if (Date.now() - lastRefreshRef.current < 2000) return;
      lastRefreshRef.current = Date.now();
      void fetchLinksAndCluster();
      void fetchAnalytics();
    }
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [user, fetchLinksAndCluster, fetchAnalytics]);

  // Sync browser back/forward navigation
  useEffect(() => {
    function handlePopState() {
      setActiveView(viewFromPath(window.location.pathname));
      setAuthMode(authModeFromPath(window.location.pathname));
    }
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  function navigateTo(view: ActiveView) {
    setActiveView(view);
    const targetPath = view === 'home' ? '/' : `/${view}`;
    if (window.location.pathname !== targetPath) {
      window.history.pushState({}, '', targetPath);
    }
    if (view === 'analytics') {
      void fetchAnalytics();
    } else if (view === 'dashboard') {
      void fetchLinksAndCluster();
    } else if (view === 'cluster') {
      void refreshClusterOnly();
    }
  }

  function handleAuthModeChange(nextMode: AuthMode) {
    setAuthMode(nextMode);
    const targetPath = nextMode === 'signup' ? '/signup' : '/login';
    if (window.location.pathname !== targetPath) {
      window.history.pushState({}, '', targetPath);
    }
  }

  function handleAuthSuccess(loggedInUser: AuthUser) {
    setUser(loggedInUser);
    setErrorMessage(null);
    setLatestLink(null);
    setLatestTrace(null);
    setActiveView('home');
    if (window.location.pathname !== '/') {
      window.history.pushState({}, '', '/');
    }
  }

  async function handleLogout() {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'same-origin',
      });
    } catch {
      // Ignore network errors during logout
    }
    setUser(null);
    setLinks([]);
    setAnalytics(null);
    setCluster(null);
    setLatestLink(null);
    setLatestTrace(null);
    setErrorMessage(null);
    setAuthMode('login');
    window.history.pushState({}, '', '/login');
  }

  function handleFocusCreate() {
    navigateTo('home');
    setTimeout(() => {
      urlInputRef.current?.focus();
    }, 50);
  }

  async function handleShorten(options: ShortenFormOptions): Promise<boolean> {
    setErrorMessage(null);
    setIsSubmitting(true);
    try {
      const res = await fetch('/api/shorten', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(options),
      });

      const payload = (await res.json()) as Partial<ShortenResponse> & {
        error?: string;
      };

      if (!res.ok || !payload.link || !payload.trace || !payload.cluster) {
        setErrorMessage(payload.error ?? 'Failed to shorten URL.');
        return false;
      }

      setLatestLink(payload.link);
      setLatestTrace(payload.trace);
      setCluster(payload.cluster);
      setLinks((prev) => [payload.link!, ...prev]);
      void fetchAnalytics();
      return true;
    } catch {
      setErrorMessage('Network error while contacting Short.ly backend.');
      return false;
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleEditLink(
    shortCode: string,
    payload: EditLinkPayload,
  ): Promise<string | null> {
    try {
      const res = await fetch(`/api/links/${encodeURIComponent(shortCode)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(payload),
      });
      const data = (await res.json()) as {
        link?: ShortLinkRecord;
        trace?: RequestTrace;
        cluster?: ClusterState;
        error?: string;
      };
      if (!res.ok || !data.link || !data.cluster) {
        return data.error ?? 'Failed to update link.';
      }
      setCluster(data.cluster);
      if (data.trace) setLatestTrace(data.trace);
      setLinks((prev) =>
        prev.map((item) =>
          item.shortCode === data.link!.shortCode ? data.link! : item,
        ),
      );
      setLatestLink((prev) =>
        prev?.shortCode === data.link!.shortCode ? data.link! : prev,
      );
      return null;
    } catch {
      return 'Network error while updating link.';
    }
  }

  async function handleSimulateLookup(shortCode: string, password?: string) {
    try {
      const res = await fetch(`/api/simulate/${encodeURIComponent(shortCode)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(password ? { password } : {}),
      });
      if (!res.ok) return;
      const data = (await res.json()) as {
        link: ShortLinkRecord;
        trace: RequestTrace;
        cluster: ClusterState;
      };

      setLatestTrace(data.trace);
      setCluster(data.cluster);
      setLatestLink((prev) =>
        prev?.shortCode === data.link.shortCode ? data.link : prev,
      );
      setLinks((prev) =>
        prev.map((item) =>
          item.shortCode === data.link.shortCode ? data.link : item,
        ),
      );
      void fetchAnalytics();
    } catch {
      setErrorMessage('Unable to reach server to simulate redirect lookup.');
    }
  }

  async function handleDelete(shortCode: string) {
    try {
      const res = await fetch(`/api/links/${encodeURIComponent(shortCode)}`, {
        method: 'DELETE',
        credentials: 'same-origin',
      });
      if (!res.ok) return;
      const data = (await res.json()) as {
        cluster: ClusterState;
        trace: RequestTrace;
      };
      setCluster(data.cluster);
      setLatestTrace(data.trace);
      setLinks((prev) => prev.filter((item) => item.shortCode !== shortCode));
      setLatestLink((prev) => (prev?.shortCode === shortCode ? null : prev));
      void fetchAnalytics();
    } catch {
      // Handled gracefully
    }
  }

  async function handleEvictCacheKey(shortCode: string) {
    try {
      const res = await fetch(
        `/api/cache/evict/${encodeURIComponent(shortCode)}`,
        {
          method: 'POST',
          credentials: 'same-origin',
        },
      );
      if (!res.ok) return;
      const data = (await res.json()) as { cluster: ClusterState };
      setCluster(data.cluster);
      setLinks((prev) =>
        prev.map((item) =>
          item.shortCode === shortCode
            ? { ...item, cachedInRedis: false }
            : item,
        ),
      );
      setLatestLink((prev) =>
        prev?.shortCode === shortCode
          ? { ...prev, cachedInRedis: false }
          : prev,
      );
    } catch {
      // Handled gracefully
    }
  }

  if (authChecking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F8FAFC] text-slate-600 dark:bg-[#090D16] dark:text-slate-400">
        <div className="space-y-1.5 text-center">
          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Short.ly</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">Verifying workspace session...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <AuthView
        mode={authMode}
        onModeChange={handleAuthModeChange}
        onAuthSuccess={handleAuthSuccess}
        databaseEngine={databaseEngine}
        theme={theme}
        onThemeChange={setTheme}
      />
    );
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900 dark:bg-[#090D16] dark:text-slate-100">
      <SidebarNav
        activeView={activeView}
        user={user}
        databaseEngine={cluster?.databaseEngine ?? databaseEngine}
        onNavigate={navigateTo}
        onLogout={handleLogout}
      />

      <div className="flex min-h-screen flex-col lg:pl-64">
        <TopWorkspaceBar
          activeView={activeView}
          user={user}
          theme={theme}
          onThemeChange={setTheme}
          onNavigate={navigateTo}
          onFocusCreate={handleFocusCreate}
          onLogout={handleLogout}
        />

        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          {activeView === 'home' && (
            <HomeShortener
              urlInputRef={urlInputRef}
              user={user}
              analytics={analytics}
              latestLink={latestLink}
              latestTrace={latestTrace}
              cluster={cluster}
              isSubmitting={isSubmitting}
              errorMessage={errorMessage}
              onShorten={handleShorten}
              onSimulateLookup={handleSimulateLookup}
              onRefreshCluster={refreshClusterOnly}
            />
          )}

          {activeView === 'dashboard' && (
            <DashboardView
              user={user}
              links={links}
              isLoading={isLoadingLinks}
              onEdit={handleEditLink}
              onDelete={handleDelete}
              onSimulateLookup={handleSimulateLookup}
              onGoToShortener={handleFocusCreate}
            />
          )}

          {activeView === 'analytics' && (
            <AnalyticsView
              analytics={analytics}
              isLoading={isLoadingAnalytics}
            />
          )}

          {activeView === 'cluster' && (
            <DistributedCluster
              cluster={cluster}
              compact={false}
              canEvict={user.role === 'admin'}
              onRefresh={refreshClusterOnly}
              onEvictCacheKey={handleEvictCacheKey}
            />
          )}
        </main>

        <footer className="border-t border-slate-200 bg-white py-4 text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 sm:px-6 lg:px-8">
            <span>Short.ly Enterprise Link Management</span>
            <span className="font-mono text-slate-400 dark:text-slate-500">
              {cluster?.databaseEngine ?? databaseEngine} · Base62 · A–M / N–Z Sharding · Redis Cache · 3-Node Round Robin
            </span>
          </div>
        </footer>
      </div>
    </div>
  );
}
