import 'server-only';

const HOST = 'airdna1.p.rapidapi.com';
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const num = (v: unknown) => (v === null || v === undefined || v === '' || Number.isNaN(Number(v)) ? null : Number(v));

export function airdnaKeys(): string[] {
  return [process.env.RAPIDAPI_KEY_1, process.env.RAPIDAPI_KEY_2, process.env.RAPIDAPI_KEY_3].filter((k): k is string => !!k && !/your-rapidapi-key/i.test(k));
}

export interface ListingsPage { listings: Array<Record<string, any>>; total: number; quotaRemaining: number | null }

/** One AirDNA /properties request (up to 100 listings). Each request counts against the monthly allowance. */
export async function fetchListingsPage(params: Record<string, string>, onCall?: () => void): Promise<ListingsPage> {
  const keys = airdnaKeys();
  for (let attempt = 0; attempt < 5; attempt++) {
    for (const key of keys) {
      await sleep(1600); // the plan allows roughly one request per second
      onCall?.();
      const res = await fetch(`https://${HOST}/properties?${new URLSearchParams(params)}`, { headers: { 'X-RapidAPI-Key': key, 'X-RapidAPI-Host': HOST }, signal: AbortSignal.timeout(60_000) });
      if ([401, 403, 429].includes(res.status)) continue;
      const data = await res.json().catch(() => null) as { listings?: Array<Record<string, any>>; pagination?: { row_count?: number }; message?: string } | null;
      if (data?.message && /rate limit/i.test(data.message)) { await sleep(4000 * (attempt + 1)); continue; }
      if (!res.ok || !data) throw new Error(`AirDNA ${res.status}: ${data?.message ?? 'no body'}`);
      const remaining = Number(res.headers.get('x-ratelimit-requests-remaining'));
      return { listings: data.listings ?? [], total: data.pagination?.row_count ?? 0, quotaRemaining: Number.isFinite(remaining) ? remaining : null };
    }
  }
  throw new Error('AirDNA request kept failing (rate limit or quota)');
}

export function toListingRow(market: string, l: Record<string, any>) {
  const images = Array.isArray(l.images) ? (l.images as string[]) : [];
  return {
    property_id: String(l.property_id), market, title: l.title ?? null,
    airbnb_url: l.airbnb_listing_url ?? null, vrbo_url: l.vrbo_listing_url ?? null, booking_url: l.booking_listing_url ?? null, channels: l.channels ?? null,
    host_id: l.property_manager_name_or_host ?? null, bedrooms: num(l.bedrooms), bathrooms: num(l.bathrooms), accommodates: num(l.accommodates),
    adr: num(l.average_daily_rate_ltm), occupancy_pct: num(l.occupancy_rate_ltm), days_available_ltm: num(l.days_available_ltm),
    revenue_ltm: num(l.revenue_ltm), revenue_potential_ltm: num(l.revenue_potential_ltm), rating: num(l.rating), reviews: num(l.reviews),
    lat: num(l.location?.lat), lng: num(l.location?.lng), address_match_confidence: l.address_match_confidence ?? null,
    photo_count: images.length, photo_urls: images.slice(0, 12), pulled_at: new Date().toISOString(),
  };
}
