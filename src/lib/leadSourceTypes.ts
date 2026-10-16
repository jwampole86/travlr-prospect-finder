/** Shapes shared by the Lead Sources Manager API and page. Types only, so both sides can import it. */

export type Health = 'healthy' | 'attention' | 'pending' | 'paused';
export type SourceStatus = Health | 'unmanaged';
export type IngestionMethod = 'api' | 'scrape' | 'manual' | 'webhook';

export interface ConfigItem {
  id: string;
  market: string;
  state: string | null;
  city: string | null;
  url: string | null;
  method: IngestionMethod;
  active: boolean;
  health: Health;
  lastSuccess: string | null;
  lastAttempt: string | null;
  error: string | null;
  notes: string | null;
  leadCount: number;
  filters: string[];
  furnishedRequired: boolean;
}

export interface CoverageItem {
  id: string;
  portfolio: string;
  zone: string;
  url: string | null;
  status: string;
  note: string | null;
  lastSyncedAt: string | null;
  lastStatus: string | null;
  lastError: string | null;
  imported: number;
}

export interface SourceStats {
  total: number;
  real: number;
  synthetic: number;
  phone: number;
  verifiedOwner: number;
  verifiedAddress: number;
  verifiedPhone: number;
  fullyVerified: number;
  luxury: number;
  duplicates: number;
  avgScore: number | null;
  added7d: number;
  added30d: number;
  newestAt: string | null;
  /** New leads per week, oldest first, last 8 weeks. */
  weekly: number[];
  byState: Array<{ state: string; count: number }>;
  /** 0 to 100 from the share of real leads with a phone (40%), a verified owner (30%) and a verified address (30%). Null with no leads. */
  quality: number | null;
}

export interface ScheduleInfo {
  intervalMs: number | null;
  lastSyncAt: string | null;
  nextSyncAt: string | null;
  status: string;
  failures: number;
  lastError: string | null;
  leadsAdded: number;
}

/** How leads from a source get into the platform. */
export interface SourceFeed {
  /** True when the platform has a working data provider for this source. */
  connected: boolean;
  /** 'auto' = pulled by the scheduled sync, 'manual' = only on demand, 'none' = no provider (CSV import only). */
  mode: 'auto' | 'manual' | 'none';
  /** Plain-language explanation shown next to sources that are not connected. */
  note: string | null;
}

export interface SourceItem {
  key: string;
  feed: SourceFeed;
  name: string;
  status: SourceStatus;
  configs: ConfigItem[];
  states: string[];
  stats: SourceStats;
  schedule: ScheduleInfo | null;
  coverage: { total: number; active: number; unconfirmed: number; imported: number; lastSyncedAt: string | null; items: CoverageItem[] };
  lastSuccess: string | null;
  attentionCount: number;
}

export interface OverviewTotals {
  sources: number;
  configs: number;
  activeConfigs: number;
  pausedConfigs: number;
  attentionConfigs: number;
  pendingConfigs: number;
  leads: number;
  added7d: number;
  phonePct: number | null;
  verifiedOwnerPct: number | null;
}

export interface LeadSourceOverview {
  generatedAt: string;
  canManage: boolean;
  totals: OverviewTotals;
  states: string[];
  sources: SourceItem[];
}
