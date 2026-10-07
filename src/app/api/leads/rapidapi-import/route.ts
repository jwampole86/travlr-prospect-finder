import { NextRequest, NextResponse } from 'next/server';
import { searchTruliaRentals, searchZillowProperties, NormalizedRentalListing } from '@/lib/services/rapidApiRealEstateService';

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
 *   provider: 'trulia' | 'zillow-search',
 *   location?: string,   // Trulia: city/state or ZIP, e.g. "Austin, TX"
 *   region?: string,      // Zillow: region slug, e.g. "austin-tx"
 *   maxPages?: number,    // default 1, capped at 5
 *   priceMin?, priceMax?, bedsMin?, bathsMin?: number, // Trulia only
 *   importedBy?: string,
 * }
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const provider = body?.provider as string;
  const maxPages = Math.min(MAX_PAGES, Math.max(1, Number(body?.maxPages) || 1));
  const importedBy = typeof body?.importedBy === 'string' ? body.importedBy : undefined;

  if (provider !== 'trulia' && provider !== 'zillow-search') {
    return NextResponse.json({ error: "provider must be 'trulia' or 'zillow-search'" }, { status: 400 });
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
    } else {
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
