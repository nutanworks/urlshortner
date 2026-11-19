import test from 'node:test';
import assert from 'node:assert/strict';
import {
  encodeBase62,
  generateShortCodeFromCounter,
  getShardForCode,
  normalizeAndValidateUrl,
  validateCustomAlias,
  detectMaliciousUrl,
  isLinkExpired,
  parseUserAgent,
  RoundRobinBalancer,
  SimulatedRedisCache,
} from './distributed';

test('encodeBase62 pads to minLength and encodes deterministically', () => {
  assert.equal(encodeBase62(0, 6), 'AAAAAA');
  assert.equal(encodeBase62(1, 6), 'AAAAAB');
  assert.equal(encodeBase62(62, 6), 'AAAABA');
});

test('generateShortCodeFromCounter produces unique codes across both DB_1 and DB_2 shards', () => {
  const seen = new Set<string>();
  let db1Count = 0;
  let db2Count = 0;

  for (let counter = 1; counter <= 500; counter += 1) {
    const code = generateShortCodeFromCounter(counter);
    assert.equal(code.length, 6);
    assert.equal(seen.has(code), false, `Duplicate code generated: ${code}`);
    seen.add(code);

    const shard = getShardForCode(code);
    if (shard.shardId === 'DB_1') db1Count += 1;
    else db2Count += 1;
  }

  assert.ok(db1Count > 50, `Expected DB_1 coverage, got ${db1Count}`);
  assert.ok(db2Count > 50, `Expected DB_2 coverage, got ${db2Count}`);
});

test('getShardForCode routes A-M to DB_1 and N-Z to DB_2', () => {
  assert.equal(getShardForCode('abc123').shardId, 'DB_1');
  assert.equal(getShardForCode('my-link').shardId, 'DB_1');
  assert.equal(getShardForCode('Alpha9').shardId, 'DB_1');
  assert.equal(getShardForCode('Nora01').shardId, 'DB_2');
  assert.equal(getShardForCode('zulu99').shardId, 'DB_2');
});

test('normalizeAndValidateUrl validates HTTP/HTTPS URLs and rejects invalid schemes or formats', () => {
  const httpsValid = normalizeAndValidateUrl('https://example.com/path?q=1');
  assert.equal(httpsValid.ok, true);

  const httpValid = normalizeAndValidateUrl('http://sub.example.org/docs');
  assert.equal(httpValid.ok, true);

  const bare = normalizeAndValidateUrl('github.com/trending');
  assert.equal(bare.ok, true);
  if (bare.ok) assert.equal(bare.url, 'https://github.com/trending');

  assert.equal(normalizeAndValidateUrl('javascript:alert(1)').ok, false);
  assert.equal(normalizeAndValidateUrl('ftp://files.example.com').ok, false);
  assert.equal(normalizeAndValidateUrl('mailto:user@example.com').ok, false);
  assert.equal(normalizeAndValidateUrl('http:example.com').ok, false);
  assert.equal(normalizeAndValidateUrl('https://exa mple.com').ok, false);
  assert.equal(normalizeAndValidateUrl('https://invalid..domain').ok, false);
  assert.equal(normalizeAndValidateUrl('not-a-domain').ok, false);
  assert.equal(normalizeAndValidateUrl('   ').ok, false);
});

test('malicious URL filter blocks phishing, malware, and .exe URLs case-insensitively', () => {
  assert.equal(detectMaliciousUrl('https://phishing-login.example.com'), 'phishing');
  assert.equal(detectMaliciousUrl('https://example.com/MALWARE/payload'), 'malware');
  assert.equal(detectMaliciousUrl('https://cdn.example.com/installer.EXE?v=1'), '.exe');
  assert.equal(detectMaliciousUrl('https://developer.mozilla.org/en-US/docs'), null);

  const phishing = normalizeAndValidateUrl('https://evil-phishing.net/bank');
  assert.equal(phishing.ok, false);
  if (!phishing.ok) assert.match(phishing.error, /phishing/i);

  const malware = normalizeAndValidateUrl('https://bad.site/download-malware');
  assert.equal(malware.ok, false);
  if (!malware.ok) assert.match(malware.error, /malware/i);

  const exe = normalizeAndValidateUrl('https://files.example.com/dropper.exe');
  assert.equal(exe.ok, false);
  if (!exe.ok) assert.match(exe.error, /\.exe/i);
});

test('validateCustomAlias enforces format and blocks reserved routes including login/signup', () => {
  assert.equal(validateCustomAlias('my-link').ok, true);
  assert.equal(validateCustomAlias('ab').ok, false);
  assert.equal(validateCustomAlias('bad alias!').ok, false);
  assert.equal(validateCustomAlias('dashboard').ok, false);
  assert.equal(validateCustomAlias('api').ok, false);
  assert.equal(validateCustomAlias('login').ok, false);
  assert.equal(validateCustomAlias('signup').ok, false);
});

test('isLinkExpired evaluates past, future, and null expiry dates accurately', () => {
  const fixedNow = Date.parse('2026-11-19T12:00:00.000Z');
  assert.equal(isLinkExpired(null, fixedNow), false);
  assert.equal(isLinkExpired(undefined, fixedNow), false);
  assert.equal(isLinkExpired('2026-11-18T12:00:00.000Z', fixedNow), true);
  assert.equal(isLinkExpired('2026-11-20T12:00:00.000Z', fixedNow), false);
});

test('parseUserAgent detects device and browser categories', () => {
  assert.deepEqual(
    parseUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/128.0.0.0 Safari/537.36',
    ),
    { device: 'Desktop', browser: 'Chrome' },
  );
  assert.deepEqual(
    parseUserAgent(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1',
    ),
    { device: 'Mobile', browser: 'Safari' },
  );
  assert.deepEqual(
    parseUserAgent(
      'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Firefox/126.0',
    ),
    { device: 'Tablet', browser: 'Firefox' },
  );
  assert.deepEqual(
    parseUserAgent(
      'Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/128.0.0.0 Safari/537.36 Edg/128.0.0.0',
    ),
    { device: 'Desktop', browser: 'Edge' },
  );
});

test('RoundRobinBalancer cycles sequentially across Server 1, Server 2, Server 3', () => {
  const lb = new RoundRobinBalancer();
  assert.equal(lb.next('req 1').nodeName, 'Server 1');
  assert.equal(lb.next('req 2').nodeName, 'Server 2');
  assert.equal(lb.next('req 3').nodeName, 'Server 3');
  assert.equal(lb.next('req 4').nodeName, 'Server 1');

  const snap = lb.snapshot();
  assert.equal(snap.nodes[0].requestsHandled, 2);
  assert.equal(snap.nodes[1].requestsHandled, 1);
  assert.equal(snap.nodes[2].requestsHandled, 1);
});

test('SimulatedRedisCache tracks misses, hits, and invalidations', () => {
  const cache = new SimulatedRedisCache();
  assert.equal(cache.get('abc123'), null);
  cache.set('abc123', 'https://example.com', 'DB_1');
  const hit = cache.get('abc123');
  assert.ok(hit);
  assert.equal(hit.longUrl, 'https://example.com');
  assert.equal(cache.stats().hits, 1);
  assert.equal(cache.stats().misses, 1);
  assert.equal(cache.stats().hitRate, 50);

  cache.del('abc123');
  assert.equal(cache.has('abc123'), false);
});
