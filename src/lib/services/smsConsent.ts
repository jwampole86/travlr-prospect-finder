import 'server-only';
import crypto from 'crypto';
import type { getSupabaseAdmin } from '@/lib/supabaseAdmin';

type Db = ReturnType<typeof getSupabaseAdmin>;

export type ReplyIntent = 'yes' | 'no' | 'stop' | 'help' | 'other';

/** Conservative on purpose: anything that sounds like a refusal is treated as an opt-out. */
export function classifyReply(raw: string): ReplyIntent {
  const text = raw.replace(/[^\w\s'’]/g, ' ').replace(/\s+/g, ' ').trim().toUpperCase();
  if (/\b(STOP|STOPALL|UNSUBSCRIBE|CANCEL|QUIT|END|REVOKE|OPT ?OUT|REMOVE ME|LEAVE ME ALONE)\b/.test(text)) return 'stop';
  if (/\b(DO NOT|DON'?T|DONT|NEVER) (TEXT|CONTACT|MESSAGE|CALL)\b/.test(text) || /\bNOT INTERESTED\b/.test(text)) return 'stop';
  if (/^(NO|N|NOPE|NAH|NO THANKS|NO THANK YOU)$/.test(text)) return 'no';
  if (text === 'HELP' || text === 'INFO') return 'help';
  if (/^(YES|Y|YEP|YEAH|YES PLEASE|YES I AM|SURE|OK YES)$/.test(text)) return 'yes';
  return 'other';
}

export function toE164(raw: string | null | undefined): string | null {
  const digits = String(raw ?? '').replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return null;
}

/** Every format a US number is stored in across imports. */
export function phoneVariants(raw: string): string[] {
  const e164 = toE164(raw);
  if (!e164) return [raw];
  const d = e164.slice(2);
  return [e164, e164.slice(1), d, `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`, `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`, `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`];
}

export async function isSuppressed(db: Db, phone: string | null | undefined): Promise<boolean> {
  const e164 = toE164(phone);
  if (!e164) return false;
  const { data } = await db.from('sms_suppressions').select('phone_e164').eq('phone_e164', e164).maybeSingle();
  return !!data;
}

/** Finds the lead for an inbound number: the lead we last texted at that number first, then any lead stored with it. */
export async function findLeadByPhone(db: Db, from: string): Promise<{ id: string; contact_name: string | null } | null> {
  const e164 = toE164(from);
  if (e164) {
    const { data: sent } = await db.from('outreach_history').select('lead_id').eq('channel', 'sms').eq('metadata->>to', e164)
      .not('lead_id', 'is', null).order('sent_at', { ascending: false }).limit(1).maybeSingle();
    if (sent?.lead_id) {
      const { data } = await db.from('leads').select('id, contact_name').eq('id', sent.lead_id).maybeSingle();
      if (data) return data;
    }
  }
  const { data } = await db.from('leads').select('id, contact_name').in('contact_phone', phoneVariants(from)).limit(1).maybeSingle();
  return data ?? null;
}

/** Twilio signs each webhook: base64(HMAC-SHA1(authToken, url + sorted key/value pairs)). Returns null when no token is available to check against. */
export function verifyTwilioSignature(url: string, params: Record<string, string>, signature: string | null): boolean | null {
  const sid = process.env.TWILIO_ACCOUNT_SID ?? '';
  const token = process.env.TWILIO_WEBHOOK_AUTH_TOKEN || (sid.startsWith('AC') ? process.env.TWILIO_AUTH_TOKEN : undefined);
  if (!token) return null;
  if (!signature) return false;
  const data = url + Object.keys(params).sort().map(k => k + params[k]).join('');
  const expected = crypto.createHmac('sha1', token).update(data).digest('base64');
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export async function recordOptOut(db: Db, input: { leadId: string | null; phone: string; message: string }) {
  const now = new Date().toISOString();
  const e164 = toE164(input.phone);
  if (e164) await db.from('sms_suppressions').upsert({ phone_e164: e164, reason: 'opt_out', last_message: input.message.slice(0, 160) }, { onConflict: 'phone_e164' });
  if (input.leadId) {
    await db.from('leads').update({ sms_opt_in: false, sms_opted_out_at: now }).eq('id', input.leadId);
    await db.from('cadence_enrollments').update({ status: 'unsubscribed' }).eq('lead_id', input.leadId).eq('status', 'active');
  }
}

export async function recordOptIn(db: Db, input: { leadId: string; phone: string }) {
  const now = new Date().toISOString();
  const e164 = toE164(input.phone);
  if (e164) await db.from('sms_suppressions').delete().eq('phone_e164', e164);
  await db.from('leads').update({ sms_opt_in: true, sms_opt_in_at: now, opt_in_source: 'sms_reply_yes', sms_opted_out_at: null }).eq('id', input.leadId);
}

/** app_notifications rows need a user_id, so alert each admin/owner. */
export async function notifyAdmins(db: Db, n: { title: string; message: string; metadata: Record<string, unknown> }) {
  try {
    const { data: admins } = await db.from('user_profiles').select('id').in('app_role', ['admin', 'owner']).limit(10);
    if (admins?.length) await db.from('app_notifications').insert(admins.map(a => ({ user_id: a.id, type: 'homeowner_inquiry', severity: 'warning', category: 'leads', ...n })));
  } catch { /* the lead is already escalated; the alert is a convenience */ }
}
