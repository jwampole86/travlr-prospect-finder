import { NextRequest, NextResponse, after } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { runFsboSkipTrace, isSkipTraceEligible } from '@/lib/services/fsboSkipTraceService';
import { searchTruliaRentals, searchZillowProperties, searchZillowRealEstate, searchRentCom, searchUsPropertyData, searchPadMapperRentals, searchHotPadsRentals, searchCraigslistRentals, toPadMapperLocation, getZillowPropertyDetails, NormalizedRentalListing } from '@/lib/services/rapidApiRealEstateService';

const CHUNK_SIZE = 50;
const MAX_PAGES = 5;
// PadMapper returns 20 listings per slug, so one import fans out over several slugs.
const PADMAPPER_MAX_LOCATIONS = 20;
// HotPads returns 5 listings per city (12k-request plan).
const HOTPADS_MAX_LOCATIONS = 20;
// Craigslist returns 5 listings per region and the plan allows only ~124 requests/month.
const CRAIGSLIST_MAX_REGIONS = 5;

/** "City, ST" locations configured for HotPads in sync_source_coverage for one state. */
async function hotPadsLocationsForState(stateCode: string): Promise<string[]> {
  const st = stateCode.trim().toLowerCase();
  const { data } = await getSupabaseAdmin()
    .from('sync_source_coverage')
    .select('zone, sync_url')
    .eq('source_name', 'HotPads')
    .in('status', ['active', 'unconfirmed']);
  const out = new Set<string>();
  for (const row of data || []) {
    const slug = /hotpads\.com\/([a-z0-9-]+)\//i.exec(row.sync_url || '')?.[1]?.toLowerCase();
    if (row.zone && slug?.endsWith(`-${st}`)) out.add(`${row.zone}, ${st.toUpperCase()}`);
  }
  return [...out];
}

/** City slugs (e.g. "aspen-co") configured for PadMapper in sync_source_coverage for one state. */
async function padMapperSlugsForState(stateCode: string): Promise<string[]> {
  const st = stateCode.trim().toLowerCase();
  const { data } = await getSupabaseAdmin()
    .from('sync_source_coverage')
    .select('sync_url')
    .eq('source_name', 'PadMapper')
    .eq('status', 'active');
  const slugs = new Set<string>();
  for (const row of data || []) {
    const slug = /padmapper\.com\/apartments\/([a-z0-9-]+)/i.exec(row.sync_url || '')?.[1]?.toLowerCase();
    if (slug && slug.endsWith(`-${st}`)) slugs.add(slug);
  }
  return [...slugs];
}

interface ImportRow {
  source: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  beds: number;
  baths: number;
  price: number;
  priceType: 'sale' | 'rent';
  rentEstimate?: number;
  listingAgentName?: string;
  listingAgentPhone?: string;
  listingBrokerName?: string;
  listingBrokerPhone?: string;
  mlsNumber?: string;
  mlsSourceName?: string;
  listingUpdatedAt?: string;
  isFsbo?: boolean;
  isApartmentCommunity?: boolean;
  propertyTypeLabel?: string;
  isFurnished?: boolean;
  notes: string;
  link?: string;
  stage: string;
  source_property_id?: string;
}

function toImportRow(listing: NormalizedRentalListing): ImportRow | null {
  if (!listing.city || !listing.state) return null;
  return {
    source: listing.source,
    // Some listings (confirmed live on Trulia) disclose no street address at
    // all — still worth leading on (city/state/zip + lat/long are real), but
    // the externalId keeps the placeholder unique so dedup doesn't collapse
    // multiple distinct undisclosed-address listings in the same zip together.
    address: listing.address || `Address Not Disclosed (${listing.source} ${listing.externalId || 'unknown'})`,
    city: listing.city,
    state: listing.state,
    zip: listing.zip,
    beds: listing.beds ?? 0,
    baths: listing.baths ?? 0,
    price: listing.price ?? 0,
    // 'sold' listings aren't an ongoing monthly cost either — treat like a sale price.
    priceType: listing.listingStatus === 'for_rent' ? 'rent' : 'sale',
    rentEstimate: listing.rentEstimate,
    listingAgentName: listing.listingAgentName,
    listingAgentPhone: listing.listingAgentPhone,
    listingBrokerName: listing.listingBrokerName,
    listingBrokerPhone: listing.listingBrokerPhone,
    mlsNumber: listing.mlsNumber,
    mlsSourceName: listing.mlsSourceName,
    listingUpdatedAt: listing.listingUpdatedAt,
    isFsbo: listing.isFsbo,
    isApartmentCommunity: listing.isApartmentCommunity,
    propertyTypeLabel: listing.propertyTypeLabel,
    isFurnished: listing.isFurnished,
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
 *   provider: 'trulia' | 'zillow-search' | 'zillow-real-estate' | 'rent-com' | 'us-property-data' | 'zillow-detail' | 'padmapper' | 'hotpads' | 'craigslist',
 *   // hotpads: 5 listings per city, city-level only (ZIPs fail). Pass location ("Austin, TX"), locations[], city+state,
 *   //   or state alone (uses HotPads rows in sync_source_coverage).
 *   // craigslist: 5 listings per region, ~124 requests/month TOTAL. Pass regions: [{ region: "austin", city: "Austin",
 *   //   state: "TX" }] (or region+city+state); capped at 5 regions per call. region is the craigslist subdomain.
 *   // padmapper: 20 listings per slug (no pagination). Pass ONE of: location ("austin-tx" or "austin-tx/78704"),
 *   //   locations[] of such slugs, city+state (+ optional zips[]), or state alone (uses the active PadMapper
 *   //   cities in sync_source_coverage). Per-ZIP slugs surface individual houses; city slugs mostly buildings.
 *   location?: string,   // Trulia/zillow-real-estate/us-property-data: city/state or ZIP, e.g. "Austin, TX"
 *   region?: string,      // Zillow (ToolzerHub): region slug, e.g. "austin-tx"
 *   city?, state?: string, // rent-com
 *   status?: 'for_sale' | 'for_rent' | 'sold', // zillow-real-estate / us-property-data
 *   urls?: string[],      // zillow-detail: up to 20 Zillow URLs, ZPIDs, or street addresses
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

  const VALID_PROVIDERS = ['trulia', 'zillow-search', 'zillow-real-estate', 'rent-com', 'us-property-data', 'zillow-detail', 'padmapper', 'hotpads', 'craigslist'];
  if (!VALID_PROVIDERS.includes(provider)) {
    return NextResponse.json({ error: `provider must be one of: ${VALID_PROVIDERS.join(', ')}` }, { status: 400 });
  }

  const allListings: NormalizedRentalListing[] = [];

  if (provider === 'zillow-detail') {
    const urls = Array.isArray(body?.urls) ? body.urls.filter((u: unknown) => typeof u === 'string' && u.trim()) : [];
    if (urls.length === 0) {
      return NextResponse.json({ error: 'urls (array of Zillow URLs, ZPIDs, or street addresses) is required for provider=zillow-detail' }, { status: 400 });
    }
    const result = await getZillowPropertyDetails(urls);
    if (!result.ok) {
      return NextResponse.json({ error: result.error || 'Zillow Detail Scraper request failed' }, { status: result.status || 503 });
    }
    allListings.push(...result.listings);
  } else if (provider === 'padmapper') {
    let slugs: string[] = [];
    if (Array.isArray(body?.locations)) {
      slugs = body.locations.filter((l: unknown): l is string => typeof l === 'string' && l.trim() !== '');
    } else if (typeof body?.location === 'string' && body.location.trim()) {
      slugs = [body.location];
    } else if (typeof body?.city === 'string' && typeof body?.state === 'string' && body.city.trim() && body.state.trim()) {
      const zips: string[] = Array.isArray(body?.zips) ? body.zips.map(String) : [];
      slugs = zips.length > 0
        ? zips.map(z => toPadMapperLocation(body.city, body.state, z))
        : [toPadMapperLocation(body.city, body.state)];
    } else if (typeof body?.state === 'string' && body.state.trim()) {
      slugs = await padMapperSlugsForState(body.state);
      if (slugs.length === 0) {
        return NextResponse.json({ error: `No active PadMapper cities configured in sync_source_coverage for state ${body.state}` }, { status: 404 });
      }
    } else {
      return NextResponse.json({ error: 'provider=padmapper needs location, locations[], city+state, or state' }, { status: 400 });
    }
    slugs = [...new Set(slugs.map(s => s.trim().toLowerCase()))].slice(0, PADMAPPER_MAX_LOCATIONS);

    const seen = new Set<string>();
    let failures = 0;
    let lastError: string | undefined;
    let lastStatus: number | undefined;
    for (const location of slugs) {
      const result = await searchPadMapperRentals({ location });
      if (!result.ok) {
        failures++;
        lastError = result.error;
        lastStatus = result.status;
        continue; // one bad slug must not discard the rest of the batch
      }
      for (const l of result.listings) {
        const key = l.externalId || `${l.address}|${l.zip}`;
        if (seen.has(key)) continue;
        seen.add(key);
        allListings.push(l);
      }
    }
    if (allListings.length === 0 && failures > 0) {
      return NextResponse.json({ error: lastError || 'PadMapper request failed' }, { status: lastStatus || 503 });
    }
  } else if (provider === 'hotpads') {
    let locations: string[] = [];
    if (Array.isArray(body?.locations)) {
      locations = body.locations.filter((l: unknown): l is string => typeof l === 'string' && l.trim() !== '');
    } else if (typeof body?.location === 'string' && body.location.trim()) {
      locations = [body.location];
    } else if (typeof body?.city === 'string' && typeof body?.state === 'string' && body.city.trim() && body.state.trim()) {
      locations = [`${body.city.trim()}, ${body.state.trim().toUpperCase()}`];
    } else if (typeof body?.state === 'string' && body.state.trim()) {
      locations = await hotPadsLocationsForState(body.state);
      if (locations.length === 0) {
        return NextResponse.json({ error: `No HotPads cities configured in sync_source_coverage for state ${body.state}; pass location or city+state` }, { status: 404 });
      }
    } else {
      return NextResponse.json({ error: 'provider=hotpads needs location, locations[], city+state, or state' }, { status: 400 });
    }
    locations = [...new Set(locations.map(l => l.trim()))].slice(0, HOTPADS_MAX_LOCATIONS);

    const seen = new Set<string>();
    let failures = 0;
    let lastError: string | undefined;
    let lastStatus: number | undefined;
    for (const location of locations) {
      const result = await searchHotPadsRentals({ location });
      if (!result.ok) {
        failures++;
        lastError = result.error;
        lastStatus = result.status;
        continue;
      }
      for (const l of result.listings) {
        const key = l.externalId || `${l.address}|${l.zip}`;
        if (seen.has(key)) continue;
        seen.add(key);
        allListings.push(l);
      }
    }
    if (allListings.length === 0 && failures > 0) {
      return NextResponse.json({ error: lastError || 'HotPads request failed' }, { status: lastStatus || 503 });
    }
  } else if (provider === 'craigslist') {
    type Region = { region: string; city: string; state: string };
    const requested: Region[] = Array.isArray(body?.regions)
      ? body.regions
      : (body?.region ? [{ region: body.region, city: body.city, state: body.state }] : []);
    const regions = requested
      .filter((r): r is Region => !!r && typeof r.region === 'string' && typeof r.city === 'string' && typeof r.state === 'string' && !!r.region.trim() && !!r.city.trim() && !!r.state.trim())
      .slice(0, CRAIGSLIST_MAX_REGIONS);
    if (regions.length === 0) {
      return NextResponse.json({ error: 'provider=craigslist needs regions[] (or region+city+state); Craigslist posts carry no city/state so the caller must supply them' }, { status: 400 });
    }

    const seen = new Set<string>();
    let failures = 0;
    let lastError: string | undefined;
    let lastStatus: number | undefined;
    for (const r of regions) {
      const result = await searchCraigslistRentals({ region: r.region, city: r.city, state: r.state.toUpperCase() });
      if (!result.ok) {
        failures++;
        lastError = result.error;
        lastStatus = result.status;
        continue;
      }
      for (const l of result.listings) {
        if (l.externalId && seen.has(l.externalId)) continue;
        if (l.externalId) seen.add(l.externalId);
        allListings.push(l);
      }
    }
    if (allListings.length === 0 && failures > 0) {
      return NextResponse.json({ error: lastError || 'Craigslist request failed' }, { status: lastStatus || 503 });
    }
  } else {
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
  }

  // Optional filter — import only specific listings matched by their
  // provider externalId (zpid/legacyId), e.g. to test a handful of named
  // properties before running a provider's full search result set.
  const externalIdFilter = Array.isArray(body?.externalIds)
    ? new Set(body.externalIds.map((id: unknown) => String(id)))
    : null;
  const filteredListings = externalIdFilter
    ? allListings.filter(l => l.externalId && externalIdFilter.has(l.externalId))
    : allListings;

  const rows = filteredListings.map(toImportRow).filter((r): r is ImportRow => r !== null);
  if (rows.length === 0) {
    return NextResponse.json({ error: 'No importable listings found (missing address/state on all results)' }, { status: 422 });
  }

  const origin = req.nextUrl.origin;
  const importBatchId = `batch-${provider}-${Date.now()}`;
  const totals: Record<string, number> = {};

  for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
    const chunk = rows.slice(i, i + CHUNK_SIZE);
    // csv-import treats an already-COMPLETED importBatchId as a duplicate submission and
    // returns the earlier summary without importing, so every chunk needs its own batch id —
    // otherwise only the first CHUNK_SIZE rows of any import were ever stored.
    const chunkBatchId = rows.length > CHUNK_SIZE ? `${importBatchId}-c${Math.floor(i / CHUNK_SIZE) + 1}` : importBatchId;
    const res = await fetch(`${origin}/api/leads/csv-import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        rows: chunk,
        importFilename: `rapidapi-${provider}-live-import.json`,
        importedBy,
        importBatchId: chunkBatchId,
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

  // Runs after the response is sent so a sync never waits on skip-trace API calls; the
  // cron route picks up anything this bounded pass doesn't reach.
  if (rows.some(r => isSkipTraceEligible({
    isFsbo: r.isFsbo, isApartmentCommunity: r.isApartmentCommunity, address: r.address,
    priceType: r.priceType, hasListingAttribution: !!(r.listingAgentName || r.listingBrokerName),
  }))) {
    after(async () => {
      try {
        await runFsboSkipTrace(getSupabaseAdmin(), { limit: 20, deadlineMs: 45_000 });
      } catch (err) {
        console.warn('[rapidapi-import] post-sync skip trace failed:', err instanceof Error ? err.message : err);
      }
    });
  }

  return NextResponse.json({ fetched: allListings.length, imported: rows.length, totals, importBatchId });
}
