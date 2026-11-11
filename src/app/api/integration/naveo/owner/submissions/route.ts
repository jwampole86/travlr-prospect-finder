import { NextRequest, NextResponse } from 'next/server';
import { naveoSellerAccess } from '@/lib/seller/naveoAccess';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { ownerEmailFrom } from '@/lib/stays/owner';
import { ownerMilestone, ownerRecommendation } from '@/lib/seller/ownerView';

export const dynamic = 'force-dynamic';

/**
 * GET: the signed-in owner's own submissions (their email, passed in `x-owner-email` by NAVEO after it has authenticated them): the property, where it stands,
 * the recommendation they were shown and the partner introduced. Never other owners' leads, the intent score, fee terms or partner and broker notes.
 * A submission for an address AVYRO already held appears as a pending claim: only what the owner typed and that it was received, nothing from the existing record.
 */
export async function GET(req: NextRequest) {
  const access = naveoSellerAccess(req.method, req.nextUrl.pathname, req.headers.get('x-naveo-key'));
  if (!access) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const ownerEmail = ownerEmailFrom(req);
  if (!ownerEmail) return NextResponse.json({ error: 'owner_required' }, { status: 403 });

  const db = getSupabaseAdmin();
  const { data: leads, error } = await db.from('leads').select('id,address,city,state,created_at,regulation_status,estimated_net_monthly')
    .eq('organization_id', access.organizationId).eq('owner_email', ownerEmail).order('created_at', { ascending: false }).limit(50);
  if (error) return NextResponse.json({ error: 'could_not_load_submissions' }, { status: 500 });
  const ids = (leads ?? []).map((l) => l.id as string);
  const { data: claims } = await db.from('lead_owner_claims').select('lead_id,address_text,city,state,created_at')
    .eq('organization_id', access.organizationId).eq('email', ownerEmail).eq('status', 'pending').order('created_at', { ascending: false }).limit(20);
  const pending = (claims ?? []).filter((c) => !ids.includes(c.lead_id as string)).map((c) => ({
    lead_id: null, address: c.address_text, city: c.city, state: c.state, submitted_at: c.created_at,
    milestone: { key: 'verifying', label: 'Received. We are confirming ownership before showing more.' }, recommendation: null, partner: null,
  }));
  if (!ids.length) return NextResponse.json({ submissions: pending }, { headers: { 'cache-control': 'no-store' } });

  const [{ data: opps }, { data: refs }] = await Promise.all([
    db.from('seller_opportunities').select('*').eq('organization_id', access.organizationId).in('lead_id', ids).order('created_at', { ascending: false }),
    db.from('partner_referrals').select('lead_id,status,partner_id,created_at').eq('organization_id', access.organizationId).in('lead_id', ids).order('created_at', { ascending: false }),
  ]);
  const partnerIds = [...new Set((refs ?? []).map((r) => r.partner_id as string))];
  const { data: partners } = partnerIds.length ? await db.from('service_partners').select('id,name,brokerage').in('id', partnerIds) : { data: [] };
  const partnerById = new Map((partners ?? []).map((p) => [p.id as string, p]));

  const submissions = (leads ?? []).map((lead) => {
    const opp = (opps ?? []).find((o) => o.lead_id === lead.id) ?? null;
    const ref = (refs ?? []).find((r) => r.lead_id === lead.id) ?? null;
    const partner = ref ? partnerById.get(ref.partner_id as string) : null;
    return {
      lead_id: lead.id, address: lead.address, city: lead.city, state: lead.state, submitted_at: lead.created_at,
      milestone: ownerMilestone((ref?.status as string | undefined) ?? null, (opp?.status as string | undefined) ?? null),
      recommendation: ownerRecommendation(opp as Record<string, unknown> | null, lead as Record<string, unknown>),
      partner: partner ? { name: partner.name, brokerage: partner.brokerage } : null,
    };
  });
  return NextResponse.json({ submissions: [...submissions, ...pending] }, { headers: { 'cache-control': 'no-store' } });
}
