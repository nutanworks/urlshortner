import 'dotenv/config';
import express, { type Request, type Response } from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer as createViteServer } from 'vite';
import {
  canDeleteLink,
  canEditLink,
  canEvictCache,
  checkPasswordHash,
  generatePasswordHash,
  parseCookieHeader,
  validateLoginInput,
  validateSignupInput,
} from './src/lib/auth.ts';
import { ShortenerDatabase, type DbLinkRow } from './src/lib/db.ts';
import {
  RoundRobinBalancer,
  SimulatedRedisCache,
  generateShortCodeFromCounter,
  getShardForCode,
  isLinkExpired,
  normalizeAndValidateUrl,
  parseUserAgent,
  validateCustomAlias,
} from './src/lib/distributed.ts';
import type {
  AnalyticsSummary,
  AuthUser,
  BreakdownItem,
  ClusterState,
  DailyClicksPoint,
  RequestTrace,
  ShortLinkRecord,
} from './src/types.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = 3000;
const DATA_DIR = path.join(__dirname, 'data');
const SESSION_COOKIE_NAME = 'shortly_session';

const db = new ShortenerDatabase(DATA_DIR);
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

function mapLinkRow(row: DbLinkRow): ShortLinkRecord {
  const shard = getShardForCode(row.short_code);
  return {
    id: row.id,
    userEmail: row.user_email,
    shortCode: row.short_code,
    shortUrl: `short.ly/${row.short_code}`,
    longUrl: row.long_url,
    clicks: row.clicks,
    createdAt: row.created_at,
    expiryDate: row.expiry_date,
    hasPassword: Boolean(row.password_hash),
    isExpired: isLinkExpired(row.expiry_date),
    shardId: shard.shardId,
    shardLabel: shard.label,
    isCustomAlias: row.is_custom_alias,
    cachedInRedis: redisCache.has(row.short_code),
  };
}

function setSessionCookie(req: Request, res: Response, sid: string) {
  const isHttps =
    req.secure ||
    req.headers['x-forwarded-proto'] === 'https' ||
    String(req.headers.origin ?? '').startsWith('https://');
  const maxAge = 7 * 24 * 60 * 60;
  const attrs = [
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(sid)}`,
    'Path=/',
    'HttpOnly',
    `Max-Age=${maxAge}`,
    isHttps ? 'SameSite=None' : 'SameSite=Lax',
    ...(isHttps ? ['Secure'] : []),
  ];
  res.setHeader('Set-Cookie', attrs.join('; '));
}

function clearSessionCookie(req: Request, res: Response) {
  const isHttps =
    req.secure ||
    req.headers['x-forwarded-proto'] === 'https' ||
    String(req.headers.origin ?? '').startsWith('https://');
  const attrs = [
    `${SESSION_COOKIE_NAME}=`,
    'Path=/',
    'HttpOnly',
    'Max-Age=0',
    isHttps ? 'SameSite=None' : 'SameSite=Lax',
    ...(isHttps ? ['Secure'] : []),
  ];
  res.setHeader('Set-Cookie', attrs.join('; '));
}

async function getAuthenticatedUser(req: Request): Promise<AuthUser | null> {
  const cookies = parseCookieHeader(req.headers.cookie);
  const sid = cookies[SESSION_COOKIE_NAME];
  if (!sid) return null;
  return db.getSession(sid);
}

async function requireAuth(req: Request, res: Response): Promise<AuthUser | null> {
  const user = await getAuthenticatedUser(req);
  if (!user) {
    res.status(401).json({ error: 'Authentication required. Please log in.' });
    return null;
  }
  return user;
}

function buildBreakdown(values: string[]): BreakdownItem[] {
  const counts = new Map<string, number>();
  for (const val of values) {
    counts.set(val, (counts.get(val) ?? 0) + 1);
  }
  const total = Math.max(1, values.length);
  return Array.from(counts.entries())
    .map(([label, count]) => ({
      label,
      count,
      percent: Math.round((count / total) * 100),
    }))
    .sort((a, b) => b.count - a.count);
}

async function buildClusterState(): Promise<ClusterState> {
  const lb = loadBalancer.snapshot();
  const cacheStats = redisCache.stats();
  const allLinks = await db.getAllLinks();
  const db1 = allLinks.filter((l) => l.shard_id === 'DB_1');
  const db2 = allLinks.filter((l) => l.shard_id === 'DB_2');
  const engineInfo = db.getEngineInfo();

  return {
    databaseEngine: engineInfo.databaseEngine,
    databaseName: engineInfo.databaseName,
    loadBalancerAlgorithm: 'Round Robin',
    nextNodeIndex: lb.nextNodeIndex,
    lastActiveNode: lb.lastActiveNode,
    nodes: lb.nodes,
    cache: cacheStats,
    shards: {
      DB_1: {
        label: 'DB 1 (A–M)',
        keyRange: 'A–M',
        dbFile:
          engineInfo.databaseEngine === 'MongoDB Atlas'
            ? 'links (shard_id: DB_1)'
            : 'shard_1_am.db',
        linkCount: db1.length,
        totalClicks: db1.reduce((sum, l) => sum + l.clicks, 0),
      },
      DB_2: {
        label: 'DB 2 (N–Z)',
        keyRange: 'N–Z',
        dbFile:
          engineInfo.databaseEngine === 'MongoDB Atlas'
            ? 'links (shard_id: DB_2)'
            : 'shard_2_nz.db',
        linkCount: db2.length,
        totalClicks: db2.reduce((sum, l) => sum + l.clicks, 0),
      },
    },
    recentTraces: [...recentTraces],
  };
}

async function buildAnalytics(): Promise<AnalyticsSummary> {
  const [linkRows, clickRecords] = await Promise.all([
    db.getAllLinks(),
    db.getAllClicks(500),
  ]);
  const allLinks = linkRows.map(mapLinkRow);
  const cacheStats = redisCache.stats();

  const db1Links = allLinks.filter((l) => l.shardId === 'DB_1').length;
  const db2Links = allLinks.filter((l) => l.shardId === 'DB_2').length;
  const totalClicks = allLinks.reduce((sum, l) => sum + l.clicks, 0);

  const dayCounts = new Map<string, number>();
  for (const click of clickRecords) {
    const isoDay = click.clickedAt.slice(0, 10);
    dayCounts.set(isoDay, (dayCounts.get(isoDay) ?? 0) + 1);
  }

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
      clicks: dayCounts.get(isoDay) ?? 0,
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
    deviceBreakdown: buildBreakdown(clickRecords.map((c) => c.device)),
    browserBreakdown: buildBreakdown(clickRecords.map((c) => c.browser)),
    recentClicks: clickRecords.slice(0, 12),
  };
}

async function resolveShortCode(
  shortCode: string,
  action: 'REDIRECT' | 'LOOKUP',
  userAgent: string | undefined,
  suppliedPassword?: string,
): Promise<
  | { status: 'ok'; link: ShortLinkRecord; trace: RequestTrace }
  | { status: 'not_found' }
  | { status: 'expired'; expiryDate: string | null }
  | { status: 'password_required'; wrongPassword?: boolean }
> {
  const start = performance.now();
  const { nodeName } = loadBalancer.next(`${action} /${shortCode}`);
  const shard = getShardForCode(shortCode);

  const cached = redisCache.get(shortCode);
  let cacheStatus: 'HIT' | 'MISS' = cached ? 'HIT' : 'MISS';

  // Fetch link record when cache miss OR when password verification is required
  let linkRow: DbLinkRow | null = null;
  if (!cached || cached.hasPassword) {
    linkRow = await db.findLinkByCode(shortCode);
    if (!linkRow) {
      return { status: 'not_found' };
    }
    if (!cached) {
      redisCache.set(shortCode, linkRow.long_url, shard.shardId, {
        expiryDate: linkRow.expiry_date,
        hasPassword: Boolean(linkRow.password_hash),
      });
    }
  }

  const expiryDate = cached ? cached.expiryDate : linkRow?.expiry_date ?? null;
  if (isLinkExpired(expiryDate)) {
    return { status: 'expired', expiryDate };
  }

  const requiresPassword = cached
    ? cached.hasPassword
    : Boolean(linkRow?.password_hash);
  if (requiresPassword) {
    if (!suppliedPassword) {
      return { status: 'password_required', wrongPassword: false };
    }
    const rowForAuth = linkRow ?? (await db.findLinkByCode(shortCode));
    if (
      !rowForAuth?.password_hash ||
      !checkPasswordHash(rowForAuth.password_hash, suppliedPassword)
    ) {
      return { status: 'password_required', wrongPassword: true };
    }
  }

  const updatedRow = await db.incrementLinkClicks(shortCode);
  if (!updatedRow) {
    return { status: 'not_found' };
  }

  const { device, browser } = parseUserAgent(userAgent);
  await db.recordClick({ shortCode, device, browser });

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
    status: 'ok',
    link: mapLinkRow(updatedRow),
    trace,
  };
}

function renderPasswordGateHtml(shortCode: string, errorMsg?: string): string {
  const safeCode = shortCode.replace(/[^a-zA-Z0-9_-]/g, '');
  const safeError = errorMsg
    ? `<p style="color:#fca5a5;background:rgba(239,68,68,.12);border:1px solid rgba(239,68,68,.35);padding:10px 12px;border-radius:8px;font-size:13px;margin:0 0 14px;">${errorMsg}</p>`
    : '';
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Protected Link · Short.ly</title>
  <style>
    body{margin:0;min-height:100vh;display:grid;place-items:center;background:#080A10;color:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;padding:24px;}
    .card{width:100%;max-width:400px;background:#0F131E;border:1px solid #1e293b;border-radius:16px;padding:28px;}
    h1{margin:0 0 8px;font-size:20px;}
    p.sub{margin:0 0 20px;color:#94a3b8;font-size:14px;line-height:1.5;}
    label{display:block;font-size:13px;color:#cbd5e1;margin-bottom:6px;}
    input{width:100%;box-sizing:border-box;height:44px;border-radius:10px;border:1px solid #334155;background:#080A10;color:#f8fafc;padding:0 12px;font-size:14px;margin-bottom:14px;}
    button{width:100%;height:44px;border:0;border-radius:10px;background:linear-gradient(90deg,#7c3aed,#4f46e5);color:#fff;font-weight:600;font-size:14px;cursor:pointer;}
  </style>
</head>
<body>
  <div class="card">
    <h1>Password Required</h1>
    <p class="sub">The link <code>short.ly/${safeCode}</code> is password protected. Enter the link password to continue.</p>
    ${safeError}
    <form method="POST" action="/api/unlock/${safeCode}">
      <label for="link-password">Link Password</label>
      <input id="link-password" name="password" type="password" required autofocus placeholder="Enter password" />
      <button type="submit">Unlock &amp; Redirect</button>
    </form>
  </div>
</body>
</html>`;
}

function renderExpiredHtml(shortCode: string): string {
  const safeCode = shortCode.replace(/[^a-zA-Z0-9_-]/g, '');
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Link Expired · Short.ly</title>
  <style>
    body{margin:0;min-height:100vh;display:grid;place-items:center;background:#080A10;color:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;padding:24px;}
    .card{width:100%;max-width:420px;background:#0F131E;border:1px solid #1e293b;border-radius:16px;padding:28px;text-align:center;}
    h1{margin:0 0 8px;font-size:20px;color:#fca5a5;}
    p{margin:0 0 20px;color:#94a3b8;font-size:14px;line-height:1.5;}
    a{display:inline-block;padding:10px 18px;border-radius:10px;background:#4f46e5;color:#fff;text-decoration:none;font-size:14px;font-weight:600;}
  </style>
</head>
<body>
  <div class="card">
    <h1>Link Expired</h1>
    <p><code>short.ly/${safeCode}</code> has passed its expiration date and is no longer active.</p>
    <a href="/">Return to Short.ly</a>
  </div>
</body>
</html>`;
}

async function startServer() {
  await db.connect();

  // Warm Redis cache with existing top links on boot
  const bootLinks = await db.getAllLinks();
  for (const link of bootLinks.slice(0, 4)) {
    redisCache.set(link.short_code, link.long_url, link.shard_id, {
      expiryDate: link.expiry_date,
      hasPassword: Boolean(link.password_hash),
    });
  }

  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));

  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      service: 'short.ly',
      ...db.getEngineInfo(),
    });
  });

  // ---------------- AUTH ROUTES ----------------

  app.get('/api/auth/me', async (req, res) => {
    const user = await getAuthenticatedUser(req);
    res.json({ user, ...db.getEngineInfo() });
  });

  app.post('/api/auth/signup', async (req, res) => {
    const validation = validateSignupInput(req.body ?? {});
    if (!validation.ok) {
      res.status(400).json({ error: validation.error });
      return;
    }

    const existing = await db.findUserByEmail(validation.email);
    if (existing) {
      res.status(409).json({
        error: 'An account with this email already exists. Please log in.',
      });
      return;
    }

    const passwordHash = generatePasswordHash(validation.password);
    const created = await db.createUser({
      name: validation.name,
      email: validation.email,
      passwordHash,
      role: 'user',
    });

    const authUser: AuthUser = {
      id: created.id,
      name: created.name,
      email: created.email,
      role: created.role,
    };
    const session = await db.createSession(authUser);
    setSessionCookie(req, res, session.sid);

    res.status(201).json({ user: authUser });
  });

  app.post('/api/auth/login', async (req, res) => {
    const validation = validateLoginInput(req.body ?? {});
    if (!validation.ok) {
      res.status(400).json({ error: validation.error });
      return;
    }

    const userRow = await db.findUserByEmail(validation.email);
    if (
      !userRow ||
      !checkPasswordHash(userRow.password_hash, validation.password)
    ) {
      res.status(401).json({ error: 'Invalid email or password.' });
      return;
    }

    const authUser: AuthUser = {
      id: userRow.id,
      name: userRow.name,
      email: userRow.email,
      role: userRow.role,
    };
    const session = await db.createSession(authUser);
    setSessionCookie(req, res, session.sid);

    res.json({ user: authUser });
  });

  app.post('/api/auth/logout', async (req, res) => {
    const cookies = parseCookieHeader(req.headers.cookie);
    const sid = cookies[SESSION_COOKIE_NAME];
    if (sid) {
      await db.deleteSession(sid);
    }
    clearSessionCookie(req, res);
    res.json({ ok: true });
  });

  // ---------------- URL SHORTENER & CRUD ROUTES ----------------

  // POST /api/shorten -> Authenticated Users & Admins can shorten URLs (with Malicious URL blocking)
  app.post('/api/shorten', async (req, res) => {
    const user = await requireAuth(req, res);
    if (!user) return;

    const start = performance.now();
    const { url, customAlias, expiryDate, linkPassword } = (req.body ?? {}) as {
      url?: string;
      customAlias?: string;
      expiryDate?: string | null;
      linkPassword?: string;
    };

    const urlCheck = normalizeAndValidateUrl(String(url ?? ''));
    if (!urlCheck.ok) {
      res.status(400).json({ error: urlCheck.error });
      return;
    }

    let normalizedExpiry: string | null = null;
    if (expiryDate && String(expiryDate).trim().length > 0) {
      const parsedExp = new Date(String(expiryDate));
      if (Number.isNaN(parsedExp.getTime())) {
        res.status(400).json({ error: 'Invalid expiry date format.' });
        return;
      }
      normalizedExpiry = parsedExp.toISOString();
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

      if (await db.findLinkByCode(shortCode)) {
        res.status(409).json({
          error: `Custom alias "${shortCode}" is already taken. Try another alias.`,
        });
        return;
      }
    } else {
      let candidate = '';
      for (let attempt = 0; attempt < 10; attempt += 1) {
        const counter = await db.nextCounter('url_seq');
        candidate = generateShortCodeFromCounter(counter);
        if (!(await db.findLinkByCode(candidate))) {
          break;
        }
      }
      shortCode = candidate;
    }

    const { nodeName } = loadBalancer.next(`SHORTEN /${shortCode}`);
    const shard = getShardForCode(shortCode);
    const passwordHash =
      linkPassword && linkPassword.trim().length > 0
        ? generatePasswordHash(linkPassword.trim())
        : null;

    const inserted = await db.insertLink({
      userEmail: user.email,
      longUrl: urlCheck.url,
      shortCode,
      expiryDate: normalizedExpiry,
      passwordHash,
      shardId: shard.shardId,
      isCustomAlias: isCustom,
    });

    redisCache.set(shortCode, urlCheck.url, shard.shardId, {
      expiryDate: normalizedExpiry,
      hasPassword: Boolean(passwordHash),
    });

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

    res.setHeader('X-Served-By', nodeName);
    res.setHeader('X-DB-Shard', shard.shardId);
    res.status(201).json({
      link: mapLinkRow(inserted),
      trace,
      cluster: await buildClusterState(),
    });
  });

  // GET /api/links -> Authenticated Users & Admins can view links
  app.get('/api/links', async (req, res) => {
    const user = await requireAuth(req, res);
    if (!user) return;

    const start = performance.now();
    const { nodeName } = loadBalancer.next('LIST /api/links');
    const rows = await db.getAllLinks();
    const links = rows.map(mapLinkRow);

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
      cluster: await buildClusterState(),
    });
  });

  // PATCH /api/links/:code -> ADMIN ONLY (Edit destination URL, expiry date, or password)
  app.patch('/api/links/:code', async (req, res) => {
    const user = await requireAuth(req, res);
    if (!user) return;

    if (!canEditLink(user.role)) {
      res.status(403).json({
        error: 'Forbidden: Only Admin accounts can edit links.',
      });
      return;
    }

    const start = performance.now();
    const { code } = req.params;
    const { url, expiryDate, linkPassword, clearPassword } = (req.body ?? {}) as {
      url?: string;
      expiryDate?: string | null;
      linkPassword?: string;
      clearPassword?: boolean;
    };

    const existing = await db.findLinkByCode(code);
    if (!existing) {
      res.status(404).json({ error: 'Short link not found.' });
      return;
    }

    let nextLongUrl = existing.long_url;
    if (url !== undefined) {
      const urlCheck = normalizeAndValidateUrl(String(url));
      if (!urlCheck.ok) {
        res.status(400).json({ error: urlCheck.error });
        return;
      }
      nextLongUrl = urlCheck.url;
    }

    let nextExpiry: string | null | undefined = undefined;
    if (expiryDate !== undefined) {
      if (expiryDate === null || String(expiryDate).trim() === '') {
        nextExpiry = null;
      } else {
        const parsed = new Date(String(expiryDate));
        if (Number.isNaN(parsed.getTime())) {
          res.status(400).json({ error: 'Invalid expiry date format.' });
          return;
        }
        nextExpiry = parsed.toISOString();
      }
    }

    let nextPasswordHash: string | null | undefined = undefined;
    if (clearPassword) {
      nextPasswordHash = null;
    } else if (linkPassword && linkPassword.trim().length > 0) {
      nextPasswordHash = generatePasswordHash(linkPassword.trim());
    }

    const { nodeName } = loadBalancer.next(`UPDATE /${code}`);
    const shard = getShardForCode(code);

    const updated = await db.updateLink(code, {
      longUrl: nextLongUrl,
      expiryDate: nextExpiry,
      passwordHash: nextPasswordHash,
    });

    if (!updated) {
      res.status(404).json({ error: 'Short link not found.' });
      return;
    }

    redisCache.set(code, updated.long_url, shard.shardId, {
      expiryDate: updated.expiry_date,
      hasPassword: Boolean(updated.password_hash),
    });

    const latencyMs = Number(
      Math.max(0.3, performance.now() - start).toFixed(2),
    );
    const trace = pushTrace({
      action: 'UPDATE',
      shortCode: code,
      serverNode: nodeName,
      shardId: shard.shardId,
      shardLabel: shard.label,
      cacheStatus: 'WRITE',
      statusCode: 200,
      latencyMs,
    });

    res.setHeader('X-Served-By', nodeName);
    res.json({
      link: mapLinkRow(updated),
      trace,
      cluster: await buildClusterState(),
    });
  });

  // DELETE /api/links/:code -> ADMIN ONLY (Remove link & evict Redis cache)
  app.delete('/api/links/:code', async (req, res) => {
    const user = await requireAuth(req, res);
    if (!user) return;

    if (!canDeleteLink(user.role)) {
      res.status(403).json({
        error: 'Forbidden: Only Admin accounts can remove links.',
      });
      return;
    }

    const start = performance.now();
    const { code } = req.params;
    const shard = getShardForCode(code);
    const { nodeName } = loadBalancer.next(`DELETE /${code}`);

    const deleted = await db.deleteLink(code);
    redisCache.del(code);

    if (!deleted) {
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
      cluster: await buildClusterState(),
    });
  });

  // POST /api/simulate/:code -> Simulates a 301 lookup & logs device/browser click
  app.post('/api/simulate/:code', async (req, res) => {
    const user = await requireAuth(req, res);
    if (!user) return;

    const { code } = req.params;
    const { password } = (req.body ?? {}) as { password?: string };
    const resolved = await resolveShortCode(
      code,
      'LOOKUP',
      req.headers['user-agent'],
      password,
    );

    if (resolved.status === 'not_found') {
      res.status(404).json({ error: `Short link "${code}" not found.` });
      return;
    }
    if (resolved.status === 'expired') {
      res.status(410).json({ error: `Short link "${code}" has expired.` });
      return;
    }
    if (resolved.status === 'password_required') {
      res.status(403).json({
        passwordRequired: true,
        error: resolved.wrongPassword
          ? 'Incorrect link password.'
          : 'This short link is password protected.',
      });
      return;
    }

    res.setHeader('X-Served-By', resolved.trace.serverNode);
    res.setHeader('X-Cache', resolved.trace.cacheStatus);
    res.setHeader('X-DB-Shard', resolved.link.shardId);
    res.json({
      link: resolved.link,
      trace: resolved.trace,
      cluster: await buildClusterState(),
    });
  });

  // POST /api/unlock/:code -> Unlocks a password-protected short link
  app.post('/api/unlock/:code', async (req, res) => {
    const { code } = req.params;
    const password = String((req.body ?? {}).password ?? '');
    const resolved = await resolveShortCode(
      code,
      'REDIRECT',
      req.headers['user-agent'],
      password,
    );

    const wantsJson = req.headers.accept?.includes('application/json');

    if (resolved.status === 'not_found') {
      if (wantsJson) {
        res.status(404).json({ error: 'Short link not found.' });
      } else {
        res.status(404).send('Short link not found.');
      }
      return;
    }
    if (resolved.status === 'expired') {
      if (wantsJson) {
        res.status(410).json({ error: 'This short link has expired.' });
      } else {
        res.status(410).type('html').send(renderExpiredHtml(code));
      }
      return;
    }
    if (resolved.status === 'password_required') {
      if (wantsJson) {
        res.status(403).json({ error: 'Incorrect password.' });
      } else {
        res
          .status(403)
          .type('html')
          .send(renderPasswordGateHtml(code, 'Incorrect password. Please try again.'));
      }
      return;
    }

    if (wantsJson) {
      res.json({ longUrl: resolved.link.longUrl, link: resolved.link });
      return;
    }

    res.setHeader('Cache-Control', 'no-store');
    res.redirect(302, resolved.link.longUrl);
  });

  // POST /api/cache/evict/:code -> ADMIN ONLY
  app.post('/api/cache/evict/:code', async (req, res) => {
    const user = await requireAuth(req, res);
    if (!user) return;

    if (!canEvictCache(user.role)) {
      res.status(403).json({
        error: 'Forbidden: Only Admin accounts can evict cache keys.',
      });
      return;
    }

    const { code } = req.params;
    const evicted = redisCache.del(code);
    res.json({
      evicted,
      shortCode: code,
      cluster: await buildClusterState(),
    });
  });

  // GET /api/analytics -> Aggregated metrics, daily clicks, device/browser breakdown
  app.get('/api/analytics', async (req, res) => {
    const user = await requireAuth(req, res);
    if (!user) return;

    res.json({
      analytics: await buildAnalytics(),
      cluster: await buildClusterState(),
    });
  });

  // GET /api/cluster -> Current state of 3 server nodes, Redis cache, shards, and MongoDB
  app.get('/api/cluster', async (req, res) => {
    const user = await requireAuth(req, res);
    if (!user) return;

    res.json({
      cluster: await buildClusterState(),
    });
  });

  // Catch unknown /api/* routes cleanly
  app.all('/api/*', (_req, res) => {
    res.status(404).json({ error: 'API route not found.' });
  });

  // GET /:code -> Public HTTP 301 Redirect using Cache-Aside + MongoDB + Click Analytics
  app.get('/:code', async (req, res, next) => {
    const { code } = req.params;
    if (
      !code ||
      !/^[a-zA-Z0-9_-]{3,32}$/.test(code) ||
      ['dashboard', 'analytics', 'cluster', 'login', 'signup', 'index.html'].includes(
        code.toLowerCase(),
      )
    ) {
      next();
      return;
    }

    const resolved = await resolveShortCode(
      code,
      'REDIRECT',
      req.headers['user-agent'],
    );
    if (resolved.status === 'not_found') {
      next();
      return;
    }
    if (resolved.status === 'expired') {
      res.status(410).type('html').send(renderExpiredHtml(code));
      return;
    }
    if (resolved.status === 'password_required') {
      res.status(200).type('html').send(renderPasswordGateHtml(code));
      return;
    }

    res.setHeader('X-Served-By', resolved.trace.serverNode);
    res.setHeader('X-Cache', resolved.trace.cacheStatus);
    res.setHeader('X-DB-Shard', resolved.link.shardId);
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
