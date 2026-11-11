import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { normStreet } from '@/lib/normStreet';

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const toRad = (d: number) => (d * Math.PI) / 180;
export function meters(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const dLat = toRad(b.lat - a.lat), dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(h));
}

interface Parcel { formattedAddress?: string; addressLine1?: string; latitude?: number; longitude?: number; bedrooms?: number; bathrooms?: number; squareFootage?: number; ownerOccupied?: boolean; owner?: { names?: string[]; type?: string; mailingAddress?: { formattedAddress?: string } } }

async function parcelsNear(lat: number, lng: number, radiusMiles: number): Promise<Parcel[]> {
  const key = process.env.RENTCAST_API_KEY!;
  for (let attempt = 0; attempt < 3; attempt++) {
    await sleep(400);
    const res = await fetch(`https://api.rentcast.io/v1/properties?latitude=${lat}&longitude=${lng}&radius=${radiusMiles}&limit=300`, { headers: { 'X-Api-Key': key, accept: 'application/json' }, signal: AbortSignal.timeout(40_000) });
    if (res.status === 429) { await sleep(3000); continue; }
    const d = await res.json().catch(() => null);
    if (Array.isArray(d)) return d as Parcel[];
    throw new Error(`RentCast: ${JSON.stringify(d).slice(0, 160)}`);
  }
  throw new Error('RentCast rate limited');
}

export interface MatchOptions {
  markets?: string[];
  /** Match every pulled market outside these states (state codes). */
  exceptStates?: string[];
  /** Skip listings that already have a match result, so a scheduled run only looks at new ones. */
  onlyUnmatched?: boolean;
  /** With onlyUnmatched: also look again at listings that found no registry nearby, which is worth doing after new registries are loaded. Unchanged results are not rewritten. */
  recheckNoRegistry?: boolean;
  /** Only listings that currently have one of these match results (for example 'too_many'), for a targeted re-check. */
  onlyStatuses?: string[];
  /** Multiplies the search radius; below 1 narrows it, so crowded areas yield fewer candidates. */
  radiusScale?: number;
  /** Only write results that narrowed to one to three homes; anything else keeps its earlier result. */
  onlyImprove?: boolean;
  /** Only ELITE listings. */
  eliteOnly?: boolean;
  /** Only LUXURY listings (ELITE included). */
  luxuryOnly?: boolean;
  write: boolean;
  /** Stops RentCast property lookups once this many were made; remaining listings are left for the next run. */
  maxLookups?: number;
  onProgress?: (status: string) => void;
}
export interface MatchSummary { checked: number; tally: Record<string, number>; uniqueIds: string[]; unique: Array<{ market: string; title: string | null; address: string; jurisdiction: string; permit: string; distanceM: number; owner: string; holder: string }> }

/**
 * Matches candidate listings to public short-term-rental registry entries. Airbnb blurs locations, so the search radius follows how sure
 * AirDNA is of the location, and a registry entry is only accepted when its bedrooms (and bathrooms, where the property record has them) agree.
 * Matches are probable, not certain, and are meant for human review.
 */
export async function matchOwners(db: SupabaseClient, opts: MatchOptions): Promise<MatchSummary> {
  // Without a RentCast key, only registries that publish bedrooms can be matched; the rest are left for a run that has one.
  const canLookUp = !!process.env.RENTCAST_API_KEY;
  const except = (opts.exceptStates ?? []).map(s => s.toUpperCase());
  const cands: Array<Record<string, any>> = [];
  const chunks = opts.markets && !except.length ? Array.from({ length: Math.ceil(opts.markets.length / 40) }, (_, i) => opts.markets!.slice(i * 40, i * 40 + 40)) : [null];
  for (const chunk of chunks) {
    for (let from = 0; ; from += 1000) {
      let q = db.from('str_listings').select('property_id,market,title,bedrooms,bathrooms,lat,lng,address_match_confidence,host_listing_count,is_luxury,is_elite,revenue_potential_ltm,under_score,matched_owner,match_status').or('segment.eq.candidate,and(segment.eq.new_or_dormant,is_luxury.eq.true)').order('property_id');
      if (chunk) q = q.in('market', chunk);
      if (opts.onlyStatuses?.length) q = q.in('match_status', opts.onlyStatuses);
      else if (opts.onlyUnmatched) q = opts.recheckNoRegistry ? q.or('match_status.is.null,match_status.eq.no_registry_nearby') : q.is('match_status', null);
      if (opts.eliteOnly) q = q.eq('is_elite', true);
      if (opts.luxuryOnly) q = q.eq('is_luxury', true);
      const { data, error } = await q.range(from, from + 999); if (error) throw error;
      cands.push(...(data ?? []).filter(c => !except.length || !except.includes(String(c.market).split(',').pop()!.trim().toUpperCase())));
      if ((data ?? []).length < 1000) break;
    }
  }

  type RegRow = { jurisdiction: string; permit_id: string; address: string; address_norm: string; lat: number; lng: number; holder_name: string | null; license_type: string | null; bedrooms: number | null; contact: Record<string, any> | null };
  // The registry is large (hundreds of thousands of licences), so only the area around each market's candidates is read.
  const regByKey = new Map<string, RegRow>();
  const boxes = new Map<string, { s: number; n: number; w: number; e: number }>();
  for (const c of cands) {
    if (c.lat == null || c.lng == null) continue;
    const lat = Number(c.lat), lng = Number(c.lng); const k = String(c.market); const bx = boxes.get(k);
    if (!bx) boxes.set(k, { s: lat, n: lat, w: lng, e: lng }); else { bx.s = Math.min(bx.s, lat); bx.n = Math.max(bx.n, lat); bx.w = Math.min(bx.w, lng); bx.e = Math.max(bx.e, lng); }
  }
  for (const bx of boxes.values()) {
    // PostgREST returns at most 1,000 rows per request, so each area is read in pages.
    for (let from = 0; ; from += 1000) {
      const { data, error } = await db.from('str_registry').select('jurisdiction,permit_id,address,address_norm,lat,lng,holder_name,license_type,active,bedrooms,contact').eq('active', true)
        .gte('lat', bx.s - 0.03).lte('lat', bx.n + 0.03).gte('lng', bx.w - 0.04).lte('lng', bx.e + 0.04).order('jurisdiction').order('permit_id').range(from, from + 999);
      if (error) throw error;
      for (const r of (data ?? []) as RegRow[]) if (r.lat != null && r.lng != null) regByKey.set(`${r.jurisdiction}|${r.permit_id}`, r);
      if ((data ?? []).length < 1000) break;
    }
  }
  // A grid of about 2 km cells keeps the nearby-licence lookup fast when there are tens of thousands of licences.
  const CELL = 0.02;
  const grid = new Map<string, RegRow[]>();
  for (const r of regByKey.values()) { const k = `${Math.floor(r.lat / CELL)}|${Math.floor(r.lng / CELL)}`; const g = grid.get(k); if (g) g.push(r); else grid.set(k, [r]); }
  const licencesAround = (p: { lat: number; lng: number }) => {
    const out: RegRow[] = []; const ci = Math.floor(p.lat / CELL), cj = Math.floor(p.lng / CELL);
    for (let i = ci - 1; i <= ci + 1; i++) for (let j = cj - 1; j <= cj + 1; j++) { const g = grid.get(`${i}|${j}`); if (g) out.push(...g); }
    return out;
  };

  const results: Array<Record<string, any>> = []; let lookups = 0;
  // The lookup budget goes to the most valuable homes first.
  cands.sort((a, b) => Number(!!b.is_elite) - Number(!!a.is_elite) || Number(!!b.is_luxury) - Number(!!a.is_luxury) || Number(b.revenue_potential_ltm ?? 0) - Number(a.revenue_potential_ltm ?? 0));
  for (const c of cands) {
    if (c.lat == null || c.lng == null) continue;
    const here = { lat: Number(c.lat), lng: Number(c.lng) };
    const radiusM = (c.address_match_confidence === 'High' ? 150 : c.address_match_confidence === 'Medium' ? 350 : 600) * (opts.radiusScale ?? 1);
    const near = licencesAround(here).filter(r => meters(here, r) <= radiusM);
    let status = 'no_registry_nearby'; const candidates: Array<Record<string, any>> = [];
    if (near.length) {
      const needsParcels = near.some(r => r.bedrooms == null);
      if (needsParcels && (!canLookUp || (opts.maxLookups != null && lookups >= opts.maxLookups))) continue;
      // The property record is only needed for registries that do not publish bedrooms.
      const parcels = needsParcels ? (lookups++, await parcelsNear(here.lat, here.lng, radiusM / 1609.34 + 0.02)) : [];
      const byAddr = new Map(parcels.map(p => [normStreet(p.addressLine1 ?? p.formattedAddress ?? ''), p]));
      const b = Number(c.bathrooms ?? 0);
      // Listing and county records often count rooms differently, so a loose pass (one bedroom or bath off) is offered for ELITE homes, always for a person to confirm.
      const build = (loose: boolean) => {
        const out: Array<Record<string, any>> = [];
        const bedsOk = (x: number | null) => (loose ? x != null && Math.abs(x - Number(c.bedrooms)) <= 1 : x === c.bedrooms);
        for (const r of near) {
          if (r.bedrooms != null) {
            if (!bedsOk(r.bedrooms)) continue;
            out.push({ address: r.address, jurisdiction: r.jurisdiction, permit: r.permit_id, permitHolder: r.holder_name, distanceM: Math.round(meters(here, r)), beds: r.bedrooms, baths: null, sqft: null, loose,
              ownerNames: r.holder_name ? [r.holder_name] : [], ownerType: null, mailing: r.contact?.ownerMailing ?? null, ownerOccupied: null, contact: r.contact ?? null });
            continue;
          }
          const p = byAddr.get(r.address_norm); if (!p) continue;
          if (!bedsOk(p.bedrooms ?? null) || Math.abs((p.bathrooms ?? 0) - b) > (loose ? 1 : 0.5)) continue;
          out.push({ address: r.address, jurisdiction: r.jurisdiction, permit: r.permit_id, permitHolder: r.holder_name, distanceM: Math.round(meters(here, r)), beds: p.bedrooms, baths: p.bathrooms, sqft: p.squareFootage ?? null, loose,
            ownerNames: p.owner?.names ?? [], ownerType: p.owner?.type ?? null, mailing: p.owner?.mailingAddress?.formattedAddress ?? null, ownerOccupied: p.ownerOccupied ?? null, contact: r.contact ?? null });
        }
        return out.sort((x, y) => x.distanceM - y.distanceM);
      };
      candidates.push(...build(false));
      status = candidates.length === 1 ? 'unique' : candidates.length >= 2 && candidates.length <= 3 ? 'ambiguous' : candidates.length > 3 ? 'too_many' : 'none_match';
      if (status === 'none_match' && c.is_elite) {
        const loose = build(true);
        if (loose.length >= 1 && loose.length <= 3) { candidates.push(...loose); status = 'ambiguous'; }
      }
    }
    // No permit list covers this area. For an ELITE home, or a LUXURY one with big potential, the county parcels with the same bedrooms and bathrooms are offered as candidates when there are few enough to choose from.
    else if ((c.is_elite || (c.is_luxury && Number(c.revenue_potential_ltm ?? 0) >= 150_000)) && canLookUp && (opts.maxLookups == null || lookups < opts.maxLookups)) {
      lookups++;
      const parcels = await parcelsNear(here.lat, here.lng, radiusM / 1609.34 + 0.02).catch(() => [] as Parcel[]);
      const b = Number(c.bathrooms ?? 0);
      const found = parcels.filter(p => p.bedrooms === c.bedrooms && Math.abs((p.bathrooms ?? 0) - b) <= 0.5 && p.formattedAddress)
        .map(p => ({ address: p.formattedAddress!, jurisdiction: 'county_parcel', permit: null, permitHolder: null, distanceM: p.latitude != null && p.longitude != null ? Math.round(meters(here, { lat: p.latitude, lng: p.longitude })) : null, beds: p.bedrooms, baths: p.bathrooms, sqft: p.squareFootage ?? null, parcelOnly: true,
          ownerNames: p.owner?.names ?? [], ownerType: p.owner?.type ?? null, mailing: p.owner?.mailingAddress?.formattedAddress ?? null, ownerOccupied: p.ownerOccupied ?? null, contact: null }))
        .sort((x, y) => (x.distanceM ?? 1e9) - (y.distanceM ?? 1e9));
      if (found.length >= 1 && found.length <= 3) { candidates.push(...found); status = 'ambiguous'; }
    }
    if (opts.onlyImprove && status !== 'unique' && status !== 'ambiguous') { opts.onProgress?.('x'); continue; }
    // Nothing changed for a listing that still has no registry nearby, so there is nothing to write.
    if (opts.recheckNoRegistry && status === 'no_registry_nearby' && c.match_status === 'no_registry_nearby') { opts.onProgress?.('.'); continue; }
    results.push({ property_id: c.property_id, market: c.market, title: c.title, status, candidates, previous: c.matched_owner ?? null });
    opts.onProgress?.(status === 'unique' ? 'U' : status === 'ambiguous' ? 'a' : status === 'no_registry_nearby' ? '.' : 'x');
  }

  const tally = results.reduce<Record<string, number>>((m, r) => { m[r.status] = (m[r.status] ?? 0) + 1; return m; }, {});
  const unique = results.filter(x => x.status === 'unique').map(r => { const m = r.candidates[0]; return { market: r.market, title: r.title, address: m.address, jurisdiction: m.jurisdiction, permit: m.permit, distanceM: m.distanceM, owner: m.ownerNames.join(' & '), holder: m.permitHolder ?? '' }; });
  if (opts.write) {
    for (const r of results) {
      const m = r.status === 'unique' ? r.candidates[0] : null;
      // Skip-trace results belong to the person, so they stay only while the matched property is unchanged.
      const same = m && r.previous && r.previous.permit === m.permit && r.previous.jurisdiction === m.jurisdiction;
      await db.from('str_listings').update({ match_status: r.status, match_candidates: r.candidates, matched_address: m?.address ?? null, matched_owner: m ? { names: m.ownerNames, type: m.ownerType, mailing: m.mailing, permitHolder: m.permitHolder, ownerOccupied: m.ownerOccupied, permit: m.permit, jurisdiction: m.jurisdiction, contact: m.contact ?? null, ...(same && r.previous.skipTrace ? { skipTrace: r.previous.skipTrace } : {}), ...(same && r.previous.homesage ? { homesage: r.previous.homesage } : {}) } : null, matched_at: new Date().toISOString() }).eq('property_id', r.property_id);
    }
  }
  return { checked: results.length, tally, uniqueIds: results.filter(x => x.status === 'unique').map(x => x.property_id), unique };
}
