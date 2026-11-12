import { NextRequest, NextResponse } from 'next/server';
import { ALREADY_LISTED_LABEL, alreadyListed, LISTING_COLUMNS } from '@/lib/seller/alreadyListed';
import { fail, sellerContext } from '@/lib/seller/api';
import { REFERRAL_STATUSES, canMoveTo, commercialBlockers, referralBlockers, scorePartner, type ReferralStatus } from '@/lib/seller/partnerReferrals';
import { partnerCoversState, stateBlockers } from '@/lib/seller/stateActivation';
import { authorizationFor } from '@/lib/seller/consentLedger';
import { feeAfterCommission, protectionEnds, withinProtection, type FeeStatus } from '@/lib/seller/partnerFees';

const isStatus = (v: unknown): v is ReferralStatus => typeof v === 'string' && (REFERRAL_STATUSES as readonly string[]).includes(v);
const text = (v: unknown, max: number) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);
const num = (v: unknown): number | null | undefined => (v === '' || v === null || v === undefined ? null : Number.isFinite(Number(v)) && Number(v) >= 0 ? Number(v) : undefined);
const day = (v: unknown): string | null => {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const t = Date.parse(v + 'T00:00:00Z');
  return Number.isFinite(t) && t <= Date.now() + 86_400_000 ? v : null;
};
const when = (v: unknown): string | null => {
  if (typeof v !== 'string' || !v) return null;
  const t = Date.parse(v);
  return Number.isFinite(t) && t <= Date.now() + 86_400_000 ? new Date(t).toISOString() : null;
};

/** GET lists referrals (optionally for one partner) with their status history. */
export async function GET(req: NextRequest) {
  const ctx = await sellerContext(req);
  if ('error' in ctx) return ctx.error;
  let q = ctx.db.from('partner_referrals').select('*').order('sent_at', { ascending: false }).limit(1000);
  if (ctx.orgId) q = q.eq('organization_id', ctx.orgId);
  const partnerId = req.nextUrl.searchParams.get('partner_id');
  if (partnerId) q = q.eq('partner_id', partnerId);
  const leadFilter = req.nextUrl.searchParams.get('lead_id');
  if (leadFilter) q = q.eq('lead_id', leadFilter);
  const { data, error } = await q;
  if (error) return fail(error.message, 500);
  const ids = (data ?? []).map((r) => r.id as string);
  let updates: Array<Record<string, unknown>> = [];
  if (ids.length) {
    const u = await ctx.db.from('partner_referral_updates').select('referral_id,status,status_at,note').in('referral_id', ids).order('status_at', { ascending: true });
    updates = u.data ?? [];
  }
  return NextResponse.json({ items: data ?? [], updates });
}

/** POST sends one lead to a partner. Blocked unless the partner and the lead's state are cleared and the owner's permission to share is recorded. */
export async function POST(req: NextRequest) {
  const ctx = await sellerContext(req);
  if ('error' in ctx) return ctx.error;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const partnerId = text(body.partner_id, 64);
  const leadId = text(body.lead_id, 64);
  if (!partnerId || !leadId) return fail('partner_id and lead_id are required');

  let pq = ctx.db.from('service_partners').select('*').eq('id', partnerId);
  if (ctx.orgId) pq = pq.eq('organization_id', ctx.orgId);
  const { data: partner } = await pq.maybeSingle();
  if (!partner) return fail('Partner not found', 404);
  const blockers = [...referralBlockers(partner), ...commercialBlockers(partner)];
  if (partner.do_not_assign) blockers.push('This partner is marked do not assign.');

  let oq = ctx.db.from('seller_opportunities').select('id,authorization_status').eq('lead_id', leadId).in('status', ['open', 'paused']);
  if (ctx.orgId) oq = oq.eq('organization_id', ctx.orgId);
  const { data: opp } = await oq.maybeSingle();
  if (!opp) blockers.push('There is no open seller opportunity for this lead.');
  // Checked live for sharing with a partner: the stored status follows the opportunity's route, which may not be set yet.
  else if ((await authorizationFor(ctx.db, leadId, 'partner_sharing')).status !== 'authorized') blockers.push("The owner's permission to share their details with a partner is not recorded.");

  // The property's state must be cleared by counsel, and the partner must be licensed there.
  const { data: lead } = await ctx.db.from('leads').select(`state,${LISTING_COLUMNS}`).eq('id', leadId).maybeSingle();
  const listed = alreadyListed(lead);
  if (listed.flag) blockers.push(`${ALREADY_LISTED_LABEL}: ${listed.reason ?? 'the home is listed with an agent.'} Seller-side referrals are not used on a home that is already listed.`);
  const state = typeof lead?.state === 'string' ? lead.state.toUpperCase() : null;
  let sq = ctx.db.from('state_activation').select('*').eq('state', state ?? '');
  if (ctx.orgId) sq = sq.eq('organization_id', ctx.orgId);
  const { data: activation } = state ? await sq.maybeSingle() : { data: null };
  blockers.push(...stateBlockers(activation, state));
  if (state && !partnerCoversState(partner, state)) blockers.push(`${partner.name} is not recorded as licensed in ${state}.`);

  // A partner who has stopped reporting gets no new leads until they catch up (Section 6.3 of the partner agreement).
  let rq = ctx.db.from('partner_referrals').select('status,sent_at,status_at').eq('partner_id', partnerId);
  if (ctx.orgId) rq = rq.eq('organization_id', ctx.orgId);
  const { data: history } = await rq;
  const score = scorePartner((history ?? []) as Array<{ status: ReferralStatus; sent_at: string; status_at: string }>);
  if (score.flag === 'stopped') blockers.push(`${partner.name} has stopped reporting: ${score.reason}`);
  if (blockers.length) return fail('This lead cannot be sent to the partner yet.', 409, { blockers });

  const sentAt = new Date().toISOString();
  // The terms are copied onto the referral so a later change to the partner never rewrites an old deal.
  const row = {
    ...(ctx.orgId ? { organization_id: ctx.orgId } : {}),
    partner_id: partnerId, lead_id: leadId, opportunity_id: opp?.id ?? null, property_label: text(body.property_label, 200), notes: text(body.notes, 1000),
    status: 'sent' as const, sent_at: sentAt, created_by: ctx.actor.user.id,
    fee_percent: partner.referral_fee_percent, protection_days: partner.protection_days, protection_ends_at: protectionEnds(sentAt, partner.protection_days),
    payment_method_snapshot: partner.payment_method, payee_name_snapshot: partner.payee_name, payment_due_days_snapshot: partner.payment_due_days
  };
  const { data, error } = await ctx.db.from('partner_referrals').insert(row).select('*').single();
  if (error) return fail(error.code === '23505' ? 'This lead already has an open referral.' : error.message, error.code === '23505' ? 409 : 422);
  await ctx.db.from('partner_referral_updates').insert({ ...(ctx.orgId ? { organization_id: ctx.orgId } : {}), referral_id: data.id, status: 'sent', recorded_by: ctx.actor.user.id });
  return NextResponse.json({ item: data }, { status: 201 });
}

/**
 * PATCH records what the partner reported (a status with the date it applied), or an event in the life of the fee: the commission the partner
 * received, the invoice, the payment, or a waiver. Statuses move forward only; a dead referral can come back while the protection period runs.
 */
export async function PATCH(req: NextRequest) {
  const ctx = await sellerContext(req);
  if ('error' in ctx) return ctx.error;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const id = text(body.id, 64);
  if (!id) return fail('id is required');
  let q = ctx.db.from('partner_referrals').select('*').eq('id', id);
  if (ctx.orgId) q = q.eq('organization_id', ctx.orgId);
  const { data: cur } = await q.maybeSingle();
  if (!cur) return fail('Not found', 404);

  const patch: Record<string, unknown> = {};
  let nextStatus: ReferralStatus = cur.status;
  let reopened = false;

  if (body.status !== undefined) {
    if (!isStatus(body.status)) return fail('Unknown status');
    const reopenable = cur.status === 'dead' && withinProtection(cur.protection_ends_at);
    if (!canMoveTo(cur.status, body.status, { reopenable })) {
      return fail(cur.status === 'dead' && !reopenable ? 'This referral is dead and its protection period has ended or was never set.' : `A referral cannot move from ${cur.status} to ${body.status}.`, 409);
    }
    reopened = cur.status === 'dead';
    nextStatus = body.status;
    patch.status = body.status;
    patch.status_at = when(body.status_at) ?? new Date().toISOString();
    if (reopened) { patch.reopened_at = new Date().toISOString(); patch.dead_reason = null; }
  }
  if ('mls_number' in body) patch.mls_number = text(body.mls_number, 40);
  if ('dead_reason' in body && !reopened) patch.dead_reason = text(body.dead_reason, 300);
  if ('notes' in body) patch.notes = text(body.notes, 1000);
  if ('close_price' in body) {
    const n = num(body.close_price);
    if (n === undefined) return fail('close_price must be a number');
    patch.close_price = n;
  }

  // The fee: set when the referral closes, filled in once the commission is known.
  const feeEvent = typeof body.fee_event === 'string' ? body.fee_event : null;
  const closing = nextStatus === 'closed' && cur.status !== 'closed';
  if (closing || feeEvent === 'commission_received') {
    if (nextStatus !== 'closed') return fail('A fee is only recorded on a closed referral.', 409);
    const commission = num('commission_received' in body ? body.commission_received : cur.commission_received);
    if (commission === undefined) return fail('commission_received must be a number');
    const received = day('commission_received_on' in body ? body.commission_received_on : cur.commission_received_on);
    if (feeEvent === 'commission_received' && (commission === null || !received)) return fail('Enter the commission the partner received and the date they received it.');
    if (cur.fee_status === 'paid' || cur.fee_status === 'waived') return fail('This fee is already settled.', 409);
    Object.assign(patch, { commission_received: commission, commission_received_on: received }, feeAfterCommission({ feePercent: cur.fee_percent, commissionReceived: commission, receivedOn: received, dueDays: cur.payment_due_days_snapshot }));
    if (cur.fee_status === 'invoiced' && patch.fee_status === 'due') patch.fee_status = 'invoiced';
  } else if (feeEvent) {
    if (cur.status !== 'closed') return fail('A fee is only recorded on a closed referral.', 409);
    if (feeEvent === 'invoiced') {
      if (cur.fee_status !== 'due') return fail('Only a fee that is due can be invoiced.', 409);
      Object.assign(patch, { fee_status: 'invoiced' satisfies FeeStatus, fee_invoiced_on: day(body.on) ?? new Date().toISOString().slice(0, 10) });
    } else if (feeEvent === 'paid') {
      if (cur.fee_status !== 'due' && cur.fee_status !== 'invoiced') return fail('Only a fee that is due or invoiced can be marked paid.', 409);
      const amount = num(body.amount);
      if (amount === undefined || amount === null) return fail('Enter the amount that was paid.');
      Object.assign(patch, { fee_status: 'paid' satisfies FeeStatus, fee_paid_amount: amount, fee_paid_on: day(body.on) ?? new Date().toISOString().slice(0, 10) });
    } else if (feeEvent === 'waived') {
      if (cur.fee_status === 'paid') return fail('This fee was already paid.', 409);
      Object.assign(patch, { fee_status: 'waived' satisfies FeeStatus });
    } else return fail('Unknown fee event');
  }
  // A referral that came back from dead starts over: no fee until it closes again.
  if (reopened && nextStatus !== 'closed') Object.assign(patch, { fee_status: 'not_due', fee_amount: null, fee_due_on: null });

  if (!Object.keys(patch).length) return fail('Nothing to change');
  const { data, error } = await ctx.db.from('partner_referrals').update(patch).eq('id', id).select('*').maybeSingle();
  if (error) return fail(error.code === '23505' ? 'Another referral for this lead is already open.' : error.message, error.code === '23505' ? 409 : 422);
  if (patch.status) {
    await ctx.db.from('partner_referral_updates').insert({
      ...(ctx.orgId ? { organization_id: ctx.orgId } : {}), referral_id: id, status: patch.status, status_at: patch.status_at, note: text(body.note, 300) ?? (reopened ? 'Back within the protection period' : null), recorded_by: ctx.actor.user.id
    });
  }
  return NextResponse.json({ item: data });
}
