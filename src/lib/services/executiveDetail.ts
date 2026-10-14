import 'server-only';
import type { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { wasSent } from '@/lib/services/smsSendState';
import { executiveOverview } from '@/lib/services/executiveOverview';

type Db = ReturnType<typeof getSupabaseAdmin>;
type Row = Record<string, any>;

export interface DetailQuery { kind: string; id: string; days: number; state: string | null }
export interface DetailSection {
  title: string; note?: string;
  columns?: string[]; rows?: Array<{ cells: Array<string | number | null>; href?: string }>;
  bars?: Array<{ label: string; value: number; hint?: string }>;
}
export interface Detail {
  title: string; subtitle?: string;
  stats: Array<{ label: string; value: string | number }>;
  sections: DetailSection[]; links: Array<{ label: string; href: string }>;
  filterState?: string; truncated?: boolean;
}

const DAY_MS = 86_400_000;
const TZ = 'America/Denver';
const dayFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
const timeFmt = new Intl.DateTimeFormat('en-US', { timeZone: TZ, month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const dayKey = (t: unknown) => { const ms = Date.parse(String(t ?? '')); return Number.isNaN(ms) ? null : dayFmt.format(ms); };
const when = (t: unknown) => { const ms = Date.parse(String(t ?? '')); return Number.isNaN(ms) ? '-' : timeFmt.format(ms); };
const pct = (n: number, d: number) => (d > 0 ? `${Math.round((n / d) * 1000) / 10}%` : '-');
const LIMIT = 200;

const ERROR_MEANING: Record<string, string> = {
  '30003': 'Phone off or unreachable', '30004': 'Blocked by the carrier', '30005': 'Number not in service', '30006': 'Landline or carrier cannot receive texts',
  '30007': 'Filtered as spam', '30008': 'Carrier gave no reason', '21211': 'Invalid phone number', '21610': 'Recipient opted out', '21614': 'Not a mobile number',
};
const STATUS_OK = ['delivered', 'read'];
const STATUS_FAIL = ['undelivered', 'failed'];
const sentLike = (r: Row) => wasSent(r.twilio_status) || STATUS_OK.includes(r.twilio_status) || STATUS_FAIL.includes(r.twilio_status);

async function pageAll(f: (a: number, b: number) => PromiseLike<{ data: Row[] | null; error: { message: string } | null }>): Promise<Row[]> {
  const out: Row[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await f(from, from + 999);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if ((data ?? []).length < 1000) break;
  }
  return out;
}

const ENG_COLS = 'lead_id,batch,audience,variant,state,scheduled_for,twilio_status,twilio_error_code,phone_quality,price_usd,delivered_at,first_click_at,human_clicks,estimate_viewed,time_on_page_s,deepest_step,estimate_submitted_at,contact_requested_at,reply_at,reply_intent,reply_text,opted_out,temperature,engagement_score,last_activity,last_activity_at';

async function engagement(db: Db, state: string | null) {
  const rows = await pageAll((a, b) => db.from('sms_lead_engagement').select(ENG_COLS).range(a, b));
  return state ? rows.filter(r => String(r.state ?? '').toUpperCase() === state) : rows;
}

async function leadInfo(db: Db, ids: string[]) {
  const map = new Map<string, Row>();
  const unique = [...new Set(ids)];
  for (let i = 0; i < unique.length; i += 100) {
    const { data } = await db.from('leads').select('id,address,city,state,owner_name,contact_name,pipeline_status,prospect_score,stage').in('id', unique.slice(i, i + 100));
    for (const l of data ?? []) map.set(l.id, l);
  }
  return map;
}
const home = (l?: Row) => (l ? [l.address, l.city, l.state].filter(Boolean).join(', ') : '') || 'Unknown home';
const lead = (id: string) => `/lead-profile?id=${id}`;

function group(rows: Row[], key: (r: Row) => string | null, top = 12, value: (r: Row) => number = () => 1) {
  const m = new Map<string, number>();
  for (const r of rows) { const k = key(r); if (k) m.set(k, (m.get(k) ?? 0) + value(r)); }
  return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, top).map(([label, v]) => ({ label, value: Math.round(v * 100) / 100 }));
}

function resultOf(r: Row) {
  if (r.reply_intent) return `${String(r.reply_intent).toUpperCase()}${r.reply_text ? `: ${String(r.reply_text).slice(0, 80)}` : ''}`;
  if (r.estimate_submitted_at || r.contact_requested_at) return 'Submitted or asked for a call';
  if (r.estimate_viewed) return `Saw the estimate${r.time_on_page_s ? ` (${r.time_on_page_s}s)` : ''}`;
  if (r.human_clicks > 0) return 'Opened the link';
  if (STATUS_FAIL.includes(r.twilio_status)) return ERROR_MEANING[String(r.twilio_error_code)] ?? `Failed${r.twilio_error_code ? ` (${r.twilio_error_code})` : ''}`;
  if (STATUS_OK.includes(r.twilio_status)) return 'Delivered';
  return String(r.twilio_status ?? '-');
}

const KPI_META: Record<string, { title: string; pred: (r: Row) => boolean; sort?: (r: Row) => number; note: string }> = {
  sent: { title: 'Texts sent', pred: sentLike, note: 'Campaign texts handed to the carrier in this period.' },
  delivered: { title: 'Delivered texts', pred: r => STATUS_OK.includes(r.twilio_status), note: 'Texts the carrier confirmed as delivered.' },
  failed: { title: 'Texts that failed to deliver', pred: r => STATUS_FAIL.includes(r.twilio_status), note: 'Most failures are landlines or phones that are off or out of service.' },
  replies: { title: 'Replies', pred: r => !!r.reply_intent, sort: r => Date.parse(r.reply_at ?? r.scheduled_for), note: 'Everyone who replied to a campaign text.' },
  yes: { title: 'YES replies', pred: r => r.reply_intent === 'yes', sort: r => Date.parse(r.reply_at ?? r.scheduled_for), note: 'Homeowners who said YES. Follow up with each.' },
  opened: { title: 'Opened the link', pred: r => r.human_clicks > 0, sort: r => Date.parse(r.first_click_at ?? r.scheduled_for), note: 'Link scanners are excluded.' },
  submitted: { title: 'Forms and callbacks', pred: r => !!(r.estimate_submitted_at || r.contact_requested_at), note: 'Submitted the estimate form or asked for a call.' },
  hot: { title: 'Hot leads', pred: r => r.temperature === 'hot', sort: r => Number(r.engagement_score ?? 0), note: 'Replied YES, submitted, or asked for a call.' },
  optOuts: { title: 'Opt-outs', pred: r => r.reply_intent === 'stop' || r.reply_intent === 'no' || !!r.opted_out, note: 'STOP and NO replies, plus anyone already opted out. They are never texted again.' },
  viewed: { title: 'Saw the estimate', pred: r => !!r.estimate_viewed, note: 'Opened the estimate page and let it load.' },
  started: { title: 'Started the form', pred: r => ['contact', 'questionnaire', 'submitted'].includes(r.deepest_step), note: 'Began the contact form or questionnaire.' },
  spend: { title: 'Messaging spend', pred: r => Number(r.price_usd ?? 0) > 0, sort: r => Number(r.price_usd ?? 0), note: 'Carrier cost recorded per text.' },
};

async function engagementList(db: Db, q: DetailQuery, key: string, titleOverride?: string): Promise<Detail> {
  const meta = KPI_META[key]; if (!meta) throw new Error('Unknown measure');
  const now = Date.now(); const from = q.days > 0 ? now - q.days * DAY_MS : 0;
  const all = await engagement(db, q.state);
  const inWin = (r: Row) => key === 'hot' || q.days === 0 || (Date.parse(r.scheduled_for) >= from && Date.parse(r.scheduled_for) <= now);
  const rows = all.filter(r => inWin(r) && sentLike(r) && meta.pred(r)).sort((a, b) => (meta.sort ? meta.sort(b) - meta.sort(a) : Date.parse(b.scheduled_for) - Date.parse(a.scheduled_for)));
  const shown = rows.slice(0, LIMIT); const info = await leadInfo(db, shown.map(r => r.lead_id));
  const sections: DetailSection[] = [
    { title: 'By campaign', bars: group(rows, r => r.batch) },
    { title: 'By state', bars: group(rows, r => String(r.state ?? '').toUpperCase() || null, 10) },
  ];
  if (key === 'failed') sections.unshift({ title: 'Why they failed', bars: group(rows, r => ERROR_MEANING[String(r.twilio_error_code)] ?? (r.twilio_error_code ? `Error ${r.twilio_error_code}` : 'No reason given')) });
  if (key === 'replies' || key === 'optOuts') sections.unshift({ title: 'What they said', bars: group(rows, r => (r.reply_intent ? String(r.reply_intent).toUpperCase() : r.opted_out ? 'Already opted out' : null)) });
  if (key === 'spend') sections.unshift({ title: 'Spend by campaign', bars: group(rows, r => r.batch, 12, r => Number(r.price_usd ?? 0)).map(b => ({ ...b, hint: `$${b.value.toFixed(2)}` })) });
  sections.push({
    title: `${rows.length > LIMIT ? `Latest ${LIMIT} of ${rows.length}` : rows.length} homeowners`, columns: ['Homeowner', 'State', 'Campaign', 'Sent', 'Result'],
    rows: shown.map(r => ({ cells: [`${home(info.get(r.lead_id))}${info.get(r.lead_id)?.owner_name ? ` (${info.get(r.lead_id)!.owner_name})` : ''}`, r.state ?? '-', r.batch, when(r.scheduled_for), resultOf(r)], href: lead(r.lead_id) })),
  });
  const stats = key === 'spend'
    ? [{ label: 'Total spend', value: `$${rows.reduce((s, r) => s + Number(r.price_usd ?? 0), 0).toFixed(2)}` }, { label: 'Texts with a cost', value: rows.length }]
    : [{ label: 'Total', value: rows.length }, { label: 'Share of texts sent', value: pct(rows.length, all.filter(r => inWin(r) && sentLike(r)).length) }];
  return { title: titleOverride ?? meta.title, subtitle: `${meta.note}${q.state ? ` State: ${q.state}.` : ''}`, stats, sections, links: [{ label: 'Open Campaigns', href: '/campaigns' }], truncated: rows.length > LIMIT };
}

async function queueRows(db: Db, state: string | null) {
  const rows = await pageAll((a, b) => db.from('outreach_history').select('lead_id,metadata').eq('channel', 'sms').eq('metadata->>kind', 'estimate_outreach').eq('metadata->>twilio_status', 'scheduled').range(a, b));
  const now = Date.now();
  return rows.filter(r => Date.parse(r.metadata?.scheduled_for) > now - 5 * 60_000 && (!state || String(r.metadata?.state ?? '').toUpperCase() === state)).sort((a, b) => Date.parse(a.metadata.scheduled_for) - Date.parse(b.metadata.scheduled_for));
}

export async function executiveDetail(db: Db, q: DetailQuery): Promise<Detail> {
  const { kind, id } = q;
  const overview = async () => executiveOverview(db, { days: q.days, state: q.state });

  // ── KPI cards and funnel steps ───────────────────────────────────────────
  if (kind === 'kpi' && id === 'newLeads') {
    const from = q.days > 0 ? new Date(Date.now() - q.days * DAY_MS).toISOString() : '';
    let qb = db.from('leads').select('id,address,city,state,owner_name,prospect_score,created_at,pipeline_status', { count: 'exact' }).or('is_synthetic.is.null,is_synthetic.eq.false').neq('program', 'co_host').order('created_at', { ascending: false }).limit(1000);
    if (from) qb = qb.gte('created_at', from); if (q.state) qb = qb.eq('state', q.state);
    const { data, count, error } = await qb; if (error) throw new Error(error.message);
    const rows = data ?? [];
    return { title: 'New leads', subtitle: 'Leads added in this period, newest first.', stats: [{ label: 'New leads', value: count ?? rows.length }, { label: 'Score 70+', value: rows.filter(r => Number(r.prospect_score ?? 0) >= 70).length }],
      sections: [{ title: 'By state', bars: group(rows, r => String(r.state ?? '').toUpperCase() || null, 12) }, { title: `Newest ${Math.min(LIMIT, rows.length)}`, columns: ['Home', 'Owner', 'Score', 'Added'], rows: rows.slice(0, LIMIT).map(r => ({ cells: [home(r), r.owner_name ?? '-', r.prospect_score ?? '-', when(r.created_at)], href: lead(r.id) })) }],
      links: [{ label: 'Open leads', href: '/lead-management' }], truncated: (count ?? 0) > LIMIT };
  }
  if (kind === 'kpi' && id === 'queued') return executiveDetail(db, { ...q, kind: 'queue', id: '' });
  if (kind === 'kpi') return engagementList(db, q, id);
  if (kind === 'funnel' && id) return engagementList(db, q, id === 'sent' ? 'sent' : id === 'delivered' ? 'delivered' : id);
  if (kind === 'funnel') {
    const o = await overview(); const by = new Map<string, Row[]>();
    for (const r of (await engagement(db, q.state)).filter(sentLike)) { const a = by.get(r.batch) ?? []; a.push(r); by.set(r.batch, a); }
    return { title: 'Conversion funnel', subtitle: 'Where homeowners drop off between the text and a conversation.', stats: o.funnel.map(f => ({ label: f.label, value: f.count })),
      sections: [
        { title: 'Step by step', columns: ['Step', 'Count', 'Of previous step', 'Of texted'], rows: o.funnel.map(f => ({ cells: [f.label, f.count, `${f.pctOfPrevious}%`, `${f.pctOfTexted}%`] })) },
        { title: 'By campaign', columns: ['Campaign', 'Texted', 'Delivered', 'Opened', 'Saw estimate', 'Started form', 'Submitted'], rows: [...by.entries()].map(([b, rs]) => ({ cells: [b, rs.length, rs.filter(KPI_META.delivered.pred).length, rs.filter(KPI_META.opened.pred).length, rs.filter(KPI_META.viewed.pred).length, rs.filter(KPI_META.started.pred).length, rs.filter(KPI_META.submitted.pred).length] })) },
      ], links: [{ label: 'Open Campaigns', href: '/campaigns' }] };
  }

  // ── Daily activity ───────────────────────────────────────────────────────
  if (kind === 'days') {
    const o = await overview();
    return { title: 'Daily activity', subtitle: 'Mountain-time days. Texts and replies are counted on the day they happened.', stats: [{ label: 'Days shown', value: o.daily.length }],
      sections: [{ title: 'Day by day', columns: ['Day', 'Texts sent', 'Delivered', 'Replies', 'Link opens', 'Forms', 'New leads'], rows: [...o.daily].reverse().map(d => ({ cells: [d.date, d.sent, d.delivered, d.replies, d.opens, d.submitted, d.newLeads] })) }], links: [] };
  }
  if (kind === 'day') {
    const all = (await engagement(db, q.state)).filter(sentLike);
    const sent = all.filter(r => dayKey(r.scheduled_for) === id); const replies = all.filter(r => r.reply_intent && dayKey(r.reply_at) === id); const opens = all.filter(r => r.human_clicks > 0 && dayKey(r.first_click_at) === id);
    const info = await leadInfo(db, [...replies, ...opens].map(r => r.lead_id));
    const { count: newLeads } = await db.from('leads').select('id', { count: 'exact', head: true }).gte('created_at', new Date(Date.parse(`${id}T12:00:00-06:00`) - 12 * 3600_000).toISOString()).lt('created_at', new Date(Date.parse(`${id}T12:00:00-06:00`) + 12 * 3600_000).toISOString());
    return { title: `Activity on ${id}`, subtitle: 'Everything that happened on this day (Mountain time).', stats: [{ label: 'Texts sent', value: sent.length }, { label: 'Delivered', value: sent.filter(KPI_META.delivered.pred).length }, { label: 'Replies', value: replies.length }, { label: 'Link opens', value: opens.length }, { label: 'New leads', value: newLeads ?? 0 }],
      sections: [
        { title: 'Texts sent by campaign', bars: group(sent, r => r.batch) },
        { title: 'Replies', columns: ['Homeowner', 'Reply', 'When'], rows: replies.slice(0, 100).map(r => ({ cells: [home(info.get(r.lead_id)), `${String(r.reply_intent).toUpperCase()}${r.reply_text ? `: ${String(r.reply_text).slice(0, 80)}` : ''}`, when(r.reply_at)], href: lead(r.lead_id) })) },
        { title: 'Link opens', columns: ['Homeowner', 'Result', 'When'], rows: opens.slice(0, 100).map(r => ({ cells: [home(info.get(r.lead_id)), resultOf(r), when(r.first_click_at)], href: lead(r.lead_id) })) },
      ], links: [] };
  }

  // ── Campaigns ────────────────────────────────────────────────────────────
  if (kind === 'campaigns') {
    const o = await overview();
    return { title: 'All campaigns', subtitle: 'Every campaign with its results.', stats: [{ label: 'Campaigns', value: o.campaigns.length }, { label: 'Texts sent', value: o.campaigns.reduce((s, c) => s + c.sent, 0) }, { label: 'Queued', value: o.campaigns.reduce((s, c) => s + c.queued, 0) }],
      sections: [{ title: 'Results by campaign', columns: ['Campaign', 'Audience', 'Status', 'Sent', 'Delivered', 'Replies', 'YES', 'Opened', 'Saw estimate', 'Queued'], rows: o.campaigns.map(c => ({ cells: [c.batch, c.audience ?? '-', c.status, c.sent, c.sent ? `${c.deliveredPct}%` : '-', c.replies, c.yes, c.opened, c.viewed, c.queued || '-'] })) },
        { title: 'Replies by audience', bars: Object.entries(o.campaigns.reduce<Record<string, number>>((m, c) => { m[c.audience ?? 'unknown'] = (m[c.audience ?? 'unknown'] ?? 0) + c.replies; return m; }, {})).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value) }],
      links: [{ label: 'Open Campaigns', href: '/campaigns' }] };
  }
  if (kind === 'campaign') {
    const all = (await engagement(db, q.state)).filter(r => r.batch === id); const queued = (await queueRows(db, q.state)).filter(r => r.metadata?.batch === id);
    const sent = all.filter(sentLike); const shown = all.sort((a, b) => Date.parse(b.scheduled_for) - Date.parse(a.scheduled_for)).slice(0, 300); const info = await leadInfo(db, shown.map(r => r.lead_id));
    return { title: id, subtitle: `${all[0]?.audience ?? 'Campaign'} · first text ${when(all.map(r => r.scheduled_for).sort()[0] ?? queued[0]?.metadata?.scheduled_for)}`,
      stats: [{ label: 'Texts', value: Math.max(all.length, sent.length + queued.length) }, { label: 'Sent', value: sent.length }, { label: 'Delivered', value: pct(sent.filter(KPI_META.delivered.pred).length, sent.length) }, { label: 'Replies', value: sent.filter(KPI_META.replies.pred).length }, { label: 'YES', value: sent.filter(KPI_META.yes.pred).length }, { label: 'Opened', value: sent.filter(KPI_META.opened.pred).length }, { label: 'Saw estimate', value: sent.filter(KPI_META.viewed.pred).length }, { label: 'Queued', value: queued.length }],
      sections: [
        { title: 'Why texts failed', bars: group(sent.filter(KPI_META.failed.pred), r => ERROR_MEANING[String(r.twilio_error_code)] ?? 'Other') },
        { title: 'What homeowners said', bars: group(sent, r => (r.reply_intent ? String(r.reply_intent).toUpperCase() : null)) },
        { title: 'By tone', bars: group(sent, r => r.variant ?? 'unknown'), note: 'Texts per tone variant.' },
        { title: 'By state', bars: group(sent, r => String(r.state ?? '').toUpperCase() || null, 10) },
        { title: 'Every text', columns: ['Homeowner', 'State', 'Sent', 'Result'], rows: shown.map(r => ({ cells: [home(info.get(r.lead_id)), r.state ?? '-', when(r.scheduled_for), resultOf(r)], href: lead(r.lead_id) })) },
      ], links: [{ label: 'Open Campaigns', href: '/campaigns' }], truncated: all.length > 300 };
  }

  // ── States ───────────────────────────────────────────────────────────────
  if (kind === 'states') {
    const o = await overview();
    return { title: 'Results by state', subtitle: 'Lead counts exclude the Co-Host program.', stats: [{ label: 'States', value: o.states.length }, { label: 'Leads', value: o.states.reduce((s, x) => s + x.leads, 0) }],
      sections: [{ title: 'All states', columns: ['State', 'Leads', 'Texted', 'Delivered', 'Reply rate', 'YES', 'Hot', 'Queued'], rows: o.states.map(s => ({ cells: [s.state, s.leads, s.texted, pct(s.delivered, s.texted), pct(s.replies, s.texted), s.yes, s.hot, s.queued] })) }], links: [] };
  }
  if (kind === 'state') {
    const all = await engagement(db, id); const sent = all.filter(sentLike); const info = await leadInfo(db, all.map(r => r.lead_id).slice(0, 300));
    const counts: Array<{ label: string; value: number }> = [];
    for (const [label, status] of [['Contacted', 'contacted'], ['Callback scheduled', 'callback_scheduled'], ['Rejected', 'rejected']] as const) { const { count } = await db.from('leads').select('id', { count: 'exact', head: true }).eq('state', id).neq('program', 'co_host').eq('pipeline_status', status); counts.push({ label, value: count ?? 0 }); }
    const { count: total } = await db.from('leads').select('id', { count: 'exact', head: true }).eq('state', id).neq('program', 'co_host').or('is_synthetic.is.null,is_synthetic.eq.false');
    return { title: `${id} in detail`, subtitle: 'Leads and campaign results for this state.', filterState: id,
      stats: [{ label: 'Leads', value: total ?? 0 }, { label: 'Texted', value: sent.length }, { label: 'Delivered', value: pct(sent.filter(KPI_META.delivered.pred).length, sent.length) }, { label: 'Replies', value: sent.filter(KPI_META.replies.pred).length }, { label: 'YES', value: sent.filter(KPI_META.yes.pred).length }, { label: 'Hot', value: all.filter(KPI_META.hot.pred).length }],
      sections: [{ title: 'Lead pipeline in this state', bars: counts }, { title: 'Texts by campaign', bars: group(sent, r => r.batch) },
        { title: 'Engaged homeowners', columns: ['Homeowner', 'Campaign', 'Sent', 'Result'], rows: all.filter(r => r.reply_intent || r.human_clicks > 0).sort((a, b) => Number(b.engagement_score ?? 0) - Number(a.engagement_score ?? 0)).slice(0, 100).map(r => ({ cells: [home(info.get(r.lead_id)), r.batch, when(r.scheduled_for), resultOf(r)], href: lead(r.lead_id) })) }],
      links: [{ label: `Open ${id} leads`, href: '/lead-management' }] };
  }

  // ── Who to call, and one homeowner ───────────────────────────────────────
  if (kind === 'hot') {
    const d = await engagementList(db, { ...q, days: 0 }, 'hot', 'Who to call first');
    const warm = (await engagement(db, q.state)).filter(r => r.temperature === 'warm').sort((a, b) => Number(b.engagement_score ?? 0) - Number(a.engagement_score ?? 0)).slice(0, 60); const info = await leadInfo(db, warm.map(r => r.lead_id));
    d.sections.push({ title: 'Warm homeowners', columns: ['Homeowner', 'Campaign', 'Last activity', 'Result'], rows: warm.map(r => ({ cells: [home(info.get(r.lead_id)), r.batch, r.last_activity ? `${r.last_activity}${r.last_activity_at ? `, ${when(r.last_activity_at)}` : ''}` : '-', resultOf(r)], href: lead(r.lead_id) })) });
    d.subtitle = 'Hot: replied YES, submitted, or asked for a call. Warm: opened the link or replied.'; return d;
  }
  if (kind === 'lead') {
    const { data: l } = await db.from('leads').select('id,address,city,state,owner_name,contact_name,pipeline_status,prospect_score,stage,luxury,last_contacted_at').eq('id', id).maybeSingle();
    if (!l) throw new Error('That lead was not found.');
    const [{ data: hist }, { data: journey }, eng] = await Promise.all([
      db.from('outreach_history').select('sent_at,channel,status,metadata,body_preview').eq('lead_id', id).eq('channel', 'sms').order('sent_at', { ascending: false }).limit(30),
      db.from('estimate_journey_events').select('event,data,created_at').eq('lead_id', id).order('created_at', { ascending: false }).limit(40),
      db.from('sms_lead_engagement').select(ENG_COLS).eq('lead_id', id),
    ]);
    const e = (eng.data ?? [])[0] as Row | undefined;
    return { title: home(l), subtitle: [l.owner_name ?? l.contact_name, l.luxury ? 'Luxury' : null].filter(Boolean).join(' · ') || undefined,
      stats: [{ label: 'Pipeline', value: l.pipeline_status ?? 'Not contacted' }, { label: 'Score', value: l.prospect_score ?? '-' }, { label: 'Temperature', value: e?.temperature ?? '-' }, { label: 'Last contacted', value: l.last_contacted_at ? when(l.last_contacted_at) : '-' }],
      sections: [
        { title: 'Texts and replies', columns: ['When', 'Direction', 'Message', 'Status'], rows: (hist ?? []).map(h => { const m = (h.metadata ?? {}) as Row; const inbound = m.direction === 'inbound'; return { cells: [when(h.sent_at), inbound ? 'Reply' : 'Sent', String(inbound ? m.body ?? h.body_preview ?? '' : m.message ?? h.body_preview ?? '').slice(0, 220), inbound ? String(m.intent ?? '-') : String(m.twilio_status ?? h.status ?? '-')] }; }) },
        { title: 'Estimate page activity', columns: ['When', 'Event', 'Detail'], rows: (journey ?? []).map(j => ({ cells: [when(j.created_at), String(j.event).replace(/_/g, ' '), j.data && Object.keys(j.data).length ? JSON.stringify(j.data).slice(0, 80) : '-'] })) },
      ], links: [{ label: 'Open lead profile', href: lead(id) }] };
  }

  // ── Queue ────────────────────────────────────────────────────────────────
  if (kind === 'queue' || kind === 'queueday') {
    let rows = await queueRows(db, q.state); if (kind === 'queueday') rows = rows.filter(r => dayKey(r.metadata.scheduled_for) === id);
    const shown = rows.slice(0, LIMIT); const info = await leadInfo(db, shown.map(r => r.lead_id));
    return { title: kind === 'queueday' ? `Queued for ${id}` : 'Send queue', subtitle: 'Texts held by Twilio. Listings are rechecked hourly and texts to sold or pending homes are cancelled.', stats: [{ label: 'Queued', value: rows.length }, { label: 'First send', value: rows[0] ? when(rows[0].metadata.scheduled_for) : '-' }, { label: 'Last send', value: rows.length ? when(rows[rows.length - 1].metadata.scheduled_for) : '-' }],
      sections: [{ title: 'By campaign', bars: group(rows, r => r.metadata.batch) }, { title: 'By state', bars: group(rows, r => String(r.metadata.state ?? '').toUpperCase() || null, 10) },
        { title: rows.length > LIMIT ? `Next ${LIMIT} of ${rows.length}` : `${rows.length} texts`, columns: ['Homeowner', 'State', 'Campaign', 'Sends at'], rows: shown.map(r => ({ cells: [home(info.get(r.lead_id)), r.metadata.state ?? '-', r.metadata.batch, when(r.metadata.scheduled_for)], href: lead(r.lead_id) })) }],
      links: [{ label: 'Open Campaigns', href: '/campaigns' }], truncated: rows.length > LIMIT };
  }

  // ── Pipeline ─────────────────────────────────────────────────────────────
  if (kind === 'pipeline') {
    const o = await overview();
    if (!id) return { title: 'Lead pipeline', subtitle: 'Where every lead stands in the conversion pipeline.', stats: [{ label: 'Leads in scope', value: o.tiers.total }, { label: 'Not yet contacted', value: o.tiers.untouched }, { label: 'Luxury', value: o.tiers.luxury }, { label: 'Score 70+', value: o.tiers.highScore }],
      sections: [{ title: 'Stage counts', bars: [{ label: 'Not yet contacted', value: o.tiers.untouched }, ...o.pipeline.map(p => ({ label: p.label, value: p.count }))] }], links: [{ label: 'Open leads', href: '/lead-management' }] };
    let qb = db.from('leads').select('id,address,city,state,owner_name,prospect_score,created_at,last_contacted_at', { count: 'exact' }).or('is_synthetic.is.null,is_synthetic.eq.false').neq('program', 'co_host').order('prospect_score', { ascending: false, nullsFirst: false }).limit(1000);
    qb = id === 'untouched' ? qb.is('pipeline_status', null) : id === 'luxury' ? qb.eq('luxury', true) : id === 'highscore' ? qb.gte('prospect_score', 70) : qb.eq('pipeline_status', id); if (q.state) qb = qb.eq('state', q.state);
    const { data, count, error } = await qb; if (error) throw new Error(error.message); const rows = data ?? [];
    return { title: id === 'untouched' ? 'Not yet contacted' : id === 'luxury' ? 'Luxury leads' : id === 'highscore' ? 'Leads scoring 70 or more' : o.pipeline.find(p => p.key === id)?.label ?? id, subtitle: 'Highest prospect score first.', stats: [{ label: 'Leads', value: count ?? rows.length }, { label: 'Score 70+', value: id === 'highscore' ? count ?? rows.length : rows.filter(r => Number(r.prospect_score ?? 0) >= 70).length }],
      sections: [{ title: 'By state', bars: group(rows, r => String(r.state ?? '').toUpperCase() || null, 12), note: (count ?? 0) > 1000 ? 'Based on the 1,000 highest-scoring leads.' : undefined }, { title: `Top ${Math.min(LIMIT, rows.length)}`, columns: ['Home', 'Owner', 'Score', 'Last contacted'], rows: rows.slice(0, LIMIT).map(r => ({ cells: [home(r), r.owner_name ?? '-', r.prospect_score ?? '-', r.last_contacted_at ? when(r.last_contacted_at) : '-'], href: lead(r.id) })) }],
      links: [{ label: 'Open leads', href: '/lead-management' }], truncated: (count ?? 0) > LIMIT };
  }

  // ── Co-Host ──────────────────────────────────────────────────────────────
  if (kind === 'cohost') {
    const o = await overview();
    if (id === 'emails') {
      const msgs = await pageAll((a, b) => db.from('cohost_email_messages').select('property_id,to_email,status,sent_at,opened_at,replied_at,bounce_type,failure_reason').order('sent_at', { ascending: false, nullsFirst: false }).range(a, b));
      const { data: ls } = msgs.length ? await db.from('str_listings').select('property_id,title,market').in('property_id', msgs.map(m => m.property_id)) : { data: [] as Row[] }; const t = new Map((ls ?? []).map(l => [l.property_id, l]));
      return { title: 'Co-Host emails', subtitle: 'One email at a time, each reviewed and sent by a person.', stats: [{ label: 'Sent', value: o.cohost.emails.sent }, { label: 'Opened', value: o.cohost.emails.opened }, { label: 'Replied', value: o.cohost.emails.replied }, { label: 'Bounced', value: o.cohost.emails.bounced }],
        sections: [{ title: 'Status', bars: group(msgs, m => m.status) }, { title: 'Every email', columns: ['Listing', 'Market', 'To', 'Status', 'Sent'], rows: msgs.map(m => ({ cells: [t.get(m.property_id)?.title ?? m.property_id, t.get(m.property_id)?.market ?? '-', m.to_email, `${m.status}${m.bounce_type ? ` (${m.bounce_type})` : ''}`, m.sent_at ? when(m.sent_at) : '-'] })) }], links: [{ label: 'Open Co-Host', href: '/cohost' }] };
    }
    if (id) {
      const { data, count } = await db.from('str_listings').select('property_id,title,market,bedrooms,revenue_ltm,revenue_potential_ltm,is_elite,is_luxury', { count: 'exact' }).eq('pipeline_stage', id).order('revenue_potential_ltm', { ascending: false, nullsFirst: false }).limit(100);
      return { title: `Co-Host: ${id.replace(/_/g, ' ')}`, subtitle: 'Listings at this stage, biggest potential first.', stats: [{ label: 'Listings', value: count ?? 0 }],
        sections: [{ title: `Top ${data?.length ?? 0}`, columns: ['Listing', 'Market', 'Beds', 'Earns now', 'Potential', 'Tier'], rows: (data ?? []).map(l => ({ cells: [l.title ?? l.property_id, l.market ?? '-', l.bedrooms ?? '-', l.revenue_ltm ? `$${Math.round(l.revenue_ltm).toLocaleString()}` : '-', l.revenue_potential_ltm ? `$${Math.round(l.revenue_potential_ltm).toLocaleString()}` : '-', l.is_elite ? 'Elite' : l.is_luxury ? 'Luxury' : '-'] })) }], links: [{ label: 'Open Co-Host', href: '/cohost' }], truncated: (count ?? 0) > 100 };
    }
    return { title: 'Co-Host program', subtitle: 'Kept separate from the homeowner numbers.', stats: [{ label: 'Listings tracked', value: o.cohost.listings }, { label: 'Emails sent', value: o.cohost.emails.sent }, { label: 'Offer pages viewed', value: o.cohost.offerPages.viewed }, { label: 'Audits requested', value: o.cohost.offerPages.requested }],
      sections: [{ title: 'Pipeline stages', bars: o.cohost.stages.map(s => ({ label: s.stage.replace(/_/g, ' '), value: s.count })) }], links: [{ label: 'Open Co-Host', href: '/cohost' }] };
  }

  throw new Error('Unknown detail');
}
