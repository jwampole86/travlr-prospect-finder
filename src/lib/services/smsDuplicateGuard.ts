import 'server-only';
import type { getSupabaseAdmin } from '@/lib/supabaseAdmin';

type Db = ReturnType<typeof getSupabaseAdmin>;
const CLEAR_STATES = new Set(['canceled', 'failed', 'undelivered']);

/** Why another text to this lead would be a double text: one already scheduled, or one sent within the window. Null when clear. */
export async function duplicateTextReason(db: Db, leadId: string, windowHours = 12): Promise<string | null> {
  const { data } = await db.from('outreach_history').select('status,sent_at,metadata').eq('lead_id', leadId).eq('channel', 'sms')
    .gte('sent_at', new Date(Date.now() - windowHours * 3_600_000).toISOString()).order('sent_at', { ascending: false }).limit(10);
  for (const r of data ?? []) {
    const m = (r.metadata ?? {}) as Record<string, any>;
    if (r.status === 'replied' || m.direction === 'inbound' || String(r.status).startsWith('blocked')) continue;
    if (CLEAR_STATES.has(String(m.twilio_status ?? '')) || r.status === 'failed') continue;
    const at = new Date(m.scheduled_for ?? r.sent_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/Denver', timeZoneName: 'short' });
    return m.twilio_status === 'scheduled' && Date.parse(m.scheduled_for ?? r.sent_at) > Date.now() ? `a text to this lead is already scheduled for ${at}` : `this lead was already texted at ${at}`;
  }
  return null;
}
