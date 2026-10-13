import { NextRequest, NextResponse } from 'next/server';
import { requireLeadAccess } from '@/lib/auth/apiAuthorization';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { findListingLink } from '@/lib/services/listingLink';

export const maxDuration = 60;
const RETRY_DAYS = 14;
const DAILY_CAP = Number(process.env.LISTING_LINK_DAILY_LOOKUPS ?? 300);

/** POST /api/leads/listing-link {leadId}  Finds and saves the lead's listing link when none is stored. */
export async function POST(req: NextRequest) {
  const { leadId } = (await req.json().catch(() => ({}))) as { leadId?: string };
  if (!leadId) return NextResponse.json({ error: 'leadId is required' }, { status: 400 });
  const auth = await requireLeadAccess(req, leadId);
  if (!auth.actor) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const db = getSupabaseAdmin();
  const { data: l } = await db.from('leads').select('id,address,city,state,zip,beds,baths,price,listing_url,listing_link_lookup_at,listing_evidence').eq('id', leadId).maybeSingle();
  if (!l) return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
  const stored = typeof l.listing_url === 'string' && /^https?:\/\/[^/]+\/.+/.test(l.listing_url) ? l.listing_url : null;
  const missing = !Number(l.beds) || !Number(l.baths) || !Number(l.price);
  if (stored && !missing) return NextResponse.json({ status: 'found', url: stored, facts: {} });
  if (!l.address || !l.state) return NextResponse.json({ status: 'not_found', reason: 'address_incomplete' });
  if (l.listing_link_lookup_at && Date.now() - Date.parse(l.listing_link_lookup_at) < RETRY_DAYS * 86_400_000) {
    const rel = (l.listing_evidence as { related_zillow?: { url?: string; address?: string } } | null)?.related_zillow;
    return NextResponse.json(rel?.url ? { status: 'related', url: rel.url, address: rel.address ?? '' } : { status: 'not_found', reason: 'searched_recently' });
  }

  const { count } = await db.from('leads').select('id', { count: 'exact', head: true }).gte('listing_link_lookup_at', new Date(Date.now() - 86_400_000).toISOString());
  if ((count ?? 0) >= DAILY_CAP) return NextResponse.json({ status: 'error', reason: 'daily_limit' });

  return NextResponse.json(await findListingLink(db, l, stored));
}
