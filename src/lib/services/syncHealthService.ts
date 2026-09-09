'use client';

import { createClient } from '@/lib/supabase/client';
import { trackSyncRetryTriggered, trackSyncValidationError, trackManualRecovery } from '@/lib/mixpanel';

export type OperationType = 'lead_enrichment' | 'email_send' | 'source_sync';
export type OperationStatus = 'pending' | 'running' | 'success' | 'failed' | 'retrying' | 'abandoned';

export interface SyncEvent {
  id: string;
  user_id: string;
  operation_type: OperationType;
  operation_id: string;
  status: OperationStatus;
  attempt_count: number;
  max_attempts: number;
  next_retry_at: string | null;
  last_error: string | null;
  error_code: string | null;
  payload: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface ValidationError {
  id: string;
  operation_type: OperationType;
  operation_id: string;
  error_code: string;
  error_message: string;
  field?: string;
  created_at: string;
  resolved: boolean;
}

const BASE_BACKOFF_MS = 30 * 1000; // 30 seconds
const MAX_BACKOFF_MS = 4 * 60 * 60 * 1000; // 4 hours
const MAX_ATTEMPTS = 7;

export function calcBackoffMs(attemptCount: number): number {
  const backoff = BASE_BACKOFF_MS * Math.pow(2, attemptCount - 1);
  return Math.min(backoff, MAX_BACKOFF_MS);
}

export function formatBackoff(ms: number): string {
  if (ms < 60000) return `${Math.round(ms / 1000)}s`;
  if (ms < 3600000) return `${Math.round(ms / 60000)}m`;
  return `${Math.round(ms / 3600000)}h`;
}

// ─── Load sync events ─────────────────────────────────────────────────────────

export async function loadSyncEvents(userId: string): Promise<SyncEvent[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from('sync_events')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(100);
  return (data || []) as SyncEvent[];
}

export async function loadValidationErrors(userId: string): Promise<ValidationError[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from('sync_validation_errors')
    .select('*')
    .eq('user_id', userId)
    .eq('resolved', false)
    .order('created_at', { ascending: false })
    .limit(50);
  return (data || []) as ValidationError[];
}

// ─── Record a sync event ──────────────────────────────────────────────────────

export async function recordSyncEvent(
  userId: string,
  operationType: OperationType,
  operationId: string,
  payload: Record<string, unknown> = {}
): Promise<string | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('sync_events')
    .insert({
      user_id: userId,
      operation_type: operationType,
      operation_id: operationId,
      status: 'pending',
      attempt_count: 0,
      max_attempts: MAX_ATTEMPTS,
      payload,
    })
    .select('id')
    .single();
  if (error) return null;
  return data?.id ?? null;
}

// ─── Update sync event status ─────────────────────────────────────────────────

export async function updateSyncEventStatus(
  eventId: string,
  status: OperationStatus,
  opts: { error?: string; errorCode?: string; attemptCount?: number } = {}
): Promise<void> {
  const supabase = createClient();
  const now = new Date();
  const updates: Record<string, unknown> = {
    status,
    updated_at: now.toISOString(),
  };
  if (opts.error !== undefined) updates.last_error = opts.error;
  if (opts.errorCode !== undefined) updates.error_code = opts.errorCode;
  if (opts.attemptCount !== undefined) {
    updates.attempt_count = opts.attemptCount;
    if (status === 'retrying' || status === 'failed') {
      const backoffMs = calcBackoffMs(opts.attemptCount);
      updates.next_retry_at = new Date(now.getTime() + backoffMs).toISOString();
    }
  }
  await supabase.from('sync_events').update(updates).eq('id', eventId);
}

// ─── Record a validation error ────────────────────────────────────────────────

export async function recordValidationError(
  userId: string,
  operationType: OperationType,
  operationId: string,
  errorCode: string,
  errorMessage: string,
  field?: string
): Promise<void> {
  const supabase = createClient();
  await supabase.from('sync_validation_errors').insert({
    user_id: userId,
    operation_type: operationType,
    operation_id: operationId,
    error_code: errorCode,
    error_message: errorMessage,
    field: field ?? null,
    resolved: false,
  });
  trackSyncValidationError({ operationType, errorCode, errorMessage });
}

// ─── Validate lead enrichment ─────────────────────────────────────────────────

export interface LeadEnrichmentPayload {
  leadId: string;
  address?: string;
  city?: string;
  phone?: string;
  email?: string;
}

export function validateLeadEnrichment(payload: LeadEnrichmentPayload): { valid: boolean; errors: { code: string; message: string; field: string }[] } {
  const errors: { code: string; message: string; field: string }[] = [];

  if (!payload.leadId) {
    errors.push({ code: 'MISSING_LEAD_ID', message: 'Lead ID is required for enrichment', field: 'leadId' });
  }
  if (!payload.address && !payload.city) {
    errors.push({ code: 'MISSING_LOCATION', message: 'Address or city is required for enrichment lookup', field: 'address' });
  }
  if (payload.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email)) {
    errors.push({ code: 'INVALID_EMAIL', message: 'Email format is invalid', field: 'email' });
  }
  if (payload.phone && !/^\+?[\d\s\-().]{7,}$/.test(payload.phone)) {
    errors.push({ code: 'INVALID_PHONE', message: 'Phone number format is invalid', field: 'phone' });
  }

  return { valid: errors.length === 0, errors };
}

// ─── Validate email send ──────────────────────────────────────────────────────

export interface EmailSendPayload {
  to: string;
  subject: string;
  body: string;
  leadId?: string;
}

export function validateEmailSend(payload: EmailSendPayload): { valid: boolean; errors: { code: string; message: string; field: string }[] } {
  const errors: { code: string; message: string; field: string }[] = [];

  if (!payload.to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.to)) {
    errors.push({ code: 'INVALID_TO_EMAIL', message: 'Recipient email address is invalid', field: 'to' });
  }
  if (!payload.subject || payload.subject.trim().length < 2) {
    errors.push({ code: 'MISSING_SUBJECT', message: 'Email subject is required', field: 'subject' });
  }
  if (!payload.body || payload.body.trim().length < 10) {
    errors.push({ code: 'MISSING_BODY', message: 'Email body must be at least 10 characters', field: 'body' });
  }

  return { valid: errors.length === 0, errors };
}

// ─── Validate sync event ──────────────────────────────────────────────────────

export interface SyncEventPayload {
  source: string;
  userId: string;
}

export function validateSyncEvent(payload: SyncEventPayload): { valid: boolean; errors: { code: string; message: string; field: string }[] } {
  const errors: { code: string; message: string; field: string }[] = [];

  if (!payload.source) {
    errors.push({ code: 'MISSING_SOURCE', message: 'Sync source is required', field: 'source' });
  }
  if (!payload.userId) {
    errors.push({ code: 'MISSING_USER_ID', message: 'User ID is required for sync', field: 'userId' });
  }

  return { valid: errors.length === 0, errors };
}

// ─── Manual recovery (one-click retry) ───────────────────────────────────────

export async function triggerManualRecovery(
  userId: string,
  eventId: string,
  operationType: OperationType,
  operationId: string
): Promise<{ success: boolean; message: string }> {
  const supabase = createClient();

  try {
    // Reset the event to pending so it gets picked up by the retry runner
    const { error } = await supabase
      .from('sync_events')
      .update({
        status: 'pending',
        attempt_count: 0,
        next_retry_at: null,
        last_error: null,
        error_code: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', eventId)
      .eq('user_id', userId);

    if (error) throw error;

    trackManualRecovery({ operationType, operationId });

    return { success: true, message: 'Operation queued for retry' };
  } catch (err) {
    return {
      success: false,
      message: err instanceof Error ? err.message : 'Failed to queue retry',
    };
  }
}

// ─── Resolve validation error ─────────────────────────────────────────────────

export async function resolveValidationError(userId: string, errorId: string): Promise<void> {
  const supabase = createClient();
  await supabase
    .from('sync_validation_errors')
    .update({ resolved: true })
    .eq('id', errorId)
    .eq('user_id', userId);
}

// ─── Process pending retries ──────────────────────────────────────────────────

export async function processPendingRetries(userId: string): Promise<number> {
  const supabase = createClient();
  const now = new Date();

  const { data: dueEvents } = await supabase
    .from('sync_events')
    .select('*')
    .eq('user_id', userId)
    .in('status', ['pending', 'retrying'])
    .or(`next_retry_at.is.null,next_retry_at.lte.${now.toISOString()}`)
    .lt('attempt_count', MAX_ATTEMPTS);

  if (!dueEvents || dueEvents.length === 0) return 0;

  let processed = 0;

  for (const event of dueEvents as SyncEvent[]) {
    const newAttemptCount = event.attempt_count + 1;

    // Mark as running
    await supabase
      .from('sync_events')
      .update({ status: 'running', attempt_count: newAttemptCount, updated_at: now.toISOString() })
      .eq('id', event.id);

    trackSyncRetryTriggered({
      operationType: event.operation_type,
      operationId: event.operation_id,
      attemptNumber: newAttemptCount,
    });

    try {
      // Simulate operation execution based on type
      // In production these would call actual service functions
      await simulateOperation(event);

      await supabase
        .from('sync_events')
        .update({
          status: 'success',
          last_error: null,
          error_code: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', event.id);

      processed++;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      const isAbandoned = newAttemptCount >= MAX_ATTEMPTS;
      const backoffMs = calcBackoffMs(newAttemptCount);
      const nextRetry = new Date(Date.now() + backoffMs);

      await supabase
        .from('sync_events')
        .update({
          status: isAbandoned ? 'abandoned' : 'retrying',
          last_error: errorMsg,
          next_retry_at: isAbandoned ? null : nextRetry.toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', event.id);
    }
  }

  return processed;
}

async function simulateOperation(event: SyncEvent): Promise<void> {
  // Placeholder: in production, dispatch to actual service handlers
  // based on event.operation_type and event.payload
  await new Promise((r) => setTimeout(r, 100));
  // Simulate occasional failures for demo
  if (Math.random() < 0.1) throw new Error('Transient service error');
}

// ─── Get sync health summary ──────────────────────────────────────────────────

export interface SyncHealthSummary {
  totalEvents: number;
  successCount: number;
  failedCount: number;
  retryingCount: number;
  abandonedCount: number;
  pendingCount: number;
  validationErrorCount: number;
  healthScore: number; // 0-100
}

export function computeHealthSummary(events: SyncEvent[], validationErrors: ValidationError[]): SyncHealthSummary {
  const total = events.length;
  const success = events.filter((e) => e.status === 'success').length;
  const failed = events.filter((e) => e.status === 'failed').length;
  const retrying = events.filter((e) => e.status === 'retrying').length;
  const abandoned = events.filter((e) => e.status === 'abandoned').length;
  const pending = events.filter((e) => e.status === 'pending' || e.status === 'running').length;
  const unresolvedErrors = validationErrors.filter((e) => !e.resolved).length;

  const healthScore = total === 0
    ? 100
    : Math.max(0, Math.round(((success / total) * 100) - (abandoned * 5) - (unresolvedErrors * 2)));

  return {
    totalEvents: total,
    successCount: success,
    failedCount: failed,
    retryingCount: retrying,
    abandonedCount: abandoned,
    pendingCount: pending,
    validationErrorCount: unresolvedErrors,
    healthScore,
  };
}
