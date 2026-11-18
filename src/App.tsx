import { useCallback, useEffect, useRef, useState } from 'react';
import { AnalyticsView } from './components/AnalyticsView';
import { DashboardView } from './components/DashboardView';
import { DistributedCluster } from './components/DistributedCluster';
import { HomeShortener } from './components/HomeShortener';
import { Navbar, type ActiveView } from './components/Navbar';
import type {
  AnalyticsSummary,
  ClusterState,
  RequestTrace,
  ShortLinkRecord,
  ShortenResponse,
} from './types';

function viewFromPath(pathname: string): ActiveView {
  const clean = pathname.replace(/^\/+|\/+$/g, '').toLowerCase();
  if (clean === 'dashboard') return 'dashboard';
  if (clean === 'analytics') return 'analytics';
  if (clean === 'cluster') return 'cluster';
  return 'home';
}

export default function App() {
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

  const fetchLinksAndCluster = useCallback(async () => {
    try {
      const res = await fetch('/api/links');
      if (!res.ok) return;
      const data = (await res.json()) as {
        links: ShortLinkRecord[];
        cluster: ClusterState;
      };
      setLinks(data.links);
      setCluster(data.cluster);
    } finally {
      setIsLoadingLinks(false);
    }
  }, []);

  const fetchAnalytics = useCallback(async () => {
    try {
      const res = await fetch('/api/analytics');
      if (!res.ok) return;
      const data = (await res.json()) as {
        analytics: AnalyticsSummary;
        cluster: ClusterState;
      };
      setAnalytics(data.analytics);
      setCluster(data.cluster);
    } finally {
      setIsLoadingAnalytics(false);
    }
  }, []);

  const refreshClusterOnly = useCallback(async () => {
    const res = await fetch('/api/cluster');
    if (!res.ok) return;
    const data = (await res.json()) as { cluster: ClusterState };
    setCluster(data.cluster);
  }, []);

  useEffect(() => {
    void fetchLinksAndCluster();
    void fetchAnalytics();
  }, [fetchLinksAndCluster, fetchAnalytics]);

  // Refresh state when user returns from opening a 301 redirect in another tab
  useEffect(() => {
    function handleFocus() {
      void fetchLinksAndCluster();
      void fetchAnalytics();
    }
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [fetchLinksAndCluster, fetchAnalytics]);

  // Sync browser back/forward navigation
  useEffect(() => {
    function handlePopState() {
      setActiveView(viewFromPath(window.location.pathname));
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

  function handleFocusCreate() {
    navigateTo('home');
    setTimeout(() => {
      urlInputRef.current?.focus();
    }, 50);
  }

  async function handleShorten(url: string, customAlias: string) {
    setErrorMessage(null);
    setIsSubmitting(true);
    try {
      const res = await fetch('/api/shorten', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, customAlias }),
      });

      const payload = (await res.json()) as Partial<ShortenResponse> & {
        error?: string;
      };

      if (!res.ok || !payload.link || !payload.trace || !payload.cluster) {
        setErrorMessage(payload.error ?? 'Failed to shorten URL.');
        return;
      }

      setLatestLink(payload.link);
      setLatestTrace(payload.trace);
      setCluster(payload.cluster);
      setLinks((prev) => [payload.link!, ...prev]);
      void fetchAnalytics();
    } catch {
      setErrorMessage('Network error while contacting Short.ly backend.');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleSimulateLookup(shortCode: string) {
    const res = await fetch(`/api/simulate/${encodeURIComponent(shortCode)}`, {
      method: 'POST',
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
  }

  async function handleDelete(shortCode: string) {
    const res = await fetch(`/api/links/${encodeURIComponent(shortCode)}`, {
      method: 'DELETE',
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
  }

  async function handleEvictCacheKey(shortCode: string) {
    const res = await fetch(
      `/api/cache/evict/${encodeURIComponent(shortCode)}`,
      { method: 'POST' },
    );
    if (!res.ok) return;
    const data = (await res.json()) as { cluster: ClusterState };
    setCluster(data.cluster);
    setLinks((prev) =>
      prev.map((item) =>
        item.shortCode === shortCode ? { ...item, cachedInRedis: false } : item,
      ),
    );
    setLatestLink((prev) =>
      prev?.shortCode === shortCode ? { ...prev, cachedInRedis: false } : prev,
    );
  }

  return (
    <div className="flex min-h-screen flex-col text-slate-100">
      <Navbar
        activeView={activeView}
        onNavigate={navigateTo}
        onFocusCreate={handleFocusCreate}
      />

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6 sm:py-10">
        {activeView === 'home' && (
          <HomeShortener
            urlInputRef={urlInputRef}
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
            links={links}
            isLoading={isLoadingLinks}
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
            onRefresh={refreshClusterOnly}
            onEvictCacheKey={handleEvictCacheKey}
          />
        )}
      </main>

      <footer className="border-t border-slate-800/80 py-5 text-center text-xs text-slate-500">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 sm:px-6">
          <span>Short.ly Distributed URL Shortener</span>
          <span className="font-mono">
            Base62 Counter · SQLite Sharding (A–M / N–Z) · In-Memory Redis Cache · 3-Node Round Robin
          </span>
        </div>
      </footer>
    </div>
  );
}
