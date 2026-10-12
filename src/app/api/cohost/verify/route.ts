import { NextRequest, NextResponse } from 'next/server';
import { requireAdminActor } from '@/lib/auth/apiAuthorization';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { ownerEligibility, verifyOwner } from '@/lib/services/ownerVerification';
import { skipTraceListing } from '@/lib/services/strSkipTrace';

export const maxDuration = 120;

/**
 * POST /api/cohost/verify { propertyId }  (admin)
 * Cross-checks the owner of a registry-matched listing with a skip trace (name plus the county mailing address) and returns the updated
 * verification. Nothing is contacted. A property matched to more than one listing is refused, since the match cannot be trusted.
 */
export async function POST(req: NextRequest) {
  const auth = await requireAdminActor(req);
  if (!auth.actor) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { propertyId } = await req.json().catch(() => ({})) as { propertyId?: string };
  if (!propertyId || typeof propertyId !== 'string') return NextResponse.json({ error: 'propertyId is required' }, { status: 400 });

  const db = getSupabaseAdmin();
  const { data: row } = await db.from('str_listings').select('property_id,bedrooms,bathrooms,address_match_confidence,match_status,matched_address,matched_owner,match_candidates').eq('property_id', propertyId).maybeSingle();
  if (!row) return NextResponse.json({ error: 'Listing not found' }, { status: 404 });
  if (row.match_status !== 'unique' || !row.matched_owner) return NextResponse.json({ error: 'Only listings with a single registry match can be verified.' }, { status: 400 });
  const { count: shared } = await db.from('str_listings').select('property_id', { count: 'exact', head: true }).eq('matched_address', row.matched_address).eq('match_status', 'unique');
  if ((shared ?? 1) > 1) return NextResponse.json({ error: 'This property is matched to more than one listing, so it cannot be verified.' }, { status: 409 });
  const elig = ownerEligibility(row.matched_owner);
  if (!elig.eligible) return NextResponse.json({ error: elig.reason }, { status: 400 });

  let owner = row.matched_owner as Record<string, any>;
  if (!owner.skipTrace) {
    const t = await skipTraceListing(db, row as { property_id: string; matched_owner: Record<string, any> });
    if (t.error) return NextResponse.json({ error: t.error }, { status: 422 });
    owner = { ...owner, skipTrace: t.skipTrace };
  }
  const verification = verifyOwner({ ...row, matched_owner: owner, candidate: (row.match_candidates as any[])?.[0] ?? null, candidateCount: (row.match_candidates as any[])?.length ?? 0, sharedAddressCount: shared ?? 1 });
  return NextResponse.json({ verification });
}
