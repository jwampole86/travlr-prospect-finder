import { NextRequest, NextResponse } from 'next/server';
import { fail, sellerContext } from '@/lib/seller/api';

export const dynamic = 'force-dynamic';

/**
 * PATCH { action: 'approve' | 'dismiss' }: a person decides an ownership claim. Approving makes the claimant the owner of the lead, so they can see their own
 * submission, and replaces any earlier owner email; dismissing leaves everything as it was and the claim is not reopened by a repeat submission.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await sellerContext(req);
  if ('error' in ctx) return ctx.error;
  const action = ((await req.json().catch(() => ({}))) as { action?: unknown }).action;
  if (action !== 'approve' && action !== 'dismiss') return fail('action must be approve or dismiss');
  let q = ctx.db.from('lead_owner_claims').select('id,lead_id,email,status').eq('id', (await params).id);
  if (ctx.orgId) q = q.eq('organization_id', ctx.orgId);
  const { data: claim } = await q.maybeSingle();
  if (!claim) return fail('Not found', 404);
  if (claim.status !== 'pending') return fail('This claim was already decided.', 409);

  if (action === 'approve') {
    const { error } = await ctx.db.from('leads').update({ owner_email: claim.email, updated_at: new Date().toISOString() }).eq('id', claim.lead_id);
    if (error) return fail('Could not approve.', 500);
  }
  await ctx.db.from('lead_owner_claims').update({ status: action === 'approve' ? 'approved' : 'dismissed', decided_at: new Date().toISOString() }).eq('id', claim.id);
  return NextResponse.json({ ok: true, status: action === 'approve' ? 'approved' : 'dismissed' });
}
