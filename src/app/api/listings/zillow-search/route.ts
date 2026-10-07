import { NextRequest, NextResponse } from 'next/server';
import { searchZillowProperties } from '@/lib/services/rapidApiRealEstateService';

/**
 * GET /api/listings/zillow-search
 * Region-based Zillow property search via the RapidAPI "Zillow Scraper API"
 * (ToolzerHub) subscription. NOTE: this provider only exposes for_sale/sold
 * listings, not rentals — use /api/listings/trulia-rapidapi for rentals.
 *
 * Query params: region (required, e.g. "austin-tx", a state, or a ZIP),
 * status ('for_sale' | 'sold', default 'for_sale'), page (1-20).
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const region = searchParams.get('region');
  if (!region) {
    return NextResponse.json({ error: 'region is required' }, { status: 400 });
  }

  const status = (searchParams.get('status') === 'sold' ? 'sold' : 'for_sale') as 'for_sale' | 'sold';
  const page = searchParams.get('page') ? Number(searchParams.get('page')) : undefined;

  const result = await searchZillowProperties({ region, status, page });

  if (!result.ok) {
    return NextResponse.json({ error: result.error || 'Zillow Scraper API request failed' }, { status: result.status || 503 });
  }

  return NextResponse.json({ listings: result.listings, count: result.listings.length });
}
