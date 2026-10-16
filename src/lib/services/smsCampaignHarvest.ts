import 'server-only';
import type { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { classifyReply, isWrongContact } from '@/lib/services/smsConsent';
import { rescoreLeadsByIds } from '@/lib/services/leadScoringService';
import { wasSent } from '@/lib/services/smsSendState';
import { nextPipelineStatus, type PipelineTarget } from '@/lib/services/leadPipeline';

type Db = ReturnType<typeof getSupabaseAdmin>;
type Meta = Record<string, any>;

const FINAL_STATUSES = new Set(['delivered', 'undelivered', 'failed', 'canceled', 'read']);
const FINALIZE_AFTER_HOURS = 72;
const BOT_WINDOW_MS = 5_000; // a hit within seconds of delivery is a carrier or phone scanner, not the homeowner
const STEP_RANK: Record<string, number> = { viewed: 1, contact: 2, questionnaire: 3, submitted: 4 };

/** What a Twilio error code tells us about the phone number. */
export function phoneQualityFor(status: string, errorCode: string | null): string {
  if (status === 'delivered' || status === 'read') return 'live';
  if (['30006', '21614'].includes(errorCode ?? '')) return 'landline';
  if (['21211', '30005', '21217'].includes(errorCode ?? '')) return 'invalid';
  if (errorCode === '30007') return 'filtered';
  if (errorCode === '21610') return 'opted_out';
  if (['undelivered', 'failed'].includes(status)) return 'unreachable';
  return 'pending';
}

function twilioAuth() {
  const key = process.env.TWILIO_ACCOUNT_SID, secret = process.env.TWILIO_AUTH_TOKEN;
  if (!key || !secret) return null;
  const acct = key.startsWith('SK') ? process.env.TWILIO_ACCOUNT_SID_MAIN : key;
  return acct ? { header: `Basic ${Buffer.from(`${key}:${secret}`).toString('base64')}`, acct } : null;
}

async function pool<T>(items: T[], size: number, fn: (x: T) => Promise<void>) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, async () => { while (i < items.length) await fn(items[i++]); }));
}
const chunk = <T,>(a: T[], n = 150) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));

interface Scored { score: number; temperature: string }

/** Turns the signals we have into one comparable number and a plain label the CRM can filter on. */
export function scoreEngagement(s: {
  delivered: boolean; humanClicks: number; viewed: boolean; seconds: number; scroll: number; step: number; downloaded: boolean; chat: number;
  website: boolean; callRequested: boolean; submitted: boolean; replyIntent: string | null; optedOut: boolean; phoneQuality: string; sent: boolean;
}): Scored {
  if (s.optedOut || s.replyIntent === 'stop') return { score: 0, temperature: 'opted_out' };
  if (s.replyIntent === 'wrong_contact') return { score: 0, temperature: 'wrong_contact' };
  let score = 0;
  if (s.delivered) score += 5;
  if (s.humanClicks > 0) score += 20;
  if (s.viewed) score += 5;
  if (s.seconds >= 30) score += 5;
  if (s.scroll >= 75) score += 5;
  if (s.step >= STEP_RANK.contact) score += 15;
  if (s.step >= STEP_RANK.questionnaire) score += 10;
  if (s.submitted) score += 40;
  if (s.downloaded) score += 10;
  score += Math.min(16, s.chat * 8);
  if (s.website) score += 5;
  if (s.callRequested) score += 30;
  if (s.replyIntent === 'yes') score += 50; else if (s.replyIntent === 'other' || s.replyIntent === 'help') score += 20; else if (s.replyIntent === 'no') score += 5;
  score = Math.min(100, score);
  const interested = s.submitted || s.callRequested || s.replyIntent === 'yes';
  if (interested || score >= 60) return { score, temperature: 'hot' };
  if (['landline', 'invalid', 'unreachable', 'filtered'].includes(s.phoneQuality)) return { score, temperature: 'unreachable' };
  if (s.replyIntent === 'no') return { score, temperature: 'declined' };
  if (score >= 20) return { score, temperature: 'warm' };
  if (!s.sent) return { score, temperature: 'untouched' };
  return { score, temperature: s.delivered ? 'cold' : 'pending' };
}

/**
 * Brings one campaign's per-lead record up to date from every source we have: Twilio's final delivery state and price, every
 * short-link hit (bots separated out), what the homeowner did on the estimate page, replies and consent. Safe to run repeatedly.
 */
export async function harvestBatch(db: Db, batch: string, opts: { refreshTwilio?: boolean; writeCrm?: boolean } = {}) {
  const { data: hist, error } = await db.from('outreach_history').select('id, lead_id, sent_at, metadata').eq('channel', 'sms')
    .eq('metadata->>batch', batch).eq('metadata->>kind', 'estimate_outreach').limit(5000);
  if (error) throw error;
  const rows = (hist ?? []).filter(h => h.lead_id) as Array<{ id: string; lead_id: string; sent_at: string; metadata: Meta }>;
  if (!rows.length) return { batch, leads: 0, note: 'no messages for this batch' };
  const now = Date.now();
  const ids = rows.map(r => r.lead_id);
  const lastSend = Math.max(...rows.map(r => Date.parse(r.metadata.scheduled_for ?? r.sent_at)));
  const final = now > lastSend + FINALIZE_AFTER_HOURS * 3_600_000;

  // 1. Twilio: final delivery state, error code and the real price of each text that has gone out.
  const auth = twilioAuth();
  if (opts.refreshTwilio !== false && auth) {
    const due = rows.filter(r => r.metadata.message_sid && !FINAL_STATUSES.has(String(r.metadata.twilio_status ?? 'scheduled'))
      && Date.parse(r.metadata.scheduled_for ?? r.sent_at) < now);
    await pool(due, 6, async r => {
      try {
        const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${auth.acct}/Messages/${r.metadata.message_sid}.json`, { headers: { Authorization: auth.header }, signal: AbortSignal.timeout(20_000) });
        if (!res.ok) return;
        const t = await res.json() as { status?: string; error_code?: number | null; price?: string | null; date_sent?: string | null };
        if (!t.status) return;
        const meta: Meta = { ...r.metadata, twilio_status: t.status, twilio_synced_at: new Date().toISOString() };
        if (t.error_code) meta.twilio_error_code = String(t.error_code);
        if (t.price) meta.price_usd = Math.abs(Number(t.price));
        if (t.date_sent) meta.delivered_at = new Date(t.date_sent).toISOString();
        r.metadata = meta;
        await db.from('outreach_history').update({ metadata: meta }).eq('id', r.id);
      } catch { /* the next run retries */ }
    });
  }

  // 2. Everything else, fetched per group of leads.
  const sinceIso = new Date(Math.min(...rows.map(r => Date.parse(r.metadata.scheduled_for ?? r.sent_at))) - 3_600_000).toISOString();
  const gather = async <T,>(f: (c: string[]) => PromiseLike<{ data: T[] | null }>) => (await Promise.all(chunk(ids).map(c => f(c)))).flatMap(p => p.data ?? []);
  const [links, journey, replies, leads, reports] = await Promise.all([
    gather<Meta>(c => db.from('sms_link_events').select('lead_id, occurred_at, is_bot, device, os, region, city').in('lead_id', c).gte('occurred_at', sinceIso).order('occurred_at')),
    gather<Meta>(c => db.from('estimate_journey_events').select('lead_id, session_id, event, data, created_at').in('lead_id', c).gte('created_at', sinceIso).order('created_at')),
    gather<Meta>(c => db.from('outreach_history').select('lead_id, sent_at, metadata').eq('channel', 'sms').eq('status', 'replied').in('lead_id', c).gte('sent_at', sinceIso).order('sent_at')),
    gather<Meta>(c => db.from('leads').select('id, sms_opt_in, sms_opt_in_at, sms_opted_out_at, tags, outreach_responded_at, last_contacted_at, pipeline_status').in('id', c)),
    gather<Meta>(c => db.from('outreach_history').select('lead_id, sent_at').eq('channel', 'email').eq('metadata->>kind', 'homeowner_report').in('lead_id', c).gte('sent_at', sinceIso)),
  ]);
  const by = <T extends Meta>(list: T[]) => { const m = new Map<string, T[]>(); for (const x of list) { const a = m.get(x.lead_id) ?? []; a.push(x); m.set(x.lead_id, a); } return m; };
  const linkBy = by(links), journeyBy = by(journey), replyBy = by(replies), reportBy = by(reports);
  const leadBy = new Map(leads.map(l => [l.id as string, l]));

  // 3. One engagement row per lead.
  const out: Array<Record<string, unknown>> = [];
  const crm: Array<{ id: string; tags: string[]; patch: Record<string, unknown> }> = [];
  for (const r of rows) {
    const m = r.metadata; const lead = leadBy.get(r.lead_id) ?? {};
    const status = String(m.twilio_status ?? 'scheduled');
    const sendAt = Date.parse(m.scheduled_for ?? r.sent_at);
    const sent = wasSent(status);
    const delivered = status === 'delivered' || status === 'read';
    const deliveredAt = m.delivered_at ? Date.parse(m.delivered_at) : delivered ? sendAt : NaN;
    const errorCode = m.twilio_error_code ? String(m.twilio_error_code) : null;
    let quality = phoneQualityFor(status, errorCode);

    const myLinks = (linkBy.get(r.lead_id) ?? []).filter(l => Date.parse(l.occurred_at) >= sendAt - 60_000);
    const human = myLinks.filter(l => !l.is_bot && !(Date.parse(l.occurred_at) - (Number.isNaN(deliveredAt) ? sendAt : deliveredAt) < BOT_WINDOW_MS));
    const firstHuman = human[0];
    const myJ = (journeyBy.get(r.lead_id) ?? []).filter(e => Date.parse(e.created_at) >= sendAt - 60_000);
    const has = (ev: string) => myJ.some(e => e.event === ev);
    const maxNum = (ev: string, key: string) => Math.max(0, ...myJ.filter(e => e.event === ev).map(e => Number(e.data?.[key] ?? 0)));
    let step = myJ.length ? STEP_RANK.viewed : 0;
    if (has('contact_started')) step = Math.max(step, STEP_RANK.contact);
    if (has('questionnaire_started')) step = Math.max(step, STEP_RANK.questionnaire);
    const submittedAt = [...(reportBy.get(r.lead_id) ?? []).map(x => Date.parse(x.sent_at)).filter(t => t >= sendAt), ...myJ.filter(e => e.event === 'submitted').map(e => Date.parse(e.created_at))].sort()[0];
    if (submittedAt) step = STEP_RANK.submitted;
    const contactAt = myJ.find(e => e.event === 'call_requested' || e.event === 'question_requested' || e.event === 'text_requested')?.created_at;
    const myReplies = (replyBy.get(r.lead_id) ?? []).filter(x => Date.parse(x.sent_at) >= sendAt);
    const reply = myReplies[myReplies.length - 1];
    const replyBody = reply ? String(reply.metadata?.body ?? '') : '';
    let replyIntent = reply ? String(reply.metadata?.intent ?? classifyReply(replyBody)) : null;
    // A reply that says we have the wrong person tells us about the phone data, not about interest.
    if (replyIntent && replyIntent !== 'stop' && isWrongContact(replyBody)) replyIntent = 'wrong_contact';
    const optedOut = !!lead.sms_opted_out_at;
    const optedIn = lead.sms_opt_in === true;
    const chat = myJ.filter(e => e.event === 'chat_question').length;
    if (reply && isWrongContact(replyBody)) quality = 'wrong_person';
    // Latest thing the homeowner did, so the Campaigns lists can show who interacted most recently.
    const journeyLabel = (ev: string) => ev === 'submitted' ? 'Submitted the form' : ev === 'call_requested' || ev === 'question_requested' || ev === 'text_requested' ? 'Asked for a call or text' : ev === 'chat_question' ? 'Asked a chat question' : ev === 'report_downloaded' || ev === 'report_printed' || ev === 'link_copied' ? 'Saved the report' : ev === 'contact_started' ? 'Started the contact form' : ev === 'questionnaire_started' ? 'Started the questionnaire' : 'Viewed the estimate';
    const activity: Array<{ t: number; label: string }> = [
      ...human.map(l => ({ t: Date.parse(l.occurred_at), label: 'Opened the link' })),
      ...myJ.map(e => ({ t: Date.parse(e.created_at), label: journeyLabel(e.event) })),
      ...(reply ? [{ t: Date.parse(reply.sent_at), label: 'Replied' }] : []),
      ...(submittedAt ? [{ t: submittedAt, label: 'Submitted the form' }] : []),
    ].filter(a => !Number.isNaN(a.t));
    const lastAct = activity.reduce<{ t: number; label: string } | null>((m, a) => (!m || a.t >= m.t ? a : m), null);
    const sc = scoreEngagement({
      delivered, humanClicks: human.length, viewed: has('estimate_shown') || has('page_view'), seconds: maxNum('time_on_page', 'seconds'), scroll: maxNum('scroll_depth', 'pct'),
      step, downloaded: has('report_downloaded') || has('report_printed') || has('link_copied'), chat, website: has('website_clicked'),
      callRequested: !!contactAt, submitted: !!submittedAt, replyIntent, optedOut, phoneQuality: quality, sent,
    });

    out.push({
      lead_id: r.lead_id, batch, audience: m.audience ?? null, message_sid: m.message_sid ?? null, variant: m.variant ?? null, generated_by: m.generated_by ?? null,
      segments: m.segments ?? null, range_text: m.range ?? null, state: m.state ?? null, scheduled_for: new Date(sendAt).toISOString(), twilio_status: status,
      twilio_error_code: errorCode, price_usd: m.price_usd ?? null, delivered_at: Number.isNaN(deliveredAt) ? null : new Date(deliveredAt).toISOString(), phone_quality: quality,
      first_click_at: firstHuman?.occurred_at ?? null, human_clicks: human.length, bot_clicks: myLinks.length - human.length,
      device: firstHuman?.device ?? null, os: firstHuman?.os ?? null, click_region: firstHuman ? [firstHuman.city, firstHuman.region].filter(Boolean).join(', ') || null : null,
      estimate_viewed: has('estimate_shown'), time_on_page_s: maxNum('time_on_page', 'seconds') || null,
      deepest_step: Object.entries(STEP_RANK).find(([, v]) => v === step)?.[0] ?? null,
      report_downloaded: has('report_downloaded') || has('report_printed'), chat_questions: chat, website_clicked: has('website_clicked'),
      estimate_submitted_at: submittedAt ? new Date(submittedAt).toISOString() : null, contact_requested_at: contactAt ?? null,
      reply_at: reply ? reply.sent_at : null, reply_intent: replyIntent, reply_text: reply ? String(reply.metadata?.body ?? '').slice(0, 500) : null,
      last_activity_at: lastAct ? new Date(lastAct.t).toISOString() : null, last_activity: lastAct?.label ?? null,
      opted_in: optedIn, opted_out: optedOut, engagement_score: sc.score, temperature: sc.temperature, final, updated_at: new Date().toISOString(),
    });

    // CRM: plain tags agents can filter on, a response timestamp, and last-contacted time.
    const keep = ((lead.tags as string[] | null) ?? []).filter(t => !t.startsWith('sms:status:') && !t.startsWith('sms:phone:'));
    const tags = [...new Set([...keep, `sms:campaign:${batch}`, `sms:status:${sc.temperature}`, `sms:phone:${quality}`])];
    const patch: Record<string, unknown> = {};
    const responded = reply?.sent_at ?? (submittedAt ? new Date(submittedAt).toISOString() : null) ?? contactAt ?? null;
    if (responded && !lead.outreach_responded_at) patch.outreach_responded_at = responded;
    if (sent && delivered && (!lead.last_contacted_at || Date.parse(lead.last_contacted_at) < sendAt)) patch.last_contacted_at = new Date(sendAt).toISOString();
    // Conversion Pipeline: a refusal rejects the lead, a YES / form / call request means a callback is due, a delivered text means contacted.
    const pipelineTarget: PipelineTarget | null = optedOut || replyIntent === 'stop' || replyIntent === 'no' ? 'rejected'
      : replyIntent === 'yes' || contactAt || submittedAt ? 'callback_scheduled' : sent && delivered ? 'contacted' : null;
    const pipelineNext = pipelineTarget ? nextPipelineStatus(lead.pipeline_status as string | null, pipelineTarget) : null;
    if (pipelineNext) { patch.pipeline_status = pipelineNext; patch.pipeline_status_updated_at = new Date().toISOString(); }
    const oldTags = (lead.tags as string[] | null) ?? [];
    if (tags.length !== oldTags.length || tags.some(t => !oldTags.includes(t))) patch.tags = tags;
    if (Object.keys(patch).length) crm.push({ id: r.lead_id, tags, patch });
  }

  for (const part of chunk(out, 100)) {
    const { error: ue } = await db.from('sms_lead_engagement').upsert(part, { onConflict: 'lead_id,batch' });
    if (ue) throw ue;
  }
  let crmUpdated = 0;
  if (opts.writeCrm !== false) {
    await pool(crm, 6, async c => { const { error: ce } = await db.from('leads').update(c.patch).eq('id', c.id); if (!ce) crmUpdated++; });
    // The prospect score counts engagement, so leads that just turned hot or warm are rescored now.
    const engaged = out.filter(o => o.temperature === 'hot' || o.temperature === 'warm').map(o => String(o.lead_id));
    if (engaged.length) await rescoreLeadsByIds(db, engaged).catch(() => 0);
  }

  const counts: Record<string, number> = {};
  for (const o of out) counts[String(o.temperature)] = (counts[String(o.temperature)] ?? 0) + 1;
  return { batch, leads: out.length, final, temperatures: counts, crmUpdated, lastSend: new Date(lastSend).toISOString() };
}

export interface BatchStats {
  delivered: number; undelivered: number; errors: Record<string, number>; cancelReasons: Record<string, number>;
  replies: number; yes: number; no: number; stop: number; other: number;
}
export interface BatchSummary { batch: string; texts: number; firstSend: string; lastSend: string; audience: string | null; pending: number; canceled: number; stats: BatchStats }

/** Distinct campaign batch names that have texts logged, with how each one turned out. */
export async function listBatches(db: Db): Promise<BatchSummary[]> {
  type Entry = { texts: number; first: number; last: number; audience: string | null; pending: number; canceled: number; stats: BatchStats };
  const map = new Map<string, Entry>();
  const sends = new Map<string, Array<{ t: number; batch: string }>>();
  const nowMs = Date.now();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from('outreach_history').select('lead_id, sent_at, metadata').eq('channel', 'sms').eq('metadata->>kind', 'estimate_outreach').range(from, from + 999);
    if (error) throw error;
    for (const r of data ?? []) {
      const m = (r.metadata ?? {}) as Meta; if (!m.batch) continue;
      const t = Date.parse(m.scheduled_for ?? r.sent_at);
      const e: Entry = map.get(m.batch) ?? { texts: 0, first: t, last: t, audience: m.audience ?? null, pending: 0, canceled: 0, stats: { delivered: 0, undelivered: 0, errors: {}, cancelReasons: {}, replies: 0, yes: 0, no: 0, stop: 0, other: 0 } };
      e.texts++; e.first = Math.min(e.first, t); e.last = Math.max(e.last, t); map.set(m.batch, e);
      if (m.twilio_status === 'canceled') { e.canceled++; const why = String(m.canceled_reason ?? 'Canceled before sending'); e.stats.cancelReasons[why] = (e.stats.cancelReasons[why] ?? 0) + 1; }
      else if (!wasSent(m.twilio_status ?? (t > nowMs ? 'scheduled' : 'sent'))) e.pending++;
      if (['delivered', 'read'].includes(m.twilio_status)) e.stats.delivered++;
      else if (['undelivered', 'failed'].includes(m.twilio_status)) { e.stats.undelivered++; const c = String(m.twilio_error_code ?? m.error ?? 'unknown'); e.stats.errors[c] = (e.stats.errors[c] ?? 0) + 1; }
      if (r.lead_id) (sends.get(r.lead_id) ?? sends.set(r.lead_id, []).get(r.lead_id)!).push({ t, batch: m.batch });
    }
    if ((data ?? []).length < 1000) break;
  }
  // A reply counts toward the campaign whose text the lead received most recently before replying.
  const earliest = Math.min(...[...map.values()].map(e => e.first));
  for (let from = 0; Number.isFinite(earliest); from += 1000) {
    const { data, error } = await db.from('outreach_history').select('lead_id, sent_at, metadata').eq('channel', 'sms').eq('metadata->>direction', 'inbound').gte('sent_at', new Date(earliest).toISOString()).range(from, from + 999);
    if (error) throw error;
    for (const r of data ?? []) {
      const at = Date.parse(r.sent_at);
      const prior = (sends.get(r.lead_id) ?? []).filter(x => x.t <= at).sort((a, b) => b.t - a.t)[0];
      const st = prior && map.get(prior.batch)?.stats; if (!st) continue;
      const intent = String(((r.metadata ?? {}) as Meta).intent ?? 'other');
      st.replies++; if (intent === 'yes') st.yes++; else if (intent === 'no') st.no++; else if (intent === 'stop') st.stop++; else st.other++;
    }
    if ((data ?? []).length < 1000) break;
  }
  return [...map.entries()].map(([batch, e]) => ({ batch, texts: e.texts, firstSend: new Date(e.first).toISOString(), lastSend: new Date(e.last).toISOString(), audience: e.audience, pending: e.pending, canceled: e.canceled, stats: e.stats })).sort((a, b) => a.firstSend.localeCompare(b.firstSend));
}
