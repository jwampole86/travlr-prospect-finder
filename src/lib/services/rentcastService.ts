/**
 * RentCast API client — rental listing search.
 *
 * SECURITY: RENTCAST_API_KEY is read server-side only, never exposed to the client.
 * Endpoint/schema verified directly against RentCast's published API reference
 * (https://developers.rentcast.io/reference/rental-listings-long-term) — unlike
 * some other provider integrations in this codebase, these paths are NOT guessed.
 */

const RENTCAST_BASE_URL = 'https://api.rentcast.io/v1';

function getApiKey(): string | null {
  const key = process.env.RENTCAST_API_KEY;
  if (!key || key === 'your-rentcast-api-key-here' || key.trim() === '') {
    return null;
  }
  return key;
}

export interface RentCastListingSearchParams {
  address?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  latitude?: number;
  longitude?: number;
  radius?: number;
  propertyType?: string;
  bedrooms?: string | number;
  bathrooms?: string | number;
  status?: 'Active' | 'Inactive';
  limit?: number;
  offset?: number;
}

export interface RentCastListing {
  id: string;
  formattedAddress: string;
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  state: string;
  zipCode: string;
  county: string | null;
  latitude: number | null;
  longitude: number | null;
  propertyType: string | null;
  bedrooms: number | null;
  bathrooms: number | null;
  squareFootage: number | null;
  yearBuilt: number | null;
  status: string;
  price: number | null;
  listedDate: string | null;
  daysOnMarket: number | null;
  listingAgent: { name?: string; phone?: string; email?: string } | null;
}

function normalizeListing(raw: Record<string, unknown>): RentCastListing {
  const agent = raw.listingAgent as Record<string, unknown> | undefined;
  return {
    id: String(raw.id || ''),
    formattedAddress: String(raw.formattedAddress || ''),
    addressLine1: String(raw.addressLine1 || ''),
    addressLine2: raw.addressLine2 ? String(raw.addressLine2) : null,
    city: String(raw.city || ''),
    state: String(raw.state || ''),
    zipCode: String(raw.zipCode || ''),
    county: raw.county ? String(raw.county) : null,
    latitude: typeof raw.latitude === 'number' ? raw.latitude : null,
    longitude: typeof raw.longitude === 'number' ? raw.longitude : null,
    propertyType: raw.propertyType ? String(raw.propertyType) : null,
    bedrooms: typeof raw.bedrooms === 'number' ? raw.bedrooms : null,
    bathrooms: typeof raw.bathrooms === 'number' ? raw.bathrooms : null,
    squareFootage: typeof raw.squareFootage === 'number' ? raw.squareFootage : null,
    yearBuilt: typeof raw.yearBuilt === 'number' ? raw.yearBuilt : null,
    status: String(raw.status || 'Unknown'),
    price: typeof raw.price === 'number' ? raw.price : null,
    listedDate: raw.listedDate ? String(raw.listedDate) : null,
    daysOnMarket: typeof raw.daysOnMarket === 'number' ? raw.daysOnMarket : null,
    listingAgent: agent ? { name: agent.name as string, phone: agent.phone as string, email: agent.email as string } : null,
  };
}

/** GET /listings/rental/long-term — active/inactive "for rent" listings by address, city/state/zip, or radius search. */
export async function searchRentalListings(
  params: RentCastListingSearchParams
): Promise<{ ok: boolean; listings: RentCastListing[]; error?: string; status?: number }> {
  const apiKey = getApiKey();
  if (!apiKey) {
    return { ok: false, listings: [], error: 'RENTCAST_API_KEY not configured' };
  }

  const query = new URLSearchParams();
  if (params.address) query.set('address', params.address);
  if (params.city) query.set('city', params.city);
  if (params.state) query.set('state', params.state);
  if (params.zipCode) query.set('zipCode', params.zipCode);
  if (params.latitude != null) query.set('latitude', String(params.latitude));
  if (params.longitude != null) query.set('longitude', String(params.longitude));
  if (params.radius != null) query.set('radius', String(params.radius));
  if (params.propertyType) query.set('propertyType', params.propertyType);
  if (params.bedrooms != null) query.set('bedrooms', String(params.bedrooms));
  if (params.bathrooms != null) query.set('bathrooms', String(params.bathrooms));
  query.set('status', params.status || 'Active');
  query.set('limit', String(Math.min(500, Math.max(1, params.limit ?? 50))));
  if (params.offset != null) query.set('offset', String(params.offset));

  try {
    const res = await fetch(`${RENTCAST_BASE_URL}/listings/rental/long-term?${query.toString()}`, {
      method: 'GET',
      headers: { 'X-Api-Key': apiKey, Accept: 'application/json' },
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({} as Record<string, unknown>));
      return {
        ok: false,
        listings: [],
        error: (body.message as string) || `RentCast API error: ${res.status}`,
        status: res.status,
      };
    }

    const data = await res.json();
    const listings = Array.isArray(data) ? data.map(normalizeListing) : [];
    return { ok: true, listings };
  } catch (err) {
    return { ok: false, listings: [], error: err instanceof Error ? err.message : 'RentCast request failed' };
  }
}

/** Lightweight reachability + auth check — used by the integration health dashboard. */
export async function getProviderHealth(): Promise<{
  status: 'ACTIVE' | 'AUTH_ERROR' | 'DISABLED' | 'DEGRADED';
  message: string;
  hasApiKey: boolean;
}> {
  const apiKey = getApiKey();
  if (!apiKey) {
    return { status: 'DISABLED', message: 'RENTCAST_API_KEY not configured', hasApiKey: false };
  }

  try {
    // Smallest possible real request (limit=1, one known city) — confirms auth
    // without burning a meaningful chunk of the monthly quota.
    const res = await fetch(`${RENTCAST_BASE_URL}/listings/rental/long-term?city=Austin&state=TX&limit=1`, {
      headers: { 'X-Api-Key': apiKey, Accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
    });

    if (res.status === 401 || res.status === 403) {
      return { status: 'AUTH_ERROR', message: 'API key invalid or unauthorized', hasApiKey: true };
    }
    if (!res.ok) {
      return { status: 'DEGRADED', message: `RentCast returned ${res.status}`, hasApiKey: true };
    }
    return { status: 'ACTIVE', message: 'RentCast API is reachable', hasApiKey: true };
  } catch {
    return { status: 'DEGRADED', message: 'RentCast API unreachable', hasApiKey: true };
  }
}
