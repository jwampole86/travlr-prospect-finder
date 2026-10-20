import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import type { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { wasSent } from '@/lib/services/smsSendState';

type Db = ReturnType<typeof getSupabaseAdmin>;
type Row = Record<string, any>;

interface Bucket { texts: number; delivered: number; clicked: number; viewed: number; submitted: number; replied: number; yes: number; optOut: number; hot: number; cost: number }
const empty = (): Bucket => ({ texts: 0, delivered: 0, clicked: 0, viewed: 0, submitted: 0, replied: 0, yes: 0, optOut: 0, hot: 0, cost: 0 });
const pct = (n: number, d: number) => (d ? Math.round((n / d) * 1000) / 10 : 0);
const rangeBucket = (r: string) => { const hi = Number((r.split('-')[1] ?? '').replace(/\D/g, '')); return !hi ? '?' : hi >= 150 ? '$150K+' : hi >= 80 ? '$80-149K' : hi >= 50 ? '$50-79K' : '<$50K'; };
const TTC = [['under 5 min', 5], ['5-30 min', 30], ['30 min-2 h', 120], ['2-6 h', 360], ['6-24 h', 1440]] as const;
const ttcBucket = (min: number) => TTC.find(([, max]) => min < max)?.[0] ?? 'over 24 h';

/** Removes phone numbers and email addresses before text is shown in a report or sent to a model. */
export const redact = (s: string) => s.replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, '[email]').replace(/\+?\d[\d\s().-]{6,}\d/g, '[number]').slice(0, 300);

async function pageAll<T>(f: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  const all: T[] = [];
  for (let from = 0; ; from += 1000) { const { data, error } = await f(from, from + 999); if (error) throw error; all.push(...(data ?? [])); if ((data ?? []).length < 1000) break; }
  return all;
}

/** The value of each breakdown (audience, tone, state...) for one text. The drill-down filters on these same keys. */
export function segmentKeys(r: Row): Record<string, string> {
  const ttc = r.first_click_at && r.delivered_at ? Math.max(0, (Date.parse(r.first_click_at) - Date.parse(r.delivered_at)) / 60_000) : null;
  return {
    audience: r.audience ?? 'fully-verified', variant: r.variant ?? '?', writtenBy: r.generated_by ?? '?', segments: `${r.segments ?? '?'} seg`, state: r.state ?? '?',
    estimate: rangeBucket(String(r.range_text ?? '')), device: r.device ?? (r.human_clicks ? 'unknown' : 'no click'), os: r.os ?? (r.human_clicks ? 'unknown' : 'no click'),
    sendHourUtc: `${new Date(r.scheduled_for).getUTCHours()}:00`, phone: r.phone_quality ?? 'pending', timeToClick: ttc === null ? 'no click' : ttcBucket(ttc), temperature: r.temperature,
  };
}

export async function buildOverview(db: Db, batches: string[] | 'all') {
  const rows = await pageAll<Row>((a, b) => {
    let q = db.from('sms_lead_engagement').select('*').range(a, b);
    if (batches !== 'all') q = q.in('batch', batches);
    return q;
  });
  if (!rows.length) return { batches, empty: true as const };

  const total = empty();
  const groups: Record<string, Record<string, Bucket>> = { audience: {}, variant: {}, writtenBy: {}, segments: {}, state: {}, estimate: {}, device: {}, os: {}, sendHourUtc: {}, phone: {}, timeToClick: {}, temperature: {} };
  const statuses: Record<string, number> = {}; const errors: Record<string, number> = {}; const intents: Record<string, number> = {};
  const funnel = { texts: 0, sent: 0, delivered: 0, clicked: 0, viewed: 0, contactStarted: 0, submitted: 0, replied: 0, optedIn: 0, optedOut: 0 };
  let cost = 0; let costRows = 0; let chatQuestions = 0; let botClicks = 0;
  const now = Date.now();
  // Activity by calendar day in the team's time zone, so a text sent at 9am Mountain counts on that day.
  const day = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/Denver' }) : null);
  const dailyMap = new Map<string, { date: string; sent: number; delivered: number; clicked: number; replied: number }>();
  const bump = (iso: string | null | undefined, k: 'sent' | 'delivered' | 'clicked' | 'replied') => { const d = day(iso); if (!d) return; const e = dailyMap.get(d) ?? { date: d, sent: 0, delivered: 0, clicked: 0, replied: 0 }; e[k]++; dailyMap.set(d, e); };

  for (const r of rows) {
    const delivered = ['delivered', 'read'].includes(r.twilio_status);
    const f = {
      delivered: +delivered, clicked: +(r.human_clicks > 0), viewed: +r.estimate_viewed, submitted: +!!r.estimate_submitted_at, replied: +!!r.reply_at,
      yes: +(r.reply_intent === 'yes' || r.opted_in), optOut: +r.opted_out, hot: +(r.temperature === 'hot'), cost: Number(r.price_usd ?? 0),
    };
    const keys = segmentKeys(r);
    for (const b of [total, ...Object.entries(keys).map(([g, k]) => (groups[g][k] ??= empty()))]) { b.texts++; for (const k of Object.keys(f) as Array<keyof typeof f>) b[k] += f[k]; }
    if (wasSent(r.twilio_status)) bump(r.delivered_at ?? r.scheduled_for, 'sent');
    if (delivered) bump(r.delivered_at ?? r.scheduled_for, 'delivered');
    if (r.human_clicks > 0) bump(r.first_click_at, 'clicked');
    bump(r.reply_at, 'replied');
    statuses[r.twilio_status ?? 'scheduled'] = (statuses[r.twilio_status ?? 'scheduled'] ?? 0) + 1;
    if (r.twilio_error_code) errors[r.twilio_error_code] = (errors[r.twilio_error_code] ?? 0) + 1;
    if (r.reply_intent) intents[r.reply_intent] = (intents[r.reply_intent] ?? 0) + 1;
    funnel.texts++; funnel.sent += +wasSent(r.twilio_status); funnel.delivered += f.delivered; funnel.clicked += f.clicked; funnel.viewed += f.viewed;
    funnel.contactStarted += +(['contact', 'questionnaire', 'submitted'].includes(r.deepest_step)); funnel.submitted += f.submitted; funnel.replied += f.replied; funnel.optedIn += +r.opted_in; funnel.optedOut += +r.opted_out;
    if (r.price_usd != null) { cost += Number(r.price_usd); costRows++; }
    chatQuestions += r.chat_questions ?? 0; botClicks += r.bot_clicks ?? 0;
  }
  // How reliable the phone data was, per audience: reached, wrong person, landline or invalid, and who actually engaged.
  const st: Record<string, { texts: number; sent: number; delivered: number; unreachable: number; wrongPerson: number; engaged: number; optedOut: number }> = {};
  for (const r of rows) {
    const a = (st[r.audience ?? 'fully-verified'] ??= { texts: 0, sent: 0, delivered: 0, unreachable: 0, wrongPerson: 0, engaged: 0, optedOut: 0 });
    a.texts++; a.sent += +wasSent(r.twilio_status);
    a.delivered += +['delivered', 'read'].includes(r.twilio_status); a.unreachable += +['landline', 'invalid', 'unreachable', 'filtered'].includes(r.phone_quality);
    a.wrongPerson += +(r.phone_quality === 'wrong_person'); a.optedOut += +r.opted_out;
    a.engaged += +(r.human_clicks > 0 || !!r.reply_at || !!r.estimate_submitted_at);
  }
  const { data: pre } = await db.from('campaign_insight_snapshots').select('batch, report').like('batch', '%:prefilter');
  const prefilter: Record<string, { audienceLeads: number; landline: number; invalid: number }> = {};
  for (const p of pre ?? []) { const rp = p.report as Row; if (batches === 'all' || batches.includes(String(p.batch).replace(':prefilter', ''))) { const k = rp.audience ?? 'fully-verified'; const e = (prefilter[k] ??= { audienceLeads: 0, landline: 0, invalid: 0 }); e.audienceLeads += rp.audienceLeads ?? 0; e.landline += rp.landline ?? 0; e.invalid += rp.invalid ?? 0; } }
  const skipTrace = Object.entries(st).map(([audience, a]) => {
    const pf = prefilter[audience]; const screened = pf?.audienceLeads ?? null;
    return {
      audience, texts: a.texts, sent: a.sent, delivered: a.delivered, deliveredPct: pct(a.delivered, a.sent), unreachable: a.unreachable, wrongPerson: a.wrongPerson, engaged: a.engaged, engagedPct: pct(a.engaged, a.delivered),
      // Share of sent texts that reached a live phone and were not flagged as the wrong person. It does not prove the owner read it.
      likelyReachedPct: pct(a.delivered - a.wrongPerson, a.sent),
      screenedLeads: screened, prefilterLandline: pf?.landline ?? null, prefilterInvalid: pf?.invalid ?? null, landlinePct: screened ? pct(pf.landline + pf.invalid, screened) : null,
    };
  });
  const rates = (b: Bucket) => ({ ...b, deliveredPct: pct(b.delivered, b.texts), clickPct: pct(b.clicked, b.delivered || b.texts), viewPct: pct(b.viewed, b.texts), submitPct: pct(b.submitted, b.texts), replyPct: pct(b.replied, b.texts), optOutPct: pct(b.optOut, b.texts), hotPct: pct(b.hot, b.texts), cost: Math.round(b.cost * 100) / 100 });
  const by = Object.fromEntries(Object.entries(groups).map(([g, m]) => [g, Object.fromEntries(Object.entries(m).sort((a, b) => b[1].texts - a[1].texts).map(([k, b]) => [k, rates(b)]))]));
  const t = rates(total);

  // Lead details for the people worth following up, plus what homeowners asked and replied.
  const act = (r: Row) => (r.last_activity_at ? Date.parse(r.last_activity_at) : 0);
  const hotRows = rows.filter(r => ['hot', 'warm', 'wrong_contact'].includes(r.temperature)).sort((a, b) => act(b) - act(a) || b.engagement_score - a.engagement_score).slice(0, 200);
  const leadIds = hotRows.map(r => r.lead_id);
  const { data: leadInfo } = leadIds.length ? await db.from('leads').select('id,address,city,state,owner_name,contact_phone,stage').in('id', leadIds) : { data: [] as Row[] };
  const info = new Map((leadInfo ?? []).map(l => [l.id, l]));
  const why = (r: Row) => [r.temperature === 'wrong_contact' && 'said this is the wrong person or number', r.estimate_submitted_at && 'submitted the estimate form', r.contact_requested_at && 'asked for a call or a question', r.reply_intent === 'yes' && 'replied YES', r.reply_intent === 'other' && 'replied', r.report_downloaded && 'saved the report', r.chat_questions > 0 && `asked ${r.chat_questions} chat question(s)`, r.deepest_step === 'questionnaire' && 'reached the questionnaire', r.deepest_step === 'contact' && 'started the contact form', r.human_clicks > 0 && 'opened the link', r.time_on_page_s >= 30 && `${r.time_on_page_s}s on the page`].filter(Boolean).join(', ');
  const hotLeads = hotRows.map(r => { const l = info.get(r.lead_id) ?? {}; return { leadId: r.lead_id, batch: r.batch, temperature: r.temperature, score: r.engagement_score, address: [l.address, l.city, l.state].filter(Boolean).join(', '), owner: l.owner_name ?? null, stage: l.stage ?? null, phone: l.contact_phone ?? null, why: why(r), lastActivityAt: (r.last_activity_at ?? null) as string | null, lastActivity: (r.last_activity ?? null) as string | null }; });

  const replyRows = rows.filter(r => r.reply_at).sort((a, b) => Date.parse(b.reply_at) - Date.parse(a.reply_at)).slice(0, 40);
  const replies = replyRows.map(r => ({ leadId: r.lead_id, batch: r.batch as string, at: r.reply_at, intent: r.reply_intent, text: redact(String(r.reply_text ?? '')) }));

  // The ids go in the request URL, so a large campaign (or all of them) has to be asked about a hundred leads at a time.
  const chatLeadIds = [...new Set(rows.map(r => r.lead_id as string))];
  const asked: Array<{ at: string; text: string }> = [];
  for (let i = 0; i < chatLeadIds.length; i += 100) {
    const { data: journey, error } = await db.from('estimate_journey_events').select('data, created_at').eq('event', 'chat_question').in('lead_id', chatLeadIds.slice(i, i + 100)).order('created_at', { ascending: false }).limit(100);
    if (error) { console.error('chat questions query failed', error.message); continue; }
    for (const j of journey ?? []) asked.push({ at: String(j.created_at), text: redact(String((j.data as Row | null)?.text ?? '')) });
  }
  const chat = asked.filter(q => q.text).sort((a, b) => b.at.localeCompare(a.at)).map(q => q.text).slice(0, 60);

  const lastUpdated = rows.map(r => Date.parse(r.updated_at)).sort((a, b) => b - a)[0];
  return {
    batches, empty: false as const, updatedAt: new Date(lastUpdated).toISOString(), final: rows.every(r => r.final),
    daily: [...dailyMap.values()].sort((a, b) => a.date.localeCompare(b.date)), totals: t, funnel, statuses, deliveryErrors: errors, replyIntents: intents, by, hotLeads, replies, chatQuestions: chat,
    cost: { totalUsd: Math.round(cost * 100) / 100, pricedTexts: costRows, perClick: t.clicked ? Math.round((cost / t.clicked) * 100) / 100 : null, perSubmission: t.submitted ? Math.round((cost / t.submitted) * 100) / 100 : null, perHotLead: t.hot ? Math.round((cost / t.hot) * 100) / 100 : null },
    botClicksFiltered: botClicks, chatQuestionCount: chatQuestions, skipTrace,
  };
}

export type Overview = Awaited<ReturnType<typeof buildOverview>>;

const INSIGHT_MODEL = process.env.CAMPAIGN_INSIGHTS_MODEL || 'claude-sonnet-4-6';

export interface Insights {
  headline: string;
  whatWorked: string[];
  whatDidNot: string[];
  objections: string[];
  nextCampaign: { audience: string; copyTests: string[]; sendTiming: string; followUp: string[] };
  crmActions: string[];
  dataGaps: string[];
  confidence: string;
}

/** Asks the model for takeaways. It only sees aggregates and redacted homeowner text, never names, numbers or addresses. */
export async function generateInsights(overview: Overview): Promise<{ insights: Insights; model: string } | { error: string }> {
  if (overview.empty) return { error: 'No campaign data yet' };
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return { error: 'Anthropic is not configured' };
  const { hotLeads: _h, replies, chatQuestions, ...stats } = overview;
  const payload = { stats, replyTexts: replies.map(r => ({ intent: r.intent, text: r.text })).slice(0, 30), chatQuestions: chatQuestions.slice(0, 40) };
  const client = new Anthropic({ apiKey: key, maxRetries: 1, timeout: 100_000 });
  const res = await client.messages.create({
    model: INSIGHT_MODEL, max_tokens: 3500, temperature: 0.3,
    system: `You are a direct-response marketing analyst for TRAVLR Vacation Homes, a vacation-rental management company. It texted homeowners a short message with a personalized revenue estimate and a link to a free estimate page. Analyze the campaign results and tell the team how to improve the next text and email campaigns and how to use the data in their CRM.
Rules:
- Ground every statement in the numbers provided. Quote the figures. Never invent data.
- Sample sizes are small. When a difference rests on few messages, say so, and call it a hypothesis to test, not a finding.
- skipTrace compares phone-data quality across audiences: landline/invalid share found before sending, delivery, replies saying wrong person, and engagement. Say plainly how accurate each audience's phone numbers look, and that wrong-person replies only capture people who answered.
- Counts of clicks exclude link-preview bots. "hot" means the homeowner submitted the form, asked for a call or replied YES.
- Be specific and practical: concrete copy ideas, audiences, timing, follow-up steps. No filler.
Return ONLY JSON with exactly these keys: {"headline": string, "whatWorked": string[], "whatDidNot": string[], "objections": string[], "nextCampaign": {"audience": string, "copyTests": string[], "sendTiming": string, "followUp": string[]}, "crmActions": string[], "dataGaps": string[], "confidence": string}. Each array has at most 4 items, each one sentence. Output the JSON object only, with no code fence.`,
    messages: [{ role: 'user', content: JSON.stringify(payload) }],
  });
  const text = res.content.filter(b => b.type === 'text').map(b => (b as { text: string }).text).join('');
  if (res.stop_reason === 'max_tokens') return { error: 'The AI ran out of room before finishing. Try again.' };
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return { error: 'The model did not return structured insights' };
  try {
    const j = JSON.parse(m[0]) as Partial<Insights>;
    const arr = (v: unknown) => (Array.isArray(v) ? v.map(String).slice(0, 6) : []);
    return { model: INSIGHT_MODEL, insights: {
      headline: String(j.headline ?? ''), whatWorked: arr(j.whatWorked), whatDidNot: arr(j.whatDidNot), objections: arr(j.objections),
      nextCampaign: { audience: String(j.nextCampaign?.audience ?? ''), copyTests: arr(j.nextCampaign?.copyTests), sendTiming: String(j.nextCampaign?.sendTiming ?? ''), followUp: arr(j.nextCampaign?.followUp) },
      crmActions: arr(j.crmActions), dataGaps: arr(j.dataGaps), confidence: String(j.confidence ?? ''),
    } };
  } catch { return { error: 'The model returned invalid JSON' }; }
}

/** Stores a point-in-time copy of the report (and insights, when given) so campaigns can be compared later. */
export async function saveSnapshot(db: Db, batch: string, report: Overview, ai?: { insights: Insights; model: string }) {
  await db.from('campaign_insight_snapshots').insert({ batch, report, insights: ai?.insights ?? null, model: ai?.model ?? null });
}
