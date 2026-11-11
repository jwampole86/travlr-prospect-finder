import { NextRequest, NextResponse } from 'next/server';
import { fail, sellerContext } from '@/lib/seller/api';
import { REFERRAL_STATUSES, canMoveTo, referralBlockers, type ReferralStatus } from '@/lib/seller/partnerReferrals';

const isStatus = (v: unknown): v is ReferralStatus => typeof v === 'string' && (REFERRAL_STATUSES as readonly string[]).includes(v);
const text = (v: unknown, max: number) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);
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

/** POST sends one lead to a partner. Blocked unless the partner is cleared and the owner's permission to share is recorded. */
export async function POST(req: NextRequest) {
  const ctx = await sellerContext(req);
  if ('error' in ctx) return ctx.error;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const partnerId = text(body.partner_id, 64);
  const leadId = text(body.lead_id, 64);
  if (!partnerId || !leadId) return fail('partner_id and lead_id are required');

  let pq = ctx.db.from('service_partners').select('id,license_status,legal_reviewed,agreement_on_file,relationship_status,states').eq('id', partnerId);
  if (ctx.orgId) pq = pq.eq('organization_id', ctx.orgId);
  const { data: partner } = await pq.maybeSingle();
  if (!partner) return fail('Partner not found', 404);
  const blockers = referralBlockers(partner);

  let oq = ctx.db.from('seller_opportunities').select('id,authorization_status').eq('lead_id', leadId).in('status', ['open', 'paused']);
  if (ctx.orgId) oq = oq.eq('organization_id', ctx.orgId);
  const { data: opp } = await oq.maybeSingle();
  if (!opp) blockers.push('There is no open seller opportunity for this lead.');
  else if (opp.authorization_status !== 'authorized') blockers.push("The owner's permission to share their details with a partner is not recorded.");
  if (blockers.length) return fail('This lead cannot be sent to the partner yet.', 409, { blockers });

  const row = {
    ...(ctx.orgId ? { organization_id: ctx.orgId } : {}),
    partner_id: partnerId, lead_id: leadId, opportunity_id: opp?.id ?? null, property_label: text(body.property_label, 200), notes: text(body.notes, 1000),
    status: 'sent' as const, created_by: ctx.actor.user.id
  };
  const { data, error } = await ctx.db.from('partner_referrals').insert(row).select('*').single();
  if (error) return fail(error.code === '23505' ? 'This lead already has an open referral.' : error.message, error.code === '23505' ? 409 : 422);
  await ctx.db.from('partner_referral_updates').insert({ ...(ctx.orgId ? { organization_id: ctx.orgId } : {}), referral_id: data.id, status: 'sent', recorded_by: ctx.actor.user.id });
  return NextResponse.json({ item: data }, { status: 201 });
}

/** PATCH records a status the partner reported (with the date it applied) and keeps the history. */
export async function PATCH(req: NextRequest) {
  const ctx = await sellerContext(req);
  if ('error' in ctx) return ctx.error;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const id = text(body.id, 64);
  if (!id) return fail('id is required');
  let q = ctx.db.from('partner_referrals').select('id,status').eq('id', id);
  if (ctx.orgId) q = q.eq('organization_id', ctx.orgId);
  const { data: cur } = await q.maybeSingle();
  if (!cur) return fail('Not found', 404);

  const patch: Record<string, unknown> = {};
  if (body.status !== undefined) {
    if (!isStatus(body.status)) return fail('Unknown status');
    if (!canMoveTo(cur.status as ReferralStatus, body.status)) return fail(`A referral cannot move from ${cur.status} to ${body.status}.`, 409);
    patch.status = body.status;
    patch.status_at = when(body.status_at) ?? new Date().toISOString();
  }
  if ('mls_number' in body) patch.mls_number = text(body.mls_number, 40);
  if ('dead_reason' in body) patch.dead_reason = text(body.dead_reason, 300);
  if ('notes' in body) patch.notes = text(body.notes, 1000);
  if ('close_price' in body) {
    const n = Number(body.close_price);
    patch.close_price = body.close_price === '' || body.close_price === null ? null : Number.isFinite(n) && n >= 0 ? n : undefined;
    if (patch.close_price === undefined) return fail('close_price must be a number');
  }
  if (!Object.keys(patch).length) return fail('Nothing to change');
  const { data, error } = await ctx.db.from('partner_referrals').update(patch).eq('id', id).select('*').maybeSingle();
  if (error) return fail(error.message, 422);
  if (patch.status) {
    await ctx.db.from('partner_referral_updates').insert({
      ...(ctx.orgId ? { organization_id: ctx.orgId } : {}), referral_id: id, status: patch.status, status_at: patch.status_at, note: text(body.note, 300), recorded_by: ctx.actor.user.id
    });
  }
  return NextResponse.json({ item: data });
}
