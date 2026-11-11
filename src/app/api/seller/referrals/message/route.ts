import { NextRequest, NextResponse } from 'next/server';
import { fail, sellerContext } from '@/lib/seller/api';
import { getResendClient, getResendFrom } from '@/lib/email/resend';
import { TEMPLATE_LABEL, leadRef, messageAllowed, renderPartnerMessage, type MessageTemplate } from '@/lib/seller/partnerMessages';

const TEMPLATES = Object.keys(TEMPLATE_LABEL) as MessageTemplate[];
const day = (iso: string | null | undefined) => (iso ? new Date(iso).toISOString().slice(0, 10) : null);

/** GET ?lead_id= or ?referral_id= returns the messages sent to partners about it, newest first. */
export async function GET(req: NextRequest) {
  const ctx = await sellerContext(req);
  if ('error' in ctx) return ctx.error;
  let q = ctx.db.from('partner_messages').select('id,referral_id,lead_id,template,to_address,subject,status,error,sent_at,created_at').order('created_at', { ascending: false }).limit(50);
  if (ctx.orgId) q = q.eq('organization_id', ctx.orgId);
  const lead = req.nextUrl.searchParams.get('lead_id');
  const ref = req.nextUrl.searchParams.get('referral_id');
  if (lead) q = q.eq('lead_id', lead);
  if (ref) q = q.eq('referral_id', ref);
  const { data, error } = await q;
  if (error) return fail(error.message, 500);
  return NextResponse.json({ items: data ?? [] });
}

/**
 * POST { referral_id, template } emails the partner. Always started by a person pressing a button, never automatic. The lead packet is
 * refused if the owner's permission to share is no longer recorded or the lead is marked do not contact.
 */
export async function POST(req: NextRequest) {
  const ctx = await sellerContext(req);
  if ('error' in ctx) return ctx.error;
  const body = (await req.json().catch(() => ({}))) as { referral_id?: string; template?: string };
  const template = TEMPLATES.find((t) => t === body.template);
  if (!body.referral_id || !template) return fail('referral_id and a known template are required');

  let rq = ctx.db.from('partner_referrals').select('*').eq('id', body.referral_id);
  if (ctx.orgId) rq = rq.eq('organization_id', ctx.orgId);
  const { data: ref } = await rq.maybeSingle();
  if (!ref) return fail('Referral not found', 404);
  const { data: partner } = await ctx.db.from('service_partners').select('id,name,contact_name,contact_email,preferred_invoice_email,payee_name,payment_method,payment_due_days').eq('id', ref.partner_id).maybeSingle();
  if (!partner) return fail('Partner not found', 404);
  const to = (template === 'closed' && partner.preferred_invoice_email) || partner.contact_email;
  if (!to) return fail(`Add an email address for ${partner.name} first.`);

  let mq = ctx.db.from('partner_messages').select('created_at').eq('referral_id', ref.id).eq('template', template).neq('status', 'failed').order('created_at', { ascending: false }).limit(1);
  if (ctx.orgId) mq = mq.eq('organization_id', ctx.orgId);
  const { data: last } = await mq.maybeSingle();
  const refused = messageAllowed(template, ref.status, last?.created_at ?? null);
  if (refused) return fail(refused, 409);

  const { data: lead } = await ctx.db.from('leads').select('address,city,state,zip,contact_name,owner_name,contact_phone').eq('id', ref.lead_id).maybeSingle();
  if (!lead) return fail('Lead not found', 404);
  if (template === 'intro') {
    let oq = ctx.db.from('seller_opportunities').select('authorization_status').eq('lead_id', ref.lead_id).in('status', ['open', 'paused', 'won']);
    if (ctx.orgId) oq = oq.eq('organization_id', ctx.orgId);
    const { data: opp } = await oq.maybeSingle();
    if (opp?.authorization_status !== 'authorized') return fail("The owner's permission to share their details is not recorded, so the lead packet was not sent.", 409);
    const { data: enr } = await ctx.db.from('lead_enrichments').select('do_not_contact').eq('lead_id', ref.lead_id).maybeSingle();
    if (enr?.do_not_contact === true) return fail('This lead is marked do not contact.', 409);
  }

  const address = [lead.address, lead.city, [lead.state, lead.zip].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  const meta = (ctx.actor.user.user_metadata ?? {}) as { full_name?: string };
  const sender = (meta.full_name ?? '').split(' ')[0] || 'The NAVEO Homes team';
  const { subject, text } = (() => {
    const m = renderPartnerMessage(template, {
      brand: 'NAVEO Homes', senderName: sender, partnerName: (partner.contact_name || partner.name).split(' ')[0] || partner.name, leadRef: leadRef(lead.state, ref.id, ref.sent_at), address, market: lead.city ?? null,
      ownerName: lead.owner_name || lead.contact_name || null, ownerPhone: lead.contact_phone ?? null, intent: 'The owner has agreed to be introduced to a licensed broker', feePercent: ref.fee_percent,
      protectionEndsOn: day(ref.protection_ends_at), payeeName: ref.payee_name_snapshot, paymentMethod: ref.payment_method_snapshot, paymentDueDays: ref.payment_due_days_snapshot,
      sentOn: day(ref.sent_at) ?? '', status: String(ref.status).replace('_', ' '), commissionNote: null
    });
    return { subject: m.subject, text: m.body };
  })();

  const base = { ...(ctx.orgId ? { organization_id: ctx.orgId } : {}), partner_id: partner.id, referral_id: ref.id, lead_id: ref.lead_id, template, to_address: to, subject, body: text, created_by: ctx.actor.user.id };
  try {
    const { data, error } = await getResendClient().emails.send({ from: getResendFrom('NAVEO Homes'), to: [to], replyTo: ctx.actor.user.email ?? undefined, subject, text });
    if (error) throw new Error(error.message);
    const { data: row } = await ctx.db.from('partner_messages').insert({ ...base, status: 'sent', provider_id: data?.id ?? null, sent_at: new Date().toISOString() }).select('id,template,to_address,subject,status,sent_at,created_at').single();
    return NextResponse.json({ item: row }, { status: 201 });
  } catch (e) {
    await ctx.db.from('partner_messages').insert({ ...base, status: 'failed', error: (e as Error).message.slice(0, 300) });
    return fail(`The email could not be sent: ${(e as Error).message}`, 502);
  }
}
