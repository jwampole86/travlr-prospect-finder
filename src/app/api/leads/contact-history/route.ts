import { NextRequest, NextResponse } from 'next/server';
import { requireLeadAccess } from '@/lib/auth/apiAuthorization';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { outreachDisplay } from '@/lib/services/smsSendState';

export const maxDuration = 30;

export interface ContactEvent {
  id: string; kind: 'text' | 'email' | 'call' | 'note' | 'link'; direction: 'outbound' | 'inbound'; at: string;
  title: string; body?: string; status?: string; tone?: 'blue' | 'amber' | 'green' | 'red' | 'purple' | 'gray'; details: Array<{ label: string; at?: string; text?: string }>; source: string; /** True when only the day is known (an agent logged it by hand). */ dateOnly?: boolean;
}

const iso = (v: unknown) => { const t = typeof v === 'string' ? Date.parse(v) : NaN; return Number.isFinite(t) ? new Date(t).toISOString() : null; };
const KIND_TITLE: Record<string, string> = { estimate_outreach: 'Estimate text', yes_followup: 'Follow-up after YES', auto_answer: 'Automatic answer to a question', homeowner_report: 'Estimate report email' };

/**
 * GET /api/leads/contact-history?leadId=
 * Every real contact with the lead, newest first, from the records that hold them: texts and emails (with true send, delivery and reply times),
 * calls, estimate-link opens and what agents logged by hand. Queued texts are listed separately as upcoming, never as contact.
 */
export async function GET(req: NextRequest) {
  const leadId = new URL(req.url).searchParams.get('leadId') ?? '';
  if (!leadId) return NextResponse.json({ error: 'leadId is required' }, { status: 400 });
  const auth = await requireLeadAccess(req, leadId);
  if (!auth.actor) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const db = getSupabaseAdmin();
  const [out, sessions, calls, manual, links] = await Promise.all([
    db.from('outreach_history').select('id,channel,status,sent_at,subject,body_preview,full_body,metadata').eq('lead_id', leadId).order('sent_at', { ascending: false }).limit(200),
    db.from('call_sessions').select('id,call_sid,agent_name,started_at,ended_at,duration_seconds,call_outcome,outcome,call_summary,notes,disposition_notes').eq('lead_id', leadId).order('started_at', { ascending: false }).limit(50),
    db.from('outreach_call_log').select('id,call_sid,agent_name,called_at,duration_seconds,outcome,disposition_notes').eq('lead_id', leadId).order('called_at', { ascending: false }).limit(50),
    db.from('contact_history').select('id,type,subject,body,outcome,contacted_at').eq('lead_id', leadId).order('contacted_at', { ascending: false }).limit(100),
    db.from('sms_link_events').select('id,occurred_at,is_bot,device,city,region').eq('lead_id', leadId).eq('is_bot', false).order('occurred_at', { ascending: false }).limit(60),
  ]);

  const events: ContactEvent[] = [];
  const upcoming: Array<{ id: string; at: string; title: string; body?: string; due: boolean }> = [];

  for (const r of out.data ?? []) {
    const m = (r.metadata ?? {}) as Record<string, any>;
    if (String(r.status).startsWith('blocked')) continue;
    if (r.channel === 'sms') {
      const inbound = r.status === 'replied' || m.direction === 'inbound';
      if (inbound) { const at = iso(r.sent_at); if (at) events.push({ id: `o-${r.id}`, kind: 'text', direction: 'inbound', at, title: 'Reply from the homeowner', body: m.body, status: 'Reply', tone: 'purple', details: [], source: 'SMS' }); continue; }
      const d = outreachDisplay({ channel: 'sms', status: r.status, sent_at: r.sent_at, metadata: m });
      const planned = iso(m.scheduled_for ?? r.sent_at);
      if (!planned) continue;
      if (d.label === 'Scheduled' || d.label === 'Due to send') { upcoming.push({ id: `o-${r.id}`, at: planned, title: KIND_TITLE[m.kind] ?? 'Text', body: m.message, due: d.label === 'Due to send' }); continue; }
      if (d.label === 'Cancelled') continue;
      events.push({ id: `o-${r.id}`, kind: 'text', direction: 'outbound', at: planned, title: `${KIND_TITLE[m.kind] ?? 'Text'}${m.campaign_name ? ` · ${m.campaign_name}` : ''}`, body: m.message ?? r.body_preview ?? undefined, status: d.label, tone: d.tone, details: d.events.filter(e => e.label !== 'Sent at').map(e => ({ label: e.label, at: e.at })), source: 'SMS' });
    } else if (r.channel === 'email') {
      const at = iso(r.sent_at); if (!at) continue;
      const inbound = m.direction === 'inbound';
      events.push({ id: `o-${r.id}`, kind: 'email', direction: inbound ? 'inbound' : 'outbound', at, title: r.subject || KIND_TITLE[m.kind] || 'Email', body: r.body_preview ?? undefined, status: r.status, tone: ['bounced', 'failed'].includes(r.status) ? 'red' : r.status === 'replied' ? 'purple' : ['opened', 'clicked', 'delivered'].includes(r.status) ? 'green' : 'blue', details: [], source: 'Email' });
    } else if (r.channel === 'call') {
      const at = iso(r.sent_at); if (!at) continue;
      events.push({ id: `o-${r.id}`, kind: 'call', direction: 'outbound', at, title: 'Call', body: m.message_body ?? undefined, status: r.status, tone: 'gray', details: [], source: 'Call' });
    }
  }

  const seenCalls = new Set<string>();
  for (const c of sessions.data ?? []) {
    const at = iso(c.started_at); if (!at) continue; if (c.call_sid) seenCalls.add(c.call_sid);
    const outcome = c.call_outcome || c.outcome || undefined;
    events.push({ id: `cs-${c.id}`, kind: 'call', direction: 'outbound', at, title: `Call${c.agent_name ? ` by ${c.agent_name}` : ''}`, body: c.call_summary || c.disposition_notes || c.notes || undefined, status: outcome, tone: 'green', details: c.duration_seconds ? [{ label: 'Duration', text: `${Math.floor(c.duration_seconds / 60)}m ${c.duration_seconds % 60}s` }] : [], source: 'Call' });
  }
  for (const c of calls.data ?? []) {
    const at = iso(c.called_at); if (!at || (c.call_sid && seenCalls.has(c.call_sid))) continue;
    events.push({ id: `cl-${c.id}`, kind: 'call', direction: 'outbound', at, title: `Call${c.agent_name ? ` by ${c.agent_name}` : ''}`, body: c.disposition_notes || undefined, status: c.outcome || undefined, tone: 'green', details: c.duration_seconds ? [{ label: 'Duration', text: `${Math.floor(c.duration_seconds / 60)}m ${c.duration_seconds % 60}s` }] : [], source: 'Call' });
  }
  for (const h of manual.data ?? []) {
    const at = iso(h.contacted_at); if (!at) continue;
    events.push({ id: `mh-${h.id}`, kind: (['email', 'call', 'text', 'note'].includes(h.type) ? h.type : 'note') as ContactEvent['kind'], direction: 'outbound', at, title: h.subject || `${String(h.type).replace(/^./, (x: string) => x.toUpperCase())} logged`, body: h.body || undefined, status: h.outcome || undefined, tone: 'gray', details: [], source: 'Logged by an agent', dateOnly: String(h.contacted_at).length <= 10 });
  }
  // Repeat opens of the estimate link within half an hour count once.
  let lastLink = 0;
  for (const l of [...(links.data ?? [])].reverse()) {
    const t = Date.parse(l.occurred_at); if (!Number.isFinite(t) || t - lastLink < 30 * 60_000) continue; lastLink = t;
    events.push({ id: `lk-${l.id}`, kind: 'link', direction: 'inbound', at: new Date(t).toISOString(), title: 'Opened the estimate link', status: 'Engaged', tone: 'purple', details: [{ label: 'From', text: [l.device, [l.city, l.region].filter(Boolean).join(', ')].filter(Boolean).join(' · ') || 'unknown' }], source: 'Estimate link' });
  }

  events.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  upcoming.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  const lastReal = events.find(e => e.kind !== 'link');
  return NextResponse.json({ events: events.slice(0, 150), upcoming, lastContactAt: lastReal?.at ?? null, counts: { texts: events.filter(e => e.kind === 'text').length, calls: events.filter(e => e.kind === 'call').length, emails: events.filter(e => e.kind === 'email').length, replies: events.filter(e => e.direction === 'inbound' && e.kind !== 'link').length } });
}
