import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {
  generatePasswordHash,
  checkPasswordHash,
  isAdminRole,
  canEditLink,
  canDeleteLink,
  canEvictCache,
  validateSignupInput,
  validateLoginInput,
  parseCookieHeader,
  sanitizeMongoUri,
} from './auth';

test('generatePasswordHash creates Werkzeug scrypt format and checkPasswordHash verifies accurately', () => {
  const hash = generatePasswordHash('admin123');
  assert.match(hash, /^scrypt:32768:8:1\$[a-zA-Z0-9]{16}\$[0-9a-f]{128}$/);
  assert.equal(checkPasswordHash(hash, 'admin123'), true);
  assert.equal(checkPasswordHash(hash, 'wrong123'), false);
  assert.equal(checkPasswordHash('invalid-hash', 'admin123'), false);

  // Salted hashes must differ for the same password
  const hash2 = generatePasswordHash('admin123');
  assert.notEqual(hash, hash2);
  assert.equal(checkPasswordHash(hash2, 'admin123'), true);
});

test('checkPasswordHash also verifies legacy Werkzeug pbkdf2:sha256 hashes', () => {
  const salt = 'TestSalt12345678';
  const derived = crypto
    .pbkdf2Sync('secretPass', salt, 10000, 32, 'sha256')
    .toString('hex');
  const werkzeugPbkdf2 = `pbkdf2:sha256:10000$${salt}$${derived}`;
  assert.equal(checkPasswordHash(werkzeugPbkdf2, 'secretPass'), true);
  assert.equal(checkPasswordHash(werkzeugPbkdf2, 'badPass'), false);
});

test('RBAC helpers permit admin mutations and deny user mutations', () => {
  assert.equal(isAdminRole('admin'), true);
  assert.equal(isAdminRole('user'), false);
  assert.equal(isAdminRole(null), false);

  assert.equal(canEditLink('admin'), true);
  assert.equal(canEditLink('user'), false);
  assert.equal(canDeleteLink('admin'), true);
  assert.equal(canDeleteLink('user'), false);
  assert.equal(canEvictCache('admin'), true);
  assert.equal(canEvictCache('user'), false);
});

test('validateSignupInput and validateLoginInput enforce required fields and email format', () => {
  const validSignup = validateSignupInput({
    name: 'Nutan M',
    email: 'Nutan@Example.com ',
    password: 'password123',
  });
  assert.equal(validSignup.ok, true);
  if (validSignup.ok) {
    assert.equal(validSignup.email, 'nutan@example.com');
  }

  assert.equal(validateSignupInput({ name: 'A', email: 'a@b.com', password: 'password' }).ok, false);
  assert.equal(validateSignupInput({ name: 'Alice', email: 'not-email', password: 'password' }).ok, false);
  assert.equal(validateSignupInput({ name: 'Alice', email: 'a@b.com', password: '123' }).ok, false);

  assert.equal(validateLoginInput({ email: 'admin@short.ly', password: 'admin123' }).ok, true);
  assert.equal(validateLoginInput({ email: '', password: 'admin123' }).ok, false);
  assert.equal(validateLoginInput({ email: 'admin@short.ly', password: '' }).ok, false);
});

test('parseCookieHeader extracts cookie key-value pairs cleanly', () => {
  const parsed = parseCookieHeader('shortly_session=abc123; theme=dark');
  assert.equal(parsed.shortly_session, 'abc123');
  assert.equal(parsed.theme, 'dark');
  assert.deepEqual(parseCookieHeader(undefined), {});
});

test('sanitizeMongoUri encodes unescaped @ inside password and sets default database', () => {
  const raw = 'mongodb+srv://admin:Admin@123@details.vczgwr8.mongodb.net/';
  const clean = sanitizeMongoUri(raw, 'shortly');
  assert.equal(
    clean,
    'mongodb+srv://admin:Admin%40123@details.vczgwr8.mongodb.net/shortly?retryWrites=true&w=majority',
  );

  // Already-encoded password should not be double-encoded
  const alreadyEncoded =
    'mongodb+srv://admin:Admin%40123@details.vczgwr8.mongodb.net/shortly?retryWrites=true&w=majority';
  assert.equal(sanitizeMongoUri(alreadyEncoded, 'shortly'), alreadyEncoded);
});
