import { NextRequest, NextResponse } from 'next/server';
import { searchTruliaRentals, searchZillowProperties, searchZillowRealEstate, searchRentCom, searchUsPropertyData, NormalizedRentalListing } from '@/lib/services/rapidApiRealEstateService';

const CHUNK_SIZE = 50;
const MAX_PAGES = 5;

interface ImportRow {
  source: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  beds: number;
  baths: number;
  price: number;
  notes: string;
  link?: string;
  stage: string;
  source_property_id?: string;
}

function toImportRow(listing: NormalizedRentalListing): ImportRow | null {
  if (!listing.address || !listing.state) return null;
  return {
    source: listing.source,
    address: listing.address,
    city: listing.city,
    state: listing.state,
    zip: listing.zip,
    beds: listing.beds ?? 0,
    baths: listing.baths ?? 0,
    price: listing.price ?? 0,
    notes: [listing.sqftText, listing.notes].filter(Boolean).join(' | ').slice(0, 2000),
    link: listing.listingUrl,
    stage: 'New Lead',
    source_property_id: listing.externalId,
  };
}

/**
 * POST /api/leads/rapidapi-import
 * Bridges the RapidAPI listing search providers into the same import pipeline
 * used by CSV imports (dedup/enrichment/scoring/portfolio logic all live in
 * /api/leads/csv-import — this route only fetches + normalizes + forwards).
 *
 * Body: {
 *   provider: 'trulia' | 'zillow-search' | 'zillow-real-estate' | 'rent-com' | 'us-property-data',
 *   location?: string,   // Trulia/zillow-real-estate/us-property-data: city/state or ZIP, e.g. "Austin, TX"
 *   region?: string,      // Zillow (ToolzerHub): region slug, e.g. "austin-tx"
 *   city?, state?: string, // rent-com
 *   status?: 'for_sale' | 'for_rent' | 'sold', // zillow-real-estate / us-property-data
 *   maxPages?: number,    // default 1, capped at 5
 *   priceMin?, priceMax?, bedsMin?, bathsMin?: number, // Trulia/zillow-real-estate only
 *   importedBy?: string,
 * }
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const provider = body?.provider as string;
  const maxPages = Math.min(MAX_PAGES, Math.max(1, Number(body?.maxPages) || 1));
  const importedBy = typeof body?.importedBy === 'string' ? body.importedBy : undefined;

  const VALID_PROVIDERS = ['trulia', 'zillow-search', 'zillow-real-estate', 'rent-com', 'us-property-data'];
  if (!VALID_PROVIDERS.includes(provider)) {
    return NextResponse.json({ error: `provider must be one of: ${VALID_PROVIDERS.join(', ')}` }, { status: 400 });
  }

  const allListings: NormalizedRentalListing[] = [];
  for (let page = 1; page <= maxPages; page++) {
    if (provider === 'trulia') {
      const location = body?.location as string;
      if (!location) {
        return NextResponse.json({ error: 'location is required for provider=trulia' }, { status: 400 });
      }
      const result = await searchTruliaRentals({
        location, page,
        priceMin: body?.priceMin, priceMax: body?.priceMax,
        bedsMin: body?.bedsMin, bathsMin: body?.bathsMin,
      });
      if (!result.ok) {
        if (page === 1) return NextResponse.json({ error: result.error || 'Trulia request failed' }, { status: result.status || 503 });
        break; // later page failed — stop paginating, keep what we have
      }
      if (result.listings.length === 0) break;
      allListings.push(...result.listings);
    } else if (provider === 'zillow-search') {
      const region = body?.region as string;
      if (!region) {
        return NextResponse.json({ error: 'region is required for provider=zillow-search' }, { status: 400 });
      }
      const result = await searchZillowProperties({ region, status: body?.status === 'sold' ? 'sold' : 'for_sale', page });
      if (!result.ok) {
        if (page === 1) return NextResponse.json({ error: result.error || 'Zillow Scraper API request failed' }, { status: result.status || 503 });
        break;
      }
      if (result.listings.length === 0) break;
      allListings.push(...result.listings);
    } else if (provider === 'zillow-real-estate') {
      const location = body?.location as string;
      if (!location) {
        return NextResponse.json({ error: 'location is required for provider=zillow-real-estate' }, { status: 400 });
      }
      const result = await searchZillowRealEstate({
        location, page, status: body?.status, sort: body?.sort,
        priceMin: body?.priceMin, priceMax: body?.priceMax, bedsMin: body?.bedsMin,
      });
      if (!result.ok) {
        if (page === 1) return NextResponse.json({ error: result.error || 'Zillow Real Estate API request failed' }, { status: result.status || 503 });
        break;
      }
      if (result.listings.length === 0) break;
      allListings.push(...result.listings);
    } else if (provider === 'rent-com') {
      const city = body?.city as string;
      const state = body?.state as string;
      if (!city || !state) {
        return NextResponse.json({ error: 'city and state are required for provider=rent-com' }, { status: 400 });
      }
      const result = await searchRentCom({ city, state, locationSlug: body?.locationSlug, page, sort: body?.sort });
      if (!result.ok) {
        if (page === 1) return NextResponse.json({ error: result.error || 'Rent.com API request failed' }, { status: result.status || 503 });
        break;
      }
      if (result.listings.length === 0) break;
      allListings.push(...result.listings);
    } else {
      // us-property-data
      const location = body?.location as string;
      if (!location) {
        return NextResponse.json({ error: 'location is required for provider=us-property-data' }, { status: 400 });
      }
      const result = await searchUsPropertyData({ location, page, listingStatus: body?.status });
      if (!result.ok) {
        if (page === 1) return NextResponse.json({ error: result.error || 'US Property Data request failed' }, { status: result.status || 503 });
        break;
      }
      if (result.listings.length === 0) break;
      allListings.push(...result.listings);
    }
  }

  const rows = allListings.map(toImportRow).filter((r): r is ImportRow => r !== null);
  if (rows.length === 0) {
    return NextResponse.json({ error: 'No importable listings found (missing address/state on all results)' }, { status: 422 });
  }

  const origin = req.nextUrl.origin;
  const importBatchId = `batch-${provider}-${Date.now()}`;
  const totals: Record<string, number> = {};

  for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
    const chunk = rows.slice(i, i + CHUNK_SIZE);
    const res = await fetch(`${origin}/api/leads/csv-import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        rows: chunk,
        importFilename: `rapidapi-${provider}-live-import.json`,
        importedBy,
        importBatchId,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return NextResponse.json({ error: data?.error || `csv-import failed with HTTP ${res.status}`, totals }, { status: res.status });
    }
    for (const [key, value] of Object.entries(data?.summary || {})) {
      if (typeof value === 'number') totals[key] = (totals[key] || 0) + value;
    }
  }

  return NextResponse.json({ fetched: allListings.length, imported: rows.length, totals, importBatchId });
}
