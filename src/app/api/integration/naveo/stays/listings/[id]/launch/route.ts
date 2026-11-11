import { NextRequest, NextResponse } from 'next/server';
import { naveoSellerAccess } from '@/lib/seller/naveoAccess';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { findListing } from '@/lib/stays/db';

export const dynamic = 'force-dynamic';

/**
 * POST: release a staged home at market go-live. Only a draft home can launch; it becomes active and quality-approved, and the named person who signed
 * off is recorded on it. The go-live readiness checks happen before this call, in the market launch review.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const access = naveoSellerAccess(req.method, req.nextUrl.pathname, req.headers.get('x-naveo-key'));
  if (!access) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const body = (await req.json().catch(() => null)) as { signed_off_by?: unknown } | null;
  const by = typeof body?.signed_off_by === 'string' ? body.signed_off_by.trim().slice(0, 120) : '';
  if (!by) return NextResponse.json({ error: 'signed_off_by is required' }, { status: 400 });

  const db = getSupabaseAdmin();
  const { listing } = await findListing(db, access.organizationId, (await params).id, { liveOnly: false, columns: 'id,status' });
  if (!listing) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (listing.status === 'active') return NextResponse.json({ id: listing.id, status: 'active' });
  if (listing.status !== 'draft') return NextResponse.json({ error: 'not_staged' }, { status: 409 });

  const now = new Date().toISOString();
  const { error } = await db.from('stays_listings').update({
    status: 'active', quality_approved: true, quality_note: `Launched at market go-live, signed off by ${by} on ${now.slice(0, 10)}.`, updated_at: now,
  }).eq('id', listing.id).eq('status', 'draft');
  if (error) return NextResponse.json({ error: 'could_not_launch' }, { status: 500 });
  return NextResponse.json({ id: listing.id, status: 'active' });
}
