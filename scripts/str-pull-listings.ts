/**
 * Pulls active short-term-rental listings (Airbnb / Vrbo / Booking.com) for a set of markets from the AirDNA RapidAPI
 * and stores them in str_listings for underperformance scoring.
 *
 *   npx tsx scripts/str-pull-listings.ts --markets="Breckenridge, CO|Aspen, CO" --bedrooms-min=3          (dry run: first page only)
 *   npx tsx scripts/str-pull-listings.ts --markets=... --go                                              (full pull + store)
 *
 * Each call returns up to 100 listings and counts against the provider's monthly allowance, so a dry run makes one call per market.
 */
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

const arg = (n: string) => process.argv.find(a => a.startsWith(`--${n}=`))?.split('=').slice(1).join('=');
const GO = process.argv.includes('--go');
const markets = (arg('markets') ?? 'Breckenridge, CO').split('|').map(s => s.trim()).filter(Boolean);
const bedroomsMin = Number(arg('bedrooms-min') ?? 3);
const HOST = 'airdna1.p.rapidapi.com';
const KEYS = [process.env.RAPIDAPI_KEY_1, process.env.RAPIDAPI_KEY_2, process.env.RAPIDAPI_KEY_3].filter((k): k is string => !!k && !/your-rapidapi-key/i.test(k));
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

let calls = 0;
async function call(params: Record<string, string>): Promise<{ listings: Array<Record<string, any>>; total: number }> {
  for (let attempt = 0; attempt < 5; attempt++) {
    for (const key of KEYS) {
      await sleep(1600); // the plan allows roughly one request per second
      calls++;
      const res = await fetch(`https://${HOST}/properties?${new URLSearchParams(params)}`, { headers: { 'X-RapidAPI-Key': key, 'X-RapidAPI-Host': HOST }, signal: AbortSignal.timeout(90_000) });
      if ([401, 403, 429].includes(res.status)) continue;
      const data = await res.json().catch(() => null) as { listings?: Array<Record<string, any>>; pagination?: { row_count?: number }; message?: string } | null;
      if (data?.message && /rate limit/i.test(data.message)) { await sleep(4000 * (attempt + 1)); continue; }
      if (!res.ok || !data) throw new Error(`AirDNA ${res.status}: ${data?.message ?? 'no body'}`);
      return { listings: data.listings ?? [], total: data.pagination?.row_count ?? 0 };
    }
  }
  throw new Error('AirDNA request kept failing (rate limit or quota)');
}

const num = (v: unknown) => (v === null || v === undefined || v === '' || Number.isNaN(Number(v)) ? null : Number(v));

function toRow(market: string, l: Record<string, any>) {
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

(async () => {
  if (!KEYS.length) throw new Error('No RAPIDAPI_KEY_* configured');
  const db = getSupabaseAdmin();
  const seen = new Map<string, ReturnType<typeof toRow>>();
  for (const market of markets) {
    const base = { location: market, page_size: '100', bedrooms_min: String(bedroomsMin), listing_type: 'entire_place' };
    const first = await call(base);
    console.log(`${market}: ${first.total} listings with ${bedroomsMin}+ bedrooms (${Math.ceil(first.total / 100)} calls)`);
    let got = first.listings;
    if (GO) {
      for (let offset = 100; offset < first.total; offset += 100) { got = got.concat((await call({ ...base, offset: String(offset) })).listings); process.stdout.write('.'); }
      console.log();
    }
    for (const l of got) if (l.property_id && !seen.has(String(l.property_id))) seen.set(String(l.property_id), toRow(market, l));
  }
  console.log(`unique listings fetched: ${seen.size} | API calls made: ${calls}`);
  if (!GO) { console.log('DRY RUN: first page only, nothing stored. Re-run with --go.'); return; }

  // How many homes each host runs across everything pulled, so professional managers can be told apart from owner-hosts.
  const perHost = new Map<string, number>();
  for (const r of seen.values()) if (r.host_id) perHost.set(r.host_id, (perHost.get(r.host_id) ?? 0) + 1);
  const rows = [...seen.values()].map(r => ({ ...r, host_listing_count: r.host_id ? perHost.get(r.host_id) ?? 1 : null }));
  for (let i = 0; i < rows.length; i += 200) {
    const { error } = await db.from('str_listings').upsert(rows.slice(i, i + 200), { onConflict: 'property_id' });
    if (error) throw error;
  }
  console.log(`stored ${rows.length} listings`);
})().catch(e => { console.error(e); process.exit(1); });
