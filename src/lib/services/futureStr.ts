import 'server-only';
import { createHmac, timingSafeEqual } from 'crypto';
import type { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { getResendClient } from '@/lib/email/resend';
import { renderIssue } from '@/lib/services/futureStrNewsletter';
import { CONCERNS, COMFORT, CONSENT_TEXT, HOME_INTERESTS, OP_INTERESTS, PAY, ROLES, SIZES, ids, type Audience } from '@/lib/futureStrOptions';

type Db = ReturnType<typeof getSupabaseAdmin>;
type Row = Record<string, any>;

/*
 * AVYRO AI-only. Nothing here may borrow another brand's sender, domain or postal address, so every
 * setting comes from its own FUTURE_STR_* variable. The public page and form are off until
 * FUTURE_STR_ENABLED=true, and no email of any kind is sent until FUTURE_STR_SENDING_ENABLED=true
 * and the sender, reply-to, postal address and site URL are all configured.
 */
const cfg = () => ({
  site: (process.env.FUTURE_STR_SITE_URL ?? '').replace(/\/$/, ''),
  postal: (process.env.FUTURE_STR_POSTAL_ADDRESS ?? '').trim(),
  fromEmail: (process.env.FUTURE_STR_FROM_EMAIL ?? '').trim(),
  fromName: (process.env.FUTURE_STR_FROM_NAME ?? 'AVYRO AI').trim(),
  replyTo: (process.env.FUTURE_STR_REPLY_TO ?? '').trim(),
  brandSite: (process.env.FUTURE_STR_BRAND_SITE ?? '').trim(),
});

export const publicPageEnabled = () => process.env.FUTURE_STR_ENABLED === 'true';

export function readiness() {
  const c = cfg();
  const missing = [!c.site && 'FUTURE_STR_SITE_URL', !c.postal && 'FUTURE_STR_POSTAL_ADDRESS', !c.fromEmail && 'FUTURE_STR_FROM_EMAIL', !c.replyTo && 'FUTURE_STR_REPLY_TO'].filter(Boolean) as string[];
  const flag = process.env.FUTURE_STR_SENDING_ENABLED === 'true';
  return { publicPage: publicPageEnabled(), sendingFlag: flag, missing, canSend: flag && missing.length === 0 };
}

function secret(): string {
  const s = process.env.ESTIMATE_LINK_SECRET || process.env.CRON_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!s || /your-|placeholder/i.test(s)) throw new Error('No signing secret configured');
  return s;
}
const sign = (kind: 'confirm' | 'unsub', id: string) => createHmac('sha256', secret()).update(`future-str:${kind}:${id}`).digest('base64url').slice(0, 22);
function verify(kind: 'confirm' | 'unsub', id: string, token: string): boolean {
  try { const a = Buffer.from(token), b = Buffer.from(sign(kind, id)); return a.length === b.length && timingSafeEqual(a, b); } catch { return false; }
}
const UUID = /^[0-9a-f-]{36}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// ── Survey and sign-up (public) ───────────────────────────────────────────────

export interface SubmitInput {
  audience?: string; comfort?: string; concerns?: unknown; interests?: unknown; role?: string; portfolioSize?: string; payInterest?: string; comment?: string;
  email?: string; firstName?: string; consent?: boolean; source?: string; website?: string;
}

const pick = (v: unknown, allowed: string[], max = 20): string[] | null => {
  if (v == null) return [];
  if (!Array.isArray(v) || v.length > max) return null;
  const out = [...new Set(v.map(String))];
  return out.every(x => allowed.includes(x)) ? out : null;
};

/** Stores a survey answer and, only with an explicit tick, a pending sign-up. It never sends email. */
export async function submitResponse(db: Db, input: SubmitInput, ip: string | null): Promise<{ ok: true; subscribed: boolean } | { ok: false; error: string }> {
  if (input.website) return { ok: true, subscribed: false }; // honeypot: bots fill hidden fields
  const audience = input.audience === 'operator' ? 'operator' : input.audience === 'homeowner' ? 'homeowner' : null;
  if (!audience) return { ok: false, error: 'Please choose who you are answering as.' };
  const interestList = audience === 'operator' ? OP_INTERESTS : HOME_INTERESTS;
  const one = (v: string | undefined, list: ReadonlyArray<{ id: string }>) => (v == null || v === '' ? null : ids(list).includes(v) ? v : undefined);
  const comfort = one(input.comfort, COMFORT), role = one(input.role, ROLES), size = one(input.portfolioSize, SIZES), pay = one(input.payInterest, PAY);
  if (comfort === undefined || role === undefined || size === undefined || pay === undefined) return { ok: false, error: 'One of the answers was not recognized.' };
  const concerns = pick(input.concerns, ids(CONCERNS)); const interests = pick(input.interests, ids(interestList));
  if (!concerns || !interests) return { ok: false, error: 'One of the answers was not recognized.' };
  const comment = String(input.comment ?? '').trim().slice(0, 1000) || null;
  if (!comfort && !role && !size && !pay && !concerns.length && !interests.length && !comment) return { ok: false, error: 'Please answer at least one question.' };

  const email = String(input.email ?? '').trim().toLowerCase();
  const wantsContact = interests.length > 0;
  if (email) {
    if (email.length > 254 || !EMAIL_RE.test(email)) return { ok: false, error: 'That email address does not look right.' };
    if (input.consent !== true) return { ok: false, error: 'Please tick the box to let us email you, or remove your email address.' };
  } else if (wantsContact) {
    return { ok: false, error: 'Add your email address if you would like updates or a conversation. Otherwise untick those options.' };
  }

  let subscriberId: string | null = null;
  if (email) {
    const { data: ex } = await db.from('future_str_subscribers').select('id,status').eq('email', email).eq('audience', audience).maybeSingle();
    if (!ex) {
      const { data, error } = await db.from('future_str_subscribers').insert({ email, audience, first_name: String(input.firstName ?? '').trim().slice(0, 60) || null, consent_text: CONSENT_TEXT, consent_ip: ip, source: String(input.source ?? '').slice(0, 40) || null }).select('id').single();
      if (error) return { ok: false, error: 'We could not save that. Please try again.' };
      subscriberId = data.id as string;
    } else {
      subscriberId = ex.id as string;
      // A previous unsubscribe is honored until the person asks again.
      if (ex.status === 'unsubscribed') await db.from('future_str_subscribers').update({ status: 'pending', consent_text: CONSENT_TEXT, consent_ip: ip, unsubscribed_at: null, confirmation_sent_at: null }).eq('id', ex.id);
    }
  }
  const { error } = await db.from('future_str_responses').insert({ audience, comfort, concerns, interests, role, portfolio_size: size, pay_interest: pay, comment, subscriber_id: subscriberId, source: String(input.source ?? '').slice(0, 40) || null });
  if (error) return { ok: false, error: 'We could not save that. Please try again.' };
  return { ok: true, subscribed: !!subscriberId };
}

export async function confirmSubscriber(db: Db, id: string, token: string): Promise<boolean | null> {
  if (!UUID.test(id) || !verify('confirm', id, token)) return null;
  const { data } = await db.from('future_str_subscribers').update({ status: 'confirmed', confirmed_at: new Date().toISOString() }).eq('id', id).in('status', ['pending', 'confirmed']).select('id');
  return !!data?.length;
}

export async function unsubscribeSubscriber(db: Db, id: string, token: string): Promise<boolean | null> {
  if (!UUID.test(id) || !verify('unsub', id, token)) return null;
  const { data } = await db.from('future_str_subscribers').update({ status: 'unsubscribed', unsubscribed_at: new Date().toISOString() }).eq('id', id).select('id');
  return !!data?.length;
}

// ── Sending (gated; nothing here runs until sending is switched on) ──────────

const unsubscribeUrl = (id: string) => `${cfg().site}/api/future-str/unsubscribe?s=${id}&t=${sign('unsub', id)}`;
const confirmUrl = (id: string) => `${cfg().site}/api/future-str/confirm?s=${id}&t=${sign('confirm', id)}`;

async function deliver(to: string, subject: string, html: string, text: string, unsub: string) {
  const c = cfg();
  return getResendClient().emails.send({
    from: `${c.fromName} <${c.fromEmail}>`, to: [to], subject, html, text, replyTo: c.replyTo,
    headers: { 'List-Unsubscribe': `<${unsub}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
    tags: [{ name: 'kind', value: 'future_str' }],
  });
}

function assertReady() {
  const r = readiness();
  if (!r.sendingFlag) throw new Error('Sending is off. Set FUTURE_STR_SENDING_ENABLED=true when you are ready.');
  if (r.missing.length) throw new Error(`Missing settings: ${r.missing.join(', ')}`);
}

export async function previewIssue(issue: number, audience: Audience) {
  const c = cfg();
  return renderIssue(issue, audience, { siteUrl: c.site || 'https://example.invalid', unsubscribeUrl: '#unsubscribe', postal: c.postal || '[AVYRO AI postal address]', brandSite: c.brandSite });
}

/** Asks pending sign-ups to confirm. Dry run unless `go`. Each person is asked once. */
export async function sendConfirmations(db: Db, opts: { go: boolean; limit?: number }) {
  const { data } = await db.from('future_str_subscribers').select('id,email,audience,first_name').eq('status', 'pending').is('confirmation_sent_at', null).order('created_at').limit(opts.limit ?? 100);
  const list = data ?? [];
  if (!opts.go) return { pending: list.length, sent: 0, failed: 0 };
  assertReady();
  let sent = 0, failed = 0;
  for (const s of list) {
    const c = cfg();
    const hi = s.first_name ? `Hi ${s.first_name},` : 'Hello,';
    const text = `${hi}\n\nYou asked to hear from AVYRO AI about our research into the future of vacation rental operations. Please confirm your email address so we know it is really you:\n\n${confirmUrl(s.id)}\n\nIf you did not ask for this, ignore this email and we will not contact you again.\n\nAVYRO AI, ${c.postal}\n`;
    const html = `<p style="font:16px/1.6 Georgia,serif;color:#1a2230;">${hi}</p><p style="font:16px/1.6 Georgia,serif;color:#1a2230;">You asked to hear from AVYRO AI about our research into the future of vacation rental operations. Please confirm your email address so we know it is really you.</p><p><a href="${confirmUrl(s.id)}" style="display:inline-block;padding:12px 24px;background:#1f7ae0;color:#fff;font:700 15px Arial,sans-serif;text-decoration:none;border-radius:8px;">Confirm my email</a></p><p style="font:13px/1.5 Arial,sans-serif;color:#6b7686;">If you did not ask for this, ignore this email and we will not contact you again.<br>AVYRO AI, ${c.postal}</p>`;
    try {
      const { error } = await deliver(s.email, 'Please confirm your email: AVYRO AI research updates', html, text, unsubscribeUrl(s.id));
      if (error) throw new Error(error.message);
      await db.from('future_str_subscribers').update({ confirmation_sent_at: new Date().toISOString() }).eq('id', s.id); sent++;
    } catch { failed++; }
  }
  return { pending: list.length, sent, failed };
}

/** Sends one issue to confirmed subscribers who have not had it. `testTo` sends a single [TEST] copy instead. */
export async function sendIssue(db: Db, opts: { issue: number; audience: Audience; go: boolean; testTo?: string; limit?: number }) {
  if (opts.testTo) {
    assertReady();
    if (!EMAIL_RE.test(opts.testTo)) throw new Error('That test address is not valid.');
    const c = cfg();
    const mail = renderIssue(opts.issue, opts.audience, { siteUrl: c.site, unsubscribeUrl: `${c.site}/api/future-str/unsubscribe?s=test`, postal: c.postal, brandSite: c.brandSite });
    const { error } = await deliver(opts.testTo, `[TEST] ${mail.subject}`, mail.html, mail.text, `${c.site}/api/future-str/unsubscribe?s=test`);
    if (error) throw new Error(error.message);
    return { eligible: 0, sent: 1, failed: 0, test: true };
  }
  const { data: subs } = await db.from('future_str_subscribers').select('id,email').eq('status', 'confirmed').eq('audience', opts.audience).limit(5000);
  const { data: done } = await db.from('future_str_sends').select('subscriber_id').eq('issue', opts.issue);
  const had = new Set((done ?? []).map(d => d.subscriber_id as string));
  const todo = (subs ?? []).filter(s => !had.has(s.id)).slice(0, opts.limit ?? 200);
  if (!opts.go) return { eligible: todo.length, sent: 0, failed: 0, test: false };
  assertReady();
  const c = cfg(); let sent = 0, failed = 0;
  for (const s of todo) {
    const mail = renderIssue(opts.issue, opts.audience, { siteUrl: c.site, unsubscribeUrl: unsubscribeUrl(s.id), postal: c.postal, brandSite: c.brandSite });
    try {
      const { data, error } = await deliver(s.email, mail.subject, mail.html, mail.text, unsubscribeUrl(s.id));
      if (error) throw new Error(error.message);
      await db.from('future_str_sends').insert({ subscriber_id: s.id, issue: opts.issue, resend_message_id: data?.id ?? null }); sent++;
    } catch { failed++; }
  }
  return { eligible: todo.length, sent, failed, test: false };
}

// ── Reporting (admin) ─────────────────────────────────────────────────────────

const tally = (rows: Row[], f: (r: Row) => string | string[] | null) => {
  const out: Record<string, number> = {};
  for (const r of rows) { const v = f(r); for (const k of Array.isArray(v) ? v : v ? [v] : []) out[k] = (out[k] ?? 0) + 1; }
  return out;
};

export async function futureStrReport(db: Db) {
  const { data: resp } = await db.from('future_str_responses').select('*').order('created_at', { ascending: false }).limit(2000);
  const { data: subs } = await db.from('future_str_subscribers').select('id,email,audience,first_name,status,created_at,confirmed_at').limit(5000);
  const responses = resp ?? [], subscribers = subs ?? [];
  const home = responses.filter(r => r.audience === 'homeowner'), op = responses.filter(r => r.audience === 'operator');
  const byId = new Map(subscribers.map(s => [s.id as string, s]));
  const count = (aud: string, st: string) => subscribers.filter(s => s.audience === aud && s.status === st).length;
  return {
    readiness: readiness(),
    totals: { responses: responses.length, homeowner: home.length, operator: op.length },
    subscribers: { homeowner: { pending: count('homeowner', 'pending'), confirmed: count('homeowner', 'confirmed'), unsubscribed: count('homeowner', 'unsubscribed') }, operator: { pending: count('operator', 'pending'), confirmed: count('operator', 'confirmed'), unsubscribed: count('operator', 'unsubscribed') } },
    homeowner: { comfort: tally(home, r => r.comfort), concerns: tally(home, r => r.concerns), interests: tally(home, r => r.interests) },
    operator: { roles: tally(op, r => r.role), sizes: tally(op, r => r.portfolio_size), pay: tally(op, r => r.pay_interest), concerns: tally(op, r => r.concerns), interests: tally(op, r => r.interests) },
    responses: responses.slice(0, 200).map(r => { const s = r.subscriber_id ? byId.get(r.subscriber_id) : null; return { id: r.id, at: r.created_at, audience: r.audience, comfort: r.comfort, concerns: r.concerns, interests: r.interests, role: r.role, size: r.portfolio_size, pay: r.pay_interest, comment: r.comment, email: s?.email ?? null, name: s?.first_name ?? null, status: s?.status ?? null }; }),
  };
}
export type FutureStrReport = Awaited<ReturnType<typeof futureStrReport>>;
