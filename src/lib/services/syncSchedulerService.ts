'use client';

import { createClient } from '@/lib/supabase/client';
import { REFRESH_SOURCES, refreshLeadsFromSources } from './leadsRefreshService';
import { trackSourceSynced } from '@/lib/mixpanel';

// ─── Central interval configuration ──────────────────────────────────────────
export const SYNC_INTERVAL_MS = 60 * 60 * 1000; // 1 hour — standardized across all sources

// Sources with stricter anti-scraping posture get a longer safe interval
const SOURCE_INTERVAL_OVERRIDES: Record<string, number> = {
  Craigslist: 2 * 60 * 60 * 1000, // 2 hours for Craigslist to avoid rate limiting
};

// ─── Exponential backoff configuration ───────────────────────────────────────
// Configurable sequence: 1s → 2s → 4s → 8s → 16s → ... capped at MAX_BACKOFF_MS
// BASE_BACKOFF_MS sets the starting delay (1 second by default)
export const BASE_BACKOFF_MS = 1_000;           // 1 second — first retry
export const MAX_BACKOFF_MS = 2 * 60 * 60 * 1000; // 2 hours absolute cap

// Jitter factor (0–1): adds randomness to prevent thundering-herd on simultaneous failures
const JITTER_FACTOR = 0.2;

// ─── Stagger configuration ────────────────────────────────────────────────────
function getStaggerOffsetMs(sourceIndex: number, totalSources: number): number {
  const windowMs = 55 * 60 * 1000;
  return Math.round((sourceIndex / Math.max(totalSources, 1)) * windowMs);
}

export interface SyncScheduleRow {
  id: string;
  user_id: string;
  source: string;
  last_sync_at: string | null;
  next_sync_at: string | null;
  status: 'idle' | 'running' | 'success' | 'failed';
  failure_count: number;
  last_error: string | null;
  leads_added: number;
  updated_at: string;
}

// ─── Exponential backoff with jitter ─────────────────────────────────────────
// Sequence (failure_count → delay):
//   1 → 1s, 2 → 2s, 3 → 4s, 4 → 8s, 5 → 16s, ... capped at MAX_BACKOFF_MS
// Jitter adds ±20% randomness to prevent simultaneous retries across sources.
export function getBackoffMs(failureCount: number, baseMs: number = BASE_BACKOFF_MS): number {
  const exponential = baseMs * Math.pow(2, failureCount - 1);
  const capped = Math.min(exponential, MAX_BACKOFF_MS);
  // Add jitter: random value in range [-jitter, +jitter] of the capped delay
  const jitter = capped * JITTER_FACTOR * (Math.random() * 2 - 1);
  return Math.max(baseMs, Math.round(capped + jitter));
}

// ─── Human-readable backoff description ──────────────────────────────────────
export function describeBackoff(failureCount: number, baseMs: number = BASE_BACKOFF_MS): string {
  const delays: string[] = [];
  for (let i = 1; i <= Math.min(failureCount + 1, 6); i++) {
    const ms = Math.min(baseMs * Math.pow(2, i - 1), MAX_BACKOFF_MS);
    if (ms < 1000) delays.push(`${ms}ms`);
    else if (ms < 60_000) delays.push(`${Math.round(ms / 1000)}s`);
    else if (ms < 3_600_000) delays.push(`${Math.round(ms / 60_000)}m`);
    else delays.push(`${Math.round(ms / 3_600_000)}h`);
  }
  return delays.join(' → ');
}

// ─── Graceful fallback message builder ───────────────────────────────────────
export function buildFallbackMessage(
  source: string,
  failureCount: number,
  errorMsg: string,
  nextRetryMs: number
): string {
  const retryIn = formatBackoffDuration(nextRetryMs);
  const backoffSequence = describeBackoff(failureCount);

  // Categorize the error for a more helpful message
  const isRateLimit = /rate.?limit|429|too many request|throttl/i.test(errorMsg);
  const isNetwork = /network|timeout|ECONNREFUSED|ENOTFOUND|fetch/i.test(errorMsg);
  const isAuth = /auth|401|403|forbidden|unauthorized/i.test(errorMsg);
  const isNotFound = /404|not found|removed|unavailable/i.test(errorMsg);

  let reason = 'an unexpected error';
  let suggestion = 'The sync will retry automatically.';

  if (isRateLimit) {
    reason = 'a rate limit from the source';
    suggestion = `${source} is throttling requests. Backing off to avoid being blocked.`;
  } else if (isNetwork) {
    reason = 'a network connectivity issue';
    suggestion = 'Check your connection or the source site status.';
  } else if (isAuth) {
    reason = 'an authentication failure';
    suggestion = 'Verify the sync URL credentials are still valid.';
  } else if (isNotFound) {
    reason = 'the source URL returning 404';
    suggestion = `The ${source} listing page may have moved or been removed. Consider updating the sync URL.`;
  }

  return [
    `⚠️ ${source} sync failed (attempt ${failureCount}) due to ${reason}.`,
    suggestion,
    `Retry schedule: ${backoffSequence}. Next retry in ${retryIn}.`,
    failureCount >= 5
      ? `⚠️ ${source} has failed ${failureCount} times. Consider checking the source URL or pausing this sync.`
      : '',
  ].filter(Boolean).join(' ');
}

function formatBackoffDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m`;
  return `${(ms / 3_600_000).toFixed(1)}h`;
}

function getIntervalForSource(source: string): number {
  return SOURCE_INTERVAL_OVERRIDES[source] ?? SYNC_INTERVAL_MS;
}

export async function loadSyncSchedules(userId: string): Promise<SyncScheduleRow[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from('sync_schedules')
    .select('*')
    .eq('user_id', userId)
    .order('source');
  return (data || []) as SyncScheduleRow[];
}

export async function ensureSyncSchedules(userId: string): Promise<void> {
  const supabase = createClient();
  const sources = REFRESH_SOURCES.map((s) => s.name);

  for (let i = 0; i < sources.length; i++) {
    const source = sources[i];
    const now = new Date();
    const intervalMs = getIntervalForSource(source);
    const staggerMs = getStaggerOffsetMs(i, sources.length);
    const nextSync = new Date(now.getTime() + staggerMs);

    await supabase.from('sync_schedules').upsert(
      {
        user_id: userId,
        source,
        status: 'idle',
        failure_count: 0,
        leads_added: 0,
        next_sync_at: nextSync.toISOString(),
        sync_interval_ms: intervalMs,
        updated_at: now.toISOString(),
      },
      { onConflict: 'user_id,source', ignoreDuplicates: true }
    );
  }
}

export async function runScheduledSyncs(
  userId: string,
  onNotify: (type: string, title: string, message: string) => void
): Promise<void> {
  const supabase = createClient();
  const schedules = await loadSyncSchedules(userId);
  const now = new Date();

  for (const schedule of schedules) {
    const nextSync = schedule.next_sync_at ? new Date(schedule.next_sync_at) : null;
    const isDue = !nextSync || now >= nextSync;

    if (!isDue || schedule.status === 'running') continue;

    // Mark as running
    await supabase
      .from('sync_schedules')
      .update({ status: 'running', updated_at: now.toISOString() })
      .eq('id', schedule.id);

    try {
      const result = await refreshLeadsFromSources();
      const intervalMs = getIntervalForSource(schedule.source);
      const nextSyncTime = new Date(now.getTime() + intervalMs);

      await supabase
        .from('sync_schedules')
        .update({
          status: 'success',
          last_sync_at: now.toISOString(),
          next_sync_at: nextSyncTime.toISOString(),
          sync_interval_ms: intervalMs,
          failure_count: 0,
          last_error: null,
          leads_added: result.newLeads,
          updated_at: now.toISOString(),
        })
        .eq('id', schedule.id);

      trackSourceSynced({ source: schedule.source, success: true, leadsCount: result.newLeads });

      if (result.newLeads > 0) {
        onNotify(
          'new_lead',
          `${schedule.source} sync complete`,
          `${result.newLeads} new lead${result.newLeads !== 1 ? 's' : ''} added from ${schedule.source}.`
        );
      } else {
        onNotify(
          'sync_health',
          `${schedule.source} synced`,
          `No new leads found. Source is healthy.`
        );
      }
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      const newFailureCount = (schedule.failure_count || 0) + 1;

      // Exponential backoff: 1s → 2s → 4s → 8s → ... capped at 2h
      const backoffMs = getBackoffMs(newFailureCount);
      const nextRetry = new Date(now.getTime() + backoffMs);

      await supabase
        .from('sync_schedules')
        .update({
          status: 'failed',
          failure_count: newFailureCount,
          last_error: errorMsg,
          next_sync_at: nextRetry.toISOString(),
          updated_at: now.toISOString(),
        })
        .eq('id', schedule.id);

      trackSourceSynced({ source: schedule.source, success: false, errorMessage: errorMsg });

      // Build graceful fallback message with full context
      const fallbackMessage = buildFallbackMessage(
        schedule.source,
        newFailureCount,
        errorMsg,
        backoffMs
      );

      onNotify('sync_health', `${schedule.source} sync failed`, fallbackMessage);
    }
  }
}

// ─── Returns the soonest upcoming next_sync_at across all schedules ───────────
export function getSoonestNextSync(schedules: SyncScheduleRow[]): string | null {
  const upcoming = schedules
    .filter(s => s.next_sync_at && s.status !== 'running')
    .map(s => new Date(s.next_sync_at!).getTime())
    .filter(t => t > Date.now());
  if (upcoming.length === 0) return null;
  return new Date(Math.min(...upcoming)).toISOString();
}

export function formatNextSync(nextSyncAt: string | null): string {
  if (!nextSyncAt) return 'Not scheduled';
  const diff = new Date(nextSyncAt).getTime() - Date.now();
  if (diff <= 0) return 'Due now';
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `in ${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `in ${hrs}h ${mins % 60}m`;
  return `in ${Math.floor(hrs / 24)}d`;
}

export function formatLastSync(lastSyncAt: string | null): string {
  if (!lastSyncAt) return 'Never';
  const diff = Date.now() - new Date(lastSyncAt).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}
