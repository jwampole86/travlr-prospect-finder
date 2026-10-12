import { NextRequest, NextResponse } from 'next/server';
import { requireAdminActor } from '@/lib/auth/apiAuthorization';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import type { HomesageRecord } from '@/lib/services/homesageSkipTrace';

/**
 * POST /api/cohost/confirm { propertyId, index }  (admin)
 * A person has looked at the photos or street view and chosen which candidate home this listing is. The listing becomes a confirmed
 * match with that home's owner and any Homesage contacts already looked up. A home already matched to another listing is refused.
 */
export async function POST(req: NextRequest) {
  const auth = await requireAdminActor(req);
  if (!auth.actor) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { propertyId, index } = await req.json().catch(() => ({})) as { propertyId?: string; index?: number };
  if (!propertyId || !Number.isInteger(index)) return NextResponse.json({ error: 'propertyId and index are required' }, { status: 400 });

  const db = getSupabaseAdmin();
  const { data: l } = await db.from('str_listings').select('property_id,match_status,match_candidates').eq('property_id', propertyId).maybeSingle();
  if (!l) return NextResponse.json({ error: 'Listing not found' }, { status: 404 });
  const c = ((l.match_candidates as any[] | null) ?? [])[index!];
  if (l.match_status !== 'ambiguous' || !c) return NextResponse.json({ error: 'There is no candidate home to confirm.' }, { status: 400 });
  const { count } = await db.from('str_listings').select('property_id', { count: 'exact', head: true }).eq('matched_address', c.address).eq('match_status', 'unique').neq('property_id', propertyId);
  if ((count ?? 0) > 0) return NextResponse.json({ error: 'That home is already matched to another listing.' }, { status: 409 });

  const hs = c.homesage as HomesageRecord | undefined;
  const now = new Date().toISOString();
  const matched_owner = {
    names: c.ownerNames?.length ? c.ownerNames : (hs?.persons ?? []).map(p => p.name), type: c.ownerType ?? null,
    mailing: c.mailing ?? hs?.persons?.[0]?.mailing ?? null, permitHolder: c.permitHolder ?? null, ownerOccupied: c.ownerOccupied ?? null,
    permit: c.permit ?? null, jurisdiction: c.jurisdiction ?? null, contact: c.contact ?? null, ...(hs ? { homesage: hs } : {}), confirmedBy: auth.actor.user.id, confirmedAt: now,
  };
  const { error } = await db.from('str_listings').update({ match_status: 'unique', matched_address: c.address, matched_owner, match_candidates: [c], matched_at: now }).eq('property_id', propertyId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
