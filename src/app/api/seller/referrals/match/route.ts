import { NextRequest, NextResponse } from 'next/server';
import { fail, sellerContext } from '@/lib/seller/api';
import { ALREADY_LISTED_EXPLANATION, alreadyListed, currentListing, LISTING_COLUMNS } from '@/lib/seller/alreadyListed';
import { matchPartners, type MatchPartner, type MatchStats } from '@/lib/seller/partnerMatch';
import { isFinal, scorePartner, type ReferralStatus } from '@/lib/seller/partnerReferrals';
import { stateBlockers } from '@/lib/seller/stateActivation';

/** GET ?lead_id= ranks the signed partners who can take this lead, and says why each of the others cannot. */
export async function GET(req: NextRequest) {
  const ctx = await sellerContext(req);
  if ('error' in ctx) return ctx.error;
  const leadId = req.nextUrl.searchParams.get('lead_id');
  if (!leadId) return fail('lead_id is required');
  const { data: lead } = await ctx.db.from('leads').select(`state,city,county,property_type,price,price_type,${LISTING_COLUMNS}`).eq('id', leadId).maybeSingle();
  if (!lead) return fail('Lead not found', 404);
  const state = typeof lead.state === 'string' ? lead.state.toUpperCase() : null;

  let pq = ctx.db.from('service_partners').select('*').neq('relationship_status', 'ended').limit(500);
  if (ctx.orgId) pq = pq.eq('organization_id', ctx.orgId);
  const { data: partners } = await pq;
  let rq = ctx.db.from('partner_referrals').select('partner_id,status,sent_at,status_at').limit(5000);
  if (ctx.orgId) rq = rq.eq('organization_id', ctx.orgId);
  const { data: refs } = await rq;

  const stats = new Map<string, MatchStats>();
  for (const p of partners ?? []) {
    const mine = (refs ?? []).filter((r) => r.partner_id === p.id) as Array<{ status: ReferralStatus; sent_at: string; status_at: string }>;
    stats.set(p.id, { openLeads: mine.filter((r) => !isFinal(r.status)).length, score: scorePartner(mine), closed: mine.filter((r) => r.status === 'closed').length, assigned: mine.length });
  }
  const result = matchPartners((partners ?? []) as MatchPartner[], {
    state, city: lead.city ?? null, county: lead.county ?? null, propertyType: lead.property_type ?? null, salePrice: lead.price_type === 'sale' && Number(lead.price) > 0 ? Number(lead.price) : null
  }, stats);

  let aq = ctx.db.from('state_activation').select('*').eq('state', state ?? '');
  if (ctx.orgId) aq = aq.eq('organization_id', ctx.orgId);
  const { data: activation } = state ? await aq.maybeSingle() : { data: null };
  const listed = alreadyListed(lead);
  const listing = currentListing(lead);
  if (listed.flag) return NextResponse.json({ state, listing, stateBlockers: [], suggestions: [], rejected: [], needsPartner: false, alreadyListed: { label: listed.label, reason: listed.reason, explanation: ALREADY_LISTED_EXPLANATION } });
  return NextResponse.json({
    state, listing, stateBlockers: stateBlockers(activation, state),
    suggestions: result.suggestions.map((s) => ({ id: s.partner.id, name: s.partner.name, score: s.score, reasons: s.reasons })),
    rejected: result.rejected.map((r) => ({ id: r.partner.id, name: r.partner.name, why: r.why })),
    needsPartner: result.suggestions.length === 0
  });
}
