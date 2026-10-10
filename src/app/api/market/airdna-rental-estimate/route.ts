import { NextRequest, NextResponse } from 'next/server';
import { getRentalEstimate, searchShortTermRentals } from '@/lib/services/airdnaService';

/**
 * GET /api/market/airdna-rental-estimate
 * Short-term rental (Airbnb/VRBO) revenue estimate for a single address via
 * Airdna's Rentalizer, or an STR listing search for a location.
 *
 * Query params:
 *   address (required for estimate mode) — e.g. "1234 Main St, Miami, FL 33101"
 *   bedrooms, bathrooms, accommodates — optional property config for the estimate
 *   location (required for search mode instead of address) — city/neighborhood/region
 *   bedroomsMin/Max, bathroomsMin/Max, accommodatesMin/Max, pageSize — search filters
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const address = searchParams.get('address') || undefined;
  const location = searchParams.get('location') || undefined;

  if (!address && !location) {
    return NextResponse.json({ error: 'Either address (for a revenue estimate) or location (for a listing search) is required' }, { status: 400 });
  }

  if (address) {
    const bedrooms = searchParams.get('bedrooms') ? Number(searchParams.get('bedrooms')) : undefined;
    const bathrooms = searchParams.get('bathrooms') ? Number(searchParams.get('bathrooms')) : undefined;
    const accommodates = searchParams.get('accommodates') ? Number(searchParams.get('accommodates')) : undefined;

    const result = await getRentalEstimate({ address, bedrooms, bathrooms, accommodates });
    if (!result.ok) {
      return NextResponse.json({ error: result.error || 'Airdna Rentalizer request failed' }, { status: result.status || 503 });
    }
    return NextResponse.json({ estimate: result.estimate });
  }

  const result = await searchShortTermRentals({
    location: location!,
    bedroomsMin: searchParams.get('bedroomsMin') ? Number(searchParams.get('bedroomsMin')) : undefined,
    bedroomsMax: searchParams.get('bedroomsMax') ? Number(searchParams.get('bedroomsMax')) : undefined,
    bathroomsMin: searchParams.get('bathroomsMin') ? Number(searchParams.get('bathroomsMin')) : undefined,
    bathroomsMax: searchParams.get('bathroomsMax') ? Number(searchParams.get('bathroomsMax')) : undefined,
    accommodatesMin: searchParams.get('accommodatesMin') ? Number(searchParams.get('accommodatesMin')) : undefined,
    accommodatesMax: searchParams.get('accommodatesMax') ? Number(searchParams.get('accommodatesMax')) : undefined,
    pageSize: searchParams.get('pageSize') ? Number(searchParams.get('pageSize')) : undefined,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error || 'Airdna listing search failed' }, { status: result.status || 503 });
  }
  return NextResponse.json({ listings: result.listings, count: result.listings.length });
}
