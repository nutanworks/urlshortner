export type ShardId = 'DB_1' | 'DB_2';

export interface ShardInfo {
  shardId: ShardId;
  label: string;
  keyRange: string;
  dbFile: string;
}

export interface ShortLinkRecord {
  shortCode: string;
  shortUrl: string;
  longUrl: string;
  clicks: number;
  createdAt: string;
  shardId: ShardId;
  shardLabel: string;
  isCustomAlias: boolean;
  cachedInRedis: boolean;
}

export interface RequestTrace {
  id: string;
  timestamp: string;
  action: 'SHORTEN' | 'REDIRECT' | 'LIST' | 'DELETE' | 'LOOKUP';
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
}

export interface ShortenResponse {
  link: ShortLinkRecord;
  trace: RequestTrace;
  cluster: ClusterState;
}
