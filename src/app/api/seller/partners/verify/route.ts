import { NextRequest, NextResponse } from 'next/server';
import { fail, sellerContext } from '@/lib/seller/api';
import { verifyLicense } from '@/lib/seller/licenseVerify';
import { partnerPatchFor } from '@/lib/seller/licenseApply';

export const maxDuration = 60;

/** POST { id } checks the partner's license against the state's published records (Arizona and Colorado) and stores what it found. */
export async function POST(req: NextRequest) {
  const ctx = await sellerContext(req);
  if ('error' in ctx) return ctx.error;
  const body = (await req.json().catch(() => ({}))) as { id?: string };
  if (typeof body.id !== 'string') return fail('id is required');
  let q = ctx.db.from('service_partners').select('id,name,contact_name,brokerage,responsible_broker,license_number,license_state,license_status').eq('id', body.id);
  if (ctx.orgId) q = q.eq('organization_id', ctx.orgId);
  const { data: partner } = await q.maybeSingle();
  if (!partner) return fail('Partner not found', 404);
  if (!partner.license_state || !partner.license_number) return fail('Add the license state and number first.');

  const result = await verifyLicense(partner.license_state, partner.license_number, [partner.contact_name, partner.name, partner.brokerage, partner.responsible_broker]);
  const patch = partnerPatchFor(result, partner);
  const { data, error } = await ctx.db.from('service_partners').update(patch).eq('id', partner.id).select('*').maybeSingle();
  if (error) return fail(error.message, 422);
  return NextResponse.json({ result, item: data });
}
