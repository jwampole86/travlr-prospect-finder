'use client';

import { createClient } from '@/lib/supabase/client';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { trackRealtimeEvent } from '@/lib/mixpanel';

export type RealtimeEventType =
  | 'lead_stage_change' | 'new_lead' | 'lead_updated' | 'new_contact' | 'workflow_trigger' | 'sync_update' | 'interview_reminder' | 'deal_alert' | 'task_update';

export interface RealtimeUpdate {
  type: RealtimeEventType;
  table: string;
  record: Record<string, unknown>;
  oldRecord?: Record<string, unknown>;
  timestamp: string;
}

type UpdateHandler = (update: RealtimeUpdate) => void;

// ─── Consolidated single-channel architecture ─────────────────────────────────
// All subscriptions share one multiplexed channel to minimize WebSocket connections
// and reduce handshake overhead. A 300ms batch flush coalesces rapid-fire events
// (e.g. bulk task inserts) into a single UI update cycle.

let consolidatedChannel: RealtimeChannel | null = null;

// ─── Batch queue ──────────────────────────────────────────────────────────────

interface BatchEntry {
  update: RealtimeUpdate;
  handler: UpdateHandler;
}

let batchQueue: BatchEntry[] = [];
let batchTimer: ReturnType<typeof setTimeout> | null = null;
const BATCH_INTERVAL_MS = 300;

function enqueueBatch(update: RealtimeUpdate, handler: UpdateHandler) {
  batchQueue.push({ update, handler });
  if (!batchTimer) {
    batchTimer = setTimeout(flushBatch, BATCH_INTERVAL_MS);
  }
}

function flushBatch() {
  batchTimer = null;
  const toFlush = batchQueue.splice(0);
  if (toFlush.length === 0) return;

  // Deduplicate: for same table+id, keep only the latest record
  const seen = new Map<string, BatchEntry>();
  for (const entry of toFlush) {
    const id = String(entry.update.record?.id ?? Math.random());
    const key = `${entry.update.table}:${id}:${entry.update.type}`;
    seen.set(key, entry); // last write wins
  }

  for (const { update, handler } of seen.values()) {
    handler(update);
  }
}

// ─── Legacy per-table subscribe functions (kept for backward compat) ──────────

export function subscribeToLeads(onUpdate: UpdateHandler): () => void {
  return subscribeToAll('', onUpdate);
}

export function subscribeToContacts(onUpdate: UpdateHandler): () => void {
  // No-op: contacts are handled inside subscribeToAll
  return () => {};
}

export function subscribeToWorkflows(onUpdate: UpdateHandler): () => void {
  return () => {};
}

export function subscribeToSyncEvents(userId: string, onUpdate: UpdateHandler): () => void {
  return subscribeToAll(userId, onUpdate);
}

export function subscribeToInterviewSessions(onUpdate: UpdateHandler): () => void {
  return () => {};
}

export function subscribeToDeals(onUpdate: UpdateHandler): () => void {
  return () => {};
}

export function subscribeToTasks(userId: string, onUpdate: UpdateHandler): () => void {
  return () => {};
}

// ─── Consolidated subscribeToAll ─────────────────────────────────────────────
// Single Supabase Realtime channel covering all tables.
// Critical events (interview_reminder, deal_alert, task_update) are dispatched
// immediately (no batching) to ensure zero perceptible lag.

export function subscribeToAll(userId: string, onUpdate: UpdateHandler): () => void {
  const supabase = createClient();

  // Tear down any existing consolidated channel before re-subscribing
  if (consolidatedChannel) {
    supabase.removeChannel(consolidatedChannel);
    consolidatedChannel = null;
  }

  // Flush any pending batch before re-subscribing
  if (batchTimer) {
    clearTimeout(batchTimer);
    batchTimer = null;
    flushBatch();
  }

  const dispatch = (update: RealtimeUpdate, critical = false) => {
    if (critical) {
      // Critical events bypass the batch queue for instant delivery
      onUpdate(update);
    } else {
      enqueueBatch(update, onUpdate);
    }
  };

  consolidatedChannel = supabase
    .channel('travlr-consolidated-realtime')

    // ── Leads ──────────────────────────────────────────────────────────────
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'leads' }, (payload) => {
      trackRealtimeEvent({ eventType: 'new_contact', leadId: String(payload.new?.id ?? ''), detail: 'New lead arrived' });
      dispatch({
        type: 'new_lead',
        table: 'leads',
        record: payload.new as Record<string, unknown>,
        timestamp: new Date().toISOString(),
      });
    })
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'leads' }, (payload) => {
      const newRecord = payload.new as Record<string, unknown>;
      const oldRecord = payload.old as Record<string, unknown>;
      const isStageChange = newRecord.stage !== oldRecord.stage;
      if (isStageChange) {
        trackRealtimeEvent({
          eventType: 'lead_stage_change',
          leadId: String(newRecord.id ?? ''),
          detail: `Stage: ${String(oldRecord.stage ?? '')} → ${String(newRecord.stage ?? '')}`,
        });
      }
      dispatch({
        type: isStageChange ? 'lead_stage_change' : 'lead_updated',
        table: 'leads',
        record: newRecord,
        oldRecord,
        timestamp: new Date().toISOString(),
      });
    })

    // ── Contact history ────────────────────────────────────────────────────
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'contact_history' }, (payload) => {
      trackRealtimeEvent({
        eventType: 'new_contact',
        leadId: String((payload.new as Record<string, unknown>)?.lead_id ?? ''),
        detail: 'New contact history entry',
      });
      dispatch({
        type: 'new_contact',
        table: 'contact_history',
        record: payload.new as Record<string, unknown>,
        timestamp: new Date().toISOString(),
      });
    })

    // ── Workflows / sequence activity ──────────────────────────────────────
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'sequence_activity_log' }, (payload) => {
      trackRealtimeEvent({ eventType: 'workflow_trigger', detail: 'Workflow activity logged' });
      dispatch({
        type: 'workflow_trigger',
        table: 'sequence_activity_log',
        record: payload.new as Record<string, unknown>,
        timestamp: new Date().toISOString(),
      });
    })
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'sequence_workflows' }, (payload) => {
      dispatch({
        type: 'workflow_trigger',
        table: 'sequence_workflows',
        record: payload.new as Record<string, unknown>,
        oldRecord: payload.old as Record<string, unknown>,
        timestamp: new Date().toISOString(),
      });
    })

    // ── Sync events ────────────────────────────────────────────────────────
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'sync_events',
      ...(userId ? { filter: `user_id=eq.${userId}` } : {}),
    }, (payload) => {
      dispatch({
        type: 'sync_update',
        table: 'sync_events',
        record: (payload.new ?? {}) as Record<string, unknown>,
        oldRecord: (payload.old ?? undefined) as Record<string, unknown> | undefined,
        timestamp: new Date().toISOString(),
      });
    })

    // ── Interview sessions — CRITICAL (no batching) ────────────────────────
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'interview_sessions' }, (payload) => {
      dispatch({
        type: 'interview_reminder',
        table: 'interview_sessions',
        record: payload.new as Record<string, unknown>,
        timestamp: new Date().toISOString(),
      }, true /* critical */);
    })
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'interview_sessions' }, (payload) => {
      const newRecord = payload.new as Record<string, unknown>;
      const oldRecord = payload.old as Record<string, unknown>;
      if (newRecord.status !== oldRecord.status) {
        dispatch({
          type: 'interview_reminder',
          table: 'interview_sessions',
          record: newRecord,
          oldRecord,
          timestamp: new Date().toISOString(),
        }, true /* critical */);
      }
    })

    // ── Closed deals — CRITICAL (no batching) ─────────────────────────────
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'closed_deals' }, (payload) => {
      dispatch({
        type: 'deal_alert',
        table: 'closed_deals',
        record: payload.new as Record<string, unknown>,
        timestamp: new Date().toISOString(),
      }, true /* critical */);
    })
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'closed_deals' }, (payload) => {
      const newRecord = payload.new as Record<string, unknown>;
      const oldRecord = payload.old as Record<string, unknown>;
      if (newRecord.status !== oldRecord.status) {
        dispatch({
          type: 'deal_alert',
          table: 'closed_deals',
          record: newRecord,
          oldRecord,
          timestamp: new Date().toISOString(),
        }, true /* critical */);
      }
    })

    // ── Lead tasks — CRITICAL (no batching) ───────────────────────────────
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'lead_tasks' }, (payload) => {
      const record = payload.new as Record<string, unknown>;
      if (userId && record.assigned_to && record.assigned_to !== userId) return;
      dispatch({
        type: 'task_update',
        table: 'lead_tasks',
        record,
        timestamp: new Date().toISOString(),
      }, true /* critical */);
    })
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'lead_tasks' }, (payload) => {
      const newRecord = payload.new as Record<string, unknown>;
      const oldRecord = payload.old as Record<string, unknown>;
      if (userId && newRecord.assigned_to && newRecord.assigned_to !== userId) return;
      if (newRecord.status !== oldRecord.status || newRecord.due_date !== oldRecord.due_date) {
        dispatch({
          type: 'task_update',
          table: 'lead_tasks',
          record: newRecord,
          oldRecord,
          timestamp: new Date().toISOString(),
        }, true /* critical */);
      }
    })

    .subscribe();

  return () => {
    if (consolidatedChannel) {
      supabase.removeChannel(consolidatedChannel);
      consolidatedChannel = null;
    }
    if (batchTimer) {
      clearTimeout(batchTimer);
      batchTimer = null;
    }
    batchQueue = [];
  };
}
