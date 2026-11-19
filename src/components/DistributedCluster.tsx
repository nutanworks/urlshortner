import { Database, HardDrive, Layers, RefreshCw, Server, Trash2 } from 'lucide-react';
import type { ClusterState } from '../types';

interface DistributedClusterProps {
  cluster: ClusterState | null;
  compact?: boolean;
  canEvict?: boolean;
  onRefresh?: () => void;
  onEvictCacheKey?: (shortCode: string) => void;
}

export function DistributedCluster({
  cluster,
  compact = false,
  canEvict = false,
  onRefresh,
  onEvictCacheKey,
}: DistributedClusterProps) {
  if (!cluster) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <div className="h-5 w-48 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          {[1, 2, 3].map((n) => (
            <div
              key={n}
              className="h-24 animate-pulse rounded-lg border border-slate-100 bg-slate-50 dark:border-slate-800 dark:bg-slate-950"
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <section aria-labelledby="cluster-heading" className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2
            id="cluster-heading"
            className={
              compact
                ? 'text-base font-semibold tracking-tight text-slate-950 dark:text-white'
                : 'text-2xl font-bold tracking-tight text-slate-950 dark:text-white'
            }
          >
            Distributed Cluster Topology
          </h2>
          <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-400">
            <span
              data-testid="database-engine-label"
              className={
                cluster.databaseEngine === 'MongoDB Atlas'
                  ? 'font-semibold text-emerald-700 dark:text-emerald-400'
                  : 'font-semibold text-amber-700 dark:text-amber-400'
              }
            >
              {cluster.databaseEngine} ({cluster.databaseName})
            </span>
            <span aria-hidden="true" className="mx-1.5 text-slate-300 dark:text-slate-600">
              ·
            </span>
            Round-Robin Load Balancer (3 nodes) · Partitioned Shards (A–M / N–Z) · In-memory Redis cache
          </p>
        </div>
        {onRefresh && (
          <button
            type="button"
            onClick={onRefresh}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition-colors hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-slate-600 dark:hover:bg-slate-800 whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
          >
            <RefreshCw className="h-3.5 w-3.5 text-slate-500 dark:text-slate-400" aria-hidden="true" />
            <span>Refresh State</span>
          </button>
        )}
      </div>

      {/* 3 Server Nodes (Load Balancer Simulation - Round Robin) */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3.5 dark:border-slate-800">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white">
            <Layers className="h-4 w-4 text-blue-600 dark:text-blue-400" aria-hidden="true" />
            <span>Load Balancer · Round Robin</span>
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
            Last handled by:{' '}
            <span className="font-semibold text-slate-900 dark:text-white">
              {cluster.lastActiveNode}
            </span>
            <span aria-hidden="true" className="mx-2 text-slate-300 dark:text-slate-600">
              ·
            </span>
            Next turn:{' '}
            <span className="font-medium text-blue-700 dark:text-blue-400">
              Server {cluster.nextNodeIndex + 1}
            </span>
          </div>
        </div>

        <div className="mt-4 grid gap-3.5 md:grid-cols-3">
          {cluster.nodes.map((node) => {
            const active = node.isLastActive;
            return (
              <div
                key={node.id}
                data-testid={`server-node-${node.id}`}
                data-active={active ? 'true' : 'false'}
                className={`rounded-lg border p-4 transition-colors ${
                  active
                    ? 'border-blue-300 bg-blue-50/50 dark:border-blue-700/80 dark:bg-blue-950/35'
                    : 'border-slate-200 bg-slate-50/50 dark:border-slate-800 dark:bg-slate-950/60'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Server
                      className={`h-4 w-4 ${active ? 'text-blue-600 dark:text-blue-400' : 'text-slate-400 dark:text-slate-500'}`}
                      aria-hidden="true"
                    />
                    <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {node.name}
                    </span>
                  </div>
                  <span
                    className={`text-xs font-mono ${
                      active ? 'font-semibold text-blue-700 dark:text-blue-400' : 'text-slate-400 dark:text-slate-500'
                    }`}
                  >
                    {active ? 'Active' : 'Standby'}
                  </span>
                </div>

                <div className="mt-3 flex items-baseline justify-between text-xs text-slate-500 dark:text-slate-400">
                  <span className="font-mono">{node.region}</span>
                  <span className="font-mono font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                    {node.requestsHandled} reqs
                  </span>
                </div>
                <p
                  className="mt-1.5 truncate font-mono text-xs text-slate-500 dark:text-slate-400"
                  title={node.lastAction}
                >
                  Last: {node.lastAction}
                </p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Sharded Storage + In-Memory Redis Cache */}
      <div className="grid gap-4 lg:grid-cols-3">
        {/* DB 1 (A-M) */}
        <div
          data-testid="shard-db-1"
          className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Database className="h-4 w-4 text-slate-700 dark:text-slate-300" aria-hidden="true" />
              <h3 className="text-sm font-semibold text-slate-950 dark:text-white">
                {cluster.shards.DB_1.label}
              </h3>
            </div>
            <span className="text-xs font-mono font-medium text-slate-600 dark:text-slate-300">
              Range {cluster.shards.DB_1.keyRange}
            </span>
          </div>
          <p className="mt-1 text-xs font-mono text-slate-400 dark:text-slate-500">
            {cluster.shards.DB_1.dbFile}
          </p>
          <div className="mt-4 flex items-baseline justify-between border-t border-slate-100 pt-3 text-sm dark:border-slate-800">
            <div>
              <span className="text-xs text-slate-500 dark:text-slate-400">Stored Links</span>
              <p className="font-mono text-lg font-bold text-slate-950 dark:text-white tabular-nums">
                {cluster.shards.DB_1.linkCount}
              </p>
            </div>
            <div className="text-right">
              <span className="text-xs text-slate-500 dark:text-slate-400">Shard Clicks</span>
              <p className="font-mono text-lg font-bold text-slate-950 dark:text-white tabular-nums">
                {cluster.shards.DB_1.totalClicks}
              </p>
            </div>
          </div>
        </div>

        {/* DB 2 (N-Z) */}
        <div
          data-testid="shard-db-2"
          className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Database className="h-4 w-4 text-blue-600 dark:text-blue-400" aria-hidden="true" />
              <h3 className="text-sm font-semibold text-slate-950 dark:text-white">
                {cluster.shards.DB_2.label}
              </h3>
            </div>
            <span className="text-xs font-mono font-medium text-blue-700 dark:text-blue-400">
              Range {cluster.shards.DB_2.keyRange}
            </span>
          </div>
          <p className="mt-1 text-xs font-mono text-slate-400 dark:text-slate-500">
            {cluster.shards.DB_2.dbFile}
          </p>
          <div className="mt-4 flex items-baseline justify-between border-t border-slate-100 pt-3 text-sm dark:border-slate-800">
            <div>
              <span className="text-xs text-slate-500 dark:text-slate-400">Stored Links</span>
              <p className="font-mono text-lg font-bold text-slate-950 dark:text-white tabular-nums">
                {cluster.shards.DB_2.linkCount}
              </p>
            </div>
            <div className="text-right">
              <span className="text-xs text-slate-500 dark:text-slate-400">Shard Clicks</span>
              <p className="font-mono text-lg font-bold text-slate-950 dark:text-white tabular-nums">
                {cluster.shards.DB_2.totalClicks}
              </p>
            </div>
          </div>
        </div>

        {/* Redis In-Memory Cache */}
        <div
          data-testid="redis-cache-panel"
          className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <HardDrive className="h-4 w-4 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
              <h3 className="text-sm font-semibold text-slate-950 dark:text-white">
                Redis Cache Layer
              </h3>
            </div>
            <span className="text-xs font-mono font-semibold text-emerald-700 dark:text-emerald-400 tabular-nums">
              {cluster.cache.hitRate}% hit rate
            </span>
          </div>
          <p className="mt-1 text-xs font-mono text-slate-400 dark:text-slate-500">
            {cluster.cache.engine}
          </p>
          <div className="mt-4 flex items-baseline justify-between border-t border-slate-100 pt-3 text-sm dark:border-slate-800">
            <div>
              <span className="text-xs text-slate-500 dark:text-slate-400">Warm Keys</span>
              <p className="font-mono text-lg font-bold text-slate-950 dark:text-white tabular-nums">
                {cluster.cache.totalKeys}
              </p>
            </div>
            <div className="text-right">
              <span className="text-xs text-slate-500 dark:text-slate-400">Hits / Misses</span>
              <p className="font-mono text-lg font-bold text-slate-950 dark:text-white tabular-nums">
                {cluster.cache.hits} / {cluster.cache.misses}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Detailed Cache Inspector & Recent Request Trace Log */}
      {!compact && (
        <div className="grid gap-6 lg:grid-cols-12">
          {/* Cached Keys Inspector */}
          <div className="lg:col-span-4 rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <h3 className="text-sm font-semibold text-slate-950 dark:text-white">
              In-Memory Cache Keys
            </h3>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {canEvict
                ? 'Admin control: evict any key to trigger a Cache MISS and MongoDB backfill on next lookup.'
                : 'Read-only list of hot keys cached in memory (Admin required to evict).'}
            </p>
            {cluster.cache.keys.length === 0 ? (
              <p className="mt-6 text-xs text-slate-400 dark:text-slate-500">
                Cache is currently empty. Shorten or visit a link to warm Redis memory.
              </p>
            ) : (
              <ul className="mt-4 divide-y divide-slate-100 dark:divide-slate-800">
                {cluster.cache.keys.map((key) => (
                  <li
                    key={key}
                    className="flex items-center justify-between py-2.5 text-xs"
                  >
                    <span className="font-mono font-medium text-slate-800 dark:text-slate-200">
                      /{key}
                    </span>
                    {canEvict && onEvictCacheKey && (
                      <button
                        type="button"
                        onClick={() => onEvictCacheKey(key)}
                        aria-label={`Evict ${key} from cache`}
                        className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-600 transition-colors hover:border-amber-300 hover:bg-amber-50 hover:text-amber-800 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300 dark:hover:border-amber-700 dark:hover:bg-amber-950/50 dark:hover:text-amber-300 whitespace-nowrap shrink-0"
                      >
                        <Trash2 className="h-3 w-3" aria-hidden="true" />
                        <span>Evict</span>
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Request Trace Log */}
          <div className="lg:col-span-8 rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <h3 className="text-sm font-semibold text-slate-950 dark:text-white">
              Recent Distributed Request Traces
            </h3>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Every API call and 301 redirect logs its Load Balancer node, Cache decision, and target Shard.
            </p>
            {cluster.recentTraces.length === 0 ? (
              <p className="mt-6 text-xs text-slate-400 dark:text-slate-500">
                No requests traced yet. Shorten a link or inspect the directory to record traces.
              </p>
            ) : (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-500 dark:border-slate-800 dark:text-slate-400">
                      <th className="pb-2.5 font-semibold">Action</th>
                      <th className="pb-2.5 font-semibold">Code</th>
                      <th className="pb-2.5 font-semibold">Server Node</th>
                      <th className="pb-2.5 font-semibold">Cache</th>
                      <th className="pb-2.5 font-semibold">DB Shard</th>
                      <th className="pb-2.5 text-right font-semibold">Latency</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-mono dark:divide-slate-800">
                    {cluster.recentTraces.slice(0, 10).map((trace) => (
                      <tr key={trace.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                        <td className="py-2.5 pr-3 font-medium text-slate-800 dark:text-slate-200">
                          {trace.action}
                        </td>
                        <td className="py-2.5 pr-3 font-semibold text-blue-700 dark:text-blue-400">
                          {trace.shortCode ? `/${trace.shortCode}` : '—'}
                        </td>
                        <td className="py-2.5 pr-3 text-slate-700 dark:text-slate-300">
                          {trace.serverNode}
                        </td>
                        <td className="py-2.5 pr-3">
                          <span
                            className={
                              trace.cacheStatus === 'HIT'
                                ? 'font-semibold text-emerald-700 dark:text-emerald-400'
                                : trace.cacheStatus === 'MISS'
                                  ? 'font-semibold text-amber-700 dark:text-amber-400'
                                  : 'font-semibold text-blue-700 dark:text-blue-400'
                            }
                          >
                            {trace.cacheStatus}
                          </span>
                        </td>
                        <td className="py-2.5 pr-3 text-slate-600 dark:text-slate-400">
                          {trace.shardLabel ?? 'All Shards'}
                        </td>
                        <td className="py-2.5 text-right text-slate-500 dark:text-slate-400 tabular-nums">
                          {trace.latencyMs.toFixed(2)} ms
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
