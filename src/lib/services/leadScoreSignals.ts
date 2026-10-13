import type { SupabaseClient } from '@supabase/supabase-js';
import type { LeadScoreSignals } from '@/lib/scoring/prospectScoring';

const WINDOW_DAYS = 120;
const CHUNK = 150;
const ANSWERED = /answer|connect|spoke|talk|interested|callback|booked|scheduled/i;

/** Replies, estimate-link opens, answered calls and email opens for each lead over the last 120 days, from the tables that record them. */
export async function loadScoreSignals(db: SupabaseClient, ids: string[]): Promise<Map<string, LeadScoreSignals>> {
  const out = new Map<string, LeadScoreSignals>();
  const get = (id: string) => { let s = out.get(id); if (!s) { s = { replies: 0, clicks: 0, formSubmitted: false, callsAnswered: 0, emailOpens: 0, emailClicks: 0, lastEngagementAt: null }; out.set(id, s); } return s; };
  const bump = (s: LeadScoreSignals, at: unknown) => { const t = typeof at === 'string' ? Date.parse(at) : NaN; if (Number.isFinite(t) && (!s.lastEngagementAt || t > Date.parse(s.lastEngagementAt))) s.lastEngagementAt = new Date(t).toISOString(); };
  const since = new Date(Date.now() - WINDOW_DAYS * 86_400_000).toISOString();

  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK);
    const [hist, links, journey, calls] = await Promise.all([
      db.from('outreach_history').select('lead_id,channel,status,sent_at,metadata').in('lead_id', chunk).gte('sent_at', since).in('status', ['replied', 'opened', 'clicked']).limit(5000),
      db.from('sms_link_events').select('lead_id,occurred_at').in('lead_id', chunk).eq('is_bot', false).gte('occurred_at', since).limit(5000),
      db.from('estimate_journey_events').select('lead_id,event,created_at').in('lead_id', chunk).gte('created_at', since).limit(5000),
      db.from('call_sessions').select('lead_id,call_outcome,outcome,started_at').in('lead_id', chunk).gte('started_at', since).limit(2000),
    ]);
    for (const h of hist.data ?? []) {
      const s = get(h.lead_id as string);
      if (h.status === 'replied') { s.replies++; bump(s, h.sent_at); }
      else if (h.status === 'opened') s.emailOpens++;
      else if (h.status === 'clicked') { s.emailClicks++; bump(s, h.sent_at); }
    }
    for (const l of links.data ?? []) { const s = get(l.lead_id as string); s.clicks++; bump(s, l.occurred_at); }
    for (const j of journey.data ?? []) { const s = get(j.lead_id as string); if (/submit/i.test(String(j.event))) { s.formSubmitted = true; bump(s, j.created_at); } }
    for (const c of calls.data ?? []) { if (!c.lead_id) continue; const s = get(c.lead_id as string); if (ANSWERED.test(String(c.call_outcome ?? c.outcome ?? ''))) { s.callsAnswered++; bump(s, c.started_at); } }
  }
  return out;
}
