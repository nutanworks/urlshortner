import { useEffect, useState, type FormEvent, type RefObject } from 'react';
import QRCode from 'qrcode';
import {
  AlertCircle,
  ArrowRight,
  Check,
  Copy,
  Download,
  ExternalLink,
  Zap,
} from 'lucide-react';
import type { ClusterState, RequestTrace, ShortLinkRecord } from '../types';
import {
  normalizeAndValidateUrl,
  validateCustomAlias,
} from '../lib/distributed';
import { DistributedCluster } from './DistributedCluster';

interface HomeShortenerProps {
  urlInputRef: RefObject<HTMLInputElement | null>;
  latestLink: ShortLinkRecord | null;
  latestTrace: RequestTrace | null;
  cluster: ClusterState | null;
  isSubmitting: boolean;
  errorMessage: string | null;
  onShorten: (url: string, customAlias: string) => Promise<void>;
  onSimulateLookup: (shortCode: string) => Promise<void>;
  onRefreshCluster: () => void;
}

export function HomeShortener({
  urlInputRef,
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
        dark: '#0B0E17',
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
    await onShorten(urlCheck.url, trimmedAlias);
  }

  const displayedError = clientError ?? errorMessage;

  async function handleCopy() {
    if (!latestLink) return;
    try {
      await navigator.clipboard.writeText(liveShortHref);
      setCopiedCode(latestLink.shortCode);
      setTimeout(() => setCopiedCode(null), 1800);
    } catch {
      // Fallback selection copy if clipboard permission restricted
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

  return (
    <div className="space-y-14">
      {/* Hero Shortener Section */}
      <section className="mx-auto max-w-4xl pt-4 sm:pt-8">
        <div className="text-center">
          <p className="text-xs sm:text-sm font-medium text-violet-300">
            Base62 Counter Encoding · Sharded SQLite · In-Memory Redis Cache
          </p>
          <h1 className="mt-3 text-balance text-4xl font-extrabold tracking-tight text-slate-50 sm:text-5xl lg:text-6xl">
            Paste your{' '}
            <span className="bg-gradient-to-r from-violet-400 via-indigo-400 to-blue-400 bg-clip-text text-transparent">
              long URL
            </span>
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-base leading-relaxed text-slate-400">
            Generate compact links routed across 3 Round-Robin server nodes, cached in memory for sub-millisecond 301 redirects, and partitioned across A–M and N–Z database shards.
          </p>
        </div>

        {/* Shortener Form */}
        <form
          onSubmit={handleSubmit}
          noValidate
          className="mt-8 rounded-2xl border border-slate-800/90 bg-[#0F131E] p-4 sm:p-6"
        >
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="flex-1">
              <label htmlFor="long-url-input" className="sr-only">
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
                placeholder="https://example.com/very/long/destination/path?utm_source=web"
                autoComplete="url"
                className={`h-12 w-full rounded-xl border bg-[#080A10] px-4 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 ${
                  invalidField === 'url'
                    ? 'border-red-500/70 focus:border-red-500 focus:ring-red-500/30'
                    : 'border-slate-800 focus:border-violet-500 focus:ring-violet-500/30'
                }`}
              />
            </div>
            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 px-7 text-sm font-semibold text-white transition-all hover:from-violet-500 hover:to-indigo-500 disabled:opacity-60 whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
            >
              <span>{isSubmitting ? 'Shortening...' : 'Shorten'}</span>
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>

          {/* Custom Alias Row */}
          <div className="mt-3.5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <label
                htmlFor="custom-alias-input"
                className="text-xs font-medium text-slate-400 whitespace-nowrap"
              >
                Custom Alias (optional):
              </label>
              <div
                className={`flex min-w-0 flex-1 sm:flex-initial items-center overflow-hidden rounded-lg border bg-[#080A10] focus-within:ring-2 ${
                  invalidField === 'alias'
                    ? 'border-red-500/70 focus-within:border-red-500 focus-within:ring-red-500/30'
                    : 'border-slate-800 focus-within:border-violet-500 focus-within:ring-violet-500/30'
                }`}
              >
                <span className="border-r border-slate-800 px-2.5 py-1.5 font-mono text-xs text-slate-500 select-none whitespace-nowrap">
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
                  className="w-full min-w-[7rem] sm:w-44 bg-transparent px-2.5 py-1.5 font-mono text-xs text-slate-100 placeholder:text-slate-600 focus:outline-none"
                />
              </div>
            </div>
            <p className="text-xs text-slate-500">
              Leave blank for automatic Counter + Base62 code generation.
            </p>
          </div>

          {displayedError && (
            <div
              id="shortener-error"
              role="alert"
              className="mt-4 flex items-center gap-2 rounded-lg border border-red-500/40 bg-red-500/10 px-3.5 py-2.5 text-sm text-red-200"
            >
              <AlertCircle className="h-4 w-4 shrink-0 text-red-400" aria-hidden="true" />
              <span>{displayedError}</span>
            </div>
          )}
        </form>

        {/* Generated Short Link + QR Code Result Card */}
        {latestLink && (
          <div
            data-testid="shorten-result-card"
            className="mt-6 rounded-2xl border border-violet-500/40 bg-[#101524] p-5 sm:p-6"
          >
            <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
              <div className="min-w-0 flex-1 space-y-3">
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
                  <span className="font-semibold text-emerald-400">
                    Short Link Ready
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>{latestLink.shardLabel}</span>
                  <span aria-hidden="true">·</span>
                  <span>
                    {latestLink.cachedInRedis ? 'Cached in Redis' : 'Cold on Disk'}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono tabular-nums">
                    {latestLink.clicks} clicks
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <a
                    href={`/${latestLink.shortCode}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    data-testid="generated-short-url"
                    className="inline-flex items-center gap-2 font-mono text-xl sm:text-2xl font-bold text-slate-50 hover:text-violet-300 transition-colors"
                  >
                    <span>{latestLink.shortUrl}</span>
                    <ExternalLink className="h-4 w-4 text-slate-400" aria-hidden="true" />
                  </a>
                </div>

                <p
                  className="truncate text-sm text-slate-400"
                  title={latestLink.longUrl}
                >
                  Target: {latestLink.longUrl}
                </p>

                <div className="flex flex-wrap items-center gap-2.5 pt-1">
                  <button
                    type="button"
                    onClick={handleCopy}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-[#161C2E] px-3.5 py-2 text-xs font-semibold text-slate-100 transition-colors hover:border-violet-500/60 hover:bg-slate-800 whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
                  >
                    {copiedCode === latestLink.shortCode ? (
                      <>
                        <Check className="h-3.5 w-3.5 text-emerald-400" aria-hidden="true" />
                        <span>Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5 text-slate-300" aria-hidden="true" />
                        <span>Copy Link</span>
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={handleTestLookup}
                    disabled={simulating}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-500/40 bg-indigo-500/10 px-3.5 py-2 text-xs font-semibold text-indigo-200 transition-colors hover:bg-indigo-500/20 disabled:opacity-60 whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
                  >
                    <Zap className="h-3.5 w-3.5 text-indigo-300" aria-hidden="true" />
                    <span>{simulating ? 'Routing...' : 'Test 301 Lookup'}</span>
                  </button>
                </div>

                {/* Live Request Trace Summary */}
                {latestTrace && (
                  <div className="mt-3 rounded-lg border border-slate-800/90 bg-[#090C14] px-3.5 py-2.5 font-mono text-xs text-slate-300">
                    <span className="text-slate-500">Request Path: </span>
                    <span className="text-violet-300">{latestTrace.serverNode}</span>
                    <span className="mx-1.5 text-slate-600">{' -> '}</span>
                    <span
                      className={
                        latestTrace.cacheStatus === 'HIT'
                          ? 'text-emerald-400'
                          : latestTrace.cacheStatus === 'MISS'
                            ? 'text-amber-400'
                            : 'text-indigo-300'
                      }
                    >
                      Redis {latestTrace.cacheStatus}
                    </span>
                    <span className="mx-1.5 text-slate-600">{' -> '}</span>
                    <span className="text-blue-300">
                      {latestTrace.shardLabel ?? 'Global'}
                    </span>
                    <span className="mx-2 text-slate-600">{' · '}</span>
                    <span className="text-slate-400 tabular-nums">
                      HTTP {latestTrace.statusCode} ({latestTrace.latencyMs.toFixed(2)} ms)
                    </span>
                  </div>
                )}
              </div>

              {/* Scannable QR Code Panel */}
              <div className="flex flex-col items-center gap-2.5 self-start md:self-center rounded-xl border border-slate-800 bg-[#080A10] p-3.5">
                {qrDataUrl ? (
                  <img
                    src={qrDataUrl}
                    alt={`QR code for ${latestLink.shortUrl}`}
                    width={140}
                    height={140}
                    className="h-36 w-36 rounded-lg bg-white p-1"
                  />
                ) : (
                  <div className="flex h-36 w-36 items-center justify-center rounded-lg bg-slate-900 text-xs text-slate-500">
                    Generating QR
                  </div>
                )}
                {qrDataUrl && (
                  <a
                    href={qrDataUrl}
                    download={`shortly-${latestLink.shortCode}.png`}
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-300 hover:text-violet-300 transition-colors"
                  >
                    <Download className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Download QR</span>
                  </a>
                )}
              </div>
            </div>
          </div>
        )}
      </section>

      {/* How It Works — 3-step Distributed Architecture */}
      <section aria-labelledby="how-it-works-heading">
        <h2
          id="how-it-works-heading"
          className="text-lg font-semibold tracking-tight text-slate-100"
        >
          How It Works
        </h2>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <div className="rounded-xl border border-slate-800/90 bg-[#0F131E] p-5">
            <h3 className="text-sm font-semibold text-slate-100">
              01. Counter + Base62 Encoding
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-400">
              Each URL increments an atomic sequence counter and encodes it into a 6-character Base62 identifier (<span className="font-mono text-xs text-slate-300">A–Z, a–z, 0–9</span>) or accepts your custom alias.
            </p>
          </div>
          <div className="rounded-xl border border-slate-800/90 bg-[#0F131E] p-5">
            <h3 className="text-sm font-semibold text-slate-100">
              02. Cache-Aside Redis Lookup
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-400">
              Redirects first query the in-memory Redis dictionary. Cache hits resolve immediately in O(1); misses query SQLite and warm the cache before serving a <span className="font-mono text-xs text-slate-300">301</span> redirect.
            </p>
          </div>
          <div className="rounded-xl border border-slate-800/90 bg-[#0F131E] p-5">
            <h3 className="text-sm font-semibold text-slate-100">
              03. Horizontal SQLite Sharding
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-400">
              Codes starting with <span className="font-mono text-xs text-indigo-300 whitespace-nowrap">A–M</span> partition into <span className="font-mono text-xs text-slate-200 whitespace-nowrap">DB 1</span> while <span className="font-mono text-xs text-blue-300 whitespace-nowrap">N–Z</span> route to <span className="font-mono text-xs text-slate-200 whitespace-nowrap">DB 2</span>, balanced across 3 Round-Robin nodes.
            </p>
          </div>
        </div>
      </section>

      {/* Live Distributed Cluster Preview */}
      <DistributedCluster
        cluster={cluster}
        compact
        onRefresh={onRefreshCluster}
      />
    </div>
  );
}
