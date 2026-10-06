import { NextRequest, NextResponse } from 'next/server';
import { searchRentalListings } from '@/lib/services/rentcastService';

/**
 * GET /api/listings/rentcast
 * Search active (or inactive) "for rent" listings via RentCast — replaces the
 * blocked Trulia/Zillow scraping path with a real, licensed listings API.
 *
 * Query params: city, state, zipCode, address, radius, propertyType, bedrooms,
 * bathrooms, status ('Active' | 'Inactive', default 'Active'), limit (<=500).
 * At least one of city, state, zipCode, or address is required.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const city = searchParams.get('city') || undefined;
  const state = searchParams.get('state') || undefined;
  const zipCode = searchParams.get('zipCode') || undefined;
  const address = searchParams.get('address') || undefined;
  const radius = searchParams.get('radius') ? Number(searchParams.get('radius')) : undefined;
  const propertyType = searchParams.get('propertyType') || undefined;
  const bedrooms = searchParams.get('bedrooms') || undefined;
  const bathrooms = searchParams.get('bathrooms') || undefined;
  const status = (searchParams.get('status') === 'Inactive' ? 'Inactive' : 'Active') as 'Active' | 'Inactive';
  const limit = searchParams.get('limit') ? Number(searchParams.get('limit')) : undefined;

  if (!city && !state && !zipCode && !address) {
    return NextResponse.json(
      { error: 'At least one of city, state, zipCode, or address is required' },
      { status: 400 }
    );
  }

  const result = await searchRentalListings({ city, state, zipCode, address, radius, propertyType, bedrooms, bathrooms, status, limit });

  if (!result.ok) {
    return NextResponse.json({ error: result.error || 'RentCast request failed' }, { status: result.status || 503 });
  }

  return NextResponse.json({ listings: result.listings, count: result.listings.length });
}
