import crypto from 'node:crypto';
import type { UserRole } from '../types';

const SALT_CHARS =
  'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

function randomSalt(length = 16): string {
  const bytes = crypto.randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += SALT_CHARS[bytes[i] % SALT_CHARS.length];
  }
  return out;
}

/**
 * Werkzeug-compatible password hashing (`generate_password_hash` default).
 * Produces `scrypt:32768:8:1$<salt>$<hex>` using Node's native scryptSync.
 */
export function generatePasswordHash(password: string): string {
  const n = 32768;
  const r = 8;
  const p = 1;
  const salt = randomSalt(16);
  const derived = crypto.scryptSync(password, salt, 64, {
    N: n,
    r,
    p,
    maxmem: 64 * 1024 * 1024,
  });
  return `scrypt:${n}:${r}:${p}$${salt}$${derived.toString('hex')}`;
}

/**
 * Verifies Werkzeug-compatible password hashes (`scrypt:N:r:p$salt$hash` and
 * `pbkdf2:sha256:iterations$salt$hash`) using constant-time comparison.
 */
export function checkPasswordHash(storedHash: string, password: string): boolean {
  if (!storedHash || typeof storedHash !== 'string') return false;
  const parts = storedHash.split('$');
  if (parts.length !== 3) return false;

  const [methodPart, salt, expectedHex] = parts;
  if (!salt || !expectedHex) return false;

  try {
    const expectedBuf = Buffer.from(expectedHex, 'hex');
    if (expectedBuf.length === 0) return false;

    if (methodPart.startsWith('scrypt')) {
      const segs = methodPart.split(':');
      const n = Number(segs[1] ?? 32768);
      const r = Number(segs[2] ?? 8);
      const p = Number(segs[3] ?? 1);
      const derived = crypto.scryptSync(password, salt, expectedBuf.length, {
        N: n,
        r,
        p,
        maxmem: 128 * 1024 * 1024,
      });
      return (
        derived.length === expectedBuf.length &&
        crypto.timingSafeEqual(derived, expectedBuf)
      );
    }

    if (methodPart.startsWith('pbkdf2:')) {
      const segs = methodPart.split(':');
      const digest = segs[1] || 'sha256';
      const iterations = Number(segs[2] ?? 600000);
      const derived = crypto.pbkdf2Sync(
        password,
        salt,
        iterations,
        expectedBuf.length,
        digest,
      );
      return (
        derived.length === expectedBuf.length &&
        crypto.timingSafeEqual(derived, expectedBuf)
      );
    }

    return false;
  } catch {
    return false;
  }
}

/**
 * Role-Based Access Control (RBAC):
 * - Admin: full permissions (view, shorten, edit, remove, cache eviction)
 * - User: view and shorten links only
 */
export function isAdminRole(role: UserRole | null | undefined): boolean {
  return role === 'admin';
}

export function canEditLink(role: UserRole | null | undefined): boolean {
  return role === 'admin';
}

export function canDeleteLink(role: UserRole | null | undefined): boolean {
  return role === 'admin';
}

export function canEvictCache(role: UserRole | null | undefined): boolean {
  return role === 'admin';
}

export function validateSignupInput(input: {
  name?: string;
  email?: string;
  password?: string;
}):
  | { ok: true; name: string; email: string; password: string }
  | { ok: false; error: string } {
  const name = String(input.name ?? '').trim();
  const email = String(input.email ?? '').trim().toLowerCase();
  const password = String(input.password ?? '');

  if (name.length < 2) {
    return { ok: false, error: 'Name must be at least 2 characters long.' };
  }
  if (name.length > 80) {
    return { ok: false, error: 'Name must be 80 characters or fewer.' };
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: 'Please enter a valid email address.' };
  }
  if (password.length < 6) {
    return {
      ok: false,
      error: 'Password must be at least 6 characters long.',
    };
  }
  if (password.length > 128) {
    return { ok: false, error: 'Password is too long.' };
  }

  return { ok: true, name, email, password };
}

export function validateLoginInput(input: {
  email?: string;
  password?: string;
}):
  | { ok: true; email: string; password: string }
  | { ok: false; error: string } {
  const email = String(input.email ?? '').trim().toLowerCase();
  const password = String(input.password ?? '');

  if (!email) {
    return { ok: false, error: 'Please enter your email address.' };
  }
  if (!password) {
    return { ok: false, error: 'Please enter your password.' };
  }
  return { ok: true, email, password };
}

export function parseCookieHeader(
  header: string | undefined,
): Record<string, string> {
  const cookies: Record<string, string> = {};
  if (!header) return cookies;

  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    if (key) {
      try {
        cookies[key] = decodeURIComponent(val);
      } catch {
        cookies[key] = val;
      }
    }
  }
  return cookies;
}

export function createSessionId(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Safely URL-encodes unescaped `@` or special characters inside the password
 * portion of a `mongodb://` or `mongodb+srv://` URI (e.g. `Admin@123`).
 */
export function sanitizeMongoUri(rawUri: string, defaultDb = 'shortly'): string {
  const trimmed = rawUri.trim();
  const protoMatch = /^(mongodb(?:\+srv)?:\/\/)(.+)$/i.exec(trimmed);
  if (!protoMatch) return trimmed;

  const prefix = protoMatch[1];
  const rest = protoMatch[2];

  // Find the LAST '@' before the first '/' (which separates credentials from host)
  const firstSlashIdx = rest.indexOf('/');
  const authority = firstSlashIdx === -1 ? rest : rest.slice(0, firstSlashIdx);
  const pathAndQuery = firstSlashIdx === -1 ? '' : rest.slice(firstSlashIdx);

  const lastAtIdx = authority.lastIndexOf('@');
  let sanitizedAuthority = authority;

  if (lastAtIdx !== -1) {
    const userInfo = authority.slice(0, lastAtIdx);
    const hostPart = authority.slice(lastAtIdx + 1);
    const colonIdx = userInfo.indexOf(':');
    if (colonIdx !== -1) {
      const user = userInfo.slice(0, colonIdx);
      const rawPass = userInfo.slice(colonIdx + 1);
      // Avoid double-encoding if already percent-encoded
      let decodedPass = rawPass;
      try {
        decodedPass = decodeURIComponent(rawPass);
      } catch {
        decodedPass = rawPass;
      }
      sanitizedAuthority = `${encodeURIComponent(user)}:${encodeURIComponent(decodedPass)}@${hostPart}`;
    }
  }

  let finalPath = pathAndQuery;
  if (!finalPath || finalPath === '/') {
    finalPath = `/${defaultDb}?retryWrites=true&w=majority`;
  } else if (finalPath.startsWith('/?')) {
    finalPath = `/${defaultDb}${finalPath.slice(1)}`;
  }

  return `${prefix}${sanitizedAuthority}${finalPath}`;
}
