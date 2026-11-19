import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { MongoClient, type Db } from 'mongodb';
import type {
  AuthUser,
  ClickRecord,
  ShardId,
  UserRole,
} from '../types.ts';
import {
  checkPasswordHash,
  createSessionId,
  generatePasswordHash,
  sanitizeMongoUri,
} from './auth.ts';
import { getShardForCode } from './distributed.ts';

export interface DbUserRow {
  id: number;
  name: string;
  email: string;
  password_hash: string;
  role: UserRole;
  created_at?: string;
}

export interface DbLinkRow {
  id: number;
  user_email: string;
  long_url: string;
  short_code: string;
  clicks: number;
  created_at: string;
  expiry_date: string | null;
  password_hash: string | null;
  shard_id: ShardId;
  is_custom_alias: boolean;
}

export interface DbClickRow {
  id: number;
  short_code: string;
  clicked_at: string;
  device: string;
  browser: string;
}

export interface DbSessionRow {
  sid: string;
  userId: number;
  email: string;
  name: string;
  role: UserRole;
  expiresAt: Date;
}

const DEFAULT_FALLBACK_URI =
  'mongodb+srv://admin:Admin@123@details.vczgwr8.mongodb.net/shortly';

export class ShortenerDatabase {
  private mongoClient: MongoClient | null = null;
  private mongoDb: Db | null = null;
  private sqliteDb: DatabaseSync | null = null;
  private engine: 'MongoDB Atlas' | 'SQLite Fallback' = 'SQLite Fallback';
  private dbName = 'shortly';

  constructor(private readonly dataDir: string) {}

  getEngineInfo(): {
    databaseEngine: 'MongoDB Atlas' | 'SQLite Fallback';
    databaseName: string;
  } {
    return {
      databaseEngine: this.engine,
      databaseName: this.dbName,
    };
  }

  async connect(): Promise<void> {
    const rawUri = process.env.MONGODB_URI || DEFAULT_FALLBACK_URI;
    const uri = sanitizeMongoUri(rawUri, 'shortly');

    try {
      const client = new MongoClient(uri, {
        serverSelectionTimeoutMS: 6000,
        connectTimeoutMS: 6000,
      });
      await client.connect();
      const db = client.db('shortly');
      await db.command({ ping: 1 });

      this.mongoClient = client;
      this.mongoDb = db;
      this.engine = 'MongoDB Atlas';
      this.dbName = db.databaseName;

      await this.initMongoIndexesAndCounters();
      await this.seedDefaultUsers();
      await this.seedInitialLinksAndClicks();
      console.log(`Connected to MongoDB Atlas database "${this.dbName}".`);
      return;
    } catch (err) {
      console.warn(
        'MongoDB Atlas unavailable, falling back to local SQLite:',
        err instanceof Error ? err.message : String(err),
      );
    }

    this.initSqliteFallback();
    await this.seedDefaultUsers();
    await this.seedInitialLinksAndClicks();
  }

  private async initMongoIndexesAndCounters(): Promise<void> {
    if (!this.mongoDb) return;
    const db = this.mongoDb;

    await Promise.all([
      db.collection('users').createIndex({ email: 1 }, { unique: true }).catch(() => {}),
      db.collection('users').createIndex({ id: 1 }, { unique: true }).catch(() => {}),
      db.collection('links').createIndex({ short_code: 1 }, { unique: true }).catch(() => {}),
      db.collection('links').createIndex({ shard_id: 1 }).catch(() => {}),
      db.collection('clicks').createIndex({ short_code: 1 }).catch(() => {}),
      db.collection('clicks').createIndex({ clicked_at: -1 }).catch(() => {}),
      db.collection('sessions').createIndex({ sid: 1 }, { unique: true }).catch(() => {}),
      db
        .collection('sessions')
        .createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 })
        .catch(() => {}),
    ]);

    const maxUser = await db
      .collection('users')
      .find({})
      .sort({ id: -1 })
      .limit(1)
      .toArray();
    const maxLink = await db
      .collection('links')
      .find({})
      .sort({ id: -1 })
      .limit(1)
      .toArray();
    const maxClick = await db
      .collection('clicks')
      .find({})
      .sort({ id: -1 })
      .limit(1)
      .toArray();

    const counterDefaults: Array<{ _id: string; minSeq: number }> = [
      { _id: 'url_seq', minSeq: 1000 },
      { _id: 'user_id', minSeq: Math.max(10, Number(maxUser[0]?.id ?? 0)) },
      { _id: 'link_id', minSeq: Math.max(10, Number(maxLink[0]?.id ?? 0)) },
      { _id: 'click_id', minSeq: Math.max(10, Number(maxClick[0]?.id ?? 0)) },
    ];

    for (const c of counterDefaults) {
      const existing = await db.collection<{ _id: string; seq: number }>('counters').findOne({ _id: c._id });
      if (!existing) {
        await db
          .collection<{ _id: string; seq: number }>('counters')
          .insertOne({ _id: c._id, seq: c.minSeq });
      } else if (existing.seq < c.minSeq) {
        await db
          .collection<{ _id: string; seq: number }>('counters')
          .updateOne({ _id: c._id }, { $set: { seq: c.minSeq } });
      }
    }
  }

  private initSqliteFallback(): void {
    fs.mkdirSync(this.dataDir, { recursive: true });
    const db = new DatabaseSync(path.join(this.dataDir, 'shortly_fallback.db'));
    db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'user',
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS links (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_email TEXT NOT NULL,
        long_url TEXT NOT NULL,
        short_code TEXT NOT NULL UNIQUE,
        clicks INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        expiry_date TEXT,
        password_hash TEXT,
        shard_id TEXT NOT NULL,
        is_custom_alias INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS clicks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        short_code TEXT NOT NULL,
        clicked_at TEXT NOT NULL,
        device TEXT NOT NULL,
        browser TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS sessions (
        sid TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL,
        email TEXT NOT NULL,
        name TEXT NOT NULL,
        role TEXT NOT NULL,
        expires_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS counters (
        name TEXT PRIMARY KEY,
        value INTEGER NOT NULL
      );
      INSERT OR IGNORE INTO counters (name, value) VALUES ('url_seq', 1000);
    `);
    this.sqliteDb = db;
    this.engine = 'SQLite Fallback';
    this.dbName = 'shortly_fallback.db';
  }

  async nextCounter(name: 'url_seq' | 'user_id' | 'link_id' | 'click_id'): Promise<number> {
    if (this.mongoDb) {
      const res = await this.mongoDb
        .collection<{ _id: string; seq: number }>('counters')
        .findOneAndUpdate(
          { _id: name },
          { $inc: { seq: 1 } },
          { upsert: true, returnDocument: 'after' },
        );
      return Number(res?.seq ?? Date.now());
    }

    const row = this.sqliteDb!
      .prepare(
        `UPDATE counters SET value = value + 1 WHERE name = ? RETURNING value`,
      )
      .get(name) as { value: number } | undefined;
    if (row) return row.value;
    this.sqliteDb!
      .prepare(`INSERT INTO counters (name, value) VALUES (?, 1)`)
      .run(name);
    return 1;
  }

  private async seedDefaultUsers(): Promise<void> {
    const defaults: Array<{
      name: string;
      email: string;
      password: string;
      role: UserRole;
    }> = [
      {
        name: 'Admin',
        email: 'admin@short.ly',
        password: 'admin123',
        role: 'admin',
      },
      {
        name: 'Standard User',
        email: 'user@short.ly',
        password: 'user123',
        role: 'user',
      },
    ];

    for (const acct of defaults) {
      const existing = await this.findUserByEmail(acct.email);
      if (!existing) {
        await this.createUser({
          name: acct.name,
          email: acct.email,
          passwordHash: generatePasswordHash(acct.password),
          role: acct.role,
        });
      } else {
        // Ensure default account credentials work with Werkzeug scrypt verification
        const valid = checkPasswordHash(existing.password_hash, acct.password);
        if (!valid || existing.role !== acct.role) {
          const freshHash = generatePasswordHash(acct.password);
          if (this.mongoDb) {
            await this.mongoDb.collection('users').updateOne(
              { email: acct.email },
              {
                $set: {
                  name: existing.name || acct.name,
                  password_hash: freshHash,
                  role: acct.role,
                },
              },
            );
          } else if (this.sqliteDb) {
            this.sqliteDb
              .prepare(
                `UPDATE users SET password_hash = ?, role = ? WHERE email = ?`,
              )
              .run(freshHash, acct.role, acct.email);
          }
        }
      }
    }
  }

  private async seedInitialLinksAndClicks(): Promise<void> {
    const existingLinks = await this.getAllLinks();
    if (existingLinks.length > 0) return;

    const now = Date.now();
    const nextMonth = new Date(now + 30 * 24 * 60 * 60 * 1000).toISOString();

    const seeds = [
      {
        shortCode: 'docs-api',
        longUrl: 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Status/301',
        userEmail: 'admin@short.ly',
        clicks: 142,
        isCustom: true,
        daysAgo: 5,
        expiryDate: null,
      },
      {
        shortCode: 'gh-flask',
        longUrl: 'https://github.com/pallets/flask',
        userEmail: 'admin@short.ly',
        clicks: 96,
        isCustom: true,
        daysAgo: 4,
        expiryDate: nextMonth,
      },
      {
        shortCode: 'redis-io',
        longUrl: 'https://redis.io/docs/latest/develop/data-types/strings/',
        userEmail: 'user@short.ly',
        clicks: 214,
        isCustom: true,
        daysAgo: 3,
        expiryDate: null,
      },
      {
        shortCode: 'mongo-db',
        longUrl: 'https://www.mongodb.com/docs/atlas/',
        userEmail: 'admin@short.ly',
        clicks: 84,
        isCustom: true,
        daysAgo: 2,
        expiryDate: null,
      },
      {
        shortCode: 'base62-x',
        longUrl: 'https://en.wikipedia.org/wiki/Base62',
        userEmail: 'user@short.ly',
        clicks: 64,
        isCustom: true,
        daysAgo: 1,
        expiryDate: null,
      },
      {
        shortCode: 'nginx-lb',
        longUrl: 'https://nginx.org/en/docs/http/load_balancing.html',
        userEmail: 'admin@short.ly',
        clicks: 51,
        isCustom: true,
        daysAgo: 0,
        expiryDate: null,
      },
    ];

    for (const seed of seeds) {
      const shard = getShardForCode(seed.shortCode);
      const createdAt = new Date(
        now - seed.daysAgo * 24 * 60 * 60 * 1000,
      ).toISOString();

      await this.insertLink({
        userEmail: seed.userEmail,
        longUrl: seed.longUrl,
        shortCode: seed.shortCode,
        clicks: seed.clicks,
        createdAt,
        expiryDate: seed.expiryDate,
        passwordHash: null,
        shardId: shard.shardId,
        isCustomAlias: seed.isCustom,
      });
    }

    const existingClicks = await this.getAllClicks();
    if (existingClicks.length === 0) {
      const devices = ['Desktop', 'Desktop', 'Desktop', 'Mobile', 'Mobile', 'Tablet'];
      const browsers = ['Chrome', 'Chrome', 'Safari', 'Firefox', 'Edge'];
      const dailyCounts = [6, 9, 8, 12, 10, 14, 11];
      for (let dayOffset = 6; dayOffset >= 0; dayOffset -= 1) {
        const count = dailyCounts[6 - dayOffset];
        for (let i = 0; i < count; i += 1) {
          const ts = new Date(
            now - dayOffset * 24 * 60 * 60 * 1000 - i * 18 * 60 * 1000,
          ).toISOString();
          await this.recordClick({
            shortCode: seeds[(i + dayOffset) % seeds.length].shortCode,
            clickedAt: ts,
            device: devices[(i + dayOffset) % devices.length],
            browser: browsers[(i + dayOffset) % browsers.length],
          });
        }
      }
    }
  }

  // ---- USERS ----

  async findUserByEmail(email: string): Promise<DbUserRow | null> {
    const normalized = email.trim().toLowerCase();
    if (this.mongoDb) {
      const doc = await this.mongoDb
        .collection('users')
        .findOne({ email: normalized });
      if (!doc) return null;
      return {
        id: Number(doc.id ?? 0),
        name: String(doc.name ?? ''),
        email: String(doc.email),
        password_hash: String(doc.password_hash ?? doc.passwordHash ?? ''),
        role: doc.role === 'admin' ? 'admin' : 'user',
        created_at: doc.created_at ?? doc.createdAt ?? undefined,
      };
    }

    const row = this.sqliteDb!
      .prepare(
        `SELECT id, name, email, password_hash, role, created_at FROM users WHERE email = ?`,
      )
      .get(normalized) as unknown as DbUserRow | undefined;
    return row ?? null;
  }

  async createUser(input: {
    name: string;
    email: string;
    passwordHash: string;
    role: UserRole;
  }): Promise<DbUserRow> {
    const email = input.email.trim().toLowerCase();
    const createdAt = new Date().toISOString();

    if (this.mongoDb) {
      const id = await this.nextCounter('user_id');
      const doc: DbUserRow = {
        id,
        name: input.name.trim(),
        email,
        password_hash: input.passwordHash,
        role: input.role,
        created_at: createdAt,
      };
      await this.mongoDb.collection('users').insertOne(doc);
      return doc;
    }

    const result = this.sqliteDb!
      .prepare(
        `INSERT INTO users (name, email, password_hash, role, created_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(input.name.trim(), email, input.passwordHash, input.role, createdAt);

    return {
      id: Number(result.lastInsertRowid),
      name: input.name.trim(),
      email,
      password_hash: input.passwordHash,
      role: input.role,
      created_at: createdAt,
    };
  }

  // ---- SESSIONS ----

  async createSession(user: AuthUser): Promise<DbSessionRow> {
    const sid = createSessionId();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    if (this.mongoDb) {
      await this.mongoDb.collection('sessions').insertOne({
        sid,
        user_id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        created_at: new Date().toISOString(),
        expiresAt,
      });
    } else if (this.sqliteDb) {
      this.sqliteDb
        .prepare(
          `INSERT INTO sessions (sid, user_id, email, name, role, expires_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run(
          sid,
          user.id,
          user.email,
          user.name,
          user.role,
          expiresAt.toISOString(),
        );
    }

    return {
      sid,
      userId: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      expiresAt,
    };
  }

  async getSession(sid: string): Promise<AuthUser | null> {
    if (!sid) return null;
    const now = new Date();

    if (this.mongoDb) {
      const doc = await this.mongoDb.collection('sessions').findOne({ sid });
      if (!doc) return null;
      const exp = doc.expiresAt ? new Date(doc.expiresAt) : null;
      if (exp && exp <= now) {
        await this.deleteSession(sid);
        return null;
      }
      return {
        id: Number(doc.user_id ?? doc.userId ?? 0),
        name: String(doc.name ?? ''),
        email: String(doc.email ?? ''),
        role: doc.role === 'admin' ? 'admin' : 'user',
      };
    }

    const row = this.sqliteDb!
      .prepare(
        `SELECT sid, user_id, email, name, role, expires_at FROM sessions WHERE sid = ?`,
      )
      .get(sid) as
      | {
          sid: string;
          user_id: number;
          email: string;
          name: string;
          role: UserRole;
          expires_at: string;
        }
      | undefined;

    if (!row) return null;
    if (new Date(row.expires_at) <= now) {
      await this.deleteSession(sid);
      return null;
    }
    return {
      id: row.user_id,
      name: row.name,
      email: row.email,
      role: row.role === 'admin' ? 'admin' : 'user',
    };
  }

  async deleteSession(sid: string): Promise<void> {
    if (!sid) return;
    if (this.mongoDb) {
      await this.mongoDb.collection('sessions').deleteOne({ sid });
    } else if (this.sqliteDb) {
      this.sqliteDb.prepare(`DELETE FROM sessions WHERE sid = ?`).run(sid);
    }
  }

  // ---- LINKS ----

  private normalizeLinkDoc(doc: Record<string, unknown>): DbLinkRow {
    const shortCode = String(doc.short_code ?? doc.shortCode ?? '');
    const shardId: ShardId =
      doc.shard_id === 'DB_1' || doc.shard_id === 'DB_2'
        ? doc.shard_id
        : getShardForCode(shortCode).shardId;

    return {
      id: Number(doc.id ?? 0),
      user_email: String(doc.user_email ?? doc.userEmail ?? 'admin@short.ly'),
      long_url: String(doc.long_url ?? doc.longUrl ?? ''),
      short_code: shortCode,
      clicks: Number(doc.clicks ?? 0),
      created_at: String(
        doc.created_at ?? doc.createdAt ?? new Date().toISOString(),
      ),
      expiry_date:
        doc.expiry_date != null && String(doc.expiry_date).trim() !== ''
          ? String(doc.expiry_date)
          : null,
      password_hash:
        doc.password_hash != null && String(doc.password_hash).trim() !== ''
          ? String(doc.password_hash)
          : null,
      shard_id: shardId,
      is_custom_alias: Boolean(
        doc.is_custom_alias === true || doc.is_custom_alias === 1,
      ),
    };
  }

  async getAllLinks(): Promise<DbLinkRow[]> {
    if (this.mongoDb) {
      const docs = await this.mongoDb
        .collection('links')
        .find({})
        .sort({ created_at: -1 })
        .toArray();
      return docs.map((d) =>
        this.normalizeLinkDoc(d as unknown as Record<string, unknown>),
      );
    }

    const rows = this.sqliteDb!
      .prepare(
        `SELECT id, user_email, long_url, short_code, clicks, created_at, expiry_date, password_hash, shard_id, is_custom_alias
         FROM links ORDER BY created_at DESC`,
      )
      .all() as unknown as Array<Record<string, unknown>>;
    return rows.map((r) => this.normalizeLinkDoc(r));
  }

  async findLinkByCode(shortCode: string): Promise<DbLinkRow | null> {
    if (this.mongoDb) {
      const doc = await this.mongoDb
        .collection('links')
        .findOne({ short_code: shortCode });
      return doc
        ? this.normalizeLinkDoc(doc as unknown as Record<string, unknown>)
        : null;
    }

    const row = this.sqliteDb!
      .prepare(
        `SELECT id, user_email, long_url, short_code, clicks, created_at, expiry_date, password_hash, shard_id, is_custom_alias
         FROM links WHERE short_code = ?`,
      )
      .get(shortCode) as unknown as Record<string, unknown> | undefined;
    return row ? this.normalizeLinkDoc(row) : null;
  }

  async insertLink(input: {
    userEmail: string;
    longUrl: string;
    shortCode: string;
    clicks?: number;
    createdAt?: string;
    expiryDate: string | null;
    passwordHash: string | null;
    shardId: ShardId;
    isCustomAlias: boolean;
  }): Promise<DbLinkRow> {
    const createdAt = input.createdAt ?? new Date().toISOString();
    const clicks = input.clicks ?? 0;

    if (this.mongoDb) {
      const id = await this.nextCounter('link_id');
      const doc: DbLinkRow = {
        id,
        user_email: input.userEmail,
        long_url: input.longUrl,
        short_code: input.shortCode,
        clicks,
        created_at: createdAt,
        expiry_date: input.expiryDate,
        password_hash: input.passwordHash,
        shard_id: input.shardId,
        is_custom_alias: input.isCustomAlias,
      };
      await this.mongoDb.collection('links').insertOne(doc);
      return doc;
    }

    const res = this.sqliteDb!
      .prepare(
        `INSERT INTO links (user_email, long_url, short_code, clicks, created_at, expiry_date, password_hash, shard_id, is_custom_alias)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        input.userEmail,
        input.longUrl,
        input.shortCode,
        clicks,
        createdAt,
        input.expiryDate,
        input.passwordHash,
        input.shardId,
        input.isCustomAlias ? 1 : 0,
      );

    return {
      id: Number(res.lastInsertRowid),
      user_email: input.userEmail,
      long_url: input.longUrl,
      short_code: input.shortCode,
      clicks,
      created_at: createdAt,
      expiry_date: input.expiryDate,
      password_hash: input.passwordHash,
      shard_id: input.shardId,
      is_custom_alias: input.isCustomAlias,
    };
  }

  async updateLink(
    shortCode: string,
    updates: {
      longUrl?: string;
      expiryDate?: string | null;
      passwordHash?: string | null;
    },
  ): Promise<DbLinkRow | null> {
    const existing = await this.findLinkByCode(shortCode);
    if (!existing) return null;

    const nextLongUrl = updates.longUrl ?? existing.long_url;
    const nextExpiry =
      updates.expiryDate !== undefined
        ? updates.expiryDate
        : existing.expiry_date;
    const nextPasswordHash =
      updates.passwordHash !== undefined
        ? updates.passwordHash
        : existing.password_hash;

    if (this.mongoDb) {
      const updated = await this.mongoDb.collection('links').findOneAndUpdate(
        { short_code: shortCode },
        {
          $set: {
            long_url: nextLongUrl,
            expiry_date: nextExpiry,
            password_hash: nextPasswordHash,
          },
        },
        { returnDocument: 'after' },
      );
      return updated
        ? this.normalizeLinkDoc(updated as unknown as Record<string, unknown>)
        : null;
    }

    this.sqliteDb!
      .prepare(
        `UPDATE links SET long_url = ?, expiry_date = ?, password_hash = ? WHERE short_code = ?`,
      )
      .run(nextLongUrl, nextExpiry, nextPasswordHash, shortCode);
    return this.findLinkByCode(shortCode);
  }

  async incrementLinkClicks(shortCode: string): Promise<DbLinkRow | null> {
    if (this.mongoDb) {
      const updated = await this.mongoDb.collection('links').findOneAndUpdate(
        { short_code: shortCode },
        { $inc: { clicks: 1 } },
        { returnDocument: 'after' },
      );
      return updated
        ? this.normalizeLinkDoc(updated as unknown as Record<string, unknown>)
        : null;
    }

    const row = this.sqliteDb!
      .prepare(
        `UPDATE links SET clicks = clicks + 1 WHERE short_code = ?
         RETURNING id, user_email, long_url, short_code, clicks, created_at, expiry_date, password_hash, shard_id, is_custom_alias`,
      )
      .get(shortCode) as unknown as Record<string, unknown> | undefined;
    return row ? this.normalizeLinkDoc(row) : null;
  }

  async deleteLink(shortCode: string): Promise<boolean> {
    if (this.mongoDb) {
      const res = await this.mongoDb
        .collection('links')
        .deleteOne({ short_code: shortCode });
      if (res.deletedCount > 0) {
        await this.mongoDb
          .collection('clicks')
          .deleteMany({ $or: [{ short_code: shortCode }, { shortCode }] });
        return true;
      }
      return false;
    }

    const res = this.sqliteDb!
      .prepare(`DELETE FROM links WHERE short_code = ?`)
      .run(shortCode);
    if (res.changes > 0) {
      this.sqliteDb!
        .prepare(`DELETE FROM clicks WHERE short_code = ?`)
        .run(shortCode);
      return true;
    }
    return false;
  }

  // ---- CLICKS ----

  async recordClick(input: {
    shortCode: string;
    clickedAt?: string;
    device: string;
    browser: string;
  }): Promise<ClickRecord> {
    const clickedAt = input.clickedAt ?? new Date().toISOString();

    if (this.mongoDb) {
      const id = await this.nextCounter('click_id');
      await this.mongoDb.collection('clicks').insertOne({
        id,
        short_code: input.shortCode,
        clicked_at: clickedAt,
        device: input.device,
        browser: input.browser,
      });
      return {
        id,
        shortCode: input.shortCode,
        clickedAt,
        device: input.device,
        browser: input.browser,
      };
    }

    const res = this.sqliteDb!
      .prepare(
        `INSERT INTO clicks (short_code, clicked_at, device, browser)
         VALUES (?, ?, ?, ?)`,
      )
      .run(input.shortCode, clickedAt, input.device, input.browser);
    return {
      id: Number(res.lastInsertRowid),
      shortCode: input.shortCode,
      clickedAt,
      device: input.device,
      browser: input.browser,
    };
  }

  async getAllClicks(limit = 500): Promise<ClickRecord[]> {
    if (this.mongoDb) {
      const docs = await this.mongoDb
        .collection('clicks')
        .find({})
        .sort({ clicked_at: -1, clickedAt: -1 })
        .limit(limit)
        .toArray();
      return docs.map((d) => ({
        id: Number(d.id ?? 0),
        shortCode: String(d.short_code ?? d.shortCode ?? ''),
        clickedAt: String(
          d.clicked_at ?? d.clickedAt ?? new Date().toISOString(),
        ),
        device: String(d.device ?? 'Desktop'),
        browser: String(d.browser ?? 'Other'),
      }));
    }

    const rows = this.sqliteDb!
      .prepare(
        `SELECT id, short_code, clicked_at, device, browser
         FROM clicks ORDER BY clicked_at DESC LIMIT ?`,
      )
      .all(limit) as unknown as DbClickRow[];
    return rows.map((r) => ({
      id: r.id,
      shortCode: r.short_code,
      clickedAt: r.clicked_at,
      device: r.device,
      browser: r.browser,
    }));
  }

  async close(): Promise<void> {
    if (this.mongoClient) {
      await this.mongoClient.close().catch(() => {});
    }
  }
}
