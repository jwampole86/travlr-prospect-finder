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
// PadMapper Rental Scraper — subscribed 2026-10-11. Host/contract discovered live (no
// public docs reachable): POST "/" with JSON {"location": "<slug>"}; see the PadMapper
// section below for the verified request/response behaviour.
const PADMAPPER_HOST = 'padmapper-rental-scraper.p.rapidapi.com';
// HotPads + Craigslist scrapers — subscribed 2026-10-11, same discovery method as PadMapper.
const HOTPADS_HOST = 'hotpads-rental-scraper.p.rapidapi.com';
const CRAIGSLIST_HOST = 'craigslist-real-estate-scraper.p.rapidapi.com';

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
  source: 'Trulia' | 'Zillow' | 'Rent.com' | 'PadMapper' | 'HotPads' | 'Craigslist';
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
  /**
   * Whether `price` is a monthly rent, a sale price, or a sold price.
   * CRITICAL: several providers (Zillow Detail Scraper, Zillow Scraper
   * API/ToolzerHub, Zillow Real Estate API, US Property Data) can return
   * for-sale/sold listings — their price is NOT a monthly rent. Always set
   * this explicitly; never assume 'for_rent'.
   */
  listingStatus: 'for_rent' | 'for_sale' | 'sold';
  sqftText?: string;
  listingUrl?: string;
  notes?: string;
  /** Real market rent estimate (e.g. Zillow's rentZestimate) — populated even
   *  for for-sale listings, since it's genuine comparable-market data, not a
   *  guess. Distinct from `price`, which always reflects the listing's own type. */
  rentEstimate?: number;
  listingAgentName?: string;
  listingAgentPhone?: string;
  listingBrokerName?: string;
  listingBrokerPhone?: string;
  mlsNumber?: string;
  mlsSourceName?: string;
  listingUpdatedAt?: string;
  /** True only when the live listing had no agent/broker attribution at all. */
  isFsbo?: boolean;
  /** True when the unit is in a multi-unit apartment/condo community rather
   *  than a standalone home/townhome — lower STR conversion priority. */
  isApartmentCommunity?: boolean;
  /** Raw property type string (e.g. 'single-family home', 'apartment', 'townhouse'). */
  propertyTypeLabel?: string;
  /** Listing explicitly marked furnished — strong STR-readiness signal. */
  isFurnished?: boolean;
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
  price?: { min?: number; max?: number; price?: number; formattedPrice?: string };
  url?: string;
  homeUrl?: string | null;
  floorSpace?: { formattedDimension?: string };
  bedrooms?: { min?: number; max?: number };
  bathrooms?: { min?: number; max?: number };
  tags?: Array<{ kind?: string; formattedName?: string }>;
  metadata?: { compositeId?: string; legacyIdForSave?: string };
  propertyType?: { value?: string };
  activeListing?: { provider?: { listingAgent?: { name?: string } | null; broker?: { name?: string } | null } };
}

function normalizeTruliaListing(raw: TruliaListingRaw): NormalizedRentalListing {
  const loc = raw.location || {};
  const beds = raw.bedrooms;
  const baths = raw.bathrooms;
  const avgBeds = beds && (beds.min != null || beds.max != null)
    ? Math.round(((beds.min ?? beds.max ?? 0) + (beds.max ?? beds.min ?? 0)) / 2) : null;
  const avgBaths = baths && (baths.min != null || baths.max != null)
    ? Math.round((((baths.min ?? baths.max ?? 0) + (baths.max ?? baths.min ?? 0)) / 2) * 2) / 2 : null;
  const price = raw.price?.min != null || raw.price?.max != null
    ? Math.round(((raw.price.min ?? raw.price.max ?? 0) + (raw.price.max ?? raw.price.min ?? 0)) / 2)
    // Confirmed live 2026-10-11: some listings (e.g. single-point luxury
    // rentals) use a flat `price.price` field instead of a min/max range.
    : (raw.price?.price ?? null);
  const rawUrl = raw.homeUrl || raw.url || '';
  const listingUrl = rawUrl ? (rawUrl.startsWith('http') ? rawUrl : `https://www.trulia.com${rawUrl}`) : undefined;
  const tagText = (raw.tags || []).map(t => t.formattedName).filter(Boolean).join('; ');
  const notesParts = [loc.communityLocation, raw.floorSpace?.formattedDimension, tagText].filter(Boolean);
  // Confirmed live 2026-10-11: top-level `propertyType.value` (e.g.
  // 'SINGLE_FAMILY_HOME') is the cleanest signal — apartment communities
  // (url starts with /building/) are the least STR-convertible unit type.
  const propertyTypeLabel = raw.propertyType?.value;
  const isApartmentCommunity = rawUrl.includes('/building/') || propertyTypeLabel === 'APARTMENT';
  const isFurnished = (raw.tags || []).some(t => t.kind === 'FURNISHED');
  const provider = raw.activeListing?.provider;
  const agentName = provider?.listingAgent?.name || undefined;
  const brokerName = provider?.broker?.name || undefined;
  // No agent AND no broker on a standalone home is the only owner signal this scraper has. Building
  // listings carry neither field but are run by a leasing office, so they are never owner-listed.
  // The scraper has no field for the "Contact This Property" owner name Trulia's site shows.
  const isFsbo = !agentName && !brokerName && !isApartmentCommunity;

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
    // Only /v1/search/rent is ever called in this app — always a real rental.
    listingStatus: 'for_rent',
    listingAgentName: agentName,
    listingBrokerName: brokerName,
    isFsbo,
    isApartmentCommunity,
    propertyTypeLabel,
    isFurnished,
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
  brokerName?: string;
  brokerPhone?: string;
  mlsId?: string;
  mlsName?: string;
  listingUpdated?: string;
  error?: string;
}

function normalizeZillowDetail(raw: ZillowDetailRaw): NormalizedRentalListing {
  const isRental = raw.homeStatus === 'FOR_RENT';
  const isSold = raw.homeStatus === 'SOLD' || raw.homeStatus === 'RECENTLY_SOLD';
  // Confirmed live 2026-10-11: a real owner-listed rental ("Listed by property
  // owner" on Zillow) returns NO agentName/brokerName at all — the owner's own
  // phone lands in `brokerPhone` regardless, and `mlsName` is 'Zillow Rentals'
  // rather than a real MLS feed. Both are independent, reliable FSBO signals.
  const isFsbo = !raw.brokerName || raw.mlsName === 'Zillow Rentals';
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
    listingStatus: isRental ? 'for_rent' : isSold ? 'sold' : 'for_sale',
    // Captured regardless of listing type — genuine comparable-market data,
    // useful for STR potential even on a for-sale listing.
    rentEstimate: raw.rentZestimate,
    sqftText: raw.livingArea ? `${raw.livingArea} sqft` : undefined,
    listingUrl: raw.url,
    listingAgentName: raw.agentName,
    // FSBO listings put the owner's real phone in `brokerPhone` even with no
    // brokerName at all — surface it as the contact phone in that case.
    listingAgentPhone: raw.agentPhone || (isFsbo ? raw.brokerPhone : undefined),
    listingBrokerName: raw.brokerName,
    listingBrokerPhone: raw.brokerPhone,
    mlsNumber: raw.mlsId,
    mlsSourceName: raw.mlsName,
    listingUpdatedAt: raw.listingUpdated,
    isFsbo,
    notes: [raw.homeStatus, raw.homeType, raw.agentName ? `Agent: ${raw.agentName}` : null, raw.brokerName ? `Broker: ${raw.brokerName}` : null, isFsbo ? 'For-sale/rent by owner' : null]
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

function normalizeZillowSearchResult(raw: ZillowSearchResultRaw, queriedStatus?: 'for_sale' | 'sold'): NormalizedRentalListing {
  const statusText = (raw.status_text || '').toLowerCase();
  const isSold = statusText.includes('sold') || queriedStatus === 'sold';
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
    // This provider never returns rentals — confirmed via its own status param (for_sale/sold only).
    listingStatus: isSold ? 'sold' : 'for_sale',
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
  const listings = (data?.data?.results || []).map(r => normalizeZillowSearchResult(r, params.status));
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

function normalizeZillowRealEstateResult(raw: ZillowRealEstateResultRaw, queriedStatus?: 'for_sale' | 'for_rent' | 'sold'): NormalizedRentalListing {
  const parsed = raw.addressCity ? null : splitCombinedAddress(raw.address || '');
  const isRental = queriedStatus === 'for_rent';
  const isSold = queriedStatus === 'sold';
  return {
    source: 'Zillow',
    externalId: raw.zpid != null ? String(raw.zpid) : undefined,
    address: raw.addressStreet || parsed?.street || raw.address || '',
    city: raw.addressCity || parsed?.city || '',
    state: raw.addressState || parsed?.state || '',
    zip: raw.addressZip || parsed?.zip || '',
    beds: raw.beds ?? null,
    baths: raw.baths ?? null,
    price: isRental ? (raw.rentZestimate ?? raw.price ?? null) : (raw.price ?? null),
    // Derived from the caller's own status query param — results match what was asked for.
    listingStatus: isRental ? 'for_rent' : isSold ? 'sold' : 'for_sale',
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
  const listings = (data?.data?.results || []).map(r => normalizeZillowRealEstateResult(r, params.status));
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
    // This endpoint is Rent.com-specific — always genuine rentals.
    listingStatus: 'for_rent',
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
  hdpData?: { homeInfo?: { homeType?: string; homeStatus?: string; rentZestimate?: number; daysOnZillow?: number; isPreforeclosureAuction?: boolean } };
}

function normalizeUsPropertyDataResult(raw: UsPropertyDataResultRaw, queriedStatus?: 'for_sale' | 'for_rent' | 'sold'): NormalizedRentalListing {
  const homeInfo = raw.hdpData?.homeInfo;
  const parsed = raw.addressCity ? null : splitCombinedAddress(raw.address || '');
  const statusRaw = (homeInfo?.homeStatus || '').toUpperCase();
  const isRental = statusRaw === 'FOR_RENT' || queriedStatus === 'for_rent';
  const isSold = statusRaw.includes('SOLD') || queriedStatus === 'sold';
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
    price: isRental ? (homeInfo?.rentZestimate ?? raw.unformattedPrice ?? null) : (raw.unformattedPrice ?? null),
    listingStatus: isRental ? 'for_rent' : isSold ? 'sold' : 'for_sale',
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
  const listings = (data?.data || []).map(r => normalizeUsPropertyDataResult(r, params.listingStatus));
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

// ─── PadMapper Rental Scraper — location-slug rental search ──────────────────
//
// Contract (verified live 2026-10-11 — the provider publishes no reachable docs):
//   POST /  body {"location": "<city>-<st>" | "<city>-<st>/<zip>"}  → 201 + bare JSON array.
//   - Exactly 20 listings per call; `page`/`limit`/filter params are silently ignored, so
//     coverage comes from querying many slugs (city slug, then per-ZIP slugs).
//   - The city slug returns apartment BUILDINGS almost exclusively; individual houses and
//     owner/manager rentals (`/rentals/` URLs) surface mainly via the per-ZIP slug.
//   - `property_type` is ALWAYS "Apartment" (even for houses) — never use it to classify.
//   - Agent/broker fields are unreliable: `agent_name` is often the listing's title text, and
//     `phone` is a PadMapper call-tracking relay "(844) xxx-xxxx ext. NNNN", not the lister's
//     own number. Only non-relay numbers are kept as contact data.
//   - There is no explicit for-sale-by-owner flag; the only owner signal is the lister being a
//     DIY-landlord platform (TurboTenant, Ziprent, ...) on a standalone-home listing.

interface PadMapperListingRaw {
  listing_id?: number | string;
  url?: string;
  name?: string;
  address?: string;
  street?: string;
  city?: string;
  state?: string;
  zipcode?: string;
  neighborhood?: string | null;
  latitude?: number;
  longitude?: number;
  price_min?: number | null;
  price_max?: number | null;
  beds_min?: number | null;
  beds_max?: number | null;
  baths_min?: number | null;
  baths_max?: number | null;
  property_type?: string;
  amenities?: string[] | null;
  pets_allowed?: string[] | null;
  phone?: string | null;
  agent_name?: string | null;
  brokerage_name?: string | null;
  date_available?: string | null;
  scraped_at?: string;
}

/** Self-serve landlord platforms: a listing posted through one is an individual owner, not a PM. */
const PADMAPPER_DIY_LANDLORD_PLATFORMS = /^(turbotenant|ziprent|rentredi|avail|innago|rentler|cozy|zillow rental manager)\b/i;
/** Room-by-room co-living operators — shared housing, not a whole-home STR candidate. */
const PADMAPPER_COLIVING_OPERATORS = /^padsplit\b/i;
/** Words that mark an `agent_name` as marketing copy / a company instead of a person. */
const PADMAPPER_NON_PERSON_WORDS = /\b(bed(room)?s?|bath(room)?s?|bd|ba|home|house|spacious|walking|charming|updated|beautiful|newer|pet|apartment|townhouse|duplex|luxury|lovely|property|properties|management|realty|real estate|team|group|rentals?|leasing|llc|inc|co|corp|company|team|apartments|residential|holdings|homes|living)\b/i;

function looksLikePersonName(value: string | null | undefined): value is string {
  const v = (value || '').trim();
  if (!v || v.length > 40 || /[\d#:,&@/❀]/.test(v)) return false;
  if (PADMAPPER_NON_PERSON_WORDS.test(v)) return false;
  return /^[A-Za-z][A-Za-z'.-]*(\s+[A-Za-z][A-Za-z'.-]*){1,3}$/.test(v);
}

/** PadMapper routes its call-tracking lines as "(844) 334-2712 ext. 7672" — not a real contact number. */
function isPadMapperRelayPhone(phone: string): boolean {
  return /ext\.?\s*\d+/i.test(phone) || /^\(?8(00|33|44|55|66|77|88)\)?/.test(phone.trim());
}

function midpoint(min: number | null | undefined, max: number | null | undefined): number | null {
  if (min == null && max == null) return null;
  return ((min ?? max ?? 0) + (max ?? min ?? 0)) / 2;
}

function normalizePadMapperListing(raw: PadMapperListingRaw): NormalizedRentalListing {
  const url = raw.url || '';
  const street = (raw.street || '').trim();
  const brokerage = (raw.brokerage_name || '').trim();
  const agentRaw = (raw.agent_name || '').trim();

  const isBuilding = url.includes('/buildings/');
  const hasUnitMarker = /(#|\b(apt|unit|ste|suite)\b)/i.test(street);
  const isColiving = PADMAPPER_COLIVING_OPERATORS.test(brokerage);
  // Same STR-priority rule as Trulia/Zillow: units inside apartment communities (and
  // co-living rooms) are the weakest prospects; only standalone homes qualify as owner-listed.
  const isApartmentCommunity = isBuilding || hasUnitMarker || isColiving;

  const isDiyLandlord = PADMAPPER_DIY_LANDLORD_PLATFORMS.test(brokerage);
  const isFsbo = !isApartmentCommunity && isDiyLandlord;

  // On building listings agent_name is the building's name ("The Mercury"), and on
  // corporate/co-living listings it echoes the operator ("Blueground Us", "sales teamblueground"),
  // so a person's name is only trusted on standalone listings from a non-corporate lister.
  const agentEchoesBrokerage = !!brokerage && agentRaw.toLowerCase().replace(/[^a-z]/g, '').includes(brokerage.toLowerCase().replace(/[^a-z]/g, '').slice(0, 8));
  const agentIsPerson = !isApartmentCommunity && !agentEchoesBrokerage && looksLikePersonName(agentRaw);
  const rawPhone = (raw.phone || '').trim();
  const directPhone = rawPhone && !isPadMapperRelayPhone(rawPhone) ? rawPhone : undefined;

  const price = midpoint(raw.price_min, raw.price_max);
  const beds = midpoint(raw.beds_min, raw.beds_max);
  const baths = midpoint(raw.baths_min, raw.baths_max);
  const amenities = raw.amenities || [];

  const propertyTypeLabel = isBuilding ? 'APARTMENT_BUILDING'
    : isColiving ? 'ROOM'
    : hasUnitMarker ? 'APARTMENT'
    : 'HOME';

  const notesParts = [
    raw.neighborhood,
    brokerage ? `Listed by ${brokerage}${isDiyLandlord ? ' (self-serve landlord platform)' : ''}` : null,
    // When agent_name is marketing copy rather than a person, it is the listing's title.
    agentRaw && !agentIsPerson && agentRaw !== brokerage ? agentRaw : null,
    raw.pets_allowed?.length ? `Pets: ${raw.pets_allowed.join(', ')}` : null,
    raw.date_available ? `Available ${raw.date_available}` : null,
    raw.price_min != null && raw.price_max != null && raw.price_min !== raw.price_max
      ? `Rent range $${raw.price_min}-$${raw.price_max}` : null,
  ].filter(Boolean);

  return {
    source: 'PadMapper',
    externalId: raw.listing_id != null ? String(raw.listing_id) : undefined,
    address: street,
    city: (raw.city || '').trim(),
    state: (raw.state || '').trim(),
    zip: (raw.zipcode || '').trim(),
    latitude: raw.latitude,
    longitude: raw.longitude,
    beds: beds != null ? Math.round(beds) : null,
    baths: baths != null ? Math.round(baths * 2) / 2 : null,
    price: price != null ? Math.round(price) : null,
    // The scraper only searches rentals.
    listingStatus: 'for_rent',
    listingAgentName: agentIsPerson ? agentRaw : undefined,
    listingAgentPhone: directPhone,
    listingBrokerName: brokerage || undefined,
    listingUpdatedAt: raw.scraped_at,
    isFsbo,
    isApartmentCommunity,
    propertyTypeLabel,
    isFurnished: amenities.some(a => /^furnished$/i.test(a.trim())),
    listingUrl: url || undefined,
    notes: notesParts.join(' | ').slice(0, 2000),
  };
}

/** Lowercase slug PadMapper expects: "Austin" + "TX" → "austin-tx"; optional ZIP → "austin-tx/78704". */
export function toPadMapperLocation(city: string, state: string, zip?: string): string {
  const citySlug = city.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const base = `${citySlug}-${state.trim().toLowerCase()}`;
  const zip5 = (zip || '').trim().slice(0, 5);
  return /^\d{5}$/.test(zip5) ? `${base}/${zip5}` : base;
}

/** POST / — one PadMapper location slug → up to 20 listings. */
export async function searchPadMapperRentals(
  params: { location: string }
): Promise<{ ok: boolean; listings: NormalizedRentalListing[]; error?: string; status?: number }> {
  const location = params.location.trim().toLowerCase();
  if (!/^[a-z0-9-]+(\/\d{5})?$/.test(location)) {
    return { ok: false, listings: [], error: `Invalid PadMapper location "${params.location}" — expected "<city>-<st>" or "<city>-<st>/<zip>"`, status: 400 };
  }
  const result = await rapidApiFetch(PADMAPPER_HOST, '/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ location }),
  });
  if (!result.ok) {
    return { ok: false, listings: [], error: result.error, status: result.status };
  }
  if (!Array.isArray(result.data)) {
    return { ok: false, listings: [], error: 'PadMapper returned an unexpected response shape', status: 502 };
  }
  return { ok: true, listings: (result.data as PadMapperListingRaw[]).map(normalizePadMapperListing) };
}

export async function getPadMapperHealth(): Promise<{ status: 'ACTIVE' | 'AUTH_ERROR' | 'DISABLED' | 'DEGRADED'; message: string; hasApiKey: boolean }> {
  const keys = getRapidApiKeys();
  if (keys.length === 0) {
    return { status: 'DISABLED', message: 'No RAPIDAPI_KEY_* configured', hasApiKey: false };
  }
  const result = await searchPadMapperRentals({ location: 'austin-tx' });
  if (result.status === 401 || result.status === 403) {
    return { status: 'AUTH_ERROR', message: 'RapidAPI key not subscribed to PadMapper Rental Scraper', hasApiKey: true };
  }
  if (!result.ok) {
    return { status: 'DEGRADED', message: result.error || 'PadMapper Rental Scraper unreachable', hasApiKey: true };
  }
  return { status: 'ACTIVE', message: 'PadMapper Rental Scraper API is reachable', hasApiKey: true };
}

/**
 * Subscription check that spends no quota: the gateway answers GET / with a 404 "Endpoint does not
 * exist" when the key is subscribed and 401/403 when it is not. Used where a real search would burn
 * a scarce request allowance on every health refresh.
 */
async function checkSubscriptionOnly(host: string, label: string): Promise<{ status: 'ACTIVE' | 'AUTH_ERROR' | 'DISABLED' | 'DEGRADED'; message: string; hasApiKey: boolean }> {
  if (getRapidApiKeys().length === 0) {
    return { status: 'DISABLED', message: 'No RAPIDAPI_KEY_* configured', hasApiKey: false };
  }
  const result = await rapidApiFetch(host, '/');
  if (result.status === 401 || result.status === 403) {
    return { status: 'AUTH_ERROR', message: `RapidAPI key not subscribed to ${label}`, hasApiKey: true };
  }
  if (result.status === 404 && /endpoint/i.test(result.error || '')) {
    return { status: 'ACTIVE', message: `${label} subscription active`, hasApiKey: true };
  }
  return { status: 'DEGRADED', message: result.error || `${label} unreachable`, hasApiKey: true };
}

// ─── HotPads Rental Scraper — city search ────────────────────────────────────
//
// Contract (verified live 2026-10-11): POST / body {"location": "Austin, TX"} → bare JSON array of
// exactly 5 listings (Apify-backed, ~5s/call). page/limit/filters are ignored; ZIP and "city-st/zip"
// locations fail the actor run, so coverage comes from querying many cities. No agent, brokerage,
// description or amenities are ever populated, so owner-vs-manager cannot be told apart (isFsbo is
// left unset rather than guessed). `property_type`: house | townhouse | condo | large | medium
// (large/medium = apartment buildings); `listing_type` is "rental" or "corporate" (managed corporate
// / vacation housing with unit codes like "#ID1303961P").

interface HotPadsListingRaw {
  listing_id?: string;
  url?: string;
  name?: string;
  street?: string | null;
  city?: string;
  state?: string;
  zipcode?: string;
  neighborhood?: string | null;
  latitude?: number;
  longitude?: number;
  price_min?: number | null;
  price_max?: number | null;
  beds_min?: number | null;
  beds_max?: number | null;
  baths_min?: number | null;
  baths_max?: number | null;
  sqft_min?: number | null;
  sqft_max?: number | null;
  property_type?: string;
  listing_type?: string;
  is_verified?: boolean;
  special_offer?: string | null;
  phone?: string | null;
  scraped_at?: string;
}

const HOTPADS_TYPE_LABELS: Record<string, string> = {
  house: 'SINGLE_FAMILY_HOME',
  townhouse: 'TOWNHOUSE',
  condo: 'CONDO',
  large: 'APARTMENT_BUILDING',
  medium: 'APARTMENT_BUILDING',
};

function normalizeHotPadsListing(raw: HotPadsListingRaw): NormalizedRentalListing {
  const type = (raw.property_type || '').toLowerCase();
  const street = (raw.street || '').trim();
  const isCorporate = raw.listing_type === 'corporate';
  const isApartmentCommunity = type === 'large' || type === 'medium' || /(#|\b(apt|unit|ste|suite)\b)/i.test(street);

  const price = midpoint(raw.price_min, raw.price_max);
  const beds = midpoint(raw.beds_min, raw.beds_max);
  const baths = midpoint(raw.baths_min, raw.baths_max);
  const sqft = raw.sqft_min != null && raw.sqft_max != null && raw.sqft_min !== raw.sqft_max
    ? `${raw.sqft_min}-${raw.sqft_max} sqft` : (raw.sqft_min ?? raw.sqft_max) != null ? `${raw.sqft_min ?? raw.sqft_max} sqft` : undefined;
  const phone = (raw.phone || '').trim().replace(/^1-/, '');

  const notesParts = [
    raw.neighborhood,
    isCorporate ? 'Corporate/managed housing listing' : null,
    raw.special_offer,
    raw.price_min != null && raw.price_max != null && raw.price_min !== raw.price_max
      ? `Rent range $${raw.price_min}-$${raw.price_max}` : null,
  ].filter(Boolean);

  return {
    source: 'HotPads',
    externalId: raw.listing_id,
    address: street,
    city: (raw.city || '').trim(),
    state: (raw.state || '').trim(),
    zip: (raw.zipcode || '').trim(),
    latitude: raw.latitude,
    longitude: raw.longitude,
    beds: beds != null ? Math.round(beds) : null,
    baths: baths != null ? Math.round(baths * 2) / 2 : null,
    price: price != null ? Math.round(price) : null,
    listingStatus: 'for_rent',
    listingAgentPhone: phone || undefined,
    listingUpdatedAt: raw.scraped_at,
    isApartmentCommunity,
    propertyTypeLabel: HOTPADS_TYPE_LABELS[type] || type.toUpperCase() || undefined,
    // Corporate housing is furnished by definition.
    isFurnished: isCorporate ? true : undefined,
    sqftText: sqft,
    listingUrl: raw.url,
    notes: notesParts.join(' | ').slice(0, 2000),
  };
}

/** POST / — one "City, ST" → 5 listings. */
export async function searchHotPadsRentals(
  params: { location: string }
): Promise<{ ok: boolean; listings: NormalizedRentalListing[]; error?: string; status?: number }> {
  const location = params.location.trim();
  if (!/^[A-Za-z.' -]+,\s*[A-Za-z]{2}$/.test(location)) {
    return { ok: false, listings: [], error: `Invalid HotPads location "${params.location}" — expected "City, ST"`, status: 400 };
  }
  const result = await rapidApiFetch(HOTPADS_HOST, '/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ location }),
  });
  if (!result.ok) {
    return { ok: false, listings: [], error: result.error, status: result.status };
  }
  if (!Array.isArray(result.data)) {
    // The Apify actor reports failures as {error:{message}} with HTTP 201.
    const msg = (result.data as { error?: { message?: string } } | null)?.error?.message;
    return { ok: false, listings: [], error: msg || 'HotPads returned an unexpected response shape', status: 502 };
  }
  return { ok: true, listings: (result.data as HotPadsListingRaw[]).map(normalizeHotPadsListing) };
}

export async function getHotPadsHealth() {
  return checkSubscriptionOnly(HOTPADS_HOST, 'HotPads Rental Scraper');
}

// ─── Craigslist Real Estate Scraper — region search ──────────────────────────
//
// Contract (verified live 2026-10-11): POST / body {"city": "<craigslist region subdomain>"} (e.g.
// "austin", "sfbay", "nashville"; default region is sfbay) → bare JSON array of exactly 5 recent
// rental posts. QUOTA IS TINY (124 requests/month on the current plan) — never call this from health
// checks or loops. by_owner/limit/page/state params are ignored.
// Responses carry NO city/state/zip: the region is a metro ("nashville" includes Franklin), so
// city/state come from the caller, overridden by a full "street, City, ST zip" line when the post
// body has one. `location` is a street or cross-street, often absent. Contact info is hidden behind
// Craigslist's relay (`reply_link`); `by_owner` is the native owner-posted flag.

interface CraigslistListingRaw {
  url?: string;
  post_id?: string;
  title?: string;
  price?: number | null;
  body?: string;
  bedrooms?: number | null;
  bathrooms?: number | null;
  sqft?: number | null;
  location?: string | null;
  latitude?: number;
  longitude?: number;
  posting_date?: string;
  attributes?: string[] | null;
  by_owner?: boolean;
  scraped_at?: string;
}

const CRAIGSLIST_PHONE = /(?:\+?1[\s.-]?)?\(?\b[2-9]\d{2}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/;
const CRAIGSLIST_BODY_ADDRESS = /(\d{1,6}\s[^\n,]{3,60}),\s*([A-Za-z][A-Za-z .'-]{1,40}),\s*([A-Z]{2})\s*(\d{5})/;
const CRAIGSLIST_APARTMENT_TYPES = /^(apartment|loft|flat)$/;
const CRAIGSLIST_HOME_TYPES = ['house', 'townhouse', 'condo', 'duplex', 'cottage/cabin', 'in-law', 'manufactured'];

function normalizeCraigslistListing(raw: CraigslistListingRaw, ctx: { city: string; state: string }): NormalizedRentalListing {
  const attrs = (raw.attributes || []).map(a => a.toLowerCase().trim());
  const body = raw.body || '';

  const periodIdx = attrs.indexOf('rent period:');
  const period = periodIdx >= 0 ? attrs[periodIdx + 1] : 'monthly';
  const rawPrice = raw.price ?? null;
  // Vacation/short-term posts quote per night or week; the lead's price is always monthly.
  const price = rawPrice == null ? null
    : period === 'daily' ? rawPrice * 30
    : period === 'weekly' ? Math.round(rawPrice * 4.33)
    : period === 'yearly' ? Math.round(rawPrice / 12)
    : rawPrice;

  const bodyAddr = CRAIGSLIST_BODY_ADDRESS.exec(body.slice(0, 600));
  // `location` is only a usable street when it starts with a house number (else it is a cross-street/"google map").
  const locStreet = (raw.location || '').replace(/\s+near\s+.*$/i, '').replace(/\s*\(.*?\)\s*$/, '').trim();
  const street = /^\d+\s+\S/.test(locStreet) ? locStreet : (bodyAddr ? bodyAddr[1].trim() : '');

  const propertyType = [...CRAIGSLIST_HOME_TYPES, 'apartment', 'loft', 'flat'].find(t => attrs.includes(t));
  const isApartmentCommunity = (propertyType ? CRAIGSLIST_APARTMENT_TYPES.test(propertyType) : false) || /(#|\b(apt|unit|ste|suite)\b)/i.test(street);
  // by_owner on a unit inside an apartment building is a small landlord, not a standalone home.
  const isFsbo = raw.by_owner === true && !isApartmentCommunity;

  const phoneMatch = raw.by_owner ? CRAIGSLIST_PHONE.exec(body) : null;
  const sqftAttr = raw.sqft ? `${raw.sqft} sqft` : undefined;

  return {
    source: 'Craigslist',
    externalId: raw.post_id,
    address: street,
    city: (bodyAddr?.[2] || ctx.city).trim(),
    state: (bodyAddr?.[3] || ctx.state).trim(),
    zip: bodyAddr?.[4] || '',
    latitude: raw.latitude,
    longitude: raw.longitude,
    beds: raw.bedrooms ?? null,
    baths: raw.bathrooms ?? null,
    price,
    listingStatus: 'for_rent',
    listingAgentPhone: phoneMatch ? phoneMatch[0].trim() : undefined,
    listingUpdatedAt: raw.posting_date,
    isFsbo,
    isApartmentCommunity,
    propertyTypeLabel: propertyType ? propertyType.toUpperCase() : undefined,
    isFurnished: attrs.includes('furnished'),
    sqftText: sqftAttr,
    listingUrl: raw.url,
    notes: [raw.title, raw.by_owner ? 'Posted by owner' : null, period !== 'monthly' ? `Quoted ${period}` : null].filter(Boolean).join(' | ').slice(0, 2000),
  };
}

/** POST / — one Craigslist region subdomain → 5 listings. Spends 1 of a ~124/month allowance. */
export async function searchCraigslistRentals(
  params: { region: string; city: string; state: string }
): Promise<{ ok: boolean; listings: NormalizedRentalListing[]; error?: string; status?: number }> {
  const region = params.region.trim().toLowerCase();
  if (!/^[a-z0-9]+$/.test(region)) {
    return { ok: false, listings: [], error: `Invalid Craigslist region "${params.region}" — expected a subdomain like "austin"`, status: 400 };
  }
  const result = await rapidApiFetch(CRAIGSLIST_HOST, '/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ city: region }),
  });
  if (!result.ok) {
    return { ok: false, listings: [], error: result.error, status: result.status };
  }
  if (!Array.isArray(result.data)) {
    return { ok: false, listings: [], error: 'Craigslist returned an unexpected response shape', status: 502 };
  }
  const ctx = { city: params.city, state: params.state };
  return { ok: true, listings: (result.data as CraigslistListingRaw[]).map(r => normalizeCraigslistListing(r, ctx)) };
}

export async function getCraigslistHealth() {
  return checkSubscriptionOnly(CRAIGSLIST_HOST, 'Craigslist Real Estate Scraper');
}
