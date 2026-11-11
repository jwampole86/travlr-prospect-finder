import { NextRequest, NextResponse } from 'next/server';
import { naveoSellerAccess } from '@/lib/seller/naveoAccess';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { publicListing } from '@/lib/stays/listings';

export const dynamic = 'force-dynamic';

/** GET: the NAVEO Stays listings guests may see: active and quality-approved, in the key's own organization. Read-only; `limit` (1-100) and `offset` page the results. */
export async function GET(req: NextRequest) {
  const access = naveoSellerAccess(req.method, req.nextUrl.pathname, req.headers.get('x-naveo-key'));
  if (!access) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const p = req.nextUrl.searchParams;
  const limit = Math.min(100, Math.max(1, Number.parseInt(p.get('limit') ?? '50', 10) || 50));
  const offset = Math.max(0, Number.parseInt(p.get('offset') ?? '0', 10) || 0);
  const { data, error } = await getSupabaseAdmin().from('stays_listings').select('*')
    .eq('organization_id', access.organizationId).eq('status', 'active').eq('quality_approved', true)
    .order('created_at', { ascending: false }).range(offset, offset + limit - 1);
  if (error) return NextResponse.json({ error: 'could_not_load_listings' }, { status: 500 });
  return NextResponse.json({ listings: (data ?? []).map(publicListing), limit, offset }, { headers: { 'cache-control': 'no-store' } });
}
