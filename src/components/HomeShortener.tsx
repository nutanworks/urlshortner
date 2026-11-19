import { useEffect, useState, type FormEvent, type RefObject } from 'react';
import QRCode from 'qrcode';
import {
  AlertCircle,
  ArrowRight,
  Calendar,
  Check,
  Copy,
  Download,
  ExternalLink,
  Lock,
  Share2,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  Zap,
} from 'lucide-react';
import type {
  AnalyticsSummary,
  AuthUser,
  ClusterState,
  RequestTrace,
  ShortLinkRecord,
} from '../types';
import {
  normalizeAndValidateUrl,
  validateCustomAlias,
} from '../lib/distributed';
import { DistributedCluster } from './DistributedCluster';

export interface ShortenFormOptions {
  url: string;
  customAlias: string;
  expiryDate: string | null;
  linkPassword: string;
}

interface HomeShortenerProps {
  urlInputRef: RefObject<HTMLInputElement | null>;
  user: AuthUser;
  analytics: AnalyticsSummary | null;
  latestLink: ShortLinkRecord | null;
  latestTrace: RequestTrace | null;
  cluster: ClusterState | null;
  isSubmitting: boolean;
  errorMessage: string | null;
  onShorten: (options: ShortenFormOptions) => Promise<boolean>;
  onSimulateLookup: (shortCode: string, password?: string) => Promise<void>;
  onRefreshCluster: () => void;
}

export function HomeShortener({
  urlInputRef,
  user,
  analytics,
  latestLink,
  latestTrace,
  cluster,
  isSubmitting,
  errorMessage,
  onShorten,
  onSimulateLookup,
  onRefreshCluster,
}: HomeShortenerProps) {
  const [longUrl, setLongUrl] = useState('');
  const [customAlias, setCustomAlias] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [expiryDate, setExpiryDate] = useState('');
  const [linkPassword, setLinkPassword] = useState('');
  const [clientError, setClientError] = useState<string | null>(null);
  const [invalidField, setInvalidField] = useState<'url' | 'alias' | null>(null);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [simulating, setSimulating] = useState(false);

  const origin =
    typeof window !== 'undefined' ? window.location.origin : 'https://short.ly';

  const liveShortHref = latestLink
    ? `${origin}/${latestLink.shortCode}`
    : '';

  useEffect(() => {
    let active = true;
    if (!latestLink) {
      setQrDataUrl('');
      return;
    }

    const targetUrl = `${window.location.origin}/${latestLink.shortCode}`;
    QRCode.toDataURL(targetUrl, {
      width: 220,
      margin: 2,
      color: {
        dark: '#0F172A',
        light: '#FFFFFF',
      },
    })
      .then((dataUrl) => {
        if (active) setQrDataUrl(dataUrl);
      })
      .catch(() => {
        if (active) setQrDataUrl('');
      });

    return () => {
      active = false;
    };
  }, [latestLink]);

  function handleUrlChange(value: string) {
    setLongUrl(value);
    if (clientError && invalidField === 'url') {
      const check = normalizeAndValidateUrl(value);
      if (check.ok || !value.trim()) {
        setClientError(null);
        setInvalidField(null);
      }
    }
  }

  function handleUrlBlur() {
    if (!longUrl.trim()) return;
    const check = normalizeAndValidateUrl(longUrl);
    if (!check.ok) {
      setClientError(check.error);
      setInvalidField('url');
    }
  }

  function handleAliasChange(value: string) {
    setCustomAlias(value);
    if (clientError && invalidField === 'alias') {
      if (!value.trim() || validateCustomAlias(value).ok) {
        setClientError(null);
        setInvalidField(null);
      }
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();

    const urlCheck = normalizeAndValidateUrl(longUrl);
    if (!urlCheck.ok) {
      setClientError(urlCheck.error);
      setInvalidField('url');
      urlInputRef.current?.focus();
      return;
    }

    const trimmedAlias = customAlias.trim();
    if (trimmedAlias.length > 0) {
      const aliasCheck = validateCustomAlias(trimmedAlias);
      if (!aliasCheck.ok) {
        setClientError(aliasCheck.error);
        setInvalidField('alias');
        return;
      }
    }

    setClientError(null);
    setInvalidField(null);
    const created = await onShorten({
      url: urlCheck.url,
      customAlias: trimmedAlias,
      expiryDate: expiryDate ? new Date(expiryDate).toISOString() : null,
      linkPassword: linkPassword.trim(),
    });

    if (created) {
      setLongUrl('');
      setCustomAlias('');
      setExpiryDate('');
      setLinkPassword('');
    }
  }

  const displayedError = clientError ?? errorMessage;
  const isSecurityBlock = Boolean(
    displayedError && /blocked malicious url/i.test(displayedError),
  );

  async function handleCopy() {
    if (!latestLink) return;
    try {
      await navigator.clipboard.writeText(liveShortHref);
      setCopiedCode(latestLink.shortCode);
      setTimeout(() => setCopiedCode(null), 1800);
    } catch {
      const input = document.createElement('input');
      input.value = liveShortHref;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
      setCopiedCode(latestLink.shortCode);
      setTimeout(() => setCopiedCode(null), 1800);
    }
  }

  async function handleTestLookup() {
    if (!latestLink || simulating) return;
    setSimulating(true);
    try {
      await onSimulateLookup(latestLink.shortCode);
    } finally {
      setSimulating(false);
    }
  }

  async function handleNativeShare() {
    if (!latestLink) return;
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({
          title: `Short.ly · ${latestLink.shortUrl}`,
          text: `Open ${latestLink.longUrl} via Short.ly`,
          url: liveShortHref,
        });
        return;
      } catch {
        // User cancelled or share unavailable; fall back to copy
      }
    }
    await handleCopy();
  }

  return (
    <div className="space-y-8">
      {/* Page Title & Live KPI Summary Row */}
      <section className="space-y-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-950 dark:text-white">
              URL Shortener
            </h1>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              Create Base62 or custom-alias short links routed across 3 server nodes and partitioned across A–M / N–Z shards.
            </p>
          </div>
          <div className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
            <ShieldCheck className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>Malicious URL Filter Active</span>
          </div>
        </div>

        {/* 4-Column Executive KPI Strip */}
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Total Links</p>
            <p className="mt-1.5 font-mono text-2xl font-bold text-slate-950 dark:text-white tabular-nums">
              {analytics ? analytics.totalLinks : '—'}
            </p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Partitioned across 2 shards
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Total Redirects</p>
            <p className="mt-1.5 font-mono text-2xl font-bold text-slate-950 dark:text-white tabular-nums">
              {analytics ? analytics.totalClicks : '—'}
            </p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              HTTP 301 click events logged
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Redis Hit Rate</p>
            <p className="mt-1.5 font-mono text-2xl font-bold text-emerald-700 dark:text-emerald-400 tabular-nums">
              {analytics ? `${analytics.cacheHitRate}%` : '—'}
            </p>
            <p className="mt-1 font-mono text-xs text-slate-500 dark:text-slate-400 tabular-nums">
              {cluster ? `${cluster.cache.totalKeys} warm keys` : 'Cache-aside layer'}
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Active Role</p>
            <p className="mt-1.5 text-2xl font-bold tracking-tight text-slate-950 dark:text-white">
              {user.role === 'admin' ? 'Admin' : 'Standard User'}
            </p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {user.role === 'admin'
                ? 'Create, edit & remove access'
                : 'View & shorten access'}
            </p>
          </div>
        </div>
      </section>

      {/* Primary Shortener Panel */}
      <section aria-labelledby="create-link-heading">
        <form
          onSubmit={handleSubmit}
          noValidate
          className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6 dark:border-slate-800 dark:bg-slate-900"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-4 dark:border-slate-800">
            <div>
              <h2
                id="create-link-heading"
                className="text-base font-semibold text-slate-950 dark:text-white"
              >
                Create Short Link
              </h2>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                Paste a destination URL below. Leave alias blank for automatic Counter + Base62 encoding.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowAdvanced((v) => !v)}
              aria-expanded={showAdvanced}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:border-slate-300 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-slate-600 dark:hover:bg-slate-700 whitespace-nowrap shrink-0"
            >
              <SlidersHorizontal className="h-3.5 w-3.5 text-slate-500 dark:text-slate-400" aria-hidden="true" />
              <span>
                {showAdvanced
                  ? 'Hide Expiry & Password'
                  : 'Expiry & Password Options'}
              </span>
            </button>
          </div>

          <div className="mt-5 grid gap-4 lg:grid-cols-12">
            {/* Destination URL */}
            <div className="lg:col-span-7">
              <label
                htmlFor="long-url-input"
                className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
              >
                Destination URL
              </label>
              <input
                ref={urlInputRef}
                id="long-url-input"
                type="url"
                value={longUrl}
                onChange={(e) => handleUrlChange(e.target.value)}
                onBlur={handleUrlBlur}
                aria-invalid={invalidField === 'url' ? 'true' : undefined}
                aria-describedby={displayedError ? 'shortener-error' : undefined}
                placeholder="https://example.com/documentation/release-notes"
                autoComplete="url"
                className={`mt-1.5 h-11 w-full rounded-lg border bg-white px-3.5 text-sm text-slate-950 placeholder:text-slate-400 focus:outline-none focus:ring-2 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500 ${
                  invalidField === 'url'
                    ? 'border-red-400 focus:border-red-500 focus:ring-red-500/20 dark:border-red-500/70'
                    : 'border-slate-300 focus:border-blue-600 focus:ring-blue-600/20 dark:border-slate-700 dark:focus:border-blue-500'
                }`}
              />
            </div>

            {/* Custom Alias */}
            <div className="lg:col-span-3">
              <label
                htmlFor="custom-alias-input"
                className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
              >
                Custom Alias (optional)
              </label>
              <div
                className={`mt-1.5 flex h-11 items-center overflow-hidden rounded-lg border bg-white focus-within:ring-2 dark:bg-slate-950 ${
                  invalidField === 'alias'
                    ? 'border-red-400 focus-within:border-red-500 focus-within:ring-red-500/20 dark:border-red-500/70'
                    : 'border-slate-300 focus-within:border-blue-600 focus-within:ring-blue-600/20 dark:border-slate-700 dark:focus-within:border-blue-500'
                }`}
              >
                <span className="flex h-full items-center border-r border-slate-200 bg-slate-50 px-2.5 font-mono text-xs text-slate-500 select-none whitespace-nowrap dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
                  short.ly/
                </span>
                <input
                  id="custom-alias-input"
                  type="text"
                  value={customAlias}
                  onChange={(e) => handleAliasChange(e.target.value)}
                  aria-invalid={invalidField === 'alias' ? 'true' : undefined}
                  aria-describedby={displayedError ? 'shortener-error' : undefined}
                  placeholder="my-link"
                  maxLength={32}
                  className="h-full w-full min-w-0 bg-transparent px-2.5 font-mono text-xs text-slate-950 placeholder:text-slate-400 focus:outline-none dark:text-slate-100 dark:placeholder:text-slate-500"
                />
              </div>
            </div>

            {/* Submit Button */}
            <div className="flex items-end lg:col-span-2">
              <button
                type="submit"
                disabled={isSubmitting}
                className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-slate-950 px-5 text-sm font-semibold text-white transition-colors hover:bg-slate-800 disabled:opacity-60 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200 whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900"
              >
                <span>{isSubmitting ? 'Creating...' : 'Shorten'}</span>
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </div>

          {/* Optional Expiry Date & Link Password Row */}
          {showAdvanced && (
            <div className="mt-4 grid gap-4 border-t border-slate-100 pt-4 sm:grid-cols-2 dark:border-slate-800">
              <div>
                <label
                  htmlFor="expiry-date-input"
                  className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300"
                >
                  <Calendar className="h-3.5 w-3.5 text-slate-400 dark:text-slate-500" aria-hidden="true" />
                  <span>Expiry Date (optional)</span>
                </label>
                <input
                  id="expiry-date-input"
                  type="datetime-local"
                  value={expiryDate}
                  onChange={(e) => setExpiryDate(e.target.value)}
                  className="mt-1.5 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-xs font-mono text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus:border-blue-500"
                />
              </div>
              <div>
                <label
                  htmlFor="link-password-input"
                  className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300"
                >
                  <Lock className="h-3.5 w-3.5 text-slate-400 dark:text-slate-500" aria-hidden="true" />
                  <span>Link Password (optional)</span>
                </label>
                <input
                  id="link-password-input"
                  type="password"
                  value={linkPassword}
                  onChange={(e) => setLinkPassword(e.target.value)}
                  placeholder="Require password before redirect"
                  className="mt-1.5 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-xs text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-blue-500"
                />
              </div>
            </div>
          )}

          <p className="mt-3.5 text-xs text-slate-500 dark:text-slate-400">
            Security policy: Destinations containing{' '}
            <span className="font-mono text-slate-700 dark:text-slate-300">phishing</span>,{' '}
            <span className="font-mono text-slate-700 dark:text-slate-300">malware</span>, or{' '}
            <span className="font-mono text-slate-700 dark:text-slate-300">.exe</span> are automatically blocked.
          </p>

          {displayedError && (
            <div
              id="shortener-error"
              role="alert"
              className="mt-4 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/50 dark:text-red-300"
            >
              {isSecurityBlock ? (
                <ShieldAlert className="h-4 w-4 shrink-0 text-red-600 dark:text-red-400" aria-hidden="true" />
              ) : (
                <AlertCircle className="h-4 w-4 shrink-0 text-red-600 dark:text-red-400" aria-hidden="true" />
              )}
              <span>{displayedError}</span>
            </div>
          )}
        </form>

        {/* Generated Short Link + QR Result Panel */}
        {latestLink && (
          <div
            data-testid="shorten-result-card"
            className="mt-5 rounded-xl border border-blue-200 bg-white p-5 sm:p-6 dark:border-blue-900/60 dark:bg-slate-900"
          >
            <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
              <div className="min-w-0 flex-1 space-y-3">
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                  <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                    Link Created
                  </span>
                  <span aria-hidden="true">·</span>
                  <span className="font-medium text-slate-700 dark:text-slate-200">
                    {latestLink.shardLabel}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>
                    {latestLink.cachedInRedis ? 'Cached in Redis' : 'Cold on Disk'}
                  </span>
                  {latestLink.hasPassword && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="font-medium text-amber-700 dark:text-amber-400">
                        Password Protected
                      </span>
                    </>
                  )}
                  {latestLink.expiryDate && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono text-slate-600 dark:text-slate-300">
                        Expires{' '}
                        {new Date(latestLink.expiryDate).toLocaleDateString()}
                      </span>
                    </>
                  )}
                  <span aria-hidden="true">·</span>
                  <span className="font-mono tabular-nums">
                    {latestLink.clicks} clicks
                  </span>
                </div>

                <div>
                  <a
                    href={`/${latestLink.shortCode}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    data-testid="generated-short-url"
                    className="inline-flex items-center gap-2 font-mono text-xl sm:text-2xl font-bold text-slate-950 hover:text-blue-600 dark:text-white dark:hover:text-blue-400 transition-colors"
                  >
                    <span>{latestLink.shortUrl}</span>
                    <ExternalLink className="h-4 w-4 text-slate-400 dark:text-slate-500" aria-hidden="true" />
                  </a>
                </div>

                <div className="space-y-1 text-xs">
                  <p className="truncate font-mono text-blue-700 dark:text-blue-400" title={liveShortHref}>
                    {liveShortHref}
                  </p>
                  <p
                    className="truncate text-slate-500 dark:text-slate-400"
                    title={latestLink.longUrl}
                  >
                    Destination: {latestLink.longUrl}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={handleCopy}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-slate-950 px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200 whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                  >
                    {copiedCode === latestLink.shortCode ? (
                      <>
                        <Check className="h-3.5 w-3.5 text-emerald-400 dark:text-emerald-600" aria-hidden="true" />
                        <span>Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>Copy Link</span>
                      </>
                    )}
                  </button>

                  <a
                    href={`https://wa.me/?text=${encodeURIComponent(liveShortHref)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 transition-colors hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-800 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:border-emerald-700 dark:hover:bg-emerald-950/40 dark:hover:text-emerald-300 whitespace-nowrap shrink-0"
                  >
                    <Share2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                    <span>WhatsApp</span>
                  </a>

                  <button
                    type="button"
                    onClick={handleNativeShare}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-800 whitespace-nowrap shrink-0"
                  >
                    <Share2 className="h-3.5 w-3.5 text-slate-500 dark:text-slate-400" aria-hidden="true" />
                    <span>Share</span>
                  </button>

                  {!latestLink.hasPassword && (
                    <button
                      type="button"
                      onClick={handleTestLookup}
                      disabled={simulating}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3.5 py-2 text-xs font-semibold text-blue-700 transition-colors hover:bg-blue-100 disabled:opacity-60 dark:border-blue-900/70 dark:bg-blue-950/50 dark:text-blue-300 dark:hover:bg-blue-950 whitespace-nowrap shrink-0"
                    >
                      <Zap className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" aria-hidden="true" />
                      <span>{simulating ? 'Routing...' : 'Test 301 Lookup'}</span>
                    </button>
                  )}
                </div>

                {/* Request Path Trace */}
                {latestTrace && (
                  <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2 font-mono text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300">
                    <span className="text-slate-400 dark:text-slate-500">Trace: </span>
                    <span className="font-semibold text-slate-900 dark:text-white">
                      {latestTrace.serverNode}
                    </span>
                    <span className="mx-1.5 text-slate-400 dark:text-slate-600">{' -> '}</span>
                    <span
                      className={
                        latestTrace.cacheStatus === 'HIT'
                          ? 'font-semibold text-emerald-700 dark:text-emerald-400'
                          : latestTrace.cacheStatus === 'MISS'
                            ? 'font-semibold text-amber-700 dark:text-amber-400'
                            : 'font-semibold text-blue-700 dark:text-blue-400'
                      }
                    >
                      Redis {latestTrace.cacheStatus}
                    </span>
                    <span className="mx-1.5 text-slate-400 dark:text-slate-600">{' -> '}</span>
                    <span className="text-slate-800 dark:text-slate-200">
                      {latestTrace.shardLabel ?? 'Global'}
                    </span>
                    <span className="mx-2 text-slate-300 dark:text-slate-700">{' · '}</span>
                    <span className="text-slate-500 dark:text-slate-400 tabular-nums">
                      HTTP {latestTrace.statusCode} ({latestTrace.latencyMs.toFixed(2)} ms)
                    </span>
                  </div>
                )}
              </div>

              {/* Scannable QR Code Panel */}
              <div className="flex flex-col items-center gap-2 self-start md:self-center rounded-xl border border-slate-200 bg-slate-50 p-3.5 dark:border-slate-800 dark:bg-slate-950">
                {qrDataUrl ? (
                  <img
                    src={qrDataUrl}
                    alt={`QR code for ${latestLink.shortUrl}`}
                    width={136}
                    height={136}
                    className="h-34 w-34 rounded-lg border border-slate-200 bg-white p-1.5 dark:border-slate-700"
                  />
                ) : (
                  <div className="flex h-34 w-34 items-center justify-center rounded-lg bg-slate-100 text-xs text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                    Generating QR
                  </div>
                )}
                {qrDataUrl && (
                  <a
                    href={qrDataUrl}
                    download={`shortly-${latestLink.shortCode}.png`}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700 hover:text-blue-600 dark:text-slate-300 dark:hover:text-blue-400 transition-colors"
                  >
                    <Download className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Download PNG</span>
                  </a>
                )}
              </div>
            </div>
          </div>
        )}
      </section>

      {/* Live Distributed Cluster Preview */}
      <DistributedCluster
        cluster={cluster}
        compact
        canEvict={user.role === 'admin'}
        onRefresh={onRefreshCluster}
      />
    </div>
  );
}
