import { NextRequest, NextResponse } from 'next/server';
import { naveoSellerAccess } from '@/lib/seller/naveoAccess';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { MAX_ICAL_CHARS, MAX_ICAL_RANGES, parseIcal } from '@/lib/stays/ical';
import { findOwnedListing, ownerEmailFrom } from '@/lib/stays/owner';

export const dynamic = 'force-dynamic';

/**
 * POST { ical }: sync the home's calendar from an external iCal feed (Airbnb, Vrbo, a channel manager). NAVEO Stays fetches the feed and sends its text,
 * so AVYRO never requests a caller-supplied URL. Every earlier import for the home is replaced, so re-sending the feed keeps the dates current.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const access = naveoSellerAccess(req.method, req.nextUrl.pathname, req.headers.get('x-naveo-key'));
  if (!access) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const ownerEmail = ownerEmailFrom(req);
  if (!ownerEmail) return NextResponse.json({ error: 'owner_required' }, { status: 403 });
  const body = (await req.json().catch(() => null)) as { ical?: unknown } | null;
  if (typeof body?.ical !== 'string' || !body.ical.includes('BEGIN:VCALENDAR')) return NextResponse.json({ error: 'ical must be the text of an iCal feed' }, { status: 400 });
  if (body.ical.length > MAX_ICAL_CHARS) return NextResponse.json({ error: 'ical_too_large' }, { status: 413 });
  const ranges = parseIcal(body.ical);
  if (ranges.length > MAX_ICAL_RANGES) return NextResponse.json({ error: 'too_many_events' }, { status: 400 });

  const db = getSupabaseAdmin();
  const listing = await findOwnedListing(db, access.organizationId, (await params).id, ownerEmail, 'id');
  if (!listing) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const { data: previous } = await db.from('stays_calendar_blocks').select('id').eq('listing_id', listing.id).eq('source', 'ical');
  if (ranges.length) {
    const { error } = await db.from('stays_calendar_blocks').insert(ranges.map((r) => ({
      listing_id: listing.id, start_date: r.start, end_date: r.end, reason: 'other', source: 'ical', note: 'Synced from external calendar',
    })));
    if (error) return NextResponse.json({ error: 'could_not_import' }, { status: 500 });
  }
  const oldIds = (previous ?? []).map((b) => b.id);
  if (oldIds.length) await db.from('stays_calendar_blocks').delete().in('id', oldIds);
  return NextResponse.json({ listingId: listing.id, imported: ranges.length });
}
