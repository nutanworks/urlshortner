import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { createServer as createViteServer } from 'vite';
import {
  RoundRobinBalancer,
  SimulatedRedisCache,
  generateShortCodeFromCounter,
  getShardForCode,
  normalizeAndValidateUrl,
  validateCustomAlias,
} from './src/lib/distributed.ts';
import type {
  AnalyticsSummary,
  ClusterState,
  DailyClicksPoint,
  RequestTrace,
  ShardId,
  ShortLinkRecord,
} from './src/types.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = 3000;
const DATA_DIR = path.join(__dirname, 'data');

fs.mkdirSync(DATA_DIR, { recursive: true });

/**
 * DISTRIBUTED CONCEPT: Physical Horizontal Database Sharding
 * Two independent SQLite databases hold partitioned URL mappings:
 *   - shard_1_am.db -> short codes starting with A-M (or 0-4)
 *   - shard_2_nz.db -> short codes starting with N-Z (or 5-9)
 * meta.db holds the global atomic sequence counter and daily click analytics.
 */
const shard1Db = new DatabaseSync(path.join(DATA_DIR, 'shard_1_am.db'));
const shard2Db = new DatabaseSync(path.join(DATA_DIR, 'shard_2_nz.db'));
const metaDb = new DatabaseSync(path.join(DATA_DIR, 'meta.db'));

function initDatabases() {
  const createLinksTable = `
    CREATE TABLE IF NOT EXISTS links (
      short_code TEXT PRIMARY KEY,
      long_url TEXT NOT NULL,
      clicks INTEGER NOT NULL DEFAULT 0,
      is_custom_alias INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    )
  `;
  shard1Db.exec(createLinksTable);
  shard2Db.exec(createLinksTable);

  metaDb.exec(`
    CREATE TABLE IF NOT EXISTS counters (
      name TEXT PRIMARY KEY,
      value INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS clicks_daily (
      day TEXT PRIMARY KEY,
      clicks INTEGER NOT NULL DEFAULT 0
    );
  `);

  metaDb
    .prepare(
      `INSERT OR IGNORE INTO counters (name, value) VALUES ('url_seq', 1000)`,
    )
    .run();
}

function getDbForShard(shardId: ShardId): DatabaseSync {
  return shardId === 'DB_1' ? shard1Db : shard2Db;
}

function nextGlobalCounter(): number {
  const row = metaDb
    .prepare(
      `UPDATE counters SET value = value + 1 WHERE name = 'url_seq' RETURNING value`,
    )
    .get() as { value: number };
  return row.value;
}

function recordDailyClick(dayIso?: string) {
  const day = dayIso ?? new Date().toISOString().slice(0, 10);
  metaDb
    .prepare(
      `INSERT INTO clicks_daily (day, clicks) VALUES (?, 1)
       ON CONFLICT(day) DO UPDATE SET clicks = clicks + 1`,
    )
    .run(day);
}

/**
 * DISTRIBUTED CONCEPT: Stateful Simulation Singletons
 * - RoundRobinBalancer distributes requests across Server 1, Server 2, Server 3
 * - SimulatedRedisCache stores hot { short_code -> long_url } pairs in memory
 */
const loadBalancer = new RoundRobinBalancer();
const redisCache = new SimulatedRedisCache();
const recentTraces: RequestTrace[] = [];

function pushTrace(trace: Omit<RequestTrace, 'id' | 'timestamp'>): RequestTrace {
  const fullTrace: RequestTrace = {
    ...trace,
    id: `tr-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    timestamp: new Date().toISOString(),
  };
  recentTraces.unshift(fullTrace);
  if (recentTraces.length > 20) {
    recentTraces.length = 20;
  }
  return fullTrace;
}

interface RawLinkRow {
  short_code: string;
  long_url: string;
  clicks: number;
  is_custom_alias: number;
  created_at: string;
}

function mapRowToRecord(row: RawLinkRow): ShortLinkRecord {
  const shard = getShardForCode(row.short_code);
  return {
    shortCode: row.short_code,
    shortUrl: `short.ly/${row.short_code}`,
    longUrl: row.long_url,
    clicks: row.clicks,
    createdAt: row.created_at,
    shardId: shard.shardId,
    shardLabel: shard.label,
    isCustomAlias: row.is_custom_alias === 1,
    cachedInRedis: redisCache.has(row.short_code),
  };
}

function readAllLinks(): ShortLinkRecord[] {
  const rows1 = shard1Db
    .prepare(
      `SELECT short_code, long_url, clicks, is_custom_alias, created_at FROM links`,
    )
    .all() as unknown as RawLinkRow[];
  const rows2 = shard2Db
    .prepare(
      `SELECT short_code, long_url, clicks, is_custom_alias, created_at FROM links`,
    )
    .all() as unknown as RawLinkRow[];

  return [...rows1, ...rows2]
    .map(mapRowToRecord)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function findLinkInShard(shortCode: string): RawLinkRow | null {
  const shard = getShardForCode(shortCode);
  const db = getDbForShard(shard.shardId);
  const row = db
    .prepare(
      `SELECT short_code, long_url, clicks, is_custom_alias, created_at FROM links WHERE short_code = ?`,
    )
    .get(shortCode) as unknown as RawLinkRow | undefined;
  return row ?? null;
}

function seedInitialData() {
  const count1 = (
    shard1Db.prepare(`SELECT COUNT(*) as cnt FROM links`).get() as {
      cnt: number;
    }
  ).cnt;
  const count2 = (
    shard2Db.prepare(`SELECT COUNT(*) as cnt FROM links`).get() as {
      cnt: number;
    }
  ).cnt;

  if (count1 + count2 > 0) {
    // Warm the cache with existing hot links on server restart
    for (const link of readAllLinks().slice(0, 4)) {
      redisCache.set(link.shortCode, link.longUrl, link.shardId);
    }
    return;
  }

  const now = Date.now();
  const seeds = [
    {
      shortCode: 'docs-api',
      longUrl: 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Status/301',
      clicks: 142,
      isCustom: 1,
      daysAgo: 5,
    },
    {
      shortCode: 'gh-flask',
      longUrl: 'https://github.com/pallets/flask',
      clicks: 96,
      isCustom: 1,
      daysAgo: 4,
    },
    {
      shortCode: 'redis-io',
      longUrl: 'https://redis.io/docs/latest/develop/data-types/strings/',
      clicks: 214,
      isCustom: 1,
      daysAgo: 3,
    },
    {
      shortCode: 'sqlite-s',
      longUrl: 'https://www.sqlite.org/docs.html',
      clicks: 78,
      isCustom: 1,
      daysAgo: 2,
    },
    {
      shortCode: 'base62-x',
      longUrl: 'https://en.wikipedia.org/wiki/Base62',
      clicks: 64,
      isCustom: 1,
      daysAgo: 1,
    },
    {
      shortCode: 'nginx-lb',
      longUrl: 'https://nginx.org/en/docs/http/load_balancing.html',
      clicks: 51,
      isCustom: 1,
      daysAgo: 0,
    },
  ];

  for (const seed of seeds) {
    const shard = getShardForCode(seed.shortCode);
    const db = getDbForShard(shard.shardId);
    const createdAt = new Date(
      now - seed.daysAgo * 24 * 60 * 60 * 1000,
    ).toISOString();
    db.prepare(
      `INSERT OR IGNORE INTO links (short_code, long_url, clicks, is_custom_alias, created_at)
       VALUES (?, ?, ?, ?, ?)`,
    ).run(seed.shortCode, seed.longUrl, seed.clicks, seed.isCustom, createdAt);

    // Pre-warm half of the links in Redis so users can observe both HIT and MISS
    if (seed.clicks > 80) {
      redisCache.set(seed.shortCode, seed.longUrl, shard.shardId);
    }
  }

  // Seed 7 days of historical click counts for the Analytics bar chart
  const dailyVolumes = [48, 72, 61, 108, 95, 134, 127];
  dailyVolumes.forEach((volume, idx) => {
    const d = new Date(now - (6 - idx) * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    metaDb
      .prepare(
        `INSERT OR IGNORE INTO clicks_daily (day, clicks) VALUES (?, ?)`,
      )
      .run(d, volume);
  });
}

function buildClusterState(): ClusterState {
  const lb = loadBalancer.snapshot();
  const cacheStats = redisCache.stats();

  const s1 = shard1Db
    .prepare(
      `SELECT COUNT(*) as linkCount, COALESCE(SUM(clicks), 0) as totalClicks FROM links`,
    )
    .get() as { linkCount: number; totalClicks: number };
  const s2 = shard2Db
    .prepare(
      `SELECT COUNT(*) as linkCount, COALESCE(SUM(clicks), 0) as totalClicks FROM links`,
    )
    .get() as { linkCount: number; totalClicks: number };

  return {
    loadBalancerAlgorithm: 'Round Robin',
    nextNodeIndex: lb.nextNodeIndex,
    lastActiveNode: lb.lastActiveNode,
    nodes: lb.nodes,
    cache: cacheStats,
    shards: {
      DB_1: {
        label: 'DB 1 (A–M)',
        keyRange: 'A–M',
        dbFile: 'shard_1_am.db',
        linkCount: s1.linkCount,
        totalClicks: s1.totalClicks,
      },
      DB_2: {
        label: 'DB 2 (N–Z)',
        keyRange: 'N–Z',
        dbFile: 'shard_2_nz.db',
        linkCount: s2.linkCount,
        totalClicks: s2.totalClicks,
      },
    },
    recentTraces: [...recentTraces],
  };
}

function buildAnalytics(): AnalyticsSummary {
  const allLinks = readAllLinks();
  const cacheStats = redisCache.stats();
  const db1Links = allLinks.filter((l) => l.shardId === 'DB_1').length;
  const db2Links = allLinks.filter((l) => l.shardId === 'DB_2').length;
  const totalClicks = allLinks.reduce((sum, l) => sum + l.clicks, 0);

  // Build 7-day rolling window
  const dailyRows = metaDb
    .prepare(`SELECT day, clicks FROM clicks_daily`)
    .all() as Array<{ day: string; clicks: number }>;
  const dayMap = new Map(dailyRows.map((r) => [r.day, r.clicks]));

  const clicksPerDay: DailyClicksPoint[] = [];
  const today = new Date();
  for (let offset = 6; offset >= 0; offset -= 1) {
    const dt = new Date(today.getTime() - offset * 24 * 60 * 60 * 1000);
    const isoDay = dt.toISOString().slice(0, 10);
    const label = dt.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
    clicksPerDay.push({
      date: isoDay,
      label,
      clicks: dayMap.get(isoDay) ?? 0,
    });
  }

  const topLinks = [...allLinks]
    .sort((a, b) => b.clicks - a.clicks)
    .slice(0, 5);

  return {
    totalLinks: allLinks.length,
    totalClicks,
    cacheHits: cacheStats.hits,
    cacheMisses: cacheStats.misses,
    cacheHitRate: cacheStats.hitRate,
    db1Links,
    db2Links,
    clicksPerDay,
    topLinks,
  };
}

/**
 * Shared redirect/lookup handler:
 * 1. Route through Round-Robin Load Balancer
 * 2. Check Redis Cache first
 * 3. On MISS, query the sharded SQLite database (A-M -> DB 1, N-Z -> DB 2) and backfill Cache
 * 4. Increment click counter & daily analytics
 */
function resolveShortCode(shortCode: string, action: 'REDIRECT' | 'LOOKUP') {
  const start = performance.now();
  const { nodeName } = loadBalancer.next(`${action} /${shortCode}`);
  const shard = getShardForCode(shortCode);

  // Step 1: Check In-Memory Redis Cache
  const cached = redisCache.get(shortCode);
  let longUrl: string | null = cached ? cached.longUrl : null;
  let cacheStatus: 'HIT' | 'MISS' = cached ? 'HIT' : 'MISS';

  // Step 2: Cache Miss -> Query appropriate SQLite Shard
  if (!longUrl) {
    const row = findLinkInShard(shortCode);
    if (!row) {
      return null;
    }
    longUrl = row.long_url;
    // Populate Redis cache for subsequent fast lookups
    redisCache.set(shortCode, longUrl, shard.shardId);
  }

  // Step 3: Increment click counter in SQLite shard & daily log
  const db = getDbForShard(shard.shardId);
  const updatedRow = db
    .prepare(
      `UPDATE links SET clicks = clicks + 1 WHERE short_code = ?
       RETURNING short_code, long_url, clicks, is_custom_alias, created_at`,
    )
    .get(shortCode) as unknown as RawLinkRow | undefined;

  if (!updatedRow) {
    return null;
  }

  recordDailyClick();

  const latencyMs = Number(Math.max(0.2, performance.now() - start).toFixed(2));
  const trace = pushTrace({
    action,
    shortCode,
    serverNode: nodeName,
    shardId: shard.shardId,
    shardLabel: shard.label,
    cacheStatus,
    statusCode: action === 'REDIRECT' ? 301 : 200,
    latencyMs,
  });

  return {
    link: mapRowToRecord(updatedRow),
    trace,
  };
}

async function startServer() {
  initDatabases();
  seedInitialData();

  const app = express();
  app.use(express.json());

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', service: 'short.ly' });
  });

  // POST /api/shorten -> Create short link with Counter+Base62 or Custom Alias
  app.post('/api/shorten', (req, res) => {
    const start = performance.now();
    const { url, customAlias } = (req.body ?? {}) as {
      url?: string;
      customAlias?: string;
    };

    const urlCheck = normalizeAndValidateUrl(String(url ?? ''));
    if (!urlCheck.ok) {
      res.status(400).json({ error: urlCheck.error });
      return;
    }

    let shortCode = '';
    let isCustom = false;

    if (customAlias && customAlias.trim().length > 0) {
      const aliasCheck = validateCustomAlias(customAlias);
      if (!aliasCheck.ok) {
        res.status(400).json({ error: aliasCheck.error });
        return;
      }
      shortCode = aliasCheck.alias;
      isCustom = true;

      if (findLinkInShard(shortCode)) {
        res.status(409).json({
          error: `Custom alias "${shortCode}" is already taken. Try another alias.`,
        });
        return;
      }
    } else {
      // Counter + Base62 encoding (guaranteeing uniqueness across shards)
      let candidate = '';
      for (let attempt = 0; attempt < 10; attempt += 1) {
        const counter = nextGlobalCounter();
        candidate = generateShortCodeFromCounter(counter);
        if (!findLinkInShard(candidate)) {
          break;
        }
      }
      shortCode = candidate;
    }

    const { nodeName } = loadBalancer.next(`SHORTEN /${shortCode}`);
    const shard = getShardForCode(shortCode);
    const db = getDbForShard(shard.shardId);
    const createdAt = new Date().toISOString();

    db.prepare(
      `INSERT INTO links (short_code, long_url, clicks, is_custom_alias, created_at)
       VALUES (?, ?, 0, ?, ?)`,
    ).run(shortCode, urlCheck.url, isCustom ? 1 : 0, createdAt);

    // Write-through to Redis cache so first redirect is an instant HIT
    redisCache.set(shortCode, urlCheck.url, shard.shardId);

    const latencyMs = Number(
      Math.max(0.4, performance.now() - start).toFixed(2),
    );
    const trace = pushTrace({
      action: 'SHORTEN',
      shortCode,
      serverNode: nodeName,
      shardId: shard.shardId,
      shardLabel: shard.label,
      cacheStatus: 'WRITE',
      statusCode: 201,
      latencyMs,
    });

    const record: ShortLinkRecord = {
      shortCode,
      shortUrl: `short.ly/${shortCode}`,
      longUrl: urlCheck.url,
      clicks: 0,
      createdAt,
      shardId: shard.shardId,
      shardLabel: shard.label,
      isCustomAlias: isCustom,
      cachedInRedis: true,
    };

    res.setHeader('X-Served-By', nodeName);
    res.setHeader('X-DB-Shard', shard.shardId);
    res.status(201).json({
      link: record,
      trace,
      cluster: buildClusterState(),
    });
  });

  // GET /api/links -> Scatter-gather across DB_1 and DB_2 shards
  app.get('/api/links', (_req, res) => {
    const start = performance.now();
    const { nodeName } = loadBalancer.next('LIST /api/links');
    const links = readAllLinks();
    const latencyMs = Number(
      Math.max(0.3, performance.now() - start).toFixed(2),
    );
    const trace = pushTrace({
      action: 'LIST',
      serverNode: nodeName,
      cacheStatus: 'BYPASS',
      statusCode: 200,
      latencyMs,
    });

    res.setHeader('X-Served-By', nodeName);
    res.json({
      links,
      trace,
      cluster: buildClusterState(),
    });
  });

  // DELETE /api/links/:code -> Delete from target SQLite shard & evict Redis cache
  app.delete('/api/links/:code', (req, res) => {
    const start = performance.now();
    const { code } = req.params;
    const shard = getShardForCode(code);
    const db = getDbForShard(shard.shardId);
    const { nodeName } = loadBalancer.next(`DELETE /${code}`);

    const result = db
      .prepare(`DELETE FROM links WHERE short_code = ?`)
      .run(code);
    redisCache.del(code);

    if (result.changes === 0) {
      res.status(404).json({ error: 'Short link not found.' });
      return;
    }

    const latencyMs = Number(
      Math.max(0.2, performance.now() - start).toFixed(2),
    );
    const trace = pushTrace({
      action: 'DELETE',
      shortCode: code,
      serverNode: nodeName,
      shardId: shard.shardId,
      shardLabel: shard.label,
      cacheStatus: 'INVALIDATE',
      statusCode: 200,
      latencyMs,
    });

    res.setHeader('X-Served-By', nodeName);
    res.json({
      deleted: true,
      shortCode: code,
      trace,
      cluster: buildClusterState(),
    });
  });

  // POST /api/simulate/:code -> Simulates a 301 lookup & returns full trace + updated link
  app.post('/api/simulate/:code', (req, res) => {
    const { code } = req.params;
    const resolved = resolveShortCode(code, 'LOOKUP');
    if (!resolved) {
      res.status(404).json({ error: `Short link "${code}" not found.` });
      return;
    }
    res.setHeader('X-Served-By', resolved.trace.serverNode);
    res.setHeader('X-Cache', resolved.trace.cacheStatus);
    res.setHeader('X-DB-Shard', resolved.link.shardId);
    res.json({
      link: resolved.link,
      trace: resolved.trace,
      cluster: buildClusterState(),
    });
  });

  // POST /api/cache/evict/:code -> Evict key from Redis cache so users can test a Cache MISS
  app.post('/api/cache/evict/:code', (req, res) => {
    const { code } = req.params;
    const evicted = redisCache.del(code);
    res.json({
      evicted,
      shortCode: code,
      cluster: buildClusterState(),
    });
  });

  // GET /api/analytics -> Aggregated metrics & daily click bar chart
  app.get('/api/analytics', (_req, res) => {
    res.json({
      analytics: buildAnalytics(),
      cluster: buildClusterState(),
    });
  });

  // GET /api/cluster -> Current state of 3 server nodes, Redis cache, and shards
  app.get('/api/cluster', (_req, res) => {
    res.json({
      cluster: buildClusterState(),
    });
  });

  // Catch unknown /api/* routes cleanly
  app.all('/api/*', (_req, res) => {
    res.status(404).json({ error: 'API route not found.' });
  });

  // GET /:code -> Real HTTP 301 Redirect using Cache-Aside + Sharded SQLite
  app.get('/:code', (req, res, next) => {
    const { code } = req.params;
    // Skip Vite internal paths, static assets, or SPA tab routes
    if (
      !code ||
      !/^[a-zA-Z0-9_-]{3,32}$/.test(code) ||
      ['dashboard', 'analytics', 'cluster', 'index.html'].includes(
        code.toLowerCase(),
      )
    ) {
      next();
      return;
    }

    const resolved = resolveShortCode(code, 'REDIRECT');
    if (!resolved) {
      next();
      return;
    }

    res.setHeader('X-Served-By', resolved.trace.serverNode);
    res.setHeader('X-Cache', resolved.trace.cacheStatus);
    res.setHeader('X-DB-Shard', resolved.link.shardId);
    // Avoid browser permanently caching 301 during live click-counter demos
    res.setHeader('Cache-Control', 'no-store');
    res.redirect(301, resolved.link.longUrl);
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.join(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Short.ly distributed server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start Short.ly server:', err);
  process.exit(1);
});
