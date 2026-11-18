import type { ShardId, ShardInfo } from '../types';

/**
 * DISTRIBUTED CONCEPT: Base62 Alphabet
 * Uses 62 URL-safe characters (A-Z, a-z, 0-9). Placing letters first ensures
 * sequential counter permutations naturally span A-M and N-Z shards immediately.
 */
export const BASE62_ALPHABET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

const BASE = BASE62_ALPHABET.length; // 62
const CODE_SPACE = 62 ** 6; // 56,800,235,584 possible 6-character codes
// 2654435761 is odd and not divisible by 31, so gcd(STRIDE, 62^6) === 1 (bijective permutation).
const COUNTER_STRIDE = 2654435761;
const COUNTER_OFFSET = 179424673;

const RESERVED_CODES = new Set([
  'api',
  'dashboard',
  'analytics',
  'cluster',
  'system',
  'health',
  'assets',
  'src',
  'static',
  'favicon.ico',
]);

/**
 * Encodes a non-negative integer into a Base62 string padded to `minLength`.
 */
export function encodeBase62(num: number, minLength = 6): string {
  if (!Number.isFinite(num) || num < 0) {
    throw new Error('Counter value must be a non-negative finite number.');
  }

  let value = Math.floor(num);
  if (value === 0) {
    return BASE62_ALPHABET[0].repeat(minLength);
  }

  let encoded = '';
  while (value > 0) {
    encoded = BASE62_ALPHABET[value % BASE] + encoded;
    value = Math.floor(value / BASE);
  }

  while (encoded.length < minLength) {
    encoded = BASE62_ALPHABET[0] + encoded;
  }

  return encoded;
}

/**
 * DISTRIBUTED CONCEPT: Counter + Base62 ID Generation
 * Each write obtains a monotonically increasing counter ID, applies a bijective
 * modular permutation so consecutive links distribute evenly across shards
 * instead of clustering on a single prefix, and encodes the result in Base62.
 */
export function generateShortCodeFromCounter(counter: number): string {
  if (!Number.isInteger(counter) || counter < 1) {
    throw new Error('Counter must be a positive integer.');
  }
  const permuted = (counter * COUNTER_STRIDE + COUNTER_OFFSET) % CODE_SPACE;
  return encodeBase62(permuted, 6);
}

/**
 * DISTRIBUTED CONCEPT: Range-Based Database Sharding
 * Partition key = first character of short_code (case-insensitive):
 *   - A-M (and digits 0-4) -> DB 1 (shard_1_am.db)
 *   - N-Z (and digits 5-9) -> DB 2 (shard_2_nz.db)
 * This splits read/write load horizontally across independent SQLite nodes.
 */
export function getShardForCode(code: string): ShardInfo {
  const firstChar = (code || '').trim().charAt(0).toUpperCase();
  const isDb1 =
    (firstChar >= 'A' && firstChar <= 'M') ||
    (firstChar >= '0' && firstChar <= '4');

  if (isDb1) {
    return {
      shardId: 'DB_1',
      label: 'DB 1 (A–M)',
      keyRange: 'A–M',
      dbFile: 'shard_1_am.db',
    };
  }

  return {
    shardId: 'DB_2',
    label: 'DB 2 (N–Z)',
    keyRange: 'N–Z',
    dbFile: 'shard_2_nz.db',
  };
}

export function normalizeAndValidateUrl(
  rawUrl: string,
): { ok: true; url: string } | { ok: false; error: string } {
  const trimmed = rawUrl.trim();
  if (!trimmed) {
    return { ok: false, error: 'Please paste a URL to shorten.' };
  }

  if (/\s/.test(trimmed)) {
    return {
      ok: false,
      error: 'URL cannot contain spaces. Please enter a valid HTTP/HTTPS URL.',
    };
  }

  // Reject dangerous or non-web schemes explicitly
  const schemeMatch = /^([a-zA-Z][a-zA-Z0-9+.-]*):/.exec(trimmed);
  if (schemeMatch) {
    const scheme = schemeMatch[1].toLowerCase();
    if (scheme !== 'http' && scheme !== 'https') {
      return {
        ok: false,
        error: 'Only http:// and https:// URLs are supported.',
      };
    }
    if (!/^https?:\/\//i.test(trimmed)) {
      return {
        ok: false,
        error: 'Invalid URL format. Use http:// or https:// followed by a domain.',
      };
    }
  }

  const candidate = schemeMatch ? trimmed : `https://${trimmed}`;

  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return {
        ok: false,
        error: 'Only http:// and https:// URLs are supported.',
      };
    }

    const host = parsed.hostname;
    const isIpv4 = /^(\d{1,3}\.){3}\d{1,3}$/.test(host) &&
      host.split('.').every((octet) => Number(octet) <= 255);

    if (!host || (!isIpv4 && (!host.includes('.') || host.includes('..')))) {
      return {
        ok: false,
        error: 'Please enter a valid domain name (e.g. https://example.com).',
      };
    }

    if (!isIpv4) {
      const labels = host.split('.');
      const tld = labels[labels.length - 1];
      const validLabels = labels.every(
        (label) => /^[a-zA-Z0-9-]+$/.test(label) && !label.startsWith('-') && !label.endsWith('-'),
      );
      if (!validLabels || !/^[a-zA-Z]{2,}$/.test(tld)) {
        return {
          ok: false,
          error: 'Please enter a valid HTTP/HTTPS domain (e.g. https://example.com).',
        };
      }
    }

    return { ok: true, url: parsed.toString() };
  } catch {
    return {
      ok: false,
      error: 'Invalid URL format. Please check the address and try again.',
    };
  }
}

export function validateCustomAlias(
  rawAlias: string,
): { ok: true; alias: string } | { ok: false; error: string } {
  const alias = rawAlias.trim();
  if (!alias) {
    return { ok: false, error: 'Custom alias cannot be empty.' };
  }
  if (alias.length < 3 || alias.length > 32) {
    return {
      ok: false,
      error: 'Custom alias must be between 3 and 32 characters.',
    };
  }
  if (!/^[a-zA-Z0-9_-]+$/.test(alias)) {
    return {
      ok: false,
      error:
        'Custom alias may only contain letters, numbers, hyphens, and underscores.',
    };
  }
  if (RESERVED_CODES.has(alias.toLowerCase())) {
    return {
      ok: false,
      error: `"${alias}" is a reserved system route. Please choose another alias.`,
    };
  }
  return { ok: true, alias };
}

/**
 * DISTRIBUTED CONCEPT: Round-Robin Load Balancer
 * Distributes incoming client requests sequentially across 3 stateless
 * application server nodes (Server 1 -> Server 2 -> Server 3 -> Server 1).
 */
export class RoundRobinBalancer {
  private readonly nodeNames = ['Server 1', 'Server 2', 'Server 3'];
  private readonly regions = ['us-east-1a', 'us-east-1b', 'us-east-1c'];
  private index = 0;
  private counts = [0, 0, 0];
  private lastActions = ['Idle', 'Idle', 'Idle'];
  private lastActiveNode = 'Server 1';

  next(actionDescription: string): {
    nodeName: string;
    nodeIndex: number;
  } {
    const current = this.index;
    const nodeName = this.nodeNames[current];
    this.counts[current] += 1;
    this.lastActions[current] = actionDescription;
    this.lastActiveNode = nodeName;
    this.index = (current + 1) % this.nodeNames.length;
    return { nodeName, nodeIndex: current };
  }

  snapshot() {
    return {
      nextNodeIndex: this.index,
      lastActiveNode: this.lastActiveNode,
      nodes: this.nodeNames.map((name, i) => ({
        id: `node-${i + 1}`,
        name,
        region: this.regions[i],
        requestsHandled: this.counts[i],
        lastAction: this.lastActions[i],
        isLastActive: name === this.lastActiveNode && this.counts[i] > 0,
      })),
    };
  }
}

/**
 * DISTRIBUTED CONCEPT: Redis In-Memory Cache Simulation
 * Simulates a Redis key-value cache using an in-memory dictionary (Map).
 * Reads check the cache first (O(1) lookup) before falling back to SQLite shards.
 */
export interface CachedEntry {
  longUrl: string;
  shardId: ShardId;
  cachedAt: string;
}

export class SimulatedRedisCache {
  private store = new Map<string, CachedEntry>();
  private hits = 0;
  private misses = 0;

  get(shortCode: string): CachedEntry | null {
    const entry = this.store.get(shortCode);
    if (entry) {
      this.hits += 1;
      return entry;
    }
    this.misses += 1;
    return null;
  }

  has(shortCode: string): boolean {
    return this.store.has(shortCode);
  }

  set(shortCode: string, longUrl: string, shardId: ShardId): void {
    this.store.set(shortCode, {
      longUrl,
      shardId,
      cachedAt: new Date().toISOString(),
    });
  }

  del(shortCode: string): boolean {
    return this.store.delete(shortCode);
  }

  stats() {
    const total = this.hits + this.misses;
    return {
      engine: 'In-Memory Dict (Redis Sim)',
      totalKeys: this.store.size,
      hits: this.hits,
      misses: this.misses,
      hitRate: total === 0 ? 0 : Math.round((this.hits / total) * 100),
      keys: Array.from(this.store.keys()),
    };
  }
}
