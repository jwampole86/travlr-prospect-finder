import { NextRequest, NextResponse } from 'next/server';
import { requireLeadAccess } from '@/lib/auth/apiAuthorization';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { daysOnMarketOf, estimateFill } from '@/lib/leadFill';

export const maxDuration = 30;

/** GET /api/leads/fill?leadId=  Values for blank estimate fields (gross, net, ADR, occupancy, rent) and days on market, for display only. */
export async function GET(req: NextRequest) {
  const leadId = new URL(req.url).searchParams.get('leadId') ?? '';
  if (!leadId) return NextResponse.json({ error: 'leadId is required' }, { status: 400 });
  const auth = await requireLeadAccess(req, leadId);
  if (!auth.actor) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { data: l } = await getSupabaseAdmin().from('leads').select('address,city,state,zip,estimated_gross_monthly,estimated_net_monthly,estimated_adr,estimated_occupancy,estimated_market_rent,days_on_market,days_on_market_listing,listing_date,listing_url,first_seen_at,created_at').eq('id', leadId).maybeSingle();
  if (!l) return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
  const missing = !Number(l.estimated_gross_monthly) || !Number(l.estimated_net_monthly) || !Number(l.estimated_adr) || !Number(l.estimated_occupancy) || !Number(l.estimated_market_rent);
  return NextResponse.json({ fill: await estimateFill(l), missing, daysOnMarket: daysOnMarketOf(l) });
}
