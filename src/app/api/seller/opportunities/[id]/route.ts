import { NextRequest, NextResponse } from 'next/server';
import { fail, pick, sellerContext } from '@/lib/seller/api';
import { authorizationFor, currentConsents } from '@/lib/seller/consentLedger';
import { stageBlockers, type Opportunity } from '@/lib/seller/sellerPipeline';
import { ROUTE_PURPOSE, STAGES, type Stage } from '@/lib/seller/types';

const EDITABLE = [
  'authority_verified', 'authority_role', 'decision_status', 'timeline', 'occupancy', 'goals', 'condition_notes', 'price_expectation_low',
  'price_expectation_high', 'preferred_channel', 'route', 'partner_id', 'next_action', 'next_action_at', 'assigned_to', 'lost_reason',
] as const;

async function load(ctx: Exclude<Awaited<ReturnType<typeof sellerContext>>, { error: unknown }>, id: string) {
  let q = ctx.db.from('seller_opportunities').select('*').eq('id', id);
  if (ctx.orgId) q = q.eq('organization_id', ctx.orgId);
  const { data } = await q.maybeSingle();
  return data as Opportunity | null;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await sellerContext(req);
  if ('error' in ctx) return ctx.error;
  const { id } = await params;
  const opp = await load(ctx, id);
  if (!opp) return fail('Not found', 404);

  const purpose = opp.route ? ROUTE_PURPOSE[opp.route] : 'seller_consultation';
  const nextStage = STAGES[Math.min(STAGES.indexOf(opp.stage) + 1, STAGES.length - 1)];
  const [lead, assessments, agreements, revenue, consents, authorization, blockers] = await Promise.all([
    ctx.db.from('leads').select('id, contact_name, contact_phone, address, city, state, price, price_type, regulation_status, estimated_net_monthly').eq('id', opp.lead_id).maybeSingle(),
    ctx.db.from('service_assessments').select('*').eq('opportunity_id', id).order('service_line'),
    ctx.db.from('service_agreements').select('*').eq('opportunity_id', id).order('created_at', { ascending: false }),
    ctx.db.from('service_revenue').select('*').eq('opportunity_id', id).order('created_at', { ascending: false }),
    currentConsents(ctx.db, opp.lead_id),
    authorizationFor(ctx.db, opp.lead_id, purpose),
    stageBlockers(ctx.db, opp, nextStage),
  ]);
  return NextResponse.json({
    opportunity: opp, lead: lead.data, assessments: assessments.data ?? [], agreements: agreements.data ?? [], revenue: revenue.data ?? [],
    consents, authorization, nextStage, blockers,
  });
}

/** PATCH updates qualification fields, the route, or the stage. A stage move is refused with the list of what is still missing. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await sellerContext(req);
  if ('error' in ctx) return ctx.error;
  const { id } = await params;
  const opp = await load(ctx, id);
  if (!opp) return fail('Not found', 404);
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const patch = pick(body, EDITABLE);

  if (typeof body.stage === 'string') {
    if (!(STAGES as readonly string[]).includes(body.stage)) return fail('Unknown stage');
    const merged = { ...opp, ...patch } as Opportunity;
    const blockers = await stageBlockers(ctx.db, merged, body.stage as Stage);
    if (blockers.length) return fail('This step is not allowed yet.', 409, { blockers });
    patch.stage = body.stage;
  }

  if (typeof body.status === 'string') {
    if (!['open', 'paused', 'won', 'lost'].includes(body.status)) return fail('Unknown status');
    if (body.status === 'lost' && !(patch.lost_reason ?? opp.lost_reason)) return fail('Say why this opportunity was lost.');
    if (body.status === 'won' && opp.stage !== 'outcome' && opp.stage !== 'agreement') return fail('Move it to the agreement stage before marking it won.', 409);
    patch.status = body.status;
    if (body.status === 'won') patch.stage = 'outcome';
  }

  const route = (patch.route ?? opp.route) as Opportunity['route'];
  const authorization = await authorizationFor(ctx.db, opp.lead_id, route ? ROUTE_PURPOSE[route] : 'seller_consultation');
  patch.authorization_status = authorization.status;

  const { data, error } = await ctx.db.from('seller_opportunities').update(patch).eq('id', id).select('*').single();
  if (error) return fail(error.message, 422);
  return NextResponse.json({ opportunity: data });
}
