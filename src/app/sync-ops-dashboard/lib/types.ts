import type { SourceKey, SourceRunStatus } from './syncEngine';

export interface SourceCell {
  status: SourceRunStatus;
  fetched: number;
  newLeads: number;
  updated: number;
  duplicates: number;
  at: string;
  error: string | null;
  durationMs: number | null;
}

export interface PortfolioRow {
  portfolio: string;
  stateCode: string;
  totalLeads: number;
  running: boolean;
  progress: { done: number; total: number };
  cells: Partial<Record<SourceKey, SourceCell>>;
}

export interface SourceStat {
  key: SourceKey;
  name: string;
  accent: string;
  total: number;
  sharePct: number;
  last24h: number;
  lastEventAt: string | null;
  lastStatus: 'success' | 'failed' | null;
  lastError: string | null;
}

export type LogLevel = 'info' | 'ok' | 'warn' | 'error';
export interface LogEntry {
  id: number;
  ts: string;
  level: LogLevel;
  text: string;
}

export interface E2ERow {
  portfolio: string;
  stateCode: string;
  leads: number;
  scoredPct: number;
  enrichedPct: number;
  outreachReady: number;
  fresh: boolean;
  status: 'pass' | 'warn' | 'fail';
  issues: string[];
}

export interface SyncAlertEvent {
  id: string;
  alert_type: string;
  portfolio: string | null;
  severity: string;
  message: string;
  details: Record<string, unknown>;
  acknowledged: boolean;
  created_at: string;
}

export interface SyncAlertConfig {
  id: string;
  alert_type: string;
  enabled: boolean;
  threshold_value: number | null;
  slack_webhook_url: string | null;
  alert_email: string | null;
  notify_slack: boolean;
  notify_email: boolean;
}
