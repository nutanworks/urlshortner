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
      <div className="rounded-xl border border-slate-800 bg-[#101420] p-6">
        <div className="h-5 w-48 animate-pulse rounded bg-slate-800" />
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          {[1, 2, 3].map((n) => (
            <div
              key={n}
              className="h-24 animate-pulse rounded-lg border border-slate-800 bg-slate-900/60"
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
            className="text-lg font-semibold tracking-tight text-slate-100"
          >
            Distributed Cluster Topology
          </h2>
          <p className="mt-0.5 text-sm text-slate-400">
            <span
              data-testid="database-engine-label"
              className={
                cluster.databaseEngine === 'MongoDB Atlas'
                  ? 'font-medium text-emerald-400'
                  : 'font-medium text-amber-300'
              }
            >
              {cluster.databaseEngine} ({cluster.databaseName})
            </span>
            <span aria-hidden="true" className="mx-1.5 text-slate-600">
              ·
            </span>
            Round-Robin Load Balancer (3 nodes) · Partitioned Shards (A–M / N–Z) · In-memory Redis cache
          </p>
        </div>
        {onRefresh && (
          <button
            type="button"
            onClick={onRefresh}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-800 bg-[#121725] px-3 py-1.5 text-xs font-medium text-slate-300 transition-colors hover:border-slate-700 hover:text-slate-100 whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
          >
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Refresh State</span>
          </button>
        )}
      </div>

      {/* 3 Server Nodes (Load Balancer Simulation - Round Robin) */}
      <div className="rounded-xl border border-slate-800/90 bg-[#0F131E] p-5">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 pb-3.5">
          <div className="flex items-center gap-2 text-sm font-medium text-slate-200">
            <Layers className="h-4 w-4 text-violet-400" aria-hidden="true" />
            <span>Load Balancer · Round Robin</span>
          </div>
          <div className="text-xs text-slate-400 font-mono tabular-nums">
            Last handled by: <span className="text-violet-300 font-semibold">{cluster.lastActiveNode}</span>
            <span aria-hidden="true" className="mx-2 text-slate-600">·</span>
            Next turn: <span className="text-slate-200">Server {cluster.nextNodeIndex + 1}</span>
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
                    ? 'border-violet-500/60 bg-violet-500/10'
                    : 'border-slate-800/90 bg-[#141927]'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Server
                      className={`h-4 w-4 ${active ? 'text-violet-300' : 'text-slate-400'}`}
                      aria-hidden="true"
                    />
                    <span className="text-sm font-semibold text-slate-100">
                      {node.name}
                    </span>
                  </div>
                  <span
                    className={`text-xs font-mono ${
                      active ? 'text-violet-300 font-semibold' : 'text-slate-500'
                    }`}
                  >
                    {active ? 'Handled Last' : 'Standby'}
                  </span>
                </div>

                <div className="mt-3 flex items-baseline justify-between text-xs text-slate-400">
                  <span className="font-mono">{node.region}</span>
                  <span className="font-mono tabular-nums text-slate-200">
                    {node.requestsHandled} reqs
                  </span>
                </div>
                <p className="mt-1.5 truncate font-mono text-xs text-slate-400" title={node.lastAction}>
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
          className="rounded-xl border border-slate-800/90 bg-[#0F131E] p-5"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Database className="h-4 w-4 text-indigo-400" aria-hidden="true" />
              <h3 className="text-sm font-semibold text-slate-100">
                {cluster.shards.DB_1.label}
              </h3>
            </div>
            <span className="text-xs font-mono text-indigo-300">
              Range {cluster.shards.DB_1.keyRange}
            </span>
          </div>
          <p className="mt-1 text-xs font-mono text-slate-500">
            {cluster.shards.DB_1.dbFile}
          </p>
          <div className="mt-4 flex items-baseline justify-between border-t border-slate-800/80 pt-3 text-sm">
            <div>
              <span className="text-xs text-slate-400">Stored Links</span>
              <p className="font-mono text-lg font-semibold text-slate-100 tabular-nums">
                {cluster.shards.DB_1.linkCount}
              </p>
            </div>
            <div className="text-right">
              <span className="text-xs text-slate-400">Shard Clicks</span>
              <p className="font-mono text-lg font-semibold text-slate-100 tabular-nums">
                {cluster.shards.DB_1.totalClicks}
              </p>
            </div>
          </div>
        </div>

        {/* DB 2 (N-Z) */}
        <div
          data-testid="shard-db-2"
          className="rounded-xl border border-slate-800/90 bg-[#0F131E] p-5"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Database className="h-4 w-4 text-blue-400" aria-hidden="true" />
              <h3 className="text-sm font-semibold text-slate-100">
                {cluster.shards.DB_2.label}
              </h3>
            </div>
            <span className="text-xs font-mono text-blue-300">
              Range {cluster.shards.DB_2.keyRange}
            </span>
          </div>
          <p className="mt-1 text-xs font-mono text-slate-500">
            {cluster.shards.DB_2.dbFile}
          </p>
          <div className="mt-4 flex items-baseline justify-between border-t border-slate-800/80 pt-3 text-sm">
            <div>
              <span className="text-xs text-slate-400">Stored Links</span>
              <p className="font-mono text-lg font-semibold text-slate-100 tabular-nums">
                {cluster.shards.DB_2.linkCount}
              </p>
            </div>
            <div className="text-right">
              <span className="text-xs text-slate-400">Shard Clicks</span>
              <p className="font-mono text-lg font-semibold text-slate-100 tabular-nums">
                {cluster.shards.DB_2.totalClicks}
              </p>
            </div>
          </div>
        </div>

        {/* Redis In-Memory Cache */}
        <div
          data-testid="redis-cache-panel"
          className="rounded-xl border border-slate-800/90 bg-[#0F131E] p-5"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <HardDrive className="h-4 w-4 text-emerald-400" aria-hidden="true" />
              <h3 className="text-sm font-semibold text-slate-100">
                Redis Cache Layer
              </h3>
            </div>
            <span className="text-xs font-mono text-emerald-300 tabular-nums">
              {cluster.cache.hitRate}% hit rate
            </span>
          </div>
          <p className="mt-1 text-xs font-mono text-slate-500">
            {cluster.cache.engine}
          </p>
          <div className="mt-4 flex items-baseline justify-between border-t border-slate-800/80 pt-3 text-sm">
            <div>
              <span className="text-xs text-slate-400">Warm Keys</span>
              <p className="font-mono text-lg font-semibold text-slate-100 tabular-nums">
                {cluster.cache.totalKeys}
              </p>
            </div>
            <div className="text-right">
              <span className="text-xs text-slate-400">Hits / Misses</span>
              <p className="font-mono text-lg font-semibold text-slate-100 tabular-nums">
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
          <div className="lg:col-span-4 rounded-xl border border-slate-800/90 bg-[#0F131E] p-5">
            <h3 className="text-sm font-semibold text-slate-100">
              In-Memory Cache Keys
            </h3>
            <p className="mt-1 text-xs text-slate-400">
              {canEvict
                ? 'Admin control: evict any key to observe a Cache MISS and MongoDB backfill on next lookup.'
                : 'Read-only view of hot keys cached in memory (Admin required to evict).'}
            </p>
            {cluster.cache.keys.length === 0 ? (
              <p className="mt-6 text-xs text-slate-500">
                Cache is currently empty. Shorten or visit a link to populate Redis memory.
              </p>
            ) : (
              <ul className="mt-4 divide-y divide-slate-800/80">
                {cluster.cache.keys.map((key) => (
                  <li
                    key={key}
                    className="flex items-center justify-between py-2.5 text-xs"
                  >
                    <span className="font-mono text-slate-200">/{key}</span>
                    {canEvict && onEvictCacheKey && (
                      <button
                        type="button"
                        onClick={() => onEvictCacheKey(key)}
                        aria-label={`Evict ${key} from cache`}
                        className="inline-flex items-center gap-1 rounded border border-slate-700/80 px-2 py-1 text-xs text-slate-300 transition-colors hover:border-amber-500/60 hover:text-amber-300 whitespace-nowrap shrink-0"
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
          <div className="lg:col-span-8 rounded-xl border border-slate-800/90 bg-[#0F131E] p-5">
            <h3 className="text-sm font-semibold text-slate-100">
              Recent Distributed Request Traces
            </h3>
            <p className="mt-1 text-xs text-slate-400">
              Every API call and 301 redirect logs its Load Balancer node, Cache decision, and target Shard.
            </p>
            {cluster.recentTraces.length === 0 ? (
              <p className="mt-6 text-xs text-slate-500">
                No requests traced yet. Shorten a link or visit the dashboard to record routing traces.
              </p>
            ) : (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-400">
                      <th className="pb-2.5 font-medium">Action</th>
                      <th className="pb-2.5 font-medium">Code</th>
                      <th className="pb-2.5 font-medium">Server Node</th>
                      <th className="pb-2.5 font-medium">Cache</th>
                      <th className="pb-2.5 font-medium">DB Shard</th>
                      <th className="pb-2.5 text-right font-medium">Latency</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-mono">
                    {cluster.recentTraces.slice(0, 10).map((trace) => (
                      <tr key={trace.id} className="hover:bg-slate-800/30">
                        <td className="py-2.5 pr-3 text-slate-200">{trace.action}</td>
                        <td className="py-2.5 pr-3 text-violet-300">
                          {trace.shortCode ? `/${trace.shortCode}` : '—'}
                        </td>
                        <td className="py-2.5 pr-3 text-slate-300">{trace.serverNode}</td>
                        <td className="py-2.5 pr-3">
                          <span
                            className={
                              trace.cacheStatus === 'HIT'
                                ? 'text-emerald-400'
                                : trace.cacheStatus === 'MISS'
                                  ? 'text-amber-400'
                                  : 'text-indigo-300'
                            }
                          >
                            {trace.cacheStatus}
                          </span>
                        </td>
                        <td className="py-2.5 pr-3 text-slate-300">
                          {trace.shardLabel ?? 'All Shards'}
                        </td>
                        <td className="py-2.5 text-right text-slate-400 tabular-nums">
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
