import { useState } from 'react';
import type { AnalyticsSummary } from '../types';

interface AnalyticsViewProps {
  analytics: AnalyticsSummary | null;
  isLoading: boolean;
}

export function AnalyticsView({ analytics, isLoading }: AnalyticsViewProps) {
  const [hoveredDay, setHoveredDay] = useState<string | null>(null);

  if (isLoading || !analytics) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="h-24 animate-pulse rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
            />
          ))}
        </div>
        <div className="h-72 animate-pulse rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900" />
      </div>
    );
  }

  const maxDailyClicks = Math.max(
    10,
    ...analytics.clicksPerDay.map((d) => d.clicks),
  );
  const totalShardLinks = Math.max(1, analytics.db1Links + analytics.db2Links);
  const db1Percent = Math.round((analytics.db1Links / totalShardLinks) * 100);
  const db2Percent = 100 - db1Percent;

  // Responsive SVG chart geometry
  const chartWidth = 680;
  const chartHeight = 220;
  const padLeft = 42;
  const padRight = 16;
  const padTop = 18;
  const padBottom = 32;
  const innerWidth = chartWidth - padLeft - padRight;
  const innerHeight = chartHeight - padTop - padBottom;
  const barCount = Math.max(1, analytics.clicksPerDay.length);
  const slotWidth = innerWidth / barCount;
  const barWidth = Math.min(44, slotWidth * 0.52);

  return (
    <section aria-labelledby="analytics-heading" className="space-y-6">
      <div>
        <h1
          id="analytics-heading"
          className="text-2xl font-bold tracking-tight text-slate-950 dark:text-white"
        >
          Traffic Analytics
        </h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Aggregated link creation, 7-day redirect volume, cache hit efficiency, shard distribution, and device/browser breakdown.
        </p>
      </div>

      {/* 4 KPI Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Total Links Created</p>
          <p
            data-testid="metric-total-links"
            className="mt-2 font-mono text-3xl font-bold text-slate-950 dark:text-white tabular-nums"
          >
            {analytics.totalLinks}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Across DB 1 & DB 2 shards
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Total Clicks</p>
          <p
            data-testid="metric-total-clicks"
            className="mt-2 font-mono text-3xl font-bold text-slate-950 dark:text-white tabular-nums"
          >
            {analytics.totalClicks}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            301 redirects served
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Redis Cache Hit Rate</p>
          <p className="mt-2 font-mono text-3xl font-bold text-emerald-700 dark:text-emerald-400 tabular-nums">
            {analytics.cacheHitRate}%
          </p>
          <p className="mt-1 font-mono text-xs text-slate-500 dark:text-slate-400 tabular-nums">
            {analytics.cacheHits} hits · {analytics.cacheMisses} misses
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Shard Balance</p>
          <p className="mt-2 font-mono text-3xl font-bold text-blue-700 dark:text-blue-400 tabular-nums">
            {analytics.db1Links} / {analytics.db2Links}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            DB 1 (A–M) vs DB 2 (N–Z)
          </p>
        </div>
      </div>

      {/* Bar Chart + Top Links Grid */}
      <div className="grid gap-6 lg:grid-cols-12">
        {/* Clicks Per Day Bar Chart */}
        <div className="lg:col-span-8 rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-semibold text-slate-950 dark:text-white">
                Clicks Per Day (Last 7 Days)
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Hover any bar to inspect exact daily click totals
              </p>
            </div>
            {hoveredDay && (
              <div className="font-mono text-xs font-semibold text-blue-700 dark:text-blue-400 tabular-nums">
                {hoveredDay}
              </div>
            )}
          </div>

          <div className="mt-4 w-full overflow-x-auto">
            <svg
              viewBox={`0 0 ${chartWidth} ${chartHeight}`}
              role="img"
              aria-label="Bar chart showing clicks per day over the last 7 days"
              className="h-56 w-full min-w-[440px]"
            >
              {/* Horizontal Gridlines & Y-Axis Ticks */}
              {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
                const y = padTop + innerHeight * (1 - ratio);
                const tickVal = Math.round(maxDailyClicks * ratio);
                return (
                  <g key={ratio}>
                    <line
                      x1={padLeft}
                      y1={y}
                      x2={chartWidth - padRight}
                      y2={y}
                      className="stroke-slate-200 dark:stroke-slate-800"
                      strokeDasharray={ratio === 0 ? undefined : '3 3'}
                    />
                    <text
                      x={padLeft - 8}
                      y={y + 4}
                      textAnchor="end"
                      className="fill-slate-500 dark:fill-slate-400"
                      fontSize="11"
                      fontFamily="JetBrains Mono, monospace"
                    >
                      {tickVal}
                    </text>
                  </g>
                );
              })}

              {/* Bars */}
              {analytics.clicksPerDay.map((point, idx) => {
                const barH = Math.max(
                  point.clicks > 0 ? 4 : 0,
                  (point.clicks / maxDailyClicks) * innerHeight,
                );
                const x = padLeft + idx * slotWidth + (slotWidth - barWidth) / 2;
                const y = padTop + innerHeight - barH;
                const labelText = `${point.label}: ${point.clicks} clicks`;

                return (
                  <g
                    key={point.date}
                    onMouseEnter={() => setHoveredDay(labelText)}
                    onMouseLeave={() => setHoveredDay(null)}
                    className="cursor-pointer"
                  >
                    <rect
                      x={x}
                      y={y}
                      width={barWidth}
                      height={barH}
                      rx={4}
                      className={
                        hoveredDay === labelText
                          ? 'fill-blue-700 dark:fill-blue-400'
                          : 'fill-blue-600 dark:fill-blue-500'
                      }
                    >
                      <title>{labelText}</title>
                    </rect>
                    <text
                      x={x + barWidth / 2}
                      y={padTop + innerHeight + 18}
                      textAnchor="middle"
                      className="fill-slate-500 dark:fill-slate-400"
                      fontSize="11"
                      fontFamily="JetBrains Mono, monospace"
                    >
                      {point.label}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>
        </div>

        {/* Shard Distribution + Top Links */}
        <div className="lg:col-span-4 space-y-6">
          <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <h2 className="text-base font-semibold text-slate-950 dark:text-white">
              Shard Key Distribution
            </h2>
            <div className="mt-4 flex h-2.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
              <div
                style={{ width: `${db1Percent}%` }}
                className="bg-slate-900 dark:bg-slate-300 transition-all"
                title={`DB 1 (A-M): ${db1Percent}%`}
              />
              <div
                style={{ width: `${db2Percent}%` }}
                className="bg-blue-600 dark:bg-blue-500 transition-all"
                title={`DB 2 (N-Z): ${db2Percent}%`}
              />
            </div>
            <div className="mt-3 flex items-center justify-between text-xs font-mono">
              <span className="font-semibold text-slate-800 dark:text-slate-200 tabular-nums">
                DB 1 (A–M): {db1Percent}%
              </span>
              <span className="font-semibold text-blue-700 dark:text-blue-400 tabular-nums">
                DB 2 (N–Z): {db2Percent}%
              </span>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <h2 className="text-base font-semibold text-slate-950 dark:text-white">
              Top Short Links
            </h2>
            {analytics.topLinks.length === 0 ? (
              <p className="mt-4 text-xs text-slate-500 dark:text-slate-400">
                No click activity recorded yet.
              </p>
            ) : (
              <ul className="mt-3 divide-y divide-slate-100 dark:divide-slate-800">
                {analytics.topLinks.map((item) => (
                  <li
                    key={item.shortCode}
                    className="flex items-center justify-between gap-3 py-2.5 text-xs"
                  >
                    <div className="min-w-0">
                      <a
                        href={`/${item.shortCode}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-mono font-semibold text-blue-700 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
                      >
                        /{item.shortCode}
                      </a>
                      <p className="truncate text-slate-500 dark:text-slate-400" title={item.longUrl}>
                        {item.longUrl}
                      </p>
                    </div>
                    <span className="font-mono font-semibold text-slate-900 dark:text-slate-100 tabular-nums shrink-0">
                      {item.clicks}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      {/* Click Telemetry: Device & Browser Breakdown */}
      <div className="grid gap-6 md:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <h2 className="text-base font-semibold text-slate-950 dark:text-white">
            Clicks by Device
          </h2>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            Parsed from redirect User-Agent logs in the clicks collection
          </p>
          {analytics.deviceBreakdown.length === 0 ? (
            <p className="mt-5 text-xs text-slate-500 dark:text-slate-400">
              No device events recorded yet.
            </p>
          ) : (
            <ul className="mt-4 space-y-3">
              {analytics.deviceBreakdown.map((item) => (
                <li key={item.label} className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-slate-800 dark:text-slate-200">
                      {item.label}
                    </span>
                    <span className="font-mono text-slate-500 dark:text-slate-400 tabular-nums">
                      {item.count} ({item.percent}%)
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                    <div
                      style={{ width: `${item.percent}%` }}
                      className="h-full bg-slate-900 dark:bg-slate-300"
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <h2 className="text-base font-semibold text-slate-950 dark:text-white">
            Clicks by Browser
          </h2>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            Browser distribution across recorded redirect events
          </p>
          {analytics.browserBreakdown.length === 0 ? (
            <p className="mt-5 text-xs text-slate-500 dark:text-slate-400">
              No browser events recorded yet.
            </p>
          ) : (
            <ul className="mt-4 space-y-3">
              {analytics.browserBreakdown.map((item) => (
                <li key={item.label} className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-slate-800 dark:text-slate-200">
                      {item.label}
                    </span>
                    <span className="font-mono text-slate-500 dark:text-slate-400 tabular-nums">
                      {item.count} ({item.percent}%)
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                    <div
                      style={{ width: `${item.percent}%` }}
                      className="h-full bg-blue-600 dark:bg-blue-500"
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
