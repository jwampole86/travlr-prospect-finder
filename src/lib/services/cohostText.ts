import 'server-only';
import type { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { dispatchSMS, lookupPhoneNumber } from '@/lib/services/twilioService';
import { countSegments, inSendWindow, toGsm, MAX_SEGMENTS } from '@/lib/services/estimateOutreachSms';
import { isSuppressed, toE164 } from '@/lib/services/smsConsent';
import { homesagePhones } from '@/lib/services/homesageSkipTrace';

type Db = ReturnType<typeof getSupabaseAdmin>;
type Row = Record<string, any>;

const DAILY_CAP = 40;
const COOLDOWN_DAYS = 7;
const NO_TEXT_STAGES = ['declined', 'not_a_fit'];

export interface HostPhone { e164: string; source: 'skip_trace' | 'permit_office' | 'homesage'; type: string | null; name: string | null }

/** Every phone we hold for this prospect: owner-record and skip-trace matches, and any number the permit office itself publishes. Numbers of people flagged litigator, TCPA risk or deceased are left out. */
export function phonesFor(owner: Row | null | undefined): HostPhone[] {
  const out = new Map<string, HostPhone>();
  const blocked = new Set(((owner?.homesage?.persons ?? []) as Row[]).filter(p => p.doNotContact).flatMap(p => (p.phones ?? []).map((x: Row) => x.e164)));
  for (const p of homesagePhones(owner)) { if (!out.has(p.e164)) out.set(p.e164, { e164: p.e164, source: 'homesage', type: p.type, name: p.person }); }
  for (const r of (owner?.skipTrace?.results ?? []) as Row[]) {
    for (const p of (r.found?.phones ?? []) as Row[]) { const e = toE164(p.e164); if (e && !blocked.has(e) && !out.has(e)) out.set(e, { e164: e, source: 'skip_trace', type: p.type ?? null, name: r.found?.name ?? r.name ?? null }); }
  }
  const pub = toE164(owner?.contact?.phone);
  if (pub && !out.has(pub)) out.set(pub, { e164: pub, source: 'permit_office', type: null, name: owner?.permitHolder ?? null });
  return [...out.values()];
}

/** The text always identifies TRAVLR and carries an opt-out line, whatever the sender edited. */
export function prepareBody(raw: string): string {
  let b = toGsm(raw).trim();
  if (!/travlr/i.test(b)) b = `TRAVLR Vacation Homes: ${b}`;
  if (!/\bstop\b/i.test(b)) b = `${b}\nReply STOP to opt out`;
  return b;
}

const stateOfMarket = (market: string | null) => (market ?? '').split(',').pop()?.trim().toUpperCase() ?? null;

export async function threadFor(db: Db, propertyId: string) {
  const { data } = await db.from('cohost_messages').select('direction,phone_e164,body,status,intent,created_at').eq('property_id', propertyId).order('created_at', { ascending: true }).limit(50);
  return data ?? [];
}

/** Sends one text to a co-host prospect after the safety checks. Only a person sending one-to-one may call this. */
export async function sendCohostText(db: Db, input: { propertyId: string; to: string; body: string; actorId: string }): Promise<{ ok: true; sid: string | null } | { ok: false; error: string }> {
  const to = toE164(input.to);
  if (!to) return { ok: false, error: 'That is not a valid US phone number.' };
  const { data: l } = await db.from('str_listings').select('property_id,market,pipeline_stage,matched_owner').eq('property_id', input.propertyId).maybeSingle();
  if (!l) return { ok: false, error: 'Unknown listing.' };
  if (NO_TEXT_STAGES.includes(l.pipeline_stage)) return { ok: false, error: 'This prospect is marked declined or not a fit. Do not text them.' };
  const { data: link } = await db.from('cohost_offer_links').select('opted_out_at').eq('property_id', input.propertyId).maybeSingle();
  if (link?.opted_out_at) return { ok: false, error: 'This owner opted out on the offer page. Do not contact them.' };
  if (await isSuppressed(db, to)) return { ok: false, error: 'That number opted out of texts. It cannot be texted.' };

  const state = stateOfMarket(l.market);
  if (!inSendWindow(state, new Date())) return { ok: false, error: `It is outside 9am to 8pm in ${state ?? 'the owner\'s'} local time. Try again during the day.` };

  const body = prepareBody(input.body);
  if (countSegments(body) > MAX_SEGMENTS) return { ok: false, error: `That message is too long (${countSegments(body)} segments). Shorten it to ${MAX_SEGMENTS} or fewer.` };

  const since = new Date(Date.now() - COOLDOWN_DAYS * 86_400_000).toISOString();
  const { data: recent } = await db.from('cohost_messages').select('direction,created_at').eq('phone_e164', to).gte('created_at', since).order('created_at', { ascending: false }).limit(5);
  const lastIsInbound = recent?.[0]?.direction === 'inbound';
  if (!lastIsInbound && (recent ?? []).some(r => r.direction === 'outbound')) return { ok: false, error: `This number was texted in the last ${COOLDOWN_DAYS} days. Wait for a reply or for the cooldown to pass.` };
  const dayStart = new Date(); dayStart.setUTCHours(0, 0, 0, 0);
  const { count } = await db.from('cohost_messages').select('id', { count: 'exact', head: true }).eq('direction', 'outbound').gte('created_at', dayStart.toISOString());
  if ((count ?? 0) >= DAILY_CAP) return { ok: false, error: `The daily limit of ${DAILY_CAP} co-host texts has been reached.` };

  const look = await lookupPhoneNumber(to);
  if (look.twilioConfigured && look.valid === false) return { ok: false, error: 'That number is not a working phone number.' };
  if (look.twilioConfigured && look.lineType === 'landline') return { ok: false, error: 'That number is a landline, so a text cannot reach it. Call instead.' };

  const known = phonesFor(l.matched_owner as Row).find(p => p.e164 === to);
  const res = await dispatchSMS({ to, body, leadId: input.propertyId, allowCoHost: true, metadata: { kind: 'cohost_outreach', property_id: input.propertyId } });
  if (!res.success) return { ok: false, error: res.error ?? 'The text could not be sent.' };

  await db.from('cohost_messages').insert({ property_id: input.propertyId, direction: 'outbound', phone_e164: to, body, message_sid: res.messageSid ?? null, status: res.status, phone_source: known?.source ?? 'manual', sent_by: input.actorId });
  if (['identified', 'reviewed'].includes(l.pipeline_stage)) await db.from('str_listings').update({ pipeline_stage: 'contacted', stage_updated_at: new Date().toISOString() }).eq('property_id', input.propertyId);
  return { ok: true, sid: res.messageSid ?? null };
}
