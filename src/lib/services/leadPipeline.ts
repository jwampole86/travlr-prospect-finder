import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

export type PipelineTarget = 'contacted' | 'callback_scheduled' | 'offer_sent' | 'signed' | 'rejected';
const RANK: Record<Exclude<PipelineTarget, 'rejected'>, number> = { contacted: 1, callback_scheduled: 2, offer_sent: 3, signed: 4 };

/**
 * The status a lead should move to, or null to leave it alone. Progress only moves forward and a signed lead stays signed.
 * A refusal marks the lead rejected; a rejected lead comes back only when the homeowner re-engages (asks for a call, says YES, signs).
 */
export function nextPipelineStatus(current: string | null | undefined, target: PipelineTarget): PipelineTarget | null {
  if (current === 'signed') return null;
  if (target === 'rejected') return current === 'rejected' ? null : 'rejected';
  if (!current) return target;
  if (current === 'rejected') return RANK[target] >= RANK.callback_scheduled ? target : null;
  return RANK[target] > RANK[current as Exclude<PipelineTarget, 'rejected'>] ? target : null;
}

/** Moves one lead along the Conversion Pipeline when something real happens (a reply, a request, an offer, a signature). Never throws. */
export async function advancePipeline(db: SupabaseClient, leadId: string, target: PipelineTarget): Promise<void> {
  try {
    const { data } = await db.from('leads').select('pipeline_status').eq('id', leadId).maybeSingle();
    const next = nextPipelineStatus(data?.pipeline_status as string | null | undefined, target);
    if (!next) return;
    await db.from('leads').update({ pipeline_status: next, pipeline_status_updated_at: new Date().toISOString() }).eq('id', leadId);
  } catch (e) { console.warn('[pipeline]', e instanceof Error ? e.message : e); }
}
