import 'server-only';
import { isProtectedContact } from '@/lib/protectedContacts';
import type { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { draftOutreach, finalizeMessage, inSendWindow, LEAD_COLUMNS, type OutreachLead } from '@/lib/services/estimateOutreachSms';
import { lookupPhoneNumber, smsBlockReason } from '@/lib/services/twilioService';
import { scheduleSMS, cancelScheduled } from '@/lib/services/twilioSchedule';
import { toE164 } from '@/lib/services/smsConsent';
import { checkListingStatuses } from '@/lib/services/listingStatus';

type Db = ReturnType<typeof getSupabaseAdmin>;
type Row = Record<string, any>;

const SITE = 'https://prospect.staytrvlr.com';
const MESSAGING_SERVICE = process.env.TWILIO_MESSAGING_SERVICE_SID || 'MG9c28a48828aae9a648e8d4bcc8c0cd41';
const MIN_LEAD_MINUTES = 30; // at plan time; Twilio itself needs 15 minutes
const MAX_TEXTS = 500;
export const CHUNK_SIZE = 8;
/** Early results (2026-10-12) favored these states, so campaigns take their leads first, then the rest by score. */
const PRIORITY_STATES = ['CO', 'FL', 'AZ'];

/** Who can be texted. The database function campaign_audience applies the shared rules (real leads, never co-host, never a property already texted, never a phone or owner that opted out or said no, one lead per phone). */
export const AUDIENCES = [
  { id: 'fully-verified', label: 'Fully verified', blurb: 'Owner, phone and address all confirmed. The cleanest data we have.' },
  { id: 'luxury-phone', label: 'Luxury homes with a phone', blurb: 'High-value homes where a rental estimate is most compelling. Phone numbers are less verified.' },
  { id: 'high-score', label: 'High prospect score (70+)', blurb: 'Leads our scoring ranks as the strongest conversion candidates, with a phone and address.' },
  { id: 'allowed-markets', label: 'Short-term rentals allowed', blurb: 'Leads in places where regulation research found short-term rentals are allowed.' },
  { id: 'broad', label: 'Broad: phone and full property details', blurb: 'Everyone with a phone, address, price and bedrooms. The largest pool; includes the groups above.' },
] as const;
export type AudienceId = (typeof AUDIENCES)[number]['id'];
const AUDIENCE_IDS = new Set<string>(AUDIENCES.map(a => a.id));

export interface Candidate { id: string; score: number; state: string | null }

export interface CampaignParams {
  name: string; audience: AudienceId; states: string[]; minScore: number; maxTexts: number;
  tone: 'friendly' | 'direct' | 'mix'; startAt: string; spreadHours: 0 | 1 | 2 | 4;
}

const hash = (s: string) => { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; };
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);

const phoneKey = (v: unknown) => String(v ?? '').replace(/\D/g, '').slice(-10) || null;
const ownerKey = (v: unknown) => String(v ?? '').trim().replace(/\s+/g, ' ').toLowerCase() || null;
const RECENT_DAYS = 7;

/** Phones and owner names already texted (or scheduled to be texted) in the last 7 days, so the same homeowner is never texted twice in one week, even for a different property. */
async function recentlyTexted(db: Db) {
  const since = new Date(Date.now() - RECENT_DAYS * 86_400_000).toISOString();
  const rows: Row[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from('outreach_history').select('lead_id, metadata').eq('channel', 'sms').gte('sent_at', since).range(from, from + 999);
    if (error) throw error;
    rows.push(...(data ?? []));
    if ((data ?? []).length < 1000) break;
  }
  const phones = new Set<string>(); const owners = new Set<string>();
  for (const r of rows) { const ph = phoneKey((r.metadata as Row)?.to); if (ph) phones.add(ph); }
  const leadIds = [...new Set(rows.map(r => r.lead_id as string).filter(Boolean))];
  for (let i = 0; i < leadIds.length; i += 100) {
    const { data, error } = await db.from('leads').select('contact_phone, owner_name').in('id', leadIds.slice(i, i + 100));
    if (error) throw error;
    for (const l of data ?? []) { const ph = phoneKey(l.contact_phone); const ok = ownerKey(l.owner_name); if (ph) phones.add(ph); if (ok) owners.add(ok); }
  }
  return { phones, owners };
}

export async function audienceCandidates(db: Db, audience: string): Promise<Candidate[]> {
  const out: Candidate[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.rpc('campaign_audience', { p_audience: audience }).range(from, from + 999);
    if (error) throw error;
    const rows = (data ?? []) as Array<{ lead_id: string; prospect_score: number; state: string | null }>;
    out.push(...rows.map(r => ({ id: r.lead_id, score: r.prospect_score ?? 0, state: r.state })));
    if (rows.length < 1000) break;
  }
  if (!out.length) return out;
  const recent = await recentlyTexted(db);
  const blocked = new Set<string>();
  for (let i = 0; i < out.length; i += 100) {
    const { data, error } = await db.from('leads').select('id, contact_phone, owner_name, contact_name').in('id', out.slice(i, i + 100).map(c => c.id));
    if (error) throw error;
    for (const l of data ?? []) {
      const ph = phoneKey(l.contact_phone); const ok = ownerKey(l.owner_name);
      if ((ph && recent.phones.has(ph)) || (ok && recent.owners.has(ok)) || isProtectedContact(l.owner_name, l.contact_name)) blocked.add(l.id as string);
    }
  }
  return out.filter(c => !blocked.has(c.id));
}

const filterCandidates = (c: Candidate[], p: Pick<CampaignParams, 'states' | 'minScore'>) =>
  c.filter(x => (!p.states.length || (x.state && p.states.includes(x.state.toUpperCase()))) && x.score >= p.minScore)
    .map((x, i) => ({ x, i, rank: PRIORITY_STATES.indexOf((x.state ?? '').toUpperCase()) }))
    .sort((a, b) => (a.rank < 0 ? 99 : a.rank) - (b.rank < 0 ? 99 : b.rank) || a.i - b.i).map(r => r.x);

/** Size, average score and top states of every audience, for the picker and for the AI helper. */
let summariesCache: { at: number; value: Promise<Awaited<ReturnType<typeof computeSummaries>>> } | null = null;
/** Concurrent or repeated page loads share one computation for 30 seconds, since the audience function is slow. */
export function audienceSummaries(db: Db) {
  if (summariesCache && Date.now() - summariesCache.at < 30_000) return summariesCache.value;
  const value = computeSummaries(db);
  summariesCache = { at: Date.now(), value };
  value.catch(() => { if (summariesCache?.value === value) summariesCache = null; });
  return value;
}

async function computeSummaries(db: Db) {
  // One at a time: the audience function is heavy and running all five together hits the database statement timeout.
  const out = [];
  for (const a of AUDIENCES) {
    const c = await audienceCandidates(db, a.id);
    const byState = new Map<string, number>(); for (const x of c) if (x.state) byState.set(x.state, (byState.get(x.state) ?? 0) + 1);
    out.push({
      ...a, size: c.length, avgScore: c.length ? Math.round(c.reduce((s, x) => s + x.score, 0) / c.length) : 0,
      // Compact [state, score] pairs so the page can count matches live as filters change; no lead ids or contact details.
      points: c.map(x => [x.state ?? '', x.score] as [string, number]),
      topStates: [...byState.entries()].sort((x, y) => y[1] - x[1]).slice(0, 8).map(([state, count]) => ({ state, count })),
    });
  }
  return out;
}

export function parseParams(raw: unknown): { p: CampaignParams } | { error: string } {
  const r = (raw ?? {}) as Row;
  const name = String(r.name ?? '').trim();
  if (name.length < 3 || name.length > 60 || !slug(name)) return { error: 'Give the campaign a name of 3 to 60 characters.' };
  if (!AUDIENCE_IDS.has(String(r.audience))) return { error: 'Choose an audience.' };
  const states = Array.isArray(r.states) ? [...new Set(r.states.map((s: unknown) => String(s).toUpperCase()).filter((s: string) => /^[A-Z]{2}$/.test(s)))].slice(0, 30) as string[] : [];
  const minScore = Math.max(0, Math.min(100, Math.round(Number(r.minScore) || 0)));
  const maxTexts = Math.round(Number(r.maxTexts));
  if (!Number.isFinite(maxTexts) || maxTexts < 1 || maxTexts > MAX_TEXTS) return { error: `Choose between 1 and ${MAX_TEXTS} texts.` };
  const tone = ['friendly', 'direct', 'mix'].includes(r.tone) ? r.tone : 'mix';
  const start = Date.parse(String(r.startAt));
  if (Number.isNaN(start)) return { error: 'Choose a start date and time.' };
  const spreadHours = [0, 1, 2, 4].includes(Number(r.spreadHours)) ? Number(r.spreadHours) as 0 | 1 | 2 | 4 : 0;
  return { p: { name, audience: r.audience, states, minScore, maxTexts, tone, startAt: new Date(start).toISOString(), spreadHours } };
}

export const batchOf = (p: CampaignParams) => `${p.startAt.slice(0, 10)}-${slug(p.name)}`;

function checkStart(p: CampaignParams, minMinutes: number): string | null {
  const t = Date.parse(p.startAt);
  if (t < Date.now() + minMinutes * 60_000) return `The start time must be at least ${minMinutes} minutes from now so every text can be scheduled in time. Pick a later time.`;
  if (t > Date.now() + 30 * 86_400_000) return 'Texts can be scheduled up to 30 days ahead.';
  return null;
}

/** Earliest time at or after the lead's slot (within 8 hours) that falls in the 9am to 8pm window of the lead's own time zone. */
function sendTimeFor(state: string | null, p: CampaignParams, id: string): Date | null {
  const slot = p.spreadHours ? hash(id) % (p.spreadHours * 60) : 0;
  const start = Date.parse(p.startAt) + slot * 60_000;
  for (let h = 0; h <= 8; h++) { const t = new Date(start + h * 3_600_000); if (inSendWindow(state, t)) return t; }
  return null;
}
const toneFor = (p: CampaignParams, id: string): 'friendly' | 'direct' => (p.tone === 'mix' ? (hash(id) % 2 === 0 ? 'friendly' : 'direct') : p.tone);

async function pool<T, R>(items: T[], size: number, fn: (x: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length); let next = 0;
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, async () => { while (next < items.length) { const i = next++; out[i] = await fn(items[i], i); } }));
  return out;
}

async function batchExists(db: Db, batch: string): Promise<boolean> {
  const { data } = await db.from('outreach_history').select('id').eq('channel', 'sms').eq('metadata->>batch', batch).limit(1);
  return (data ?? []).length > 0;
}
/** A chunk may only add to a campaign created here, never to one of the scripted campaigns. */
async function batchIsBuilderOwned(db: Db, batch: string): Promise<boolean> {
  const { data } = await db.from('outreach_history').select('metadata').eq('channel', 'sms').eq('metadata->>batch', batch).limit(1);
  return !(data ?? []).length || (data![0].metadata as Row)?.builder === true;
}

/** Step 1: validates the settings and returns the ordered list of lead ids to work through. Nothing is sent. */
export async function planCampaign(db: Db, p: CampaignParams) {
  const bad = checkStart(p, MIN_LEAD_MINUTES); if (bad) return { error: bad };
  const batch = batchOf(p);
  if (await batchExists(db, batch)) return { error: `A campaign named "${batch}" already exists. Change the name or the start date.` };
  const all = filterCandidates(await audienceCandidates(db, p.audience), p);
  if (!all.length) return { error: 'No leads match this audience and filters.' };
  // Some leads are dropped while scheduling (landline, no estimate), so the list is longer than the target.
  return { batch, total: all.length, target: Math.min(p.maxTexts, all.length), ids: all.slice(0, Math.min(all.length, Math.ceil(p.maxTexts * 1.6) + 20)).map(c => c.id) };
}

/** Drafts a few messages exactly as they would be sent, so the user can read them before scheduling. */
export async function previewCampaign(db: Db, p: CampaignParams) {
  const bad = checkStart(p, MIN_LEAD_MINUTES); if (bad) return { error: bad };
  const all = filterCandidates(await audienceCandidates(db, p.audience), p);
  if (!all.length) return { error: 'No leads match this audience and filters.' };
  const n = Math.min(6, all.length);
  const picks = Array.from({ length: n }, (_, i) => all[Math.floor((i * all.length) / n)]);
  const { data: leads } = await db.from('leads').select(LEAD_COLUMNS).in('id', picks.map(x => x.id));
  const byId = new Map((leads ?? []).map(l => [l.id as string, l as unknown as OutreachLead]));
  const drafts = await pool(picks, 3, async c => {
    const lead = byId.get(c.id); if (!lead) return null;
    const sendAt = sendTimeFor(lead.state, p, c.id);
    if (!sendAt) return { state: lead.state, message: '', segments: 0, by: 'template', blockers: ['no_send_window'], sendAt: null as string | null };
    const d = await draftOutreach(db, lead, { site: SITE, tone: toneFor(p, c.id), now: sendAt });
    return { state: lead.state, message: d.message, segments: d.segments, by: d.generatedBy, blockers: d.blockers as string[], sendAt: sendAt.toISOString() };
  });
  const ok = drafts.filter((d): d is NonNullable<typeof d> => !!d);
  const sendable = ok.filter(d => !d.blockers.length);
  const segs = sendable.length ? sendable.reduce((s, d) => s + d.segments, 0) / sendable.length : 2;
  const blockers: Record<string, number> = {}; for (const d of ok) for (const b of d.blockers) blockers[b] = (blockers[b] ?? 0) + 1;
  const count = Math.min(p.maxTexts, all.length);
  return {
    audienceSize: all.length, count, sampled: ok.length, sendableInSample: sendable.length, blockers, avgSegments: Math.round(segs * 10) / 10,
    // Twilio price per segment plus the typical carrier fee range, as used in the scripted campaigns.
    costLow: Math.round(count * segs * 0.0113 * 100) / 100, costHigh: Math.round(count * segs * 0.0133 * 100) / 100,
    samples: sendable.slice(0, 3).map(d => ({ state: d.state, message: d.message, segments: d.segments, generatedBy: d.by, sendAt: d.sendAt })),
    states: [...new Set(all.map(x => x.state).filter(Boolean))].length,
  };
}

/** Step 2, called repeatedly with a few ids at a time: checks each lead again, drafts, screens the phone and schedules the text with Twilio. */
export async function scheduleChunk(db: Db, p: CampaignParams, ids: string[], budget: number) {
  const bad = checkStart(p, 16); if (bad) return { error: bad };
  const batch = batchOf(p);
  if (!(await batchIsBuilderOwned(db, batch))) return { error: 'That campaign was not created here and cannot be added to.' };
  const unique = [...new Set(ids.filter(i => typeof i === 'string'))].slice(0, CHUNK_SIZE);

  const eligible = new Set((await audienceCandidates(db, p.audience)).map(c => c.id));
  const { data: leadRows, error } = await db.from('leads').select(LEAD_COLUMNS).in('id', unique);
  if (error) return { error: error.message };
  const skipped: Record<string, number> = {}; const skip = (r: string) => { skipped[r] = (skipped[r] ?? 0) + 1; };
  const leads: OutreachLead[] = [];
  for (const id of unique) { const l = (leadRows ?? []).find(x => x.id === id) as OutreachLead | undefined; if (!l || !eligible.has(id)) skip('no_longer_eligible'); else leads.push(l); }

  // One text per phone number per campaign. Across campaigns the audience rules decide: only the same owner's other property may be texted again.
  const phones = leads.map(l => toE164(l.contact_phone)).filter((x): x is string => !!x);
  const { data: used } = phones.length ? await db.from('outreach_history').select('metadata').eq('channel', 'sms').eq('metadata->>kind', 'estimate_outreach').eq('metadata->>batch', batch).in('metadata->>to', phones) : { data: [] as Row[] };
  const taken = new Set((used ?? []).map(u => (u.metadata as Row)?.to as string));

  // A home that has sold, gone pending or come off Zillow is not texted "we saw your home on Zillow".
  const listingStatus = await checkListingStatuses(db, leads as Array<{ id: string; listing_url?: string | null }>).catch(() => new Map());
  let scheduled = 0; let landline = 0; let invalid = 0; let segments = 0; let reserved = 0;
  const failures: string[] = [];
  const manifest: Array<{ sid: string; leadId: string; to: string; sendAt: string }> = [];
  await pool(leads, 4, async lead => {
    const to = toE164(lead.contact_phone);
    const ls = listingStatus.get(lead.id);
    if (ls?.blocked) return skip(`listing_${ls.reason}`);
    if (to && taken.has(to)) return skip('phone_already_texted');
    if (to) taken.add(to);
    if (reserved >= budget) return skip('target_reached');
    const sendAt = sendTimeFor(lead.state, p, lead.id);
    if (!sendAt) return skip('no_send_window');
    const d = await draftOutreach(db, lead, { site: SITE, tone: toneFor(p, lead.id), now: sendAt });
    if (d.blockers.length || !d.to) return skip(d.blockers[0] ?? 'no_phone');
    const look = await lookupPhoneNumber(d.to);
    if (look.twilioConfigured && look.error) return skip('lookup_failed'); // a failed lookup says nothing about the number, so the lead is not tagged
    const blocked = smsBlockReason(look);
    if (blocked) {
      const reason = blocked;
      if (reason === 'invalid') invalid++; else landline++;
      const { data: row } = await db.from('leads').select('tags').eq('id', lead.id).maybeSingle();
      const tags = [...new Set([...((row?.tags as string[] | null) ?? []).filter(t => !t.startsWith('sms:phone:')), `sms:phone:${reason}`])];
      await db.from('leads').update({ tags }).eq('id', lead.id);
      return skip(reason === 'invalid' ? 'invalid_number' : 'landline');
    }
    if (reserved >= budget) return skip('target_reached');
    reserved++;
    const message = await finalizeMessage(db, d, SITE);
    const r = await scheduleSMS({ to: d.to, body: message, sendAt, messagingServiceSid: MESSAGING_SERVICE, statusCallback: `${SITE}/api/sms/delivery` });
    if (!r.ok || !r.sid) { reserved--; failures.push(r.error ?? 'Twilio rejected the message'); return skip('twilio_error'); }
    manifest.push({ sid: r.sid, leadId: lead.id, to: d.to, sendAt: sendAt.toISOString() });
    scheduled++; segments += d.segments;
    await db.from('outreach_history').insert({
      lead_id: lead.id, channel: 'sms', status: 'sent', sent_at: sendAt.toISOString(),
      metadata: { kind: 'estimate_outreach', batch, builder: true, campaign_name: p.name, audience: p.audience, to: d.to, message, variant: toneFor(p, lead.id), generated_by: d.generatedBy, range: d.range, segments: d.segments, state: lead.state,
        message_sid: r.sid, twilio_status: 'scheduled', scheduled_for: sendAt.toISOString(), named: /^Hi [A-Z]/.test(message) && !message.startsWith('Hi there') },
    });
  });
  return { batch, scheduled, landline, invalid, segments, skipped, failures: failures.slice(0, 3) };
}

/** Records the phone screening totals so the skip-trace accuracy card covers this campaign too. */
export async function finishCampaign(db: Db, p: CampaignParams, tally: { screened: number; landline: number; invalid: number }) {
  const batch = batchOf(p);
  await db.from('campaign_insight_snapshots').delete().eq('batch', `${batch}:prefilter`);
  await db.from('campaign_insight_snapshots').insert({ batch: `${batch}:prefilter`, report: { audience: p.audience, audienceLeads: Math.max(0, Math.round(tally.screened)), landline: Math.max(0, Math.round(tally.landline)), invalid: Math.max(0, Math.round(tally.invalid)), recordedAt: new Date().toISOString() } });
  return { ok: true };
}

/** Cancels every text of a campaign that has not gone out yet (Twilio holds them until their send time). */
export async function cancelCampaign(db: Db, batch: string) {
  const rows: Row[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from('outreach_history').select('id,metadata').eq('channel', 'sms').eq('metadata->>batch', batch).range(from, from + 999);
    if (error) return { error: error.message };
    rows.push(...(data ?? [])); if ((data ?? []).length < 1000) break;
  }
  if (!rows.length) return { error: 'Unknown campaign' };
  // Texts within two minutes of their send time are already being handed to the carrier.
  const cutoff = Date.now() + 2 * 60_000;
  const todo = rows.filter(r => { const m = r.metadata as Row; return m.message_sid && (m.twilio_status ?? 'scheduled') === 'scheduled' && Date.parse(m.scheduled_for) > cutoff; });
  let canceled = 0; let failed = 0;
  await pool(todo, 5, async r => {
    const res = await cancelScheduled((r.metadata as Row).message_sid);
    if (!res.ok) { failed++; return; }
    canceled++;
    await db.from('outreach_history').update({ metadata: { ...(r.metadata as Row), twilio_status: 'canceled' } }).eq('id', r.id);
  });
  return { canceled, failed, alreadySent: rows.length - todo.length };
}
