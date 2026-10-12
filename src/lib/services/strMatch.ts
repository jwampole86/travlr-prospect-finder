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

interface Parcel { formattedAddress?: string; addressLine1?: string; bedrooms?: number; bathrooms?: number; squareFootage?: number; ownerOccupied?: boolean; owner?: { names?: string[]; type?: string; mailingAddress?: { formattedAddress?: string } } }

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
  const reg: Array<Record<string, any>> = [];
  // PostgREST returns at most 1,000 rows per request, so the registry has to be read in pages.
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from('str_registry').select('jurisdiction,permit_id,address,address_norm,lat,lng,holder_name,license_type,active,bedrooms,contact').eq('active', true).order('jurisdiction').order('permit_id').range(from, from + 999);
    if (error) throw error;
    reg.push(...(data ?? []));
    if ((data ?? []).length < 1000) break;
  }
  const registry = reg.filter(r => r.lat != null && r.lng != null) as Array<{ jurisdiction: string; permit_id: string; address: string; address_norm: string; lat: number; lng: number; holder_name: string | null; license_type: string | null; bedrooms: number | null; contact: Record<string, any> | null }>;

  const except = (opts.exceptStates ?? []).map(s => s.toUpperCase());
  const cands: Array<Record<string, any>> = [];
  const chunks = opts.markets && !except.length ? Array.from({ length: Math.ceil(opts.markets.length / 40) }, (_, i) => opts.markets!.slice(i * 40, i * 40 + 40)) : [null];
  for (const chunk of chunks) {
    for (let from = 0; ; from += 1000) {
      let q = db.from('str_listings').select('property_id,market,title,bedrooms,bathrooms,lat,lng,address_match_confidence,host_listing_count,is_luxury,under_score,matched_owner,match_status').eq('segment', 'candidate').order('property_id');
      if (chunk) q = q.in('market', chunk);
      if (opts.onlyUnmatched) q = q.is('match_status', null);
      const { data, error } = await q.range(from, from + 999); if (error) throw error;
      cands.push(...(data ?? []).filter(c => !except.length || !except.includes(String(c.market).split(',').pop()!.trim().toUpperCase())));
      if ((data ?? []).length < 1000) break;
    }
  }

  const results: Array<Record<string, any>> = []; let lookups = 0;
  for (const c of cands) {
    if (c.lat == null || c.lng == null) continue;
    const here = { lat: Number(c.lat), lng: Number(c.lng) };
    const radiusM = c.address_match_confidence === 'High' ? 150 : c.address_match_confidence === 'Medium' ? 350 : 600;
    const near = registry.filter(r => Math.abs(r.lat - here.lat) < 0.02 && meters(here, r) <= radiusM);
    let status = 'no_registry_nearby'; const candidates: Array<Record<string, any>> = [];
    if (near.length) {
      const needsParcels = near.some(r => r.bedrooms == null);
      if (needsParcels && (!canLookUp || (opts.maxLookups != null && lookups >= opts.maxLookups))) continue;
      // The property record is only needed for registries that do not publish bedrooms.
      const parcels = needsParcels ? (lookups++, await parcelsNear(here.lat, here.lng, radiusM / 1609.34 + 0.02)) : [];
      const byAddr = new Map(parcels.map(p => [normStreet(p.addressLine1 ?? p.formattedAddress ?? ''), p]));
      const b = Number(c.bathrooms ?? 0);
      for (const r of near) {
        if (r.bedrooms != null) {
          if (r.bedrooms !== c.bedrooms) continue;
          candidates.push({ address: r.address, jurisdiction: r.jurisdiction, permit: r.permit_id, permitHolder: r.holder_name, distanceM: Math.round(meters(here, r)), beds: r.bedrooms, baths: null, sqft: null,
            ownerNames: r.holder_name ? [r.holder_name] : [], ownerType: null, mailing: r.contact?.ownerMailing ?? null, ownerOccupied: null, contact: r.contact ?? null });
          continue;
        }
        const p = byAddr.get(r.address_norm); if (!p) continue;
        if (p.bedrooms !== c.bedrooms || Math.abs((p.bathrooms ?? 0) - b) > 0.5) continue;
        candidates.push({ address: r.address, jurisdiction: r.jurisdiction, permit: r.permit_id, permitHolder: r.holder_name, distanceM: Math.round(meters(here, r)), beds: p.bedrooms, baths: p.bathrooms, sqft: p.squareFootage ?? null,
          ownerNames: p.owner?.names ?? [], ownerType: p.owner?.type ?? null, mailing: p.owner?.mailingAddress?.formattedAddress ?? null, ownerOccupied: p.ownerOccupied ?? null, contact: r.contact ?? null });
      }
      candidates.sort((x, y) => x.distanceM - y.distanceM);
      status = candidates.length === 1 ? 'unique' : candidates.length >= 2 && candidates.length <= 3 ? 'ambiguous' : candidates.length > 3 ? 'too_many' : 'none_match';
    }
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
      await db.from('str_listings').update({ match_status: r.status, match_candidates: r.candidates, matched_address: m?.address ?? null, matched_owner: m ? { names: m.ownerNames, type: m.ownerType, mailing: m.mailing, permitHolder: m.permitHolder, ownerOccupied: m.ownerOccupied, permit: m.permit, jurisdiction: m.jurisdiction, contact: m.contact ?? null, ...(same && r.previous.skipTrace ? { skipTrace: r.previous.skipTrace } : {}) } : null, matched_at: new Date().toISOString() }).eq('property_id', r.property_id);
    }
  }
  return { checked: results.length, tally, uniqueIds: results.filter(x => x.status === 'unique').map(x => x.property_id), unique };
}
