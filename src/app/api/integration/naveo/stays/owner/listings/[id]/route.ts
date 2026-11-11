import { NextRequest, NextResponse } from 'next/server';
import { naveoSellerAccess } from '@/lib/seller/naveoAccess';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { findOwnedListing, ownerEmailFrom } from '@/lib/stays/owner';

export const dynamic = 'force-dynamic';

/** PATCH: an owner pauses or resumes their own listing. Only active and paused are allowed here, and a home AVYRO has not approved can never be resumed by an owner. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const access = naveoSellerAccess(req.method, req.nextUrl.pathname, req.headers.get('x-naveo-key'));
  if (!access) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const ownerEmail = ownerEmailFrom(req);
  if (!ownerEmail) return NextResponse.json({ error: 'owner_required' }, { status: 403 });
  const body = (await req.json().catch(() => null)) as { status?: unknown } | null;
  const status = body?.status;
  if (status !== 'paused' && status !== 'active') return NextResponse.json({ error: 'status must be paused or active' }, { status: 400 });

  const db = getSupabaseAdmin();
  const listing = await findOwnedListing(db, access.organizationId, (await params).id, ownerEmail, 'id,status,quality_approved,str_eligible');
  if (!listing) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (listing.status === status) return NextResponse.json({ id: listing.id, status });
  if (listing.status !== 'active' && listing.status !== 'paused') return NextResponse.json({ error: 'not_changeable' }, { status: 409 });
  if (status === 'active' && (!listing.quality_approved || !listing.str_eligible)) return NextResponse.json({ error: 'not_approved' }, { status: 409 });

  const { error } = await db.from('stays_listings').update({ status, updated_at: new Date().toISOString() }).eq('id', listing.id);
  if (error) return NextResponse.json({ error: 'could_not_update_listing' }, { status: 500 });
  return NextResponse.json({ id: listing.id, status });
}
