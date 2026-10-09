/**
 * RapidAPI real-estate providers — Trulia rent search, Zillow property detail,
 * and Zillow (ToolzerHub) property search.
 *
 * SECURITY: RAPIDAPI_KEY_* are read server-side only, never exposed to the client.
 * Endpoints verified against each provider's published docs:
 *   - Trulia Real Estate Scraper (letsscrape): https://rapidapi.com/letsscrape/api/trulia-real-estate-scraper
 *   - Zillow Detail Scraper (benthepythondev0): https://rapidapi.com/benthepythondev0/api/zillow-detail-scraper1
 *   - Zillow Scraper API (ToolzerHub): https://docs.toolzerhub.com/reference/zillow
 *
 * All 3 subscriptions live under one RapidAPI account; any configured key works
 * against any of the 3 hosts (RapidAPI subscriptions are account-level). Multiple
 * RAPIDAPI_KEY_N env vars are supported and tried in order — a request only moves
 * to the next key on 401/403/429, so a second key acts as rate-limit headroom.
 */

const TRULIA_HOST = 'trulia-real-estate-scraper.p.rapidapi.com';
const ZILLOW_DETAIL_HOST = 'zillow-detail-scraper1.p.rapidapi.com';
const ZILLOW_SEARCH_HOST = 'zillow-scraper-api2.p.rapidapi.com';

function getRapidApiKeys(): string[] {
  return [process.env.RAPIDAPI_KEY_1, process.env.RAPIDAPI_KEY_2, process.env.RAPIDAPI_KEY_3]
    .filter((k): k is string => typeof k === 'string' && k.trim() !== '' && !/your-rapidapi-key/i.test(k));
}

interface RapidApiFetchResult {
  ok: boolean;
  status?: number;
  data?: unknown;
  error?: string;
}

async function rapidApiFetch(host: string, path: string, init: RequestInit = {}): Promise<RapidApiFetchResult> {
  const keys = getRapidApiKeys();
  if (keys.length === 0) {
    return { ok: false, error: 'No RAPIDAPI_KEY_* configured' };
  }

  let lastStatus: number | undefined;
  let lastError: string | undefined;

  for (const key of keys) {
    try {
      const res = await fetch(`https://${host}${path}`, {
        ...init,
        headers: { ...(init.headers || {}), 'X-RapidAPI-Key': key, 'X-RapidAPI-Host': host },
        signal: AbortSignal.timeout(30000),
      });

      // Only rotate to the next key on auth/quota failures — any other response
      // (including the provider's own 4xx/5xx) is a real answer, not a bad key.
      if (res.status === 401 || res.status === 403 || res.status === 429) {
        lastStatus = res.status;
        lastError = `HTTP ${res.status}`;
        continue;
      }

      const data = await res.json().catch(() => null);
      if (!res.ok) {
        return { ok: false, status: res.status, data, error: (data as { message?: string })?.message || `HTTP ${res.status}` };
      }
      return { ok: true, status: res.status, data };
    } catch (err) {
      // A network-level failure (timeout, DNS, connection reset) is a property
      // of the upstream host, not the key — retrying with a different key just
      // doubles/triples the wait for the same flaky provider. Fail fast instead.
      return { ok: false, error: err instanceof Error ? err.message : 'Request failed' };
    }
  }

  return { ok: false, status: lastStatus, error: lastError || 'All RapidAPI keys failed' };
}

// ─── Normalized listing shape (feeds directly into the CSV-import row contract) ──

export interface NormalizedRentalListing {
  source: 'Trulia' | 'Zillow';
  externalId?: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  latitude?: number;
  longitude?: number;
  beds: number | null;
  baths: number | null;
  price: number | null;
  sqftText?: string;
  listingUrl?: string;
  notes?: string;
}

// ─── Trulia — rent search ─────────────────────────────────────────────────────

export interface TruliaRentSearchParams {
  location: string;
  page?: number;
  sort?: 'newest' | 'price_asc' | 'price_desc' | 'sqft_desc';
  priceMin?: number;
  priceMax?: number;
  bedsMin?: number;
  bathsMin?: number;
}

interface TruliaListingRaw {
  location?: {
    city?: string; stateCode?: string; zipCode?: string; streetAddress?: string;
    communityLocation?: string;
    coordinates?: { latitude?: number; longitude?: number };
  };
  price?: { min?: number; max?: number; formattedPrice?: string };
  url?: string;
  homeUrl?: string | null;
  floorSpace?: { formattedDimension?: string };
  bedrooms?: { min?: number; max?: number };
  bathrooms?: { min?: number; max?: number };
  tags?: Array<{ formattedName?: string }>;
  metadata?: { compositeId?: string; legacyIdForSave?: string };
}

function normalizeTruliaListing(raw: TruliaListingRaw): NormalizedRentalListing {
  const loc = raw.location || {};
  const beds = raw.bedrooms;
  const baths = raw.bathrooms;
  const avgBeds = beds && (beds.min != null || beds.max != null)
    ? Math.round(((beds.min ?? beds.max ?? 0) + (beds.max ?? beds.min ?? 0)) / 2) : null;
  const avgBaths = baths && (baths.min != null || baths.max != null)
    ? Math.round((((baths.min ?? baths.max ?? 0) + (baths.max ?? baths.min ?? 0)) / 2) * 2) / 2 : null;
  const price = raw.price && (raw.price.min != null || raw.price.max != null)
    ? Math.round(((raw.price.min ?? raw.price.max ?? 0) + (raw.price.max ?? raw.price.min ?? 0)) / 2) : null;
  const rawUrl = raw.homeUrl || raw.url || '';
  const listingUrl = rawUrl ? (rawUrl.startsWith('http') ? rawUrl : `https://www.trulia.com${rawUrl}`) : undefined;
  const tagText = (raw.tags || []).map(t => t.formattedName).filter(Boolean).join('; ');
  const notesParts = [loc.communityLocation, raw.floorSpace?.formattedDimension, tagText].filter(Boolean);

  return {
    source: 'Trulia',
    externalId: raw.metadata?.compositeId || raw.metadata?.legacyIdForSave,
    address: loc.streetAddress || '',
    city: loc.city || '',
    state: loc.stateCode || '',
    zip: loc.zipCode || '',
    latitude: loc.coordinates?.latitude,
    longitude: loc.coordinates?.longitude,
    beds: avgBeds,
    baths: avgBaths,
    price,
    sqftText: raw.floorSpace?.formattedDimension,
    listingUrl,
    notes: notesParts.join(' | ').slice(0, 2000),
  };
}

/** GET /v1/search/rent — Trulia rental listings by city/state or ZIP. */
export async function searchTruliaRentals(
  params: TruliaRentSearchParams
): Promise<{ ok: boolean; listings: NormalizedRentalListing[]; error?: string; status?: number }> {
  const query = new URLSearchParams();
  // BUG WORKAROUND: the provider's `location` param reliably 500s for bare
  // ZIP codes ("Subject property not found"-style generic error, confirmed
  // live across 6/6 test ZIPs), even though the docs say ZIP is supported.
  // Trulia's real site uses /for_rent/{ZIP}_zip/ (note the _zip suffix) for
  // ZIP searches — passing that as the `url` override works reliably where
  // the bare `location=ZIP` param does not.
  const isBareZip = /^\d{5}(-\d{4})?$/.test(params.location.trim());
  if (isBareZip) {
    query.set('url', `https://www.trulia.com/for_rent/${params.location.trim().slice(0, 5)}_zip/`);
  } else {
    query.set('location', params.location);
    if (params.page) query.set('page', String(params.page));
    if (params.sort) query.set('sort', params.sort);
    if (params.priceMin != null) query.set('price_min', String(params.priceMin));
    if (params.priceMax != null) query.set('price_max', String(params.priceMax));
    if (params.bedsMin != null) query.set('beds_min', String(params.bedsMin));
    if (params.bathsMin != null) query.set('baths_min', String(params.bathsMin));
  }
  // When `url` is set, Trulia's provider ignores page/sort/filters and always
  // returns page 1 of that exact URL — only `location` mode supports them.

  const result = await rapidApiFetch(TRULIA_HOST, `/v1/search/rent?${query.toString()}`);
  if (!result.ok) {
    return { ok: false, listings: [], error: result.error, status: result.status };
  }

  const data = result.data as { data?: { listings?: TruliaListingRaw[] } };
  const listings = (data?.data?.listings || []).map(normalizeTruliaListing);
  return { ok: true, listings };
}

/** Lightweight reachability check — Trulia's provider is known to be slow (~60% service level). */
export async function getTruliaHealth(): Promise<{ status: 'ACTIVE' | 'AUTH_ERROR' | 'DISABLED' | 'DEGRADED'; message: string; hasApiKey: boolean }> {
  const keys = getRapidApiKeys();
  if (keys.length === 0) {
    return { status: 'DISABLED', message: 'No RAPIDAPI_KEY_* configured', hasApiKey: false };
  }
  const result = await rapidApiFetch(TRULIA_HOST, '/v1/search/rent?location=Austin%2C%20TX&page=1');
  if (result.status === 401 || result.status === 403) {
    return { status: 'AUTH_ERROR', message: 'RapidAPI key not subscribed to Trulia Real Estate Scraper', hasApiKey: true };
  }
  if (!result.ok) {
    return { status: 'DEGRADED', message: result.error || 'Trulia Real Estate Scraper unreachable (provider is known to be slow)', hasApiKey: true };
  }
  return { status: 'ACTIVE', message: 'Trulia Real Estate Scraper API is reachable', hasApiKey: true };
}

// ─── Zillow Detail Scraper — bulk property lookup by URL/ZPID/address ─────────

interface ZillowDetailRaw {
  input?: string;
  zpid?: string;
  url?: string;
  homeStatus?: string;
  homeType?: string;
  address?: string;
  street?: string;
  city?: string;
  state?: string;
  zip?: string;
  latitude?: number;
  longitude?: number;
  price?: number;
  rentZestimate?: number;
  bedrooms?: number;
  bathrooms?: number;
  livingArea?: number;
  agentName?: string;
  agentPhone?: string;
  error?: string;
}

function normalizeZillowDetail(raw: ZillowDetailRaw): NormalizedRentalListing {
  const isRental = raw.homeStatus === 'FOR_RENT';
  return {
    source: 'Zillow',
    externalId: raw.zpid,
    address: raw.street || raw.address || '',
    city: raw.city || '',
    state: raw.state || '',
    zip: raw.zip || '',
    latitude: raw.latitude,
    longitude: raw.longitude,
    beds: raw.bedrooms ?? null,
    baths: raw.bathrooms ?? null,
    price: (isRental ? raw.rentZestimate : raw.price) ?? raw.price ?? null,
    sqftText: raw.livingArea ? `${raw.livingArea} sqft` : undefined,
    listingUrl: raw.url,
    notes: [raw.homeStatus, raw.homeType, raw.agentName ? `Agent: ${raw.agentName}` : null, raw.agentPhone]
      .filter(Boolean).join(' | '),
  };
}

/** POST / — full Zillow record for up to 20 URLs, ZPIDs, or street addresses per request. */
export async function getZillowPropertyDetails(
  homes: string[]
): Promise<{ ok: boolean; listings: NormalizedRentalListing[]; error?: string; status?: number }> {
  if (homes.length === 0) {
    return { ok: false, listings: [], error: 'At least one home (URL, ZPID, or address) is required' };
  }
  const result = await rapidApiFetch(ZILLOW_DETAIL_HOST, '/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ homes: homes.slice(0, 20) }),
  });
  if (!result.ok) {
    return { ok: false, listings: [], error: result.error, status: result.status };
  }
  const rows = (Array.isArray(result.data) ? result.data : []) as ZillowDetailRaw[];
  const listings = rows.filter(r => !r.error).map(normalizeZillowDetail);
  return { ok: true, listings };
}

export async function getZillowDetailHealth(): Promise<{ status: 'ACTIVE' | 'AUTH_ERROR' | 'DISABLED' | 'DEGRADED'; message: string; hasApiKey: boolean }> {
  const keys = getRapidApiKeys();
  if (keys.length === 0) {
    return { status: 'DISABLED', message: 'No RAPIDAPI_KEY_* configured', hasApiKey: false };
  }
  const result = await rapidApiFetch(ZILLOW_DETAIL_HOST, '/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ homes: ['Austin, TX'] }),
  });
  if (result.status === 401 || result.status === 403) {
    return { status: 'AUTH_ERROR', message: 'RapidAPI key not subscribed to Zillow Detail Scraper', hasApiKey: true };
  }
  if (!result.ok) {
    return { status: 'DEGRADED', message: result.error || 'Zillow Detail Scraper unreachable', hasApiKey: true };
  }
  return { status: 'ACTIVE', message: 'Zillow Detail Scraper API is reachable', hasApiKey: true };
}

// ─── Zillow Scraper API (ToolzerHub) — region property search ─────────────────

export interface ZillowRegionSearchParams {
  region: string;
  status?: 'for_sale' | 'sold';
  page?: number;
}

interface ZillowSearchResultRaw {
  zpid?: string;
  url?: string;
  price?: number;
  bedrooms?: number;
  bathrooms?: number;
  living_area?: number;
  address?: string;
  street_address?: string;
  city?: string;
  state?: string;
  zipcode?: string;
  latitude?: number;
  longitude?: number;
  status_text?: string;
  broker_name?: string;
}

function normalizeZillowSearchResult(raw: ZillowSearchResultRaw): NormalizedRentalListing {
  return {
    source: 'Zillow',
    externalId: raw.zpid,
    address: raw.street_address || raw.address || '',
    city: raw.city || '',
    state: raw.state || '',
    zip: raw.zipcode || '',
    latitude: raw.latitude,
    longitude: raw.longitude,
    beds: raw.bedrooms ?? null,
    baths: raw.bathrooms ?? null,
    price: raw.price ?? null,
    sqftText: raw.living_area ? `${raw.living_area} sqft` : undefined,
    listingUrl: raw.url,
    notes: [raw.status_text, raw.broker_name ? `Broker: ${raw.broker_name}` : null].filter(Boolean).join(' | '),
  };
}

/** GET /v1/zillow/search — region listings (for_sale/sold only; Zillow does not expose rentals here). */
export async function searchZillowProperties(
  params: ZillowRegionSearchParams
): Promise<{ ok: boolean; listings: NormalizedRentalListing[]; error?: string; status?: number }> {
  const query = new URLSearchParams({ region: params.region });
  if (params.status) query.set('status', params.status);
  if (params.page) query.set('page', String(params.page));

  const result = await rapidApiFetch(ZILLOW_SEARCH_HOST, `/v1/zillow/search?${query.toString()}`);
  if (!result.ok) {
    return { ok: false, listings: [], error: result.error, status: result.status };
  }
  const data = result.data as { data?: { results?: ZillowSearchResultRaw[] } };
  const listings = (data?.data?.results || []).map(normalizeZillowSearchResult);
  return { ok: true, listings };
}

export async function getZillowSearchHealth(): Promise<{ status: 'ACTIVE' | 'AUTH_ERROR' | 'DISABLED' | 'DEGRADED'; message: string; hasApiKey: boolean }> {
  const keys = getRapidApiKeys();
  if (keys.length === 0) {
    return { status: 'DISABLED', message: 'No RAPIDAPI_KEY_* configured', hasApiKey: false };
  }
  // No free/unmetered health route is exposed through the RapidAPI gateway for this
  // provider (only its directly-hosted api.toolzerhub.com has one) — smallest real
  // paid call instead, same approach RentCast's health check uses.
  const result = await rapidApiFetch(ZILLOW_SEARCH_HOST, '/v1/zillow/search?region=austin-tx&page=1');
  if (result.status === 401 || result.status === 403) {
    return { status: 'AUTH_ERROR', message: 'RapidAPI key not subscribed to Zillow Scraper API', hasApiKey: true };
  }
  if (!result.ok) {
    return { status: 'DEGRADED', message: result.error || 'Zillow Scraper API unreachable', hasApiKey: true };
  }
  return { status: 'ACTIVE', message: 'Zillow Scraper API is reachable', hasApiKey: true };
}
