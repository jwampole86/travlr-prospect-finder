import { NextRequest, NextResponse } from 'next/server';
import { getZillowPropertyDetails } from '@/lib/services/rapidApiRealEstateService';

/**
 * POST /api/listings/zillow-detail
 * Full Zillow record lookup (price, Zestimate, history, agent, schools, photos)
 * via the RapidAPI "Zillow Detail Scraper" subscription.
 *
 * Body: { homes: string[] } — up to 20 Zillow URLs, ZPIDs, or street addresses.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const homes = Array.isArray(body?.homes) ? body.homes.filter((h: unknown) => typeof h === 'string') : [];

  if (homes.length === 0) {
    return NextResponse.json({ error: 'homes (array of URLs, ZPIDs, or addresses) is required' }, { status: 400 });
  }

  const result = await getZillowPropertyDetails(homes);

  if (!result.ok) {
    return NextResponse.json({ error: result.error || 'Zillow Detail Scraper request failed' }, { status: result.status || 503 });
  }

  return NextResponse.json({ listings: result.listings, count: result.listings.length });
}
