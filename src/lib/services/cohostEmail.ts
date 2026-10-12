import 'server-only';
import { createHmac, timingSafeEqual } from 'crypto';
import type { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { getResendClient, getResendFrom } from '@/lib/email/resend';
import { ensureOfferLink, OFFER_SITE } from '@/lib/services/cohostOffer';
import { phonesFor } from '@/lib/services/cohostText';
import { contactablePersons } from '@/lib/services/homesageSkipTrace';

type Db = ReturnType<typeof getSupabaseAdmin>;
type Row = Record<string, any>;

const REPLY_TO = process.env.REPLY_ALERT_EMAIL ?? 'info@staytrvlr.com';
const POSTAL = process.env.COHOST_POSTAL_ADDRESS ?? '17 Coronel Pl, Aliso Viejo, CA 92656-1631';
const DAILY_CAP = 40;
const COOLDOWN_DAYS = 3;
const NO_EMAIL_STAGES = ['declined', 'not_a_fit'];
const EARLY_STAGES = ['identified', 'reviewed'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function secret(): string {
  const s = process.env.ESTIMATE_LINK_SECRET || process.env.CRON_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!s || /your-|placeholder/i.test(s)) throw new Error('No signing secret configured');
  return s;
}
const sign = (id: string) => createHmac('sha256', secret()).update(`cohost-unsub:${id}`).digest('base64url').slice(0, 22);
export const unsubscribeUrl = (id: string) => `${OFFER_SITE}/api/cohost/unsubscribe?m=${id}&t=${sign(id)}`;
export function verifyUnsubscribe(id: string, token: string): boolean {
  try { const a = Buffer.from(token), b = Buffer.from(sign(id)); return a.length === b.length && timingSafeEqual(a, b); } catch { return false; }
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
/** Plain letter layout: the body with its links made clickable, then the unsubscribe line and our postal address. */
export function buildHtml(body: string, unsub: string): string {
  const withLinks = esc(body).replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" style="color:#1d4ed8;">$1</a>').replace(/\n/g, '<br>');
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:Georgia,serif;max-width:600px;margin:0 auto;padding:32px 24px;color:#1a1a1a;line-height:1.7;font-size:15px;">
<div>${withLinks}</div>
<hr style="border:none;border-top:1px solid #e5e7eb;margin:32px 0;">
<p style="font-size:11px;color:#6b7280;line-height:1.5;">TRAVLR Vacation Homes, ${esc(POSTAL)}.<br>You are receiving this one-time introduction because your home is listed as a vacation rental. If you would rather not hear from us, <a href="${unsub}" style="color:#6b7280;">unsubscribe here</a> and we will not contact you again.</p>
</body></html>`;
}
const plainText = (body: string, unsub: string) => `${body}\n\n--\nTRAVLR Vacation Homes, ${POSTAL}\nTo stop hearing from us: ${unsub}`;

/** Addresses we may use for this owner: the contactable people on the property record and skip-trace matches, never a typed-in guess. */
export function knownEmails(owner: Row | null | undefined): string[] {
  const found = ((owner?.skipTrace?.results ?? []) as Row[]).flatMap(r => (r.found?.emails ?? []) as string[]);
  const hs = contactablePersons(owner).flatMap(p => [...p.emails].sort((a, b) => Number(b.tested) - Number(a.tested)).map(e => e.email));
  return [...new Set([...hs, ...found, owner?.contact?.email].filter((e): e is string => typeof e === 'string' && EMAIL_RE.test(e)).map(e => e.toLowerCase()))];
}

export interface NewEmail { propertyId: string; toEmail: string; toName?: string | null; subject: string; body: string }

export async function createCampaign(db: Db, input: { name: string; createdBy: string | null; items: NewEmail[] }): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const name = input.name.trim();
  if (name.length < 3 || name.length > 80) return { ok: false, error: 'Give the campaign a name of 3 to 80 characters.' };
  if (!input.items.length || input.items.length > 50) return { ok: false, error: 'Add between 1 and 50 emails.' };
  if (new Set(input.items.map(i => i.propertyId)).size !== input.items.length) return { ok: false, error: 'Each owner can appear only once in a campaign.' };
  const { data: listings } = await db.from('str_listings').select('property_id,pipeline_stage,matched_owner').in('property_id', input.items.map(i => i.propertyId));
  const byId = new Map((listings ?? []).map(l => [l.property_id as string, l]));
  const rows: Row[] = [];
  for (const it of input.items) {
    const l = byId.get(it.propertyId);
    if (!l) return { ok: false, error: `Unknown listing ${it.propertyId}.` };
    if (NO_EMAIL_STAGES.includes(l.pipeline_stage)) return { ok: false, error: `${it.propertyId} is marked declined or not a fit.` };
    const to = it.toEmail.trim().toLowerCase();
    if (!knownEmails(l.matched_owner).includes(to)) return { ok: false, error: `${to} is not an email we hold for that owner.` };
    if (!it.subject.trim() || !it.body.trim()) return { ok: false, error: 'Every email needs a subject and a body.' };
    const code = await ensureOfferLink(db, it.propertyId);
    rows.push({ property_id: it.propertyId, offer_code: code, to_email: to, to_name: it.toName ?? null, subject: it.subject.trim().slice(0, 200), body: it.body.trim() });
  }
  const { data: c, error } = await db.from('cohost_email_campaigns').insert({ name, created_by: input.createdBy }).select('id').single();
  if (error || !c) return { ok: false, error: error?.message ?? 'Could not create the campaign.' };
  const { error: me } = await db.from('cohost_email_messages').insert(rows.map(r => ({ ...r, campaign_id: c.id })));
  if (me) { await db.from('cohost_email_campaigns').delete().eq('id', c.id); return { ok: false, error: me.message }; }
  return { ok: true, id: c.id as string };
}

/** Everything that must be true before an email may go out. Returns the reason it may not, or null. */
async function blockReason(db: Db, m: Row): Promise<string | null> {
  if (!['draft', 'failed'].includes(m.status)) return m.status === 'canceled' ? 'This email was canceled.' : 'This email was already sent.';
  if (/\[[^\]]+\]|\{\{/.test(`${m.subject} ${m.body}`)) return 'The email still has a [placeholder] to fill in.';
  if (!EMAIL_RE.test(m.to_email)) return 'That is not a valid email address.';
  const { data: l } = await db.from('str_listings').select('pipeline_stage').eq('property_id', m.property_id).maybeSingle();
  if (!l) return 'Unknown listing.';
  if (NO_EMAIL_STAGES.includes(l.pipeline_stage)) return 'This prospect is marked declined or not a fit. Do not contact them.';
  const { data: link } = await db.from('cohost_offer_links').select('opted_out_at').eq('property_id', m.property_id).maybeSingle();
  if (link?.opted_out_at) return 'This owner opted out. Do not contact them.';
  const { data: bad } = await db.from('cohost_email_messages').select('id').eq('to_email', m.to_email).or('bounce_type.eq.hard,status.eq.opted_out').limit(1);
  if (bad?.length) return 'This address bounced or opted out before.';
  const since = new Date(Date.now() - COOLDOWN_DAYS * 86_400_000).toISOString();
  const { data: recent } = await db.from('cohost_email_messages').select('id').eq('to_email', m.to_email).neq('id', m.id).gte('sent_at', since).limit(1);
  if (recent?.length) return `This address was emailed in the last ${COOLDOWN_DAYS} days.`;
  const dayStart = new Date(); dayStart.setUTCHours(0, 0, 0, 0);
  const { count } = await db.from('cohost_email_messages').select('id', { count: 'exact', head: true }).gte('sent_at', dayStart.toISOString());
  if ((count ?? 0) >= DAILY_CAP) return `The daily limit of ${DAILY_CAP} co-host emails has been reached.`;
  return null;
}

async function deliver(m: Row, subject: string, to: string) {
  const unsub = unsubscribeUrl(m.id);
  return getResendClient().emails.send({
    from: getResendFrom(), to: [to], subject, html: buildHtml(m.body, unsub), text: plainText(m.body, unsub), replyTo: REPLY_TO,
    headers: { 'List-Unsubscribe': `<${unsub}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
    tags: [{ name: 'kind', value: 'cohost_email' }, { name: 'campaign_id', value: m.campaign_id }],
  });
}

export async function sendOne(db: Db, id: string, actorId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: m } = await db.from('cohost_email_messages').select('*').eq('id', id).maybeSingle();
  if (!m) return { ok: false, error: 'Unknown email.' };
  const why = await blockReason(db, m); if (why) return { ok: false, error: why };
  const now = new Date().toISOString();
  try {
    const { data, error } = await deliver(m, m.subject, m.to_email);
    if (error) { await db.from('cohost_email_messages').update({ status: 'failed', failure_reason: error.message.slice(0, 300), updated_at: now }).eq('id', id); return { ok: false, error: error.message }; }
    await db.from('cohost_email_messages').update({ status: 'sent', sent_at: now, sent_by: actorId, resend_message_id: data?.id ?? null, failure_reason: null, updated_at: now }).eq('id', id);
    const { data: l } = await db.from('str_listings').select('pipeline_stage').eq('property_id', m.property_id).maybeSingle();
    if (l && EARLY_STAGES.includes(l.pipeline_stage)) await db.from('str_listings').update({ pipeline_stage: 'contacted', stage_updated_at: now }).eq('property_id', m.property_id);
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Send error';
    await db.from('cohost_email_messages').update({ status: 'failed', failure_reason: msg.slice(0, 300), updated_at: now }).eq('id', id);
    return { ok: false, error: msg };
  }
}

/** Sends the email, as written, to the person using the app so they can read it in a real inbox first. Nothing is recorded as sent. */
export async function testSend(db: Db, id: string, toEmail: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: m } = await db.from('cohost_email_messages').select('*').eq('id', id).maybeSingle();
  if (!m) return { ok: false, error: 'Unknown email.' };
  if (!EMAIL_RE.test(toEmail)) return { ok: false, error: 'Your account has no email address to test with.' };
  try {
    const { error } = await deliver(m, `[TEST] ${m.subject}`, toEmail);
    if (error) return { ok: false, error: error.message };
    await db.from('cohost_email_messages').update({ tested_at: new Date().toISOString() }).eq('id', id);
    return { ok: true };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : 'Send error' }; }
}

/** The owner asked not to be contacted (unsubscribe link or spam complaint): same effect as the opt-out on the offer page. */
export async function optOutOwner(db: Db, propertyId: string, reason: string) {
  const now = new Date().toISOString();
  const { data: link } = await db.from('cohost_offer_links').select('code').eq('property_id', propertyId).maybeSingle();
  if (link) { await db.from('cohost_offer_links').update({ opted_out_at: now }).eq('code', link.code); await db.from('cohost_offer_events').insert({ code: link.code, event: 'opt_out' }); }
  const { data: l } = await db.from('str_listings').select('pipeline_stage,matched_owner').eq('property_id', propertyId).maybeSingle();
  if (l && !['agreed', 'onboarded'].includes(l.pipeline_stage)) await db.from('str_listings').update({ pipeline_stage: 'declined', stage_updated_at: now }).eq('property_id', propertyId);
  for (const p of phonesFor(l?.matched_owner)) await db.from('sms_suppressions').upsert({ phone_e164: p.e164, reason: 'opt_out', last_message: reason }, { onConflict: 'phone_e164' });
  await db.from('cohost_email_messages').update({ status: 'opted_out', opted_out_at: now, updated_at: now }).eq('property_id', propertyId).in('status', ['draft', 'sent', 'delivered', 'opened']);
}

/** Resend delivery events for a campaign email. Returns false when the message id is not one of ours. */
export async function applyResendEvent(db: Db, messageId: string, type: string, at: string, bounce?: { type?: string; message?: string }, reason?: string): Promise<boolean> {
  const { data: m } = await db.from('cohost_email_messages').select('id,status,property_id').eq('resend_message_id', messageId).maybeSingle();
  if (!m) return false;
  const rank: Record<string, number> = { sent: 1, delivered: 2, opened: 3 };
  const u: Row = { updated_at: new Date().toISOString() };
  if (type === 'email.delivered' && (rank[m.status] ?? 0) < 2) Object.assign(u, { status: 'delivered', delivered_at: at });
  else if (type === 'email.opened' || type === 'email.clicked') Object.assign(u, { status: 'opened', opened_at: at, ...(m.status === 'sent' ? { delivered_at: at } : {}) });
  else if (type === 'email.bounced') Object.assign(u, { status: 'bounced', bounced_at: at, bounce_type: (bounce?.type ?? '').toLowerCase().includes('perm') ? 'hard' : 'soft', failure_reason: (bounce?.message ?? 'Bounced').slice(0, 300) });
  else if (type === 'email.failed') Object.assign(u, { status: 'failed', failure_reason: (reason ?? 'Send failed').slice(0, 300) });
  else if (type === 'email.complained') { await optOutOwner(db, m.property_id, 'marked a co-host email as spam'); return true; }
  else return true;
  await db.from('cohost_email_messages').update(u).eq('id', m.id);
  return true;
}

export async function logReply(db: Db, id: string, text: string) {
  const now = new Date().toISOString();
  const { data: m } = await db.from('cohost_email_messages').select('property_id').eq('id', id).maybeSingle();
  if (!m) return false;
  await db.from('cohost_email_messages').update({ replied_at: now, reply_text: text.slice(0, 1000), updated_at: now }).eq('id', id);
  const { data: l } = await db.from('str_listings').select('pipeline_stage').eq('property_id', m.property_id).maybeSingle();
  if (l && ['identified', 'reviewed', 'contacted'].includes(l.pipeline_stage)) await db.from('str_listings').update({ pipeline_stage: 'replied', stage_updated_at: now }).eq('property_id', m.property_id);
  return true;
}

// ── Reporting ─────────────────────────────────────────────────────────────────

export interface EmailRow {
  id: string; campaignId: string; propertyId: string; title: string; market: string; owner: string | null; stage: string | null; toEmail: string; subject: string; body: string;
  status: string; temperature: string; sentAt: string | null; deliveredAt: string | null; openedAt: string | null; bouncedAt: string | null; bounceType: string | null; failureReason: string | null;
  repliedAt: string | null; replyText: string | null; optedOutAt: string | null; testedAt: string | null;
  offer: { code: string | null; views: number; firstViewedAt: string | null; requested: boolean; requestedAt: string | null; ctaClicks: number };
}
export interface CampaignSummary { id: string; name: string; createdAt: string; emails: number; drafts: number; sent: number; canceled: number; firstSend: string | null }

export async function listCampaigns(db: Db): Promise<CampaignSummary[]> {
  const { data: cs } = await db.from('cohost_email_campaigns').select('id,name,created_at').order('created_at', { ascending: false }).limit(50);
  const { data: ms } = await db.from('cohost_email_messages').select('campaign_id,status,sent_at').limit(5000);
  return (cs ?? []).map(c => {
    const mine = (ms ?? []).filter(m => m.campaign_id === c.id);
    const sent = mine.filter(m => m.sent_at).length;
    return { id: c.id as string, name: c.name as string, createdAt: c.created_at as string, emails: mine.length, drafts: mine.filter(m => m.status === 'draft' || m.status === 'failed').length, sent, canceled: mine.filter(m => m.status === 'canceled').length,
      firstSend: mine.map(m => m.sent_at as string | null).filter((x): x is string => !!x).sort()[0] ?? null };
  });
}

export async function campaignReport(db: Db, key: string) {
  let q = db.from('cohost_email_messages').select('*').order('created_at', { ascending: true }).limit(2000);
  if (key !== 'all') q = q.eq('campaign_id', key);
  const { data: msgs } = await q;
  const list = msgs ?? [];
  const ids = [...new Set(list.map(m => m.property_id as string))];
  const { data: listings } = ids.length ? await db.from('str_listings').select('property_id,title,market,pipeline_stage,matched_owner').in('property_id', ids) : { data: [] as Row[] };
  const lm = new Map((listings ?? []).map(l => [l.property_id as string, l]));
  const codes = [...new Set(list.map(m => m.offer_code as string).filter(Boolean))];
  const first = list.map(m => m.sent_at as string | null).filter((x): x is string => !!x).sort()[0];
  const { data: ev } = codes.length && first ? await db.from('cohost_offer_events').select('code,event,is_bot,created_at').in('code', codes).gte('created_at', first).limit(5000) : { data: [] as Row[] };

  const rows: EmailRow[] = list.map(m => {
    const l = lm.get(m.property_id) ?? {};
    const mine = (ev ?? []).filter(e => e.code === m.offer_code && m.sent_at && Date.parse(e.created_at) >= Date.parse(m.sent_at) && !e.is_bot);
    const views = mine.filter(e => e.event === 'view').sort((a, b) => a.created_at.localeCompare(b.created_at));
    const req = mine.find(e => e.event === 'request');
    const status = m.status as string;
    const temperature = status === 'opted_out' ? 'opted_out' : ['bounced', 'failed'].includes(status) ? 'undeliverable' : status === 'canceled' ? 'canceled' : status === 'draft' ? 'draft'
      : m.replied_at || req ? 'hot' : views.length || m.opened_at ? 'warm' : 'cold';
    return {
      id: m.id, campaignId: m.campaign_id, propertyId: m.property_id, title: l.title ?? m.property_id, market: l.market ?? '', owner: m.to_name ?? l.matched_owner?.names?.[0] ?? null, stage: l.pipeline_stage ?? null,
      toEmail: m.to_email, subject: m.subject, body: m.body, status, temperature, sentAt: m.sent_at, deliveredAt: m.delivered_at, openedAt: m.opened_at, bouncedAt: m.bounced_at, bounceType: m.bounce_type, failureReason: m.failure_reason,
      repliedAt: m.replied_at, replyText: m.reply_text, optedOutAt: m.opted_out_at, testedAt: m.tested_at,
      offer: { code: m.offer_code, views: views.length, firstViewedAt: views[0]?.created_at ?? null, requested: !!req, requestedAt: req?.created_at ?? null, ctaClicks: mine.filter(e => e.event === 'cta_click').length },
    };
  });
  const n = (f: (r: EmailRow) => boolean) => rows.filter(f).length;
  const wasSent = (r: EmailRow) => !!r.sentAt;
  const totals = {
    emails: rows.length, drafts: n(r => r.status === 'draft'), sent: n(wasSent), delivered: n(r => !!r.deliveredAt || !!r.openedAt), opened: n(r => !!r.openedAt), viewed: n(r => r.offer.views > 0), clicked: n(r => r.offer.ctaClicks > 0),
    requested: n(r => r.offer.requested), replied: n(r => !!r.repliedAt), bounced: n(r => r.status === 'bounced' || r.status === 'failed'), optedOut: n(r => r.status === 'opted_out'), hot: n(r => r.temperature === 'hot'),
  };
  return { totals, rows, updatedAt: new Date().toISOString() };
}
export type CampaignReport = Awaited<ReturnType<typeof campaignReport>>;
