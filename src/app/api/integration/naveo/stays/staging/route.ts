import { NextRequest, NextResponse } from 'next/server';
import { naveoSellerAccess } from '@/lib/seller/naveoAccess';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { stagedListing } from '@/lib/stays/listings';

export const dynamic = 'force-dynamic';

/** GET: homes staged (status draft) in one city, with the fields a go-live review checks. These are not public; only the key can read them. */
export async function GET(req: NextRequest) {
  const access = naveoSellerAccess(req.method, req.nextUrl.pathname, req.headers.get('x-naveo-key'));
  if (!access) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const city = req.nextUrl.searchParams.get('city')?.trim().slice(0, 80);
  if (!city) return NextResponse.json({ error: 'city is required' }, { status: 400 });
  const { data, error } = await getSupabaseAdmin().from('stays_listings').select('*')
    .eq('organization_id', access.organizationId).eq('status', 'draft').eq('city', city).order('created_at').limit(500);
  if (error) return NextResponse.json({ error: 'could_not_load_staged' }, { status: 500 });
  return NextResponse.json({ listings: (data ?? []).map(stagedListing) }, { headers: { 'cache-control': 'no-store' } });
}
