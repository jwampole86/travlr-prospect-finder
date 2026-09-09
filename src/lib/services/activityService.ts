'use client';

import { createClient } from '@/lib/supabase/client';

// ─── Types ────────────────────────────────────────────────────────────────────

export type ActivityEventType =
  | 'lead_created' |'csv_imported' |'stage_changed' |'score_updated' |'note_added' |'note_edited' |'regulation_refreshed' |'live_status' |'lead_edited' |'contact_updated' |'lead_assigned' |'lead_archived' |'lead_restored' |'bulk_update' |'enrichment_completed' |'outreach_sent' |'email_sent' |'sms_sent' |'call_completed';

export interface ActivityEvent {
  id: string;
  user_id: string;
  lead_id: string | null;
  lead_address: string | null;
  lead_state: string | null;
  event_type: ActivityEventType;
  description: string;
  detail: string | null;
  previous_value: string | null;
  new_value: string | null;
  actor_user_id: string | null;
  actor_email: string | null;
  source: string | null;
  metadata: Record<string, unknown>;
  event_timestamp: string;
  created_at: string;
}

export interface RecordActivityParams {
  leadId?: string;
  leadAddress?: string;
  leadState?: string;
  eventType: ActivityEventType;
  description: string;
  detail?: string;
  previousValue?: string;
  newValue?: string;
  source?: string;
  metadata?: Record<string, unknown>;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Relative timestamp — recalculated on every render so it stays fresh */
export function formatRelativeTime(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime();
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return 'just now';
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  // Older than 7 days — show absolute date
  return new Date(isoString).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

// ─── Service ─────────────────────────────────────────────────────────────────

export const activityService = {
  /**
   * Persist a single activity event.
   * Called at the moment the underlying action occurs — never reconstructed.
   * Returns the created event id, or null on failure (non-blocking).
   */
  async record(params: RecordActivityParams): Promise<string | null> {
    const supabase = createClient();
    try {
      const { data: { user } } = await supabase.auth.getUser();

      // Allow recording without a logged-in user (e.g. sync events, background jobs)
      // In that case, user_id is set to a sentinel value and actor fields are null.
      const userId = user?.id ?? '00000000-0000-0000-0000-000000000000';

      const { data, error } = await supabase
        .from('activity_events')
        .insert({
          user_id: userId,
          lead_id: params.leadId ?? null,
          lead_address: params.leadAddress ?? null,
          lead_state: params.leadState ?? null,
          event_type: params.eventType,
          description: params.description,
          detail: params.detail ?? null,
          previous_value: params.previousValue ?? null,
          new_value: params.newValue ?? null,
          actor_user_id: user?.id ?? null,
          actor_email: user?.email ?? null,
          source: params.source ?? 'manual',
          metadata: params.metadata ?? {},
          event_timestamp: new Date().toISOString(),
        })
        .select('id')
        .single();

      if (error) {
        console.warn('[activityService] record error:', error.message);
        return null;
      }
      return (data as { id: string }).id;
    } catch (err) {
      console.warn('[activityService] record exception:', err);
      return null;
    }
  },

  /**
   * Fetch the most recent activity events for the dashboard feed.
   * Scoped to the current user. Optionally filtered by portfolio state code.
   */
  async getFeed(options: {
    stateCode?: string; // 'all' or specific state like 'CO'
    limit?: number;
    cursor?: string; // event_timestamp for pagination
  } = {}): Promise<ActivityEvent[]> {
    const supabase = createClient();
    try {
      const limit = options.limit ?? 20;

      // Build query — show all recent events, not scoped to a single user,
      // so activity from syncs, imports, and other users is visible.
      let query = supabase
        .from('activity_events')
        .select('*')
        .order('event_timestamp', { ascending: false })
        .limit(limit);

      // Portfolio scoping
      if (options.stateCode && options.stateCode !== 'all') {
        query = query.eq('lead_state', options.stateCode);
      }

      // Cursor-based pagination
      if (options.cursor) {
        query = query.lt('event_timestamp', options.cursor);
      }

      const { data, error } = await query;
      if (error) {
        console.warn('[activityService] getFeed error:', error.message);
        return [];
      }
      return (data ?? []) as ActivityEvent[];
    } catch {
      return [];
    }
  },

  /**
   * Fetch all activity for a specific lead (used in lead profile / detail panel).
   */
  async getForLead(leadId: string, limit = 50): Promise<ActivityEvent[]> {
    const supabase = createClient();
    try {
      // Query all activity for this lead — not scoped to a single user
      // so events from syncs, imports, and other team members are visible.
      const { data, error } = await supabase
        .from('activity_events')
        .select('*')
        .eq('lead_id', leadId)
        .order('event_timestamp', { ascending: false })
        .limit(limit);

      if (error) return [];
      return (data ?? []) as ActivityEvent[];
    } catch {
      return [];
    }
  },
};

// ─── Convenience wrappers ─────────────────────────────────────────────────────
// These are called from leadsService and other mutation points.

export async function recordLeadCreated(params: {
  leadId: string;
  address: string;
  state: string;
}): Promise<void> {
  await activityService.record({
    leadId: params.leadId,
    leadAddress: params.address,
    leadState: params.state,
    eventType: 'lead_created',
    description: `New lead added — ${params.address}`,
    detail: `${params.state} market`,
    source: 'manual',
  });
}

export async function recordCSVImported(params: {
  count: number;
  state?: string;
  batchLabel?: string;
}): Promise<void> {
  await activityService.record({
    leadState: params.state ?? null,
    eventType: 'csv_imported',
    description: `CSV uploaded — ${params.count} new lead${params.count !== 1 ? 's' : ''} added`,
    detail: params.batchLabel ?? undefined,
    source: 'csv_upload',
    metadata: { count: params.count },
  });
}

export async function recordStageChanged(params: {
  leadId: string;
  address: string;
  state: string;
  previousStage: string;
  newStage: string;
  actorEmail?: string;
}): Promise<void> {
  // Special description for Live status
  const description =
    params.newStage === 'Live'
      ? `${params.address} marked Live`
      : `${params.address} moved to ${params.newStage}`;

  const eventType: ActivityEventType =
    params.newStage === 'Live' ? 'live_status' : 'stage_changed';

  await activityService.record({
    leadId: params.leadId,
    leadAddress: params.address,
    leadState: params.state,
    eventType,
    description,
    detail: `${params.previousStage} → ${params.newStage}`,
    previousValue: params.previousStage,
    newValue: params.newStage,
    source: 'manual',
  });
}

export async function recordScoreUpdated(params: {
  leadId: string;
  address: string;
  state: string;
  previousScore: number;
  newScore: number;
  trigger?: string;
}): Promise<void> {
  // Only record if score materially changed (≥5 point delta)
  if (Math.abs(params.newScore - params.previousScore) < 5) return;

  await activityService.record({
    leadId: params.leadId,
    leadAddress: params.address,
    leadState: params.state,
    eventType: 'score_updated',
    description: `${params.address} scored ${params.newScore}/100`,
    detail: params.trigger ?? 'Score updated',
    previousValue: String(params.previousScore),
    newValue: String(params.newScore),
    source: params.trigger ?? 'manual',
  });
}

export async function recordNoteAdded(params: {
  leadId: string;
  address: string;
  state: string;
  notePreview?: string;
}): Promise<void> {
  await activityService.record({
    leadId: params.leadId,
    leadAddress: params.address,
    leadState: params.state,
    eventType: 'note_added',
    description: `Note added to ${params.address}`,
    detail: params.notePreview
      ? `"${params.notePreview.slice(0, 80)}${params.notePreview.length > 80 ? '…' : ''}"`
      : undefined,
    source: 'manual',
  });
}

export async function recordRegulationRefreshed(params: {
  city: string;
  state: string;
  changed: boolean;
}): Promise<void> {
  await activityService.record({
    leadState: params.state,
    eventType: 'regulation_refreshed',
    description: `Regulations refreshed — ${params.city}`,
    detail: params.changed ? 'Rule changes detected' : 'No rule changes detected',
    source: 'regulation_sync',
    metadata: { changed: params.changed },
  });
}

export async function recordEnrichmentCompleted(params: {
  leadId: string;
  address: string;
  state: string;
  enrichmentType?: string;
}): Promise<void> {
  await activityService.record({
    leadId: params.leadId,
    leadAddress: params.address,
    leadState: params.state,
    eventType: 'enrichment_completed',
    description: `${params.address} enrichment completed`,
    detail: params.enrichmentType ?? 'Data enriched',
    source: 'enrichment',
  });
}

export async function recordBulkUpdate(params: {
  count: number;
  action: string;
  state?: string;
}): Promise<void> {
  await activityService.record({
    leadState: params.state ?? null,
    eventType: 'bulk_update',
    description: `Bulk update — ${params.count} lead${params.count !== 1 ? 's' : ''} ${params.action}`,
    source: 'bulk_action',
    metadata: { count: params.count, action: params.action },
  });
}
