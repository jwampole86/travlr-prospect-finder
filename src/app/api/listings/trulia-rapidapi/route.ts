import { NextRequest, NextResponse } from 'next/server';
import { searchTruliaRentals } from '@/lib/services/rapidApiRealEstateService';

/**
 * GET /api/listings/trulia-rapidapi
 * Search active Trulia rental listings via the RapidAPI "Trulia Real Estate
 * Scraper" subscription.
 *
 * Query params: location (required, e.g. "Austin, TX" or a ZIP), page, sort
 * ('newest' | 'price_asc' | 'price_desc' | 'sqft_desc'), priceMin, priceMax,
 * bedsMin, bathsMin.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const location = searchParams.get('location');
  if (!location) {
    return NextResponse.json({ error: 'location is required' }, { status: 400 });
  }

  const page = searchParams.get('page') ? Number(searchParams.get('page')) : undefined;
  const sort = searchParams.get('sort') as 'newest' | 'price_asc' | 'price_desc' | 'sqft_desc' | null;
  const priceMin = searchParams.get('priceMin') ? Number(searchParams.get('priceMin')) : undefined;
  const priceMax = searchParams.get('priceMax') ? Number(searchParams.get('priceMax')) : undefined;
  const bedsMin = searchParams.get('bedsMin') ? Number(searchParams.get('bedsMin')) : undefined;
  const bathsMin = searchParams.get('bathsMin') ? Number(searchParams.get('bathsMin')) : undefined;

  const result = await searchTruliaRentals({ location, page, sort: sort || undefined, priceMin, priceMax, bedsMin, bathsMin });

  if (!result.ok) {
    return NextResponse.json({ error: result.error || 'Trulia request failed' }, { status: result.status || 503 });
  }

  return NextResponse.json({ listings: result.listings, count: result.listings.length });
}
