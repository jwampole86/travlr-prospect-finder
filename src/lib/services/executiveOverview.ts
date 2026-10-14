import 'server-only';
import type { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { wasSent } from '@/lib/services/smsSendState';

type Db = ReturnType<typeof getSupabaseAdmin>;
type Row = Record<string, any>;

export interface OverviewParams { days: number; state: string | null }

const TZ = 'America/Denver';
const DAY_MS = 86_400_000;
const dayFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
const dayKey = (t: number | string | null | undefined) => { const ms = typeof t === 'number' ? t : Date.parse(String(t ?? '')); return Number.isNaN(ms) ? null : dayFmt.format(ms); };
const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 1000) / 10 : 0);

async function pageAll(f: (from: number, to: number) => PromiseLike<{ data: Row[] | null; error: { message: string } | null }>): Promise<Row[]> {
  const out: Row[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await f(from, from + 999);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if ((data ?? []).length < 1000) break;
  }
  return out;
}

const cache = new Map<string, { at: number; data: Awaited<ReturnType<typeof compute>> }>();
const TTL_MS = 45_000;

/** Company-wide numbers for the Executive Overview, aggregated on the server so no query is cut off at 1,000 rows. */
export async function executiveOverview(db: Db, p: OverviewParams, opts: { fresh?: boolean } = {}) {
  const key = `${p.days}:${p.state ?? ''}`;
  const hit = cache.get(key);
  if (!opts.fresh && hit && Date.now() - hit.at < TTL_MS) return { ...hit.data, cached: true };
  const data = await compute(db, p);
  cache.set(key, { at: Date.now(), data });
  return { ...data, cached: false };
}

async function compute(db: Db, p: OverviewParams) {
  const started = Date.now();
  const now = Date.now();
  const state = p.state ? p.state.toUpperCase() : null;
  const from = p.days > 0 ? now - p.days * DAY_MS : 0;
  const prevFrom = p.days > 0 ? from - p.days * DAY_MS : 0;
  const inWin = (t: number) => t >= from && t <= now;
  const inPrev = (t: number) => p.days > 0 && t >= prevFrom && t < from;

  const [leads, eng, queueRows, stageRows, identified, cohostMail, offerLinks] = await Promise.all([
    pageAll((a, b) => db.from('leads').select('id,state,stage,pipeline_status,program,luxury,prospect_score,created_at').or('is_synthetic.is.null,is_synthetic.eq.false').range(a, b)),
    pageAll((a, b) => db.from('sms_lead_engagement').select('lead_id,batch,audience,state,scheduled_for,twilio_status,twilio_error_code,phone_quality,price_usd,delivered_at,first_click_at,human_clicks,bot_clicks,estimate_viewed,time_on_page_s,deepest_step,estimate_submitted_at,contact_requested_at,reply_at,reply_intent,opted_out,temperature,engagement_score,last_activity_at,last_activity').range(a, b)),
    pageAll((a, b) => db.from('outreach_history').select('metadata').eq('channel', 'sms').eq('metadata->>kind', 'estimate_outreach').eq('metadata->>twilio_status', 'scheduled').range(a, b)),
    pageAll((a, b) => db.from('str_listings').select('pipeline_stage').neq('pipeline_stage', 'identified').range(a, b)),
    db.from('str_listings').select('property_id', { count: 'exact', head: true }).eq('pipeline_stage', 'identified'),
    pageAll((a, b) => db.from('cohost_email_messages').select('status,sent_at,opened_at,replied_at,bounce_type').range(a, b)),
    db.from('cohost_offer_links').select('code,view_count,requested_at,opted_out_at').limit(5000),
  ]);

  const scopedLeads = leads.filter(l => l.program !== 'co_host' && (!state || String(l.state ?? '').toUpperCase() === state));
  const scopedEng = eng.filter(r => !state || String(r.state ?? '').toUpperCase() === state);
  const queue = queueRows.map(r => r.metadata as Row).filter(m => m?.scheduled_for && Date.parse(m.scheduled_for) > now - 5 * 60_000 && (!state || String(m.state ?? '').toUpperCase() === state));

  const sendMs = (r: Row) => Date.parse(r.scheduled_for);
  const sentRows = scopedEng.filter(r => wasSent(r.twilio_status) || ['delivered', 'read', 'undelivered', 'failed'].includes(r.twilio_status));
  const sentSet = new Set(sentRows);
  const cohort = (pred: (t: number) => boolean) => sentRows.filter(r => !Number.isNaN(sendMs(r)) && pred(sendMs(r)));
  const summarize = (rows: Row[]) => {
    const delivered = rows.filter(r => ['delivered', 'read'].includes(r.twilio_status)).length;
    const replied = rows.filter(r => r.reply_intent);
    return {
      sent: rows.length, delivered, undelivered: rows.filter(r => ['undelivered', 'failed'].includes(r.twilio_status)).length,
      replies: replied.length, yes: replied.filter(r => r.reply_intent === 'yes').length, no: replied.filter(r => r.reply_intent === 'no').length,
      optOuts: rows.filter(r => r.reply_intent === 'stop' || r.opted_out).length,
      opened: rows.filter(r => r.human_clicks > 0).length, viewed: rows.filter(r => r.estimate_viewed).length,
      started: rows.filter(r => ['contact', 'questionnaire', 'submitted'].includes(r.deepest_step)).length,
      submitted: rows.filter(r => r.estimate_submitted_at || r.contact_requested_at).length,
      hot: rows.filter(r => r.temperature === 'hot').length, spend: rows.reduce((s, r) => s + Number(r.price_usd ?? 0), 0),
    };
  };
  const cur = summarize(p.days > 0 ? cohort(inWin) : cohort(() => true));
  const prev = p.days > 0 ? summarize(cohort(inPrev)) : null;

  const leadTime = (l: Row) => (/^\d{4}-\d\d-\d\d/.test(String(l.created_at)) ? Date.parse(l.created_at) : NaN);
  const newLeads = scopedLeads.filter(l => { const t = leadTime(l); return !Number.isNaN(t) && (p.days > 0 ? inWin(t) : true); }).length;
  const prevNewLeads = p.days > 0 ? scopedLeads.filter(l => { const t = leadTime(l); return !Number.isNaN(t) && inPrev(t); }).length : null;
  const hotNow = scopedEng.filter(r => r.temperature === 'hot').length;
  const pipelineCount = (s: string) => scopedLeads.filter(l => l.pipeline_status === s).length;

  const kpis = [
    { key: 'newLeads', label: 'New leads', value: newLeads, prev: prevNewLeads, format: 'int', metric: 'newLeads', hint: 'Leads added in the period', href: '/lead-management' },
    { key: 'sent', label: 'Texts sent', value: cur.sent, prev: prev?.sent ?? null, format: 'int', metric: 'sent', hint: 'Campaign texts handed to the carrier', href: '/campaigns' },
    { key: 'delivered', label: 'Delivery rate', value: pct(cur.delivered, cur.sent), prev: prev ? pct(prev.delivered, prev.sent) : null, format: 'pct', metric: 'delivered', hint: `${cur.delivered} of ${cur.sent} delivered; ${cur.undelivered} failed`, href: '/campaigns' },
    { key: 'replies', label: 'Replies', value: cur.replies, prev: prev?.replies ?? null, format: 'int', metric: 'replies', hint: `${cur.yes} YES, ${cur.no} NO, ${cur.optOuts} STOP`, href: '/campaigns' },
    { key: 'yes', label: 'Said YES', value: cur.yes, prev: prev?.yes ?? null, format: 'int', metric: 'replies', hint: 'Replied YES to a campaign text', href: '/campaigns' },
    { key: 'opened', label: 'Opened the link', value: cur.opened, prev: prev?.opened ?? null, format: 'int', metric: 'opens', hint: `${pct(cur.opened, cur.delivered)}% of delivered. Link scanners are excluded`, href: '/campaigns' },
    { key: 'submitted', label: 'Forms and callbacks', value: cur.submitted, prev: prev?.submitted ?? null, format: 'int', metric: 'submitted', hint: 'Submitted the estimate form or asked for a call', href: '/campaigns' },
    { key: 'hot', label: 'Hot leads now', value: hotNow, prev: null, format: 'int', metric: null, hint: 'Replied YES, submitted, or asked for a call', href: '/campaigns' },
    { key: 'optOuts', label: 'Opt-outs', value: cur.optOuts, prev: prev?.optOuts ?? null, format: 'int', metric: null, hint: `${pct(cur.optOuts, cur.sent)}% of texts sent`, href: '/campaigns', inverse: true },
    { key: 'queued', label: 'Texts queued', value: queue.length, prev: null, format: 'int', metric: null, hint: 'Scheduled and not yet sent', href: '/campaigns' },
    ...(cur.spend > 0 ? [{ key: 'spend', label: 'Messaging spend', value: Math.round(cur.spend * 100) / 100, prev: prev ? Math.round(prev.spend * 100) / 100 : null, format: 'usd', metric: null, hint: `${cur.sent ? `$${(cur.spend / cur.sent).toFixed(3)}` : '$0'} per text`, href: '/campaigns', inverse: true }] : []),
  ];

  const funnel = [
    { key: 'sent', label: 'Texted', count: cur.sent }, { key: 'delivered', label: 'Delivered', count: cur.delivered },
    { key: 'opened', label: 'Opened the link', count: cur.opened }, { key: 'viewed', label: 'Saw the estimate', count: cur.viewed },
    { key: 'started', label: 'Started the form', count: cur.started }, { key: 'submitted', label: 'Submitted or asked for a call', count: cur.submitted },
  ].map((s, i, a) => ({ ...s, pctOfTexted: pct(s.count, a[0].count), pctOfPrevious: i === 0 ? 100 : pct(s.count, a[i - 1].count) }));

  // Daily series by Mountain-time day, ending today.
  const spanDays = p.days > 0 ? Math.min(p.days, 90) : 90;
  const days: string[] = []; for (let i = spanDays - 1; i >= 0; i--) days.push(dayFmt.format(now - i * DAY_MS));
  const series = new Map(days.map(d => [d, { date: d, sent: 0, delivered: 0, replies: 0, opens: 0, submitted: 0, newLeads: 0 }]));
  const bump = (t: unknown, k: 'sent' | 'delivered' | 'replies' | 'opens' | 'submitted' | 'newLeads') => { const d = dayKey(t as string); const e = d ? series.get(d) : null; if (e) e[k]++; };
  for (const r of sentRows) { bump(r.scheduled_for, 'sent'); if (['delivered', 'read'].includes(r.twilio_status)) bump(r.delivered_at ?? r.scheduled_for, 'delivered'); if (r.reply_intent) bump(r.reply_at, 'replies'); if (r.human_clicks > 0) bump(r.first_click_at, 'opens'); if (r.estimate_submitted_at || r.contact_requested_at) bump(r.estimate_submitted_at ?? r.contact_requested_at, 'submitted'); }
  for (const l of scopedLeads) { const t = leadTime(l); if (!Number.isNaN(t)) bump(t, 'newLeads'); }
  const daily = [...series.values()];

  // Campaigns: engagement rows plus texts still in the queue.
  type Camp = { batch: string; audience: string | null; texts: number; sent: number; delivered: number; undelivered: number; replies: number; yes: number; no: number; stop: number; opened: number; viewed: number; submitted: number; hot: number; queued: number; first: number; last: number };
  const camps = new Map<string, Camp>();
  const blank = (batch: string, audience: string | null): Camp => ({ batch, audience, texts: 0, sent: 0, delivered: 0, undelivered: 0, replies: 0, yes: 0, no: 0, stop: 0, opened: 0, viewed: 0, submitted: 0, hot: 0, queued: 0, first: Infinity, last: 0 });
  for (const r of scopedEng) {
    const c = camps.get(r.batch) ?? blank(r.batch, r.audience ?? null); camps.set(r.batch, c);
    const t = sendMs(r); c.texts++; if (!Number.isNaN(t)) { c.first = Math.min(c.first, t); c.last = Math.max(c.last, t); }
    if (['delivered', 'read'].includes(r.twilio_status)) c.delivered++; if (['undelivered', 'failed'].includes(r.twilio_status)) c.undelivered++;
    if (sentSet.has(r)) c.sent++;
    if (r.reply_intent) { c.replies++; if (r.reply_intent === 'yes') c.yes++; else if (r.reply_intent === 'no') c.no++; else if (r.reply_intent === 'stop') c.stop++; }
    if (r.human_clicks > 0) c.opened++; if (r.estimate_viewed) c.viewed++; if (r.estimate_submitted_at || r.contact_requested_at) c.submitted++; if (r.temperature === 'hot') c.hot++;
  }
  for (const m of queue) {
    const c = camps.get(m.batch) ?? blank(String(m.batch), m.audience ?? null); camps.set(String(m.batch), c);
    const t = Date.parse(m.scheduled_for); c.queued++;
    c.first = Math.min(c.first, t); c.last = Math.max(c.last, t);
  }
  const campaigns = [...camps.values()].map(c => ({
    batch: c.batch, audience: c.audience, texts: Math.max(c.texts, c.sent + c.queued), sent: c.sent, delivered: c.delivered, deliveredPct: pct(c.delivered, c.sent), undelivered: c.undelivered,
    replies: c.replies, yes: c.yes, no: c.no, stop: c.stop, opened: c.opened, viewed: c.viewed, submitted: c.submitted, hot: c.hot, queued: c.queued,
    firstSend: Number.isFinite(c.first) ? new Date(c.first).toISOString() : null, lastSend: c.last ? new Date(c.last).toISOString() : null,
    status: c.queued > 0 ? (c.first > now ? 'scheduled' : 'sending') : 'complete',
  })).sort((a, b) => String(b.firstSend).localeCompare(String(a.firstSend)));

  // By state.
  const states = new Map<string, { state: string; leads: number; texted: number; delivered: number; replies: number; yes: number; hot: number; queued: number }>();
  const st = (s: unknown) => { const k = String(s ?? '').toUpperCase() || '??'; const e = states.get(k) ?? { state: k, leads: 0, texted: 0, delivered: 0, replies: 0, yes: 0, hot: 0, queued: 0 }; states.set(k, e); return e; };
  for (const l of leads.filter(l => l.program !== 'co_host')) st(l.state).leads++;
  for (const r of eng) { const e = st(r.state); if (wasSent(r.twilio_status) || ['delivered', 'read', 'undelivered', 'failed'].includes(r.twilio_status)) e.texted++; if (['delivered', 'read'].includes(r.twilio_status)) e.delivered++; if (r.reply_intent) e.replies++; if (r.reply_intent === 'yes') e.yes++; if (r.temperature === 'hot') e.hot++; }
  for (const m of queueRows.map(r => r.metadata as Row)) if (m?.scheduled_for && Date.parse(m.scheduled_for) > now - 5 * 60_000) st(m.state).queued++;
  const stateList = [...states.values()].sort((a, b) => b.leads - a.leads);

  // Pipeline snapshot of the conversion pipeline.
  const pipeline = ['contacted', 'callback_scheduled', 'rejected'].map(s => ({ key: s, label: s === 'callback_scheduled' ? 'Callback scheduled' : s === 'contacted' ? 'Contacted' : 'Rejected', count: pipelineCount(s) }));
  const untouched = scopedLeads.length - pipeline.reduce((s, x) => s + x.count, 0);
  const tiers = { total: scopedLeads.length, untouched, luxury: scopedLeads.filter(l => l.luxury).length, highScore: scopedLeads.filter(l => Number(l.prospect_score ?? 0) >= 70).length };

  // Who to call first.
  const warm = scopedEng.filter(r => r.temperature === 'hot' || r.temperature === 'warm').sort((a, b) => (a.temperature === 'hot' ? 0 : 1) - (b.temperature === 'hot' ? 0 : 1) || Number(b.engagement_score ?? 0) - Number(a.engagement_score ?? 0)).slice(0, 12);
  const info = new Map<string, Row>();
  if (warm.length) { const { data } = await db.from('leads').select('id,address,city,state,owner_name,contact_name,pipeline_status').in('id', warm.map(r => r.lead_id)); for (const l of data ?? []) info.set(l.id, l); }
  const hot = warm.map(r => { const l = info.get(r.lead_id) ?? {}; return { leadId: r.lead_id as string, temperature: r.temperature as string, score: Number(r.engagement_score ?? 0), address: [l.address, l.city, l.state].filter(Boolean).join(', ') || r.lead_id, owner: (l.owner_name ?? l.contact_name ?? null) as string | null, why: (r.last_activity ?? (r.reply_intent ? `Replied ${String(r.reply_intent).toUpperCase()}` : 'Engaged')) as string, at: (r.last_activity_at ?? null) as string | null, pipeline: (l.pipeline_status ?? null) as string | null, batch: r.batch as string }; });

  // Send queue by day.
  const qDays = new Map<string, { date: string; count: number; batches: Record<string, number> }>();
  for (const m of queue) { const d = dayKey(m.scheduled_for); if (!d) continue; const e = qDays.get(d) ?? { date: d, count: 0, batches: {} }; e.count++; e.batches[m.batch] = (e.batches[m.batch] ?? 0) + 1; qDays.set(d, e); }
  const queueByDay = [...qDays.values()].sort((a, b) => a.date.localeCompare(b.date));

  // Co-Host program (kept apart from the homeowner numbers).
  const stageCounts: Record<string, number> = { identified: identified.count ?? 0 };
  for (const r of stageRows) stageCounts[r.pipeline_stage] = (stageCounts[r.pipeline_stage] ?? 0) + 1;
  const links = (offerLinks.data ?? []) as Row[];
  const cohost = {
    listings: Object.values(stageCounts).reduce((s, n) => s + n, 0), stages: Object.entries(stageCounts).map(([stage, count]) => ({ stage, count })).sort((a, b) => b.count - a.count),
    emails: { total: cohostMail.length, sent: cohostMail.filter(m => m.sent_at).length, opened: cohostMail.filter(m => m.opened_at).length, replied: cohostMail.filter(m => m.replied_at).length, bounced: cohostMail.filter(m => m.status === 'bounced' || m.status === 'failed').length },
    offerPages: { viewed: links.filter(l => Number(l.view_count ?? 0) > 0).length, requested: links.filter(l => l.requested_at).length, optedOut: links.filter(l => l.opted_out_at).length },
  };

  // Things that need a person.
  const attention: Array<{ level: 'high' | 'medium' | 'info'; title: string; detail: string; href: string }> = [];
  const waiting = hot.filter(h => h.temperature === 'hot' && h.pipeline !== 'callback_scheduled').length;
  if (waiting) attention.push({ level: 'high', title: `${waiting} hot lead${waiting === 1 ? '' : 's'} not yet scheduled for a callback`, detail: 'They replied YES, submitted the form or asked for a call. Call them first.', href: '/campaigns' });
  if (cur.sent >= 50 && pct(cur.undelivered, cur.sent) > 15) attention.push({ level: 'medium', title: `${pct(cur.undelivered, cur.sent)}% of texts failed to deliver`, detail: 'Most failures are landlines or unreachable phones. Check the phone-quality breakdown in Campaigns.', href: '/campaigns' });
  if (cur.sent >= 50 && pct(cur.optOuts, cur.sent) > 3) attention.push({ level: 'medium', title: `Opt-outs are ${pct(cur.optOuts, cur.sent)}% of texts sent`, detail: 'Review the wording and the audience before the next campaign.', href: '/campaigns' });
  if (cohost.emails.bounced) attention.push({ level: 'medium', title: `${cohost.emails.bounced} Co-Host email${cohost.emails.bounced === 1 ? '' : 's'} bounced`, detail: 'Alternate addresses are tried automatically; any with none left need another way to reach the owner.', href: '/cohost' });
  if (queue.length) { const next = queueByDay[0]; attention.push({ level: 'info', title: `${queue.length} texts queued, next send ${next?.date ?? ''}`, detail: Object.entries(next?.batches ?? {}).map(([b, n]) => `${b}: ${n}`).join(' · '), href: '/campaigns' }); }
  if (!cur.sent && p.days > 0) attention.push({ level: 'info', title: 'No texts were sent in this period', detail: 'Pick a longer range to see earlier campaigns.', href: '/campaigns' });

  return {
    params: { days: p.days, state }, from: p.days > 0 ? new Date(from).toISOString() : null, to: new Date(now).toISOString(),
    kpis, funnel, daily, campaigns, states: stateList, pipeline, tiers, hot, queue: { total: queue.length, byDay: queueByDay }, cohost, attention,
    totals: { leads: scopedLeads.length, textsAllTime: sentRows.length },
    updatedAt: new Date().toISOString(), queryMs: Date.now() - started,
  };
}
