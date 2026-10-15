import 'server-only';
import type { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { wasSent } from '@/lib/services/smsSendState';
import type { AnalyticsOverview, CampaignRow, DayPoint, GroupRow, HourRow, Kpi } from '@/lib/analyticsTypes';

type Db = ReturnType<typeof getSupabaseAdmin>;
type Row = Record<string, any>;
const TZ = 'America/Denver';
const DAY = 86_400_000;

async function pageAll(build: (from: number, to: number) => PromiseLike<{ data: Row[] | null; error: unknown }>): Promise<Row[]> {
  const all: Row[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build(from, from + 999);
    if (error) throw error;
    all.push(...(data ?? []));
    if ((data ?? []).length < 1000) break;
  }
  return all;
}

const dayKey = (iso: string) => new Date(iso).toLocaleDateString('en-CA', { timeZone: TZ });
const hourOf = (iso: string) => Number(new Date(iso).toLocaleString('en-US', { timeZone: TZ, hour: 'numeric', hour12: false })) % 24;
const ms = (iso: unknown) => { const t = Date.parse(String(iso ?? '')); return Number.isFinite(t) ? t : null; };
const pct = (n: number, d: number) => (d ? (n / d) * 100 : 0);
const round1 = (n: number) => Math.round(n * 10) / 10;

const cache = new Map<number, { at: number; data: AnalyticsOverview }>();

/** Company-wide numbers for a time window, computed from the real tables. Cached for a minute because it reads every lead. */
export async function buildAnalytics(db: Db, days: number): Promise<AnalyticsOverview> {
  const hit = cache.get(days);
  if (hit && Date.now() - hit.at < 60_000) return hit.data;

  const now = Date.now();
  const start = now - days * DAY;
  const prevStart = now - 2 * days * DAY;

  const [leads, engagement, emails, calls, deals] = await Promise.all([
    pageAll((a, b) => db.from('leads').select('id,stage,source,state,prospect_score,regulation_status,created_at').eq('is_synthetic', false).order('id').range(a, b)),
    pageAll((a, b) => db.from('sms_lead_engagement').select('lead_id,batch,audience,state,scheduled_for,twilio_status,delivered_at,human_clicks,first_click_at,estimate_viewed,reply_at,reply_intent,opted_out,temperature,engagement_score,contact_requested_at,estimate_submitted_at,price_usd').order('lead_id').range(a, b)),
    pageAll((a, b) => db.from('cohost_email_messages').select('sent_at,delivered_at,opened_at,bounced_at,replied_at,status').order('created_at').range(a, b)),
    pageAll((a, b) => db.from('call_sessions').select('started_at,duration_seconds').order('started_at').range(a, b)),
    pageAll((a, b) => db.from('leads').select('deal_revenue,deal_closed_at').eq('deal_closed', true).order('id').range(a, b)),
  ]);

  const meta = new Map<string, Row>();
  for (const l of leads) meta.set(l.id, l);

  // Texts that really went out, with the time each one left.
  const sentRows = engagement.filter((r) => wasSent(r.twilio_status) && ms(r.scheduled_for) != null);
  const inWin = (t: number | null, from: number, to: number) => t != null && t >= from && t < to;
  const sentAt = (r: Row) => ms(r.delivered_at) ?? ms(r.scheduled_for);
  const cur = sentRows.filter((r) => inWin(sentAt(r), start, now + DAY));
  const prev = sentRows.filter((r) => inWin(sentAt(r), prevStart, start));
  const delivered = (r: Row) => ['delivered', 'read'].includes(r.twilio_status);
  const clicked = (r: Row) => r.human_clicks > 0;
  const tally = (rows: Row[]) => ({ sent: rows.length, delivered: rows.filter(delivered).length, clicked: rows.filter(clicked).length, viewed: rows.filter((r) => r.estimate_viewed).length, replied: rows.filter((r) => !!r.reply_at).length, hot: rows.filter((r) => r.temperature === 'hot' || r.temperature === 'warm').length, contact: rows.filter((r) => r.contact_requested_at || r.estimate_submitted_at).length, optedOut: rows.filter((r) => r.opted_out).length, cost: rows.reduce((s, r) => s + Number(r.price_usd ?? 0), 0) });
  const c = tally(cur); const p = tally(prev);

  const emailSent = (rows: Row[], from: number, to: number) => rows.filter((e) => inWin(ms(e.sent_at), from, to));
  const eCur = emailSent(emails, start, now + DAY); const ePrev = emailSent(emails, prevStart, start);
  const callIn = (from: number, to: number) => calls.filter((x) => inWin(ms(x.started_at), from, to));
  const callCur = callIn(start, now + DAY); const callPrev = callIn(prevStart, start);
  const newLeads = (from: number, to: number) => leads.filter((l) => inWin(ms(l.created_at), from, to)).length;
  const revenue = (from: number, to: number) => deals.filter((d) => inWin(ms(d.deal_closed_at), from, to)).reduce((s, d) => s + Number(d.deal_revenue ?? 0), 0);

  const kpis: Kpi[] = [
    { key: 'leads', label: 'Leads in pipeline', value: leads.length, prev: null, format: 'number', sub: `+${newLeads(start, now + DAY).toLocaleString()} added in this period` },
    { key: 'texts', label: 'Texts sent', value: c.sent, prev: p.sent, format: 'number', sub: `${c.delivered.toLocaleString()} delivered` },
    { key: 'click', label: 'Estimate link click rate', value: round1(pct(c.clicked, c.delivered)), prev: p.delivered ? round1(pct(p.clicked, p.delivered)) : null, format: 'percent', sub: `${c.clicked} owners clicked` },
    { key: 'reply', label: 'Reply rate', value: round1(pct(c.replied, c.delivered)), prev: p.delivered ? round1(pct(p.replied, p.delivered)) : null, format: 'percent', sub: `${c.replied} replies` },
    { key: 'hot', label: 'Hot and warm owners', value: c.hot, prev: p.hot, format: 'number', sub: `${c.contact} asked to be contacted` },
    { key: 'emails', label: 'Co-host emails sent', value: eCur.length, prev: ePrev.length, format: 'number', sub: `${eCur.filter((e) => e.opened_at).length} opened` },
    { key: 'calls', label: 'Calls', value: callCur.length, prev: callPrev.length, format: 'number', sub: `${Math.round(callCur.reduce((s, x) => s + (x.duration_seconds ?? 0), 0) / 60)} minutes talked` },
    { key: 'revenue', label: 'Closed revenue', value: revenue(start, now + DAY), prev: revenue(prevStart, start), format: 'currency', sub: `${deals.length} deals closed all time` },
  ];

  // One point per calendar day in the team's time zone, including quiet days so the chart has no gaps.
  const series = new Map<string, DayPoint>();
  for (let i = days - 1; i >= 0; i--) { const d = dayKey(new Date(now - i * DAY).toISOString()); series.set(d, { date: d, texts: 0, clicks: 0, replies: 0, emails: 0, calls: 0 }); }
  const bump = (t: number | null, k: keyof Omit<DayPoint, 'date'>) => { if (t == null) return; const e = series.get(dayKey(new Date(t).toISOString())); if (e) e[k]++; };
  for (const r of sentRows) { bump(sentAt(r), 'texts'); if (clicked(r)) bump(ms(r.first_click_at), 'clicks'); if (r.reply_at) bump(ms(r.reply_at), 'replies'); }
  for (const e of emails) bump(ms(e.sent_at), 'emails');
  for (const x of calls) bump(ms(x.started_at), 'calls');

  const funnel = [
    { label: 'Texts sent', value: c.sent }, { label: 'Delivered', value: c.delivered }, { label: 'Opened the link', value: c.clicked },
    { label: 'Viewed the estimate', value: c.viewed }, { label: 'Replied', value: c.replied }, { label: 'Hot or warm', value: c.hot }, { label: 'Asked to be contacted', value: c.contact },
  ];

  // Campaigns: every batch ever sent, newest first (not limited to the window, so a quiet week still shows the last campaigns).
  const batches = new Map<string, Row[]>();
  for (const r of engagement) { const k = r.batch ?? 'unknown'; (batches.get(k) ?? batches.set(k, []).get(k)!).push(r); }
  const campaigns: CampaignRow[] = [...batches.entries()].map(([batch, rows]) => {
    const t = tally(rows.filter((r) => wasSent(r.twilio_status)));
    return { batch, audience: rows[0]?.audience ?? null, firstSend: new Date(Math.min(...rows.map((r) => ms(r.scheduled_for) ?? now))).toISOString(), texts: rows.length, sent: t.sent, delivered: t.delivered, clicked: t.clicked, replied: t.replied, hot: t.hot, optedOut: t.optedOut, cost: Math.round(t.cost * 100) / 100 };
  }).sort((a, b) => b.firstSend.localeCompare(a.firstSend)).slice(0, 15);

  // Sources and markets: what is in the pipeline and how it responds to outreach.
  const group = (keyOf: (l: Row) => string | null, limit: number): GroupRow[] => {
    const g = new Map<string, { leads: number; score: number; allowed: number; texted: number; replied: number }>();
    for (const l of leads) { const k = keyOf(l) || 'Unknown'; const e = g.get(k) ?? g.set(k, { leads: 0, score: 0, allowed: 0, texted: 0, replied: 0 }).get(k)!; e.leads++; e.score += Number(l.prospect_score) || 0; e.allowed += +(l.regulation_status === 'Allowed'); }
    for (const r of sentRows) { const l = meta.get(r.lead_id); if (!l) continue; const e = g.get(keyOf(l) || 'Unknown'); if (e) { e.texted++; e.replied += +!!r.reply_at; } }
    return [...g.entries()].map(([key, e]) => ({ key, leads: e.leads, avgScore: Math.round(e.score / e.leads), texted: e.texted, replied: e.replied, allowedPct: Math.round(pct(e.allowed, e.leads)) })).sort((a, b) => b.leads - a.leads).slice(0, limit);
  };

  const hourMap: HourRow[] = Array.from({ length: 24 }, (_, hour) => ({ hour, sent: 0, replied: 0, clicked: 0 }));
  for (const r of sentRows) { const h = hourMap[hourOf(r.scheduled_for)]; h.sent++; h.replied += +!!r.reply_at; h.clicked += +clicked(r); }

  const count = (rows: Row[], f: (r: Row) => string) => { const m = new Map<string, number>(); for (const r of rows) { const k = f(r); m.set(k, (m.get(k) ?? 0) + 1); } return [...m.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value); };
  const band = (s: number) => (s >= 80 ? '80–100 · Hot' : s >= 60 ? '60–79 · Warm' : s >= 40 ? '40–59 · Nurture' : 'Under 40');
  const scoreBands = ['80–100 · Hot', '60–79 · Warm', '40–59 · Nurture', 'Under 40'].map((label) => ({ label, value: leads.filter((l) => band(Number(l.prospect_score) || 0) === label).length }));
  const stageLabel: Record<string, string> = { human_outreach: 'In conversation', 'New Lead': 'New', closed_won: 'Won', closed_dead: 'Lost' };

  const email = { sent: eCur.length, delivered: eCur.filter((e) => e.delivered_at).length, opened: eCur.filter((e) => e.opened_at).length, replied: eCur.filter((e) => e.replied_at).length, bounced: eCur.filter((e) => e.bounced_at || e.status === 'bounced').length };
  const talkSeconds = callCur.reduce((s, x) => s + (x.duration_seconds ?? 0), 0);

  // Plain-language takeaways, only when there is enough volume to mean something.
  const insights: string[] = [];
  const hoursWithVolume = hourMap.filter((h) => h.sent >= 25);
  const bestHour = [...hoursWithVolume].sort((a, b) => pct(b.replied, b.sent) - pct(a.replied, a.sent))[0];
  const fmtHour = (h: number) => `${h % 12 || 12}${h < 12 ? 'am' : 'pm'}`;
  if (bestHour) insights.push(`Texts sent around ${fmtHour(bestHour.hour)} Mountain get the best reply rate (${round1(pct(bestHour.replied, bestHour.sent))}% of ${bestHour.sent} texts).`);
  const states = group((l) => l.state, 60).filter((g) => g.texted >= 20);
  const bestState = [...states].sort((a, b) => pct(b.replied, b.texted) - pct(a.replied, a.texted))[0];
  if (bestState) insights.push(`${bestState.key} owners reply the most: ${round1(pct(bestState.replied, bestState.texted))}% of ${bestState.texted} texted.`);
  const bestCampaign = campaigns.filter((x) => x.delivered >= 30).sort((a, b) => pct(b.replied, b.delivered) - pct(a.replied, a.delivered))[0];
  if (bestCampaign) insights.push(`Best campaign so far: ${bestCampaign.batch}, with ${round1(pct(bestCampaign.replied, bestCampaign.delivered))}% replies and ${round1(pct(bestCampaign.clicked, bestCampaign.delivered))}% link clicks.`);
  if (c.delivered && c.sent) insights.push(`${round1(pct(c.delivered, c.sent))}% of texts were delivered; ${c.sent - c.delivered} did not reach a phone.`);
  if (c.optedOut) insights.push(`${c.optedOut} owner${c.optedOut === 1 ? '' : 's'} opted out in this period (${round1(pct(c.optedOut, c.delivered))}% of delivered).`);

  const data: AnalyticsOverview = {
    generatedAt: new Date().toISOString(), days, kpis, daily: [...series.values()], funnel, campaigns,
    sources: group((l) => l.source, 8), states: group((l) => l.state, 12), hours: hourMap,
    stages: count(leads, (l) => stageLabel[l.stage] ?? String(l.stage ?? 'Unknown')),
    scoreBands, regulation: count(leads, (l) => l.regulation_status ?? 'Unknown'),
    email, calls: { total: callCur.length, totalMinutes: Math.round(talkSeconds / 60), avgMinutes: callCur.length ? round1(talkSeconds / 60 / callCur.length) : 0 },
    spend: { total: Math.round(c.cost * 100) / 100, perReply: c.replied ? Math.round((c.cost / c.replied) * 100) / 100 : null, perHotLead: c.hot ? Math.round((c.cost / c.hot) * 100) / 100 : null, perClick: c.clicked ? Math.round((c.cost / c.clicked) * 100) / 100 : null },
    insights,
  };
  cache.set(days, { at: Date.now(), data });
  return data;
}
