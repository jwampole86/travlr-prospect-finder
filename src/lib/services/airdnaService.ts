/**
 * Airdna (RapidAPI, by s.mahmoud97) — short-term rental (Airbnb/VRBO) market
 * analytics and revenue estimation ("Rentalizer").
 *
 * SECURITY: RAPIDAPI_KEY_* are read server-side only, never exposed to the client.
 * Reuses the same account-level RapidAPI key rotation as rapidApiRealEstateService.ts
 * (RapidAPI subscriptions are account-level — any configured key works against
 * this host too).
 *
 * Endpoints verified live 2026-10-10 by direct probing (the marketplace listing's
 * static docs show only operation IDs, not literal paths):
 *   GET /rentalizer  — address required, bedrooms/bathrooms/accommodates/currency
 *                      optional. Flagship endpoint: estimated nightly rate,
 *                      occupancy, and annual revenue for any address.
 *   GET /properties  — location required (city/neighborhood/region). Search
 *                      active Airbnb/VRBO listings with 20+ filter params
 *                      (bedrooms_min/max, bathrooms_min/max, accommodates_min/max,
 *                      ratings_min/max, amenities.*, price_tier, etc).
 * NOT verified (guessed paths all 404'd and were not pursued further): a
 * for-sale-properties search and a single-property-details-by-id endpoint are
 * documented by name (searchForSaleProperties / getPropertyDetails) but their
 * real paths are unconfirmed — do not add calls to them without re-verifying.
 */

const AIRDNA_HOST = 'airdna1.p.rapidapi.com';

function getRapidApiKeys(): string[] {
  return [process.env.RAPIDAPI_KEY_1, process.env.RAPIDAPI_KEY_2, process.env.RAPIDAPI_KEY_3]
    .filter((k): k is string => typeof k === 'string' && k.trim() !== '' && !/your-rapidapi-key/i.test(k));
}

interface AirdnaFetchResult {
  ok: boolean;
  status?: number;
  data?: unknown;
  error?: string;
}

async function airdnaFetch(path: string): Promise<AirdnaFetchResult> {
  const keys = getRapidApiKeys();
  if (keys.length === 0) return { ok: false, error: 'No RAPIDAPI_KEY_* configured' };

  let lastStatus: number | undefined;
  let lastError: string | undefined;

  for (const key of keys) {
    try {
      const res = await fetch(`https://${AIRDNA_HOST}${path}`, {
        headers: { 'X-RapidAPI-Key': key, 'X-RapidAPI-Host': AIRDNA_HOST },
        signal: AbortSignal.timeout(20000),
      });

      if (res.status === 401 || res.status === 403 || res.status === 429) {
        lastStatus = res.status;
        lastError = `HTTP ${res.status}`;
        continue; // try the next key
      }

      const data = await res.json().catch(() => null);
      // The account's PRO plan enforces a tight per-second cap, reported as a
      // plain 200 body (same pattern seen on other RapidAPI real-estate hosts
      // in rapidApiRealEstateService.ts) — surface it as a retryable DEGRADED
      // error rather than treating it as a real (empty) answer.
      const msg = (data as { message?: string } | null)?.message;
      if (typeof msg === 'string' && /rate limit/i.test(msg)) {
        return { ok: false, status: res.status, error: msg };
      }
      if (!res.ok) {
        return { ok: false, status: res.status, data, error: msg || `HTTP ${res.status}` };
      }
      return { ok: true, status: res.status, data };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'Request failed' };
    }
  }

  return { ok: false, status: lastStatus, error: lastError || 'All RapidAPI keys failed' };
}

export interface RentalEstimateParams {
  address: string;
  bedrooms?: number;
  bathrooms?: number;
  accommodates?: number;
  currency?: 'native' | 'usd';
}

export interface RentalEstimateResult {
  marketName?: string;
  submarketName?: string;
  marketScore?: number;
  avgDailyRate?: number;
  occupancyRate?: number;
  annualRevenue?: number;
  currency?: string;
  raw: Record<string, unknown>;
}

interface RentalizerRaw {
  data?: {
    combined_market_info?: {
      airdna_market_name?: string;
      airdna_submarket_name?: string;
      market_score?: number;
    };
    property_statistics?: {
      adr?: { ltm?: number };
      occupancy?: { ltm?: number };
      revenue?: { ltm?: number };
      confidence_score?: { level?: string; score?: number };
    };
    property_details?: { currency_symbol?: string };
  };
}

/** GET /rentalizer — estimated nightly rate, occupancy, and annual revenue for any address. */
export async function getRentalEstimate(
  params: RentalEstimateParams
): Promise<{ ok: boolean; estimate?: RentalEstimateResult; error?: string; status?: number }> {
  const query = new URLSearchParams({ address: params.address });
  if (params.bedrooms != null) query.set('bedrooms', String(params.bedrooms));
  if (params.bathrooms != null) query.set('bathrooms', String(params.bathrooms));
  if (params.accommodates != null) query.set('accommodates', String(params.accommodates));
  if (params.currency) query.set('currency', params.currency);

  const result = await airdnaFetch(`/rentalizer?${query.toString()}`);
  if (!result.ok) {
    return { ok: false, error: result.error, status: result.status };
  }

  const raw = result.data as RentalizerRaw;
  const marketInfo = raw?.data?.combined_market_info;
  const stats = raw?.data?.property_statistics;
  return {
    ok: true,
    estimate: {
      marketName: marketInfo?.airdna_market_name,
      submarketName: marketInfo?.airdna_submarket_name,
      marketScore: marketInfo?.market_score,
      avgDailyRate: stats?.adr?.ltm,
      occupancyRate: stats?.occupancy?.ltm,
      annualRevenue: stats?.revenue?.ltm,
      currency: raw?.data?.property_details?.currency_symbol,
      raw: (raw?.data as unknown as Record<string, unknown>) || {},
    },
  };
}

export interface StrListingSearchParams {
  location: string;
  bedroomsMin?: number;
  bedroomsMax?: number;
  bathroomsMin?: number;
  bathroomsMax?: number;
  accommodatesMin?: number;
  accommodatesMax?: number;
  pageSize?: number;
}

export interface StrListing {
  airbnbPropertyId?: string;
  airbnbListingUrl?: string;
  bookingPropertyId?: string;
  bookingListingUrl?: string;
  bedrooms?: number;
  bathrooms?: number;
  accommodates?: number;
  averageDailyRate?: number;
  daysAvailableLtm?: number;
  currency?: string;
  channels?: string[];
  raw: Record<string, unknown>;
}

/** GET /properties — search active Airbnb/VRBO short-term rental listings by location. */
export async function searchShortTermRentals(
  params: StrListingSearchParams
): Promise<{ ok: boolean; listings: StrListing[]; error?: string; status?: number }> {
  const query = new URLSearchParams({ location: params.location });
  if (params.bedroomsMin != null) query.set('bedrooms_min', String(params.bedroomsMin));
  if (params.bedroomsMax != null) query.set('bedrooms_max', String(params.bedroomsMax));
  if (params.bathroomsMin != null) query.set('bathrooms_min', String(params.bathroomsMin));
  if (params.bathroomsMax != null) query.set('bathrooms_max', String(params.bathroomsMax));
  if (params.accommodatesMin != null) query.set('accommodates_min', String(params.accommodatesMin));
  if (params.accommodatesMax != null) query.set('accommodates_max', String(params.accommodatesMax));
  if (params.pageSize) query.set('page_size', String(params.pageSize));

  const result = await airdnaFetch(`/properties?${query.toString()}`);
  if (!result.ok) {
    return { ok: false, listings: [], error: result.error, status: result.status };
  }

  const data = result.data as { listings?: Array<Record<string, unknown>> };
  const listings = (data?.listings || []).map((raw): StrListing => ({
    airbnbPropertyId: raw.airbnb_property_id as string | undefined,
    airbnbListingUrl: raw.airbnb_listing_url as string | undefined,
    bookingPropertyId: raw.booking_property_id as string | undefined,
    bookingListingUrl: raw.booking_listing_url as string | undefined,
    bedrooms: raw.bedrooms as number | undefined,
    bathrooms: raw.bathrooms as number | undefined,
    accommodates: raw.accommodates as number | undefined,
    averageDailyRate: raw.average_daily_rate_ltm as number | undefined,
    daysAvailableLtm: raw.days_available_ltm as number | undefined,
    currency: raw.currency as string | undefined,
    channels: raw.channels as string[] | undefined,
    raw,
  }));
  return { ok: true, listings };
}

/** Lightweight reachability check for the integration-health dashboard. */
export async function getAirdnaHealth(): Promise<{ status: 'ACTIVE' | 'AUTH_ERROR' | 'DISABLED' | 'DEGRADED'; message: string; hasApiKey: boolean }> {
  const keys = getRapidApiKeys();
  if (keys.length === 0) {
    return { status: 'DISABLED', message: 'No RAPIDAPI_KEY_* configured', hasApiKey: false };
  }
  const result = await airdnaFetch(`/rentalizer?${new URLSearchParams({ address: '650 NE 32nd St, Miami, FL 33137' })}`);
  if (result.status === 401 || result.status === 403) {
    return { status: 'AUTH_ERROR', message: result.error || 'RapidAPI key not subscribed to Airdna', hasApiKey: true };
  }
  if (!result.ok) {
    return { status: 'DEGRADED', message: result.error || 'Airdna unreachable', hasApiKey: true };
  }
  return { status: 'ACTIVE', message: 'Airdna API is reachable', hasApiKey: true };
}
