import { NextRequest, NextResponse } from 'next/server';
import { fail, sellerContext } from '@/lib/seller/api';

export const dynamic = 'force-dynamic';

/** GET: pending ownership claims: people who submitted an address AVYRO already holds. Shows the lead's own address next to what the claimant typed so a person can compare. */
export async function GET(req: NextRequest) {
  const ctx = await sellerContext(req);
  if ('error' in ctx) return ctx.error;
  let q = ctx.db.from('lead_owner_claims').select('id,lead_id,email,claimant_name,address_text,city,state,created_at').eq('status', 'pending').order('created_at', { ascending: false }).limit(200);
  if (ctx.orgId) q = q.eq('organization_id', ctx.orgId);
  const { data, error } = await q;
  if (error) return fail('Could not load the claims.', 500);
  const ids = [...new Set((data ?? []).map((c) => c.lead_id as string))];
  const { data: leads } = ids.length ? await ctx.db.from('leads').select('id,address,city,state,contact_name,owner_email').in('id', ids) : { data: [] };
  const byId = new Map((leads ?? []).map((l) => [l.id as string, l]));
  return NextResponse.json({ items: (data ?? []).map((c) => ({ ...c, lead: byId.get(c.lead_id as string) ?? null })) });
}
