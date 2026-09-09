'use client';

import { createClient } from '@/lib/supabase/client';

export type AuditEventType = 'field_change' | 'stage_progression' | 'note_added' | 'enrichment_event' | 'lead_created' | 'lead_deleted';

export interface AuditTrailEntry {
  id: string;
  user_id: string;
  lead_id: string;
  event_type: AuditEventType;
  field_name: string | null;
  old_value: string | null;
  new_value: string | null;
  changed_by_user_id: string | null;
  changed_by_email: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export async function recordAuditEvent(params: {
  userId: string;
  leadId: string;
  eventType: AuditEventType;
  fieldName?: string;
  oldValue?: string;
  newValue?: string;
  changedByUserId?: string;
  changedByEmail?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const supabase = createClient();
  await supabase.from('lead_audit_trail').insert({
    user_id: params.userId,
    lead_id: params.leadId,
    event_type: params.eventType,
    field_name: params.fieldName ?? null,
    old_value: params.oldValue ?? null,
    new_value: params.newValue ?? null,
    changed_by_user_id: params.changedByUserId ?? null,
    changed_by_email: params.changedByEmail ?? null,
    metadata: params.metadata ?? {},
  });
}

export async function loadAuditTrail(
  userId: string,
  leadId?: string,
  limit = 100
): Promise<AuditTrailEntry[]> {
  const supabase = createClient();
  let query = supabase
    .from('lead_audit_trail')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (leadId) {
    query = query.eq('lead_id', leadId);
  }

  const { data } = await query;
  return (data || []) as AuditTrailEntry[];
}

export function formatAuditEventLabel(entry: AuditTrailEntry): string {
  switch (entry.event_type) {
    case 'stage_progression':
      return `Stage changed: ${entry.old_value ?? '—'} → ${entry.new_value ?? '—'}`;
    case 'field_change':
      return `${entry.field_name ?? 'Field'} updated: "${entry.old_value ?? ''}" → "${entry.new_value ?? ''}"`;
    case 'note_added':
      return `Note added`;
    case 'enrichment_event':
      return `Enrichment: ${entry.metadata?.enrichment_type ?? 'data updated'}`;
    case 'lead_created':
      return `Lead created`;
    case 'lead_deleted':
      return `Lead deleted`;
    default:
      return entry.event_type;
  }
}

export const EVENT_TYPE_COLORS: Record<AuditEventType, string> = {
  stage_progression: 'bg-primary/10 text-primary',
  field_change: 'bg-blue-500/10 text-blue-500',
  note_added: 'bg-success/10 text-success',
  enrichment_event: 'bg-warning/10 text-warning',
  lead_created: 'bg-success/10 text-success',
  lead_deleted: 'bg-danger/10 text-danger',
};
