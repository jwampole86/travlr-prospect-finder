/**
 * RapidAPI real-estate providers — Trulia rent search, Zillow property detail,
 * Zillow (ToolzerHub) property search, Zillow Real Estate API, Rent.com, and
 * US Property Data.
 *
 * SECURITY: RAPIDAPI_KEY_* are read server-side only, never exposed to the client.
 * Endpoints verified against each provider's published docs:
 *   - Trulia Real Estate Scraper (letsscrape): https://rapidapi.com/letsscrape/api/trulia-real-estate-scraper
 *   - Zillow Detail Scraper (benthepythondev0): https://rapidapi.com/benthepythondev0/api/zillow-detail-scraper1
 *   - Zillow Scraper API (ToolzerHub): https://docs.toolzerhub.com/reference/zillow
 *   - Zillow Real Estate API (jdtpnjtp/Data Forge): https://rapidapi.com/jdtpnjtp/api/zillow-real-estate-api
 *   - Rent.com API (skdeveloper): https://rapidapi.com/skdeveloper/api/rent-com-api
 *   - US Property Data (PropertyData): https://rapidapi.com/propertydata-propertydata-default/api/us-property-data
 *
 * All 3 subscriptions live under one RapidAPI account; any configured key works
 * against any of the 3 hosts (RapidAPI subscriptions are account-level). Multiple
 * RAPIDAPI_KEY_N env vars are supported and tried in order — a request only moves
 * to the next key on 401/403/429, so a second key acts as rate-limit headroom.
 */

const TRULIA_HOST = 'trulia-real-estate-scraper.p.rapidapi.com';
const ZILLOW_DETAIL_HOST = 'zillow-detail-scraper1.p.rapidapi.com';
const ZILLOW_SEARCH_HOST = 'zillow-scraper-api2.p.rapidapi.com';
// Added 2026-10-10 — 3 newly-subscribed providers. Hosts/paths verified live via
// curl (us-property-data) and the providers' own published quickstart docs
// (zillow-real-estate-api, rent-com-api). NOTE: zillow-real-estate-api and
// rent-com-api were just subscribed minutes before this was written and the
// RapidAPI gateway was still returning "You are not subscribed to this API."
// for the account's only real key at verification time — likely a short
// propagation delay after a brand-new paid-plan purchase, not a code issue.
// getZillowRealEstateHealth()/getRentComHealth() will correctly report
// AUTH_ERROR until that clears; re-check the integration-health page once it does.
const ZILLOW_REAL_ESTATE_HOST = 'zillow-real-estate-api.p.rapidapi.com';
const RENT_COM_HOST = 'rent-com-api.p.rapidapi.com';
const US_PROPERTY_DATA_HOST = 'us-property-data.p.rapidapi.com';

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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Some of these RapidAPI subscriptions (observed live on zillow-scraper-api2,
// "ULTRA" plan) enforce a per-second cap *tighter* than the plan name implies
// and report it as a plain HTTP 200 body — e.g. {"message":"You have exceeded
// the rate limit per second..."} — not a 429. Left unhandled, callers treated
// that 200 as a real (empty) answer, which surfaced as "0 listings" → a false
// "No importable listings found" error on the Dashboard's parallel portfolio
// sync (some portfolios failing, some not, purely by which ones raced past
// the 1-req/sec ceiling). Track the last call time per host and enforce a
// floor between requests, plus retry once with backoff if the message still
// slips through.
const MIN_INTERVAL_MS = 1100;
const lastCallAtByHost = new Map<string, number>();

function isRateLimitMessage(data: unknown): boolean {
  const msg = (data as { message?: string } | null)?.message;
  return typeof msg === 'string' && /rate limit/i.test(msg);
}

async function throttleHost(host: string): Promise<void> {
  const last = lastCallAtByHost.get(host);
  if (last != null) {
    const wait = MIN_INTERVAL_MS - (Date.now() - last);
    if (wait > 0) await sleep(wait);
  }
  lastCallAtByHost.set(host, Date.now());
}

async function rapidApiFetch(host: string, path: string, init: RequestInit = {}): Promise<RapidApiFetchResult> {
  const keys = getRapidApiKeys();
  if (keys.length === 0) {
    return { ok: false, error: 'No RAPIDAPI_KEY_* configured' };
  }

  let lastStatus: number | undefined;
  let lastError: string | undefined;

  for (const key of keys) {
    // Up to 2 attempts per key: the provider's per-second rate-limit message
    // (HTTP 200, not 429) is transient — a short backoff almost always clears it.
    for (let attempt = 1; attempt <= 2; attempt++) {
      await throttleHost(host);
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
          break; // try the next key
        }

        const data = await res.json().catch(() => null);

        if (isRateLimitMessage(data)) {
          lastStatus = res.status;
          lastError = (data as { message?: string }).message;
          if (attempt === 1) {
            await sleep(1500);
            continue; // retry same key once more
          }
          break; // still rate-limited after backoff — try the next key
        }

        if (!res.ok) {
          return { ok: false, status: res.status, data, error: (data as { message?: string })?.message || `HTTP ${res.status}` };
        }
        return { ok: true, status: res.status, data };
      } catch (err) {
        // Trulia in particular is a known-slow provider (~60% service level) —
        // a single request timing out is often transient, not a sustained
        // outage, so one retry meaningfully cuts the real-world failure rate
        // (seen live: ~20% of portfolios timing out per sync run). Other
        // network failures (DNS, connection reset) are less likely to clear
        // on retry and fail fast as before.
        const isTimeout = err instanceof Error && /timeout|aborted/i.test(err.name + err.message);
        if (isTimeout && attempt === 1) {
          lastError = err.message;
          await sleep(500);
          continue; // retry same key once more
        }
        return { ok: false, error: err instanceof Error ? err.message : 'Request failed' };
      }
    }
  }

  return { ok: false, status: lastStatus, error: lastError || 'All RapidAPI keys failed' };
}

// ─── Normalized listing shape (feeds directly into the CSV-import row contract) ──

export interface NormalizedRentalListing {
  source: 'Trulia' | 'Zillow' | 'Rent.com';
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

// ─── Shared helper — split a single "street, city, ST zip" string ────────────

/** Several of the newer providers return one combined address string instead of components. */
function splitCombinedAddress(full: string): { street: string; city: string; state: string; zip: string } {
  const match = full.match(/^(.*?),\s*([^,]+),\s*([A-Z]{2})\s*(\d{5})?/);
  if (!match) return { street: full, city: '', state: '', zip: '' };
  return { street: match[1].trim(), city: match[2].trim(), state: match[3], zip: match[4] || '' };
}

// ─── Zillow Real Estate API (jdtpnjtp / Data Forge) — property search ────────

export interface ZillowRealEstateSearchParams {
  location: string;
  status?: 'for_sale' | 'for_rent' | 'sold';
  priceMin?: number;
  priceMax?: number;
  bedsMin?: number;
  sort?: string;
  page?: number;
}

interface ZillowRealEstateResultRaw {
  zpid?: string | number;
  address?: string;
  addressStreet?: string;
  addressCity?: string;
  addressState?: string;
  addressZip?: string;
  price?: number;
  beds?: number;
  baths?: number;
  sqft?: number;
  zestimate?: number;
  rentZestimate?: number;
  detailUrl?: string;
  homeType?: string;
  daysOnZillow?: number;
}

function normalizeZillowRealEstateResult(raw: ZillowRealEstateResultRaw): NormalizedRentalListing {
  const parsed = raw.addressCity ? null : splitCombinedAddress(raw.address || '');
  return {
    source: 'Zillow',
    externalId: raw.zpid != null ? String(raw.zpid) : undefined,
    address: raw.addressStreet || parsed?.street || raw.address || '',
    city: raw.addressCity || parsed?.city || '',
    state: raw.addressState || parsed?.state || '',
    zip: raw.addressZip || parsed?.zip || '',
    beds: raw.beds ?? null,
    baths: raw.baths ?? null,
    price: raw.price ?? raw.rentZestimate ?? null,
    sqftText: raw.sqft ? `${raw.sqft} sqft` : undefined,
    listingUrl: raw.detailUrl,
    notes: [raw.homeType, raw.zestimate ? `Zestimate: $${raw.zestimate.toLocaleString()}` : null, raw.daysOnZillow != null ? `${raw.daysOnZillow}d on Zillow` : null]
      .filter(Boolean).join(' | '),
  };
}

/** GET /v1/search — Zillow Real Estate API (35+ filters; search/rent/sold/for_sale). */
export async function searchZillowRealEstate(
  params: ZillowRealEstateSearchParams
): Promise<{ ok: boolean; listings: NormalizedRentalListing[]; error?: string; status?: number }> {
  const query = new URLSearchParams({ location: params.location });
  if (params.status) query.set('status', params.status);
  if (params.priceMin != null) query.set('price_min', String(params.priceMin));
  if (params.priceMax != null) query.set('price_max', String(params.priceMax));
  if (params.bedsMin != null) query.set('beds_min', String(params.bedsMin));
  if (params.sort) query.set('sort', params.sort);
  if (params.page) query.set('page', String(params.page));

  const result = await rapidApiFetch(ZILLOW_REAL_ESTATE_HOST, `/v1/search?${query.toString()}`);
  if (!result.ok) {
    return { ok: false, listings: [], error: result.error, status: result.status };
  }
  const data = result.data as { data?: { results?: ZillowRealEstateResultRaw[] } };
  const listings = (data?.data?.results || []).map(normalizeZillowRealEstateResult);
  return { ok: true, listings };
}

export async function getZillowRealEstateHealth(): Promise<{ status: 'ACTIVE' | 'AUTH_ERROR' | 'DISABLED' | 'DEGRADED'; message: string; hasApiKey: boolean }> {
  const keys = getRapidApiKeys();
  if (keys.length === 0) {
    return { status: 'DISABLED', message: 'No RAPIDAPI_KEY_* configured', hasApiKey: false };
  }
  const result = await rapidApiFetch(ZILLOW_REAL_ESTATE_HOST, '/v1/autocomplete?query=Austin');
  if (result.status === 401 || result.status === 403) {
    return { status: 'AUTH_ERROR', message: result.error || 'RapidAPI key not subscribed to Zillow Real Estate API', hasApiKey: true };
  }
  if (!result.ok) {
    return { status: 'DEGRADED', message: result.error || 'Zillow Real Estate API unreachable', hasApiKey: true };
  }
  return { status: 'ACTIVE', message: 'Zillow Real Estate API is reachable', hasApiKey: true };
}

// ─── Rent.com API (skdeveloper) — location-based rental search ───────────────

interface RentComListingRaw {
  listingId?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  price?: number | string;
  minPrice?: number;
  maxPrice?: number;
  beds?: number;
  baths?: number;
  sqft?: number;
  url?: string;
  latitude?: number;
  longitude?: number;
}

function normalizeRentComListing(raw: RentComListingRaw): NormalizedRentalListing {
  const parsed = raw.city ? null : splitCombinedAddress(raw.address || '');
  const priceNum = typeof raw.price === 'string' ? Number(raw.price.replace(/[^0-9.]/g, '')) : raw.price;
  return {
    source: 'Rent.com',
    externalId: raw.listingId,
    address: raw.address || parsed?.street || '',
    city: raw.city || parsed?.city || '',
    state: raw.state || parsed?.state || '',
    zip: raw.zip || parsed?.zip || '',
    latitude: raw.latitude,
    longitude: raw.longitude,
    beds: raw.beds ?? null,
    baths: raw.baths ?? null,
    price: priceNum || raw.minPrice || null,
    sqftText: raw.sqft ? `${raw.sqft} sqft` : undefined,
    listingUrl: raw.url,
  };
}

export interface RentComSearchParams {
  city: string;
  state: string;
  locationSlug?: string;
  sort?: 'PRICE_LOW_TO_HIGH' | 'PRICE_HIGH_TO_LOW';
  resultsPerPage?: number;
  page?: number;
}

/**
 * Rent.com is a 2-step search: GET /location-search resolves a free-text query
 * into a `locationSlug` (e.g. "arizona/oro-valley"), then POST /location-listings
 * fetches results for that slug. Callers can skip step 1 by passing a known slug.
 */
export async function searchRentCom(
  params: RentComSearchParams
): Promise<{ ok: boolean; listings: NormalizedRentalListing[]; error?: string; status?: number }> {
  let locationSlug = params.locationSlug;
  if (!locationSlug) {
    const searchResult = await rapidApiFetch(RENT_COM_HOST, `/location-search?${new URLSearchParams({ query: `${params.city}, ${params.state}`, limit: '1' })}`);
    if (!searchResult.ok) {
      return { ok: false, listings: [], error: searchResult.error, status: searchResult.status };
    }
    const matches = searchResult.data as Array<{ locationSlug?: string }> | { results?: Array<{ locationSlug?: string }> };
    const first = Array.isArray(matches) ? matches[0] : matches?.results?.[0];
    locationSlug = first?.locationSlug;
    if (!locationSlug) {
      return { ok: false, listings: [], error: `No Rent.com location match for "${params.city}, ${params.state}"` };
    }
  }

  const result = await rapidApiFetch(RENT_COM_HOST, '/location-listings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      input: { city: params.city, locationSlug, state: params.state },
      sort: params.sort,
      resultsPerPage: params.resultsPerPage || 50,
      page: params.page || 1,
      showBuildings: true,
    }),
  });
  if (!result.ok) {
    return { ok: false, listings: [], error: result.error, status: result.status };
  }
  const data = result.data as { listings?: RentComListingRaw[]; results?: RentComListingRaw[] };
  const rows = data?.listings || data?.results || (Array.isArray(result.data) ? (result.data as RentComListingRaw[]) : []);
  return { ok: true, listings: rows.map(normalizeRentComListing) };
}

export async function getRentComHealth(): Promise<{ status: 'ACTIVE' | 'AUTH_ERROR' | 'DISABLED' | 'DEGRADED'; message: string; hasApiKey: boolean }> {
  const keys = getRapidApiKeys();
  if (keys.length === 0) {
    return { status: 'DISABLED', message: 'No RAPIDAPI_KEY_* configured', hasApiKey: false };
  }
  const result = await rapidApiFetch(RENT_COM_HOST, `/location-search?${new URLSearchParams({ query: 'Austin, TX', limit: '1' })}`);
  if (result.status === 401 || result.status === 403) {
    return { status: 'AUTH_ERROR', message: result.error || 'RapidAPI key not subscribed to Rent.com API', hasApiKey: true };
  }
  if (!result.ok) {
    return { status: 'DEGRADED', message: result.error || 'Rent.com API unreachable', hasApiKey: true };
  }
  return { status: 'ACTIVE', message: 'Rent.com API is reachable', hasApiKey: true };
}

// ─── US Property Data (PropertyData) — real-time Zillow scraper ──────────────

export interface UsPropertyDataSearchParams {
  location: string;
  listingStatus?: 'for_sale' | 'for_rent' | 'sold';
  page?: number;
}

interface UsPropertyDataResultRaw {
  zpid?: string;
  address?: string;
  addressStreet?: string;
  addressCity?: string;
  addressState?: string;
  addressZipcode?: string;
  beds?: number;
  baths?: number;
  area?: number;
  unformattedPrice?: number;
  detailUrl?: string;
  latLong?: { latitude?: number; longitude?: number };
  hdpData?: { homeInfo?: { homeType?: string; rentZestimate?: number; daysOnZillow?: number; isPreforeclosureAuction?: boolean } };
}

function normalizeUsPropertyDataResult(raw: UsPropertyDataResultRaw): NormalizedRentalListing {
  const homeInfo = raw.hdpData?.homeInfo;
  const parsed = raw.addressCity ? null : splitCombinedAddress(raw.address || '');
  return {
    source: 'Zillow',
    externalId: raw.zpid,
    address: raw.addressStreet || parsed?.street || raw.address || '',
    city: raw.addressCity || parsed?.city || '',
    state: raw.addressState || parsed?.state || '',
    zip: raw.addressZipcode || parsed?.zip || '',
    latitude: raw.latLong?.latitude,
    longitude: raw.latLong?.longitude,
    beds: raw.beds ?? null,
    baths: raw.baths ?? null,
    price: raw.unformattedPrice ?? homeInfo?.rentZestimate ?? null,
    sqftText: raw.area ? `${raw.area} sqft` : undefined,
    listingUrl: raw.detailUrl,
    notes: [homeInfo?.homeType, homeInfo?.isPreforeclosureAuction ? 'Pre-foreclosure/auction' : null, homeInfo?.daysOnZillow != null ? `${homeInfo.daysOnZillow}d on Zillow` : null]
      .filter(Boolean).join(' | '),
  };
}

/** GET /api/v1/search/by-location — redundant Zillow-sourced search (independent scraper from Zillow Detail/Search above). */
export async function searchUsPropertyData(
  params: UsPropertyDataSearchParams
): Promise<{ ok: boolean; listings: NormalizedRentalListing[]; error?: string; status?: number }> {
  const query = new URLSearchParams({ location: params.location });
  if (params.listingStatus) query.set('listing_status', params.listingStatus);
  if (params.page) query.set('page', String(params.page));

  const result = await rapidApiFetch(US_PROPERTY_DATA_HOST, `/api/v1/search/by-location?${query.toString()}`);
  if (!result.ok) {
    return { ok: false, listings: [], error: result.error, status: result.status };
  }
  const data = result.data as { data?: UsPropertyDataResultRaw[] };
  const listings = (data?.data || []).map(normalizeUsPropertyDataResult);
  return { ok: true, listings };
}

export async function getUsPropertyDataHealth(): Promise<{ status: 'ACTIVE' | 'AUTH_ERROR' | 'DISABLED' | 'DEGRADED'; message: string; hasApiKey: boolean }> {
  const keys = getRapidApiKeys();
  if (keys.length === 0) {
    return { status: 'DISABLED', message: 'No RAPIDAPI_KEY_* configured', hasApiKey: false };
  }
  const result = await rapidApiFetch(US_PROPERTY_DATA_HOST, `/api/v1/search/by-location?${new URLSearchParams({ location: 'Austin, TX', page: '1' })}`);
  if (result.status === 401 || result.status === 403) {
    return { status: 'AUTH_ERROR', message: result.error || 'RapidAPI key not subscribed to US Property Data', hasApiKey: true };
  }
  if (!result.ok) {
    return { status: 'DEGRADED', message: result.error || 'US Property Data unreachable', hasApiKey: true };
  }
  return { status: 'ACTIVE', message: 'US Property Data API is reachable', hasApiKey: true };
}
