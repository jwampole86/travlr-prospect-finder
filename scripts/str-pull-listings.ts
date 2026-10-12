/**
 * Pulls active short-term-rental listings (Airbnb / Vrbo / Booking.com) for a set of markets from the AirDNA RapidAPI
 * and stores them in str_listings for underperformance scoring. The request and row mapping live in src/lib/services/strPull.ts.
 *
 *   npx tsx scripts/str-pull-listings.ts --markets="Breckenridge, CO|Aspen, CO" --bedrooms-min=3          (dry run: first page only)
 *   npx tsx scripts/str-pull-listings.ts --markets=... --go                                              (full pull + store)
 *   npx tsx scripts/str-pull-listings.ts --markets=... --max-pages=4 --go                                (cap calls per market)
 *
 * Each call returns up to 100 listings and counts against the provider's monthly allowance, so a dry run makes one call per market.
 * Each market is stored as soon as it is pulled, and a market that fails is reported and skipped.
 */
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { airdnaKeys, fetchListingsPage, toListingRow } from '@/lib/services/strPull';

const arg = (n: string) => process.argv.find(a => a.startsWith(`--${n}=`))?.split('=').slice(1).join('=');
const GO = process.argv.includes('--go');
const markets = (arg('markets') ?? 'Breckenridge, CO').split('|').map(s => s.trim()).filter(Boolean);
const bedroomsMin = Number(arg('bedrooms-min') ?? 3);
const maxPages = Number(arg('max-pages') ?? 1000); // caps calls per market (100 listings per page)

let calls = 0;
const call = (params: Record<string, string>) => fetchListingsPage(params, () => { calls++; });

(async () => {
  if (!airdnaKeys().length) throw new Error('No RAPIDAPI_KEY_* configured');
  const db = getSupabaseAdmin();
  const seen = new Map<string, ReturnType<typeof toListingRow>>();
  for (const market of markets) {
    const base = { location: market, page_size: '100', bedrooms_min: String(bedroomsMin), listing_type: 'entire_place' };
    try {
      const first = await call(base);
      console.log(`${market}: ${first.total} listings with ${bedroomsMin}+ bedrooms (${Math.ceil(first.total / 100)} calls${first.total > maxPages * 100 ? `, capped at ${maxPages}` : ''})`);
      let got = first.listings;
      if (GO) {
        for (let offset = 100; offset < Math.min(first.total, maxPages * 100); offset += 100) { got = got.concat((await call({ ...base, offset: String(offset) })).listings); process.stdout.write('.'); }
        console.log();
      }
      const fresh = new Map<string, ReturnType<typeof toListingRow>>();
      for (const l of got) if (l.property_id && !seen.has(String(l.property_id))) { const r = toListingRow(market, l); seen.set(String(l.property_id), r); fresh.set(String(l.property_id), r); }
      if (GO && fresh.size) {
        const perHost = new Map<string, number>();
        for (const r of fresh.values()) if (r.host_id) perHost.set(r.host_id, (perHost.get(r.host_id) ?? 0) + 1);
        const part = [...fresh.values()].map(r => ({ ...r, host_listing_count: r.host_id ? perHost.get(r.host_id) ?? 1 : null }));
        for (let i = 0; i < part.length; i += 200) { const { error } = await db.from('str_listings').upsert(part.slice(i, i + 200), { onConflict: 'property_id' }); if (error) throw error; }
      }
    } catch (e) { console.log(`${market}: FAILED (${(e as Error).message.slice(0, 120)})`); }
  }
  console.log(`unique listings fetched: ${seen.size} | API calls made: ${calls}`);
  if (!GO) console.log('DRY RUN: first page only, nothing stored. Re-run with --go.');
})().catch(e => { console.error(e); process.exit(1); });
