import { NextRequest, NextResponse } from 'next/server';
import { fail, sellerContext } from '@/lib/seller/api';
import { SERVICE_LINES } from '@/lib/seller/types';

/**
 * PATCH { serviceLine, eligibility, assumptions?, estMonthlyRevenue?, estMonthlyCost? }
 * Eligibility is a human decision: only a signed-in admin can mark a service eligible, and the reviewer is recorded.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await sellerContext(req);
  if ('error' in ctx) return ctx.error;
  const { id } = await params;
  const body = await req.json().catch(() => ({})) as { serviceLine?: string; eligibility?: string; assumptions?: string; estMonthlyRevenue?: number | null; estMonthlyCost?: number | null };
  if (!body.serviceLine || !(SERVICE_LINES as readonly string[]).includes(body.serviceLine)) return fail('Unknown service line');
  if (body.eligibility && !['needs_review', 'eligible', 'ineligible'].includes(body.eligibility)) return fail('Unknown eligibility');

  let owner = ctx.db.from('seller_opportunities').select('id').eq('id', id);
  if (ctx.orgId) owner = owner.eq('organization_id', ctx.orgId);
  if (!(await owner.maybeSingle()).data) return fail('Not found', 404);

  const patch: Record<string, unknown> = {};
  if (body.eligibility) { patch.eligibility = body.eligibility; patch.reviewed_by = body.eligibility === 'needs_review' ? null : ctx.actor.user.id; patch.reviewed_at = body.eligibility === 'needs_review' ? null : new Date().toISOString(); }
  if (body.assumptions !== undefined) patch.assumptions = body.assumptions;
  if (body.estMonthlyRevenue !== undefined) patch.est_monthly_revenue = body.estMonthlyRevenue;
  if (body.estMonthlyCost !== undefined) patch.est_monthly_cost = body.estMonthlyCost;

  const { data, error } = await ctx.db.from('service_assessments').update(patch).eq('opportunity_id', id).eq('service_line', body.serviceLine).select('*').maybeSingle();
  if (error) return fail(error.message, 422);
  if (!data) return fail('Assessment not found', 404);
  return NextResponse.json({ assessment: data });
}
