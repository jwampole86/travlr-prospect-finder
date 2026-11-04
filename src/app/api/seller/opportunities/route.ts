import { NextRequest, NextResponse } from 'next/server';
import { fail, sellerContext } from '@/lib/seller/api';
import { detectSellerIntent } from '@/lib/seller/sellerIntent';
import { recordSellerSignal } from '@/lib/seller/sellerPipeline';

/** GET ?status=open|paused|won|lost|all&stage= lists opportunities with the lead's name and address. */
export async function GET(req: NextRequest) {
  const ctx = await sellerContext(req);
  if ('error' in ctx) return ctx.error;
  const status = req.nextUrl.searchParams.get('status') || 'open';
  const stage = req.nextUrl.searchParams.get('stage');
  let q = ctx.db.from('seller_opportunities').select('*').order('intent_score', { ascending: false }).order('created_at', { ascending: false }).limit(500);
  if (ctx.orgId) q = q.eq('organization_id', ctx.orgId);
  if (status !== 'all') q = q.eq('status', status);
  if (stage) q = q.eq('stage', stage);
  const { data, error } = await q;
  if (error) return fail(error.message, 500);

  const ids = [...new Set((data ?? []).map((o) => o.lead_id))];
  const leads = new Map<string, { contact_name: string | null; address: string | null; city: string | null; state: string | null }>();
  for (let i = 0; i < ids.length; i += 100) {
    const { data: rows } = await ctx.db.from('leads').select('id, contact_name, address, city, state').in('id', ids.slice(i, i + 100));
    for (const r of rows ?? []) leads.set(r.id, r);
  }
  return NextResponse.json({ items: (data ?? []).map((o) => ({ ...o, lead: leads.get(o.lead_id) ?? null })) });
}

/** POST { leadId, text? } flags a lead as a seller by hand, for example after a phone call. */
export async function POST(req: NextRequest) {
  const ctx = await sellerContext(req);
  if ('error' in ctx) return ctx.error;
  const body = await req.json().catch(() => ({})) as { leadId?: string; text?: string };
  if (!body.leadId) return fail('leadId is required');
  const text = (body.text || '').trim() || 'Flagged as a seller by a team member';
  const detected = detectSellerIntent(text);
  // A manual flag counts as an explicit signal even when the note has no sale wording.
  const intent = detected.level === 'none' ? { ...detected, level: 'explicit' as const, score: 60, signals: ['Flagged by a team member'] } : detected;
  try {
    const result = await recordSellerSignal(ctx.db, { leadId: body.leadId, source: 'manual', text, intent, organizationId: ctx.orgId });
    if (!result) return fail('Lead not found', 404);
    return NextResponse.json({ item: result.opportunity, created: result.created }, { status: result.created ? 201 : 200 });
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Could not create the opportunity', 422);
  }
}
