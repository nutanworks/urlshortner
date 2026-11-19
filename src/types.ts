export type ShardId = 'DB_1' | 'DB_2';

export type UserRole = 'admin' | 'user';

export interface AuthUser {
  id: number;
  name: string;
  email: string;
  role: UserRole;
}

export interface ShardInfo {
  shardId: ShardId;
  label: string;
  keyRange: string;
  dbFile: string;
}

export interface ShortLinkRecord {
  id: number;
  userEmail: string;
  shortCode: string;
  shortUrl: string;
  longUrl: string;
  clicks: number;
  createdAt: string;
  expiryDate: string | null;
  hasPassword: boolean;
  isExpired: boolean;
  shardId: ShardId;
  shardLabel: string;
  isCustomAlias: boolean;
  cachedInRedis: boolean;
}

export interface ClickRecord {
  id: number;
  shortCode: string;
  clickedAt: string;
  device: string;
  browser: string;
}

export interface RequestTrace {
  id: string;
  timestamp: string;
  action: 'SHORTEN' | 'REDIRECT' | 'LIST' | 'UPDATE' | 'DELETE' | 'LOOKUP';
  shortCode?: string;
  serverNode: string;
  shardId?: ShardId;
  shardLabel?: string;
  cacheStatus: 'HIT' | 'MISS' | 'WRITE' | 'INVALIDATE' | 'BYPASS';
  statusCode: number;
  latencyMs: number;
}

export interface ServerNodeStatus {
  id: string;
  name: string;
  region: string;
  requestsHandled: number;
  lastAction: string;
  isLastActive: boolean;
}

export interface ClusterState {
  databaseEngine: 'MongoDB Atlas' | 'SQLite Fallback';
  databaseName: string;
  loadBalancerAlgorithm: 'Round Robin';
  nextNodeIndex: number;
  lastActiveNode: string;
  nodes: ServerNodeStatus[];
  cache: {
    engine: string;
    totalKeys: number;
    hits: number;
    misses: number;
    hitRate: number;
    keys: string[];
  };
  shards: {
    DB_1: {
      label: string;
      keyRange: string;
      dbFile: string;
      linkCount: number;
      totalClicks: number;
    };
    DB_2: {
      label: string;
      keyRange: string;
      dbFile: string;
      linkCount: number;
      totalClicks: number;
    };
  };
  recentTraces: RequestTrace[];
}

export interface DailyClicksPoint {
  date: string;
  label: string;
  clicks: number;
}

export interface BreakdownItem {
  label: string;
  count: number;
  percent: number;
}

export interface AnalyticsSummary {
  totalLinks: number;
  totalClicks: number;
  cacheHits: number;
  cacheMisses: number;
  cacheHitRate: number;
  db1Links: number;
  db2Links: number;
  clicksPerDay: DailyClicksPoint[];
  topLinks: ShortLinkRecord[];
  deviceBreakdown: BreakdownItem[];
  browserBreakdown: BreakdownItem[];
  recentClicks: ClickRecord[];
}

export interface ShortenResponse {
  link: ShortLinkRecord;
  trace: RequestTrace;
  cluster: ClusterState;
}
