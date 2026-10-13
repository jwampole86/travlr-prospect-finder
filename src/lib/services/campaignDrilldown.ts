import 'server-only';
import type { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { redact, segmentKeys } from '@/lib/services/campaignInsights';
import { wasSent } from '@/lib/services/smsSendState';

type Db = ReturnType<typeof getSupabaseAdmin>;
type Row = Record<string, any>;

const MAX_ROWS = 500;
const delivered = (r: Row) => ['delivered', 'read'].includes(r.twilio_status);

/** Whether one text belongs to a metric, using the same definitions as the overview numbers. */
function inMetric(metric: string, r: Row, now: number): boolean {
  const sent = wasSent(r.twilio_status);
  const [m, arg = ''] = metric.split(':');
  switch (m) {
    case 'texts': return true;
    case 'sent': return sent;
    case 'delivered': return delivered(r);
    case 'notdelivered': return sent && !delivered(r);
    case 'waiting': return !sent && r.twilio_status !== 'canceled';
    case 'clicked': return r.human_clicks > 0;
    case 'viewed': return !!r.estimate_viewed;
    case 'contact': return ['contact', 'questionnaire', 'submitted'].includes(r.deepest_step);
    case 'submitted': return !!r.estimate_submitted_at;
    case 'replied': return !!r.reply_at;
    case 'yes': return r.reply_intent === 'yes' || !!r.opted_in;
    case 'optout': return !!r.opted_out;
    case 'temp': return r.temperature === arg;
    case 'status': return (r.twilio_status ?? 'scheduled') === arg;
    case 'error': return r.twilio_error_code === arg;
    case 'intent': return r.reply_intent === arg;
    case 'engaged': return r.human_clicks > 0 || !!r.reply_at || !!r.estimate_submitted_at;
    case 'unreachable': return ['landline', 'invalid', 'unreachable', 'filtered'].includes(r.phone_quality);
    case 'wrong_person': return r.phone_quality === 'wrong_person';
    default: return false;
  }
}

async function pageAll(db: Db, batch: string): Promise<Row[]> {
  const all: Row[] = [];
  for (let from = 0; ; from += 1000) {
    let q = db.from('sms_lead_engagement').select('*').range(from, from + 999);
    if (batch !== 'all') q = q.eq('batch', batch);
    const { data, error } = await q; if (error) throw error;
    all.push(...(data ?? []));
    if ((data ?? []).length < 1000) break;
  }
  return all;
}

async function leadInfo(db: Db, ids: string[]) {
  const out = new Map<string, Row>();
  for (let i = 0; i < ids.length; i += 100) {
    const { data } = await db.from('leads').select('id,address,city,state,owner_name,contact_phone,stage,prospect_score').in('id', ids.slice(i, i + 100));
    for (const l of data ?? []) out.set(l.id, l);
  }
  return out;
}

export interface DrillRow {
  leadId: string; batch: string; address: string; owner: string | null; state: string | null; phone: string | null; stage: string | null;
  status: string; errorCode: string | null; tone: string | null; audience: string | null; scheduledFor: string; deliveredAt: string | null;
  clicks: number; viewed: boolean; timeOnPage: number | null; deepestStep: string | null; submittedAt: string | null;
  replyAt: string | null; replyIntent: string | null; replyText: string | null; optedOut: boolean; temperature: string; score: number; device: string | null; os: string | null;
  lastActivityAt: string | null; lastActivity: string | null;
}

/** The individual texts behind one number on the Campaigns page. `group` and `value` narrow it to a segment (tone, state, audience...). */
export async function drilldown(db: Db, opts: { batch: string; metric: string; group?: string; value?: string }) {
  const now = Date.now();
  const rows = (await pageAll(db, opts.batch)).filter(r => inMetric(opts.metric, r, now) && (!opts.group || segmentKeys(r)[opts.group] === opts.value));
  // Most recent interaction first; texts nobody has touched fall to the bottom in send order.
  const act = (r: Row) => (r.last_activity_at ? Date.parse(r.last_activity_at) : 0);
  rows.sort((a, b) => act(b) - act(a) || (b.engagement_score ?? 0) - (a.engagement_score ?? 0) || Date.parse(a.scheduled_for) - Date.parse(b.scheduled_for));
  const shown = rows.slice(0, MAX_ROWS);
  const info = await leadInfo(db, [...new Set(shown.map(r => r.lead_id as string))]);
  const list: DrillRow[] = shown.map(r => {
    const l = info.get(r.lead_id) ?? {};
    return {
      leadId: r.lead_id, batch: r.batch, address: [l.address, l.city, l.state].filter(Boolean).join(', '), owner: l.owner_name ?? null, state: r.state ?? l.state ?? null,
      phone: l.contact_phone ?? null, stage: l.stage ?? null, status: r.twilio_status ?? 'scheduled', errorCode: r.twilio_error_code ?? null, tone: r.variant ?? null, audience: r.audience ?? null,
      scheduledFor: r.scheduled_for, deliveredAt: r.delivered_at ?? null, clicks: r.human_clicks ?? 0, viewed: !!r.estimate_viewed, timeOnPage: r.time_on_page_s ?? null,
      deepestStep: r.deepest_step ?? null, submittedAt: r.estimate_submitted_at ?? null, replyAt: r.reply_at ?? null, replyIntent: r.reply_intent ?? null,
      replyText: r.reply_text ? redact(String(r.reply_text)) : null, optedOut: !!r.opted_out, temperature: r.temperature, score: r.engagement_score ?? 0, device: r.device ?? null, os: r.os ?? null,
      lastActivityAt: r.last_activity_at ?? null, lastActivity: r.last_activity ?? null,
    };
  });
  return { total: rows.length, shown: list.length, rows: list };
}

export interface TimelineItem { at: string; label: string; detail?: string }

/** One text in full: the message that was sent, the lead's facts and everything that happened afterwards. */
export async function textDetail(db: Db, leadId: string, batch: string) {
  const { data: r } = await db.from('sms_lead_engagement').select('*').eq('lead_id', leadId).eq('batch', batch).maybeSingle();
  if (!r) return null;
  const [{ data: lead }, { data: hist }, { data: events }] = await Promise.all([
    db.from('leads').select('id,address,city,state,zip,owner_name,contact_phone,stage,prospect_score,price,beds,baths').eq('id', leadId).maybeSingle(),
    db.from('outreach_history').select('metadata,sent_at').eq('lead_id', leadId).eq('channel', 'sms').eq('metadata->>batch', batch).limit(1),
    db.from('estimate_journey_events').select('event,data,created_at').eq('lead_id', leadId).order('created_at', { ascending: true }).limit(60),
  ]);
  const meta = (hist?.[0]?.metadata ?? {}) as Row;
  const t: TimelineItem[] = [];
  t.push({ at: r.scheduled_for, label: wasSent(r.twilio_status) ? 'Sent' : 'Scheduled to send' });
  if (r.delivered_at) t.push({ at: r.delivered_at, label: 'Delivered to the phone' });
  else if (r.twilio_status && !['scheduled', 'queued', 'sent', 'accepted', 'sending'].includes(r.twilio_status)) t.push({ at: r.scheduled_for, label: `Delivery: ${r.twilio_status}`, detail: r.twilio_error_code ? `Carrier error ${r.twilio_error_code}` : undefined });
  if (r.first_click_at) t.push({ at: r.first_click_at, label: `Opened the link${r.human_clicks > 1 ? ` (${r.human_clicks} times)` : ''}`, detail: [r.device, r.os, r.click_region].filter(Boolean).join(' · ') || undefined });
  for (const e of events ?? []) {
    const labels: Record<string, string> = { page_view: 'Viewed the page', estimate_shown: 'Saw the estimate', time_on_page: 'Time on page', scroll_depth: 'Scrolled the page', credential_clicked: 'Opened a credential', chat_question: 'Asked a question in the chat' };
    const d = (e.data ?? {}) as Row;
    t.push({ at: e.created_at, label: labels[e.event] ?? e.event.replace(/_/g, ' '), detail: e.event === 'chat_question' ? redact(String(d.text ?? '')) : e.event === 'time_on_page' && d.seconds ? `${d.seconds}s` : e.event === 'scroll_depth' && d.depth ? `${d.depth}%` : undefined });
  }
  if (r.contact_requested_at) t.push({ at: r.contact_requested_at, label: 'Asked for a call or a question' });
  if (r.estimate_submitted_at) t.push({ at: r.estimate_submitted_at, label: 'Submitted the estimate form' });
  if (r.reply_at) t.push({ at: r.reply_at, label: `Replied${r.reply_intent ? ` (${String(r.reply_intent).toUpperCase()})` : ''}`, detail: r.reply_text ? redact(String(r.reply_text)) : undefined });
  if (r.opted_out) t.push({ at: r.reply_at ?? r.updated_at, label: 'Opted out' });
  t.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  return {
    leadId, batch, temperature: r.temperature as string, score: (r.engagement_score ?? 0) as number, status: (r.twilio_status ?? 'scheduled') as string, errorCode: (r.twilio_error_code ?? null) as string | null,
    audience: (r.audience ?? null) as string | null, tone: (r.variant ?? null) as string | null, writtenBy: (r.generated_by ?? null) as string | null, segments: (r.segments ?? null) as number | null,
    range: (r.range_text ?? null) as string | null, phoneQuality: (r.phone_quality ?? null) as string | null, priceUsd: r.price_usd != null ? Number(r.price_usd) : null,
    message: typeof meta.message === 'string' ? meta.message : null,
    lead: lead ? { address: [lead.address, lead.city, lead.state, lead.zip].filter(Boolean).join(', '), owner: lead.owner_name ?? null, phone: lead.contact_phone ?? null, stage: lead.stage ?? null, score: lead.prospect_score ?? null, price: lead.price ?? null, beds: lead.beds ?? null, baths: lead.baths ?? null } : null,
    timeline: t,
  };
}
