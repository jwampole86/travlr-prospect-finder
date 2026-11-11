import { NextRequest, NextResponse } from 'next/server';
import { naveoSellerAccess } from '@/lib/seller/naveoAccess';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { publicListing } from '@/lib/stays/listings';

export const dynamic = 'force-dynamic';

/** GET: one live listing (active and quality-approved) in the key's organization. Anything else is a 404, so a draft or paused home is never confirmed to exist. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const access = naveoSellerAccess(req.method, req.nextUrl.pathname, req.headers.get('x-naveo-key'));
  if (!access) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { id } = await params;
  const { data, error } = await getSupabaseAdmin().from('stays_listings').select('*').eq('id', id)
    .eq('organization_id', access.organizationId).eq('status', 'active').eq('quality_approved', true).maybeSingle();
  if (error) return NextResponse.json({ error: 'could_not_load_listing' }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  return NextResponse.json({ listing: publicListing(data) }, { headers: { 'cache-control': 'no-store' } });
}
