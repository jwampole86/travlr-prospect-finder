/**
 * Matches scored STR listing candidates to a real, licensed property.
 *
 * A listing only has an approximate map point, so a single test is never enough. A candidate is matched only when a property
 *   (1) is on a public STR license registry (str_registry),
 *   (2) lies within the listing's location uncertainty, and
 *   (3) has the same bedrooms and (within half a bath) bathrooms in the county property record (RentCast).
 * Exactly one such property is a "unique" match; two or three are kept as "ambiguous" for a person to decide; the rest stay unmatched.
 * Owner details come from the county property record, not from the listing.
 *
 *   npx tsx scripts/str-match-owners.ts --markets="Breckenridge, CO|Aspen, CO"          (dry run: prints results, writes nothing)
 *   npx tsx scripts/str-match-owners.ts --markets=... --go
 */
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { normStreet } from './lib/normStreet';

const arg = (n: string) => process.argv.find(a => a.startsWith(`--${n}=`))?.split('=').slice(1).join('=');
const GO = process.argv.includes('--go');
const markets = (arg('markets') ?? 'Breckenridge, CO|Aspen, CO').split('|').map(s => s.trim());
const KEY = process.env.RENTCAST_API_KEY;
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

const toRad = (d: number) => (d * Math.PI) / 180;
function meters(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const dLat = toRad(b.lat - a.lat), dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(h));
}

interface Parcel { formattedAddress?: string; addressLine1?: string; bedrooms?: number; bathrooms?: number; squareFootage?: number; ownerOccupied?: boolean; owner?: { names?: string[]; type?: string; mailingAddress?: { formattedAddress?: string } } }

async function parcelsNear(lat: number, lng: number, radiusMiles: number): Promise<Parcel[]> {
  for (let attempt = 0; attempt < 3; attempt++) {
    await sleep(400);
    const res = await fetch(`https://api.rentcast.io/v1/properties?latitude=${lat}&longitude=${lng}&radius=${radiusMiles}&limit=300`, { headers: { 'X-Api-Key': KEY!, accept: 'application/json' }, signal: AbortSignal.timeout(40_000) });
    if (res.status === 429) { await sleep(3000); continue; }
    const d = await res.json().catch(() => null);
    if (Array.isArray(d)) return d as Parcel[];
    throw new Error(`RentCast: ${JSON.stringify(d).slice(0, 160)}`);
  }
  throw new Error('RentCast rate limited');
}

(async () => {
  if (!KEY) throw new Error('RENTCAST_API_KEY is not set');
  const db = getSupabaseAdmin();
  const { data: reg } = await db.from('str_registry').select('jurisdiction,permit_id,address,address_norm,lat,lng,holder_name,license_type,active').eq('active', true).limit(10000);
  const registry = (reg ?? []).filter(r => r.lat != null && r.lng != null) as Array<{ jurisdiction: string; permit_id: string; address: string; address_norm: string; lat: number; lng: number; holder_name: string | null; license_type: string | null }>;
  console.log(`registry entries available: ${registry.length}`);

  const { data: cands } = await db.from('str_listings').select('property_id,market,title,bedrooms,bathrooms,lat,lng,address_match_confidence,host_listing_count,is_luxury,under_score').eq('segment', 'candidate').in('market', markets).limit(2000);
  const results: Array<Record<string, any>> = [];
  for (const c of cands ?? []) {
    const here = { lat: Number(c.lat), lng: Number(c.lng) };
    // Airbnb blurs locations, and "High" confidence is the exception, so the search area follows how sure the match is.
    const radiusM = c.address_match_confidence === 'High' ? 150 : c.address_match_confidence === 'Medium' ? 350 : 600;
    const near = registry.filter(r => meters(here, r) <= radiusM);
    let status = 'no_registry_nearby'; let candidates: Array<Record<string, any>> = [];
    if (near.length) {
      const parcels = await parcelsNear(here.lat, here.lng, radiusM / 1609.34 + 0.02);
      const byAddr = new Map(parcels.map(p => [normStreet(p.addressLine1 ?? p.formattedAddress ?? ''), p]));
      const b = Number(c.bathrooms ?? 0);
      for (const r of near) {
        const p = byAddr.get(r.address_norm); if (!p) continue;
        if (p.bedrooms !== c.bedrooms || Math.abs((p.bathrooms ?? 0) - b) > 0.5) continue;
        candidates.push({ address: r.address, jurisdiction: r.jurisdiction, permit: r.permit_id, permitHolder: r.holder_name, distanceM: Math.round(meters(here, r)), beds: p.bedrooms, baths: p.bathrooms, sqft: p.squareFootage ?? null,
          ownerNames: p.owner?.names ?? [], ownerType: p.owner?.type ?? null, mailing: p.owner?.mailingAddress?.formattedAddress ?? null, ownerOccupied: p.ownerOccupied ?? null });
      }
      candidates.sort((x, y) => x.distanceM - y.distanceM);
      status = candidates.length === 1 ? 'unique' : candidates.length >= 2 && candidates.length <= 3 ? 'ambiguous' : candidates.length > 3 ? 'too_many' : 'none_match';
    }
    results.push({ property_id: c.property_id, market: c.market, title: c.title, confidence: c.address_match_confidence, status, candidates });
    process.stdout.write(status === 'unique' ? 'U' : status === 'ambiguous' ? 'a' : status === 'no_registry_nearby' ? '.' : 'x');
  }
  console.log();
  const tally = results.reduce<Record<string, number>>((m, r) => { m[r.status] = (m[r.status] ?? 0) + 1; return m; }, {});
  console.log('candidates checked:', results.length, tally);
  for (const r of results.filter(x => x.status === 'unique').slice(0, 8)) { const m = r.candidates[0]; console.log(`UNIQUE ${r.market.split(',')[0]} | ${r.title?.slice(0, 40)} -> ${m.address} (${m.jurisdiction} ${m.permit}) ${m.distanceM}m | owner of record: ${m.ownerNames.join(' & ') || 'n/a'} | permit holder: ${m.permitHolder ?? 'n/a'}`); }
  if (!GO) { console.log('\nDRY RUN: nothing written. Re-run with --go.'); return; }
  for (const r of results) {
    const m = r.status === 'unique' ? r.candidates[0] : null;
    await db.from('str_listings').update({ match_status: r.status, match_candidates: r.candidates, matched_address: m?.address ?? null, matched_owner: m ? { names: m.ownerNames, type: m.ownerType, mailing: m.mailing, permitHolder: m.permitHolder, ownerOccupied: m.ownerOccupied, permit: m.permit, jurisdiction: m.jurisdiction } : null, matched_at: new Date().toISOString() }).eq('property_id', r.property_id);
  }
  console.log('saved');
})().catch(e => { console.error(e); process.exit(1); });
