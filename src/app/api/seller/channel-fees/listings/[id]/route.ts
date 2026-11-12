import { NextRequest, NextResponse } from 'next/server';
import { fail, sellerContext } from '@/lib/seller/api';

export const dynamic = 'force-dynamic';

const isDate = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v;

/** PATCH: assign a home to a co-listing partner and record the day its homes went live (the start of the 60-day 0% window). Empty clears. Admin only. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await sellerContext(req);
  if ('error' in ctx) return ctx.error;
  const body = (await req.json().catch(() => ({}))) as { channel_partner?: unknown; channel_live_date?: unknown };
  const patch: Record<string, unknown> = {};
  if ('channel_partner' in body) {
    const v = typeof body.channel_partner === 'string' ? body.channel_partner.trim() : '';
    if (v.length > 120) return fail('The partner name can be up to 120 characters.');
    patch.channel_partner = v || null;
  }
  if ('channel_live_date' in body) {
    if (body.channel_live_date && !isDate(body.channel_live_date)) return fail('The live date must be YYYY-MM-DD.');
    patch.channel_live_date = body.channel_live_date || null;
  }
  if (!Object.keys(patch).length) return fail('Nothing to change.');
  let q = ctx.db.from('stays_listings').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', (await params).id);
  if (ctx.orgId) q = q.eq('organization_id', ctx.orgId);
  const { data, error } = await q.select('id,channel_partner,channel_live_date').maybeSingle();
  if (error) return fail('Could not save.', 500);
  if (!data) return fail('Not found', 404);
  return NextResponse.json({ item: data });
}
