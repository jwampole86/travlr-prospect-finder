import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { normStreet } from '@/lib/normStreet';

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

interface Parcel { addressLine1?: string; ownerOccupied?: boolean; owner?: { names?: string[]; type?: string; mailingAddress?: { formattedAddress?: string } } }

/** "123 Main St, Austin, TX 78701" from a registry address, falling back to the market for registries that publish no city. */
function fullAddress(matched: string, market: string | null): { street: string; query: string } | null {
  const parts = matched.split(',').map(s => s.trim()).filter(Boolean); if (!parts[0] || !/^\d/.test(parts[0])) return null;
  const [marketCity, marketState] = String(market ?? '').split(',').map(s => s.trim());
  const second = parts[1] && !/^[A-Za-z]{2}(\s+\d+)?$/.test(parts[1]) ? parts[1] : marketCity;
  if (!second || !marketState) return null;
  return { street: parts[0], query: `${parts[0]}, ${second}, ${marketState}` };
}

async function parcelAt(query: string): Promise<Parcel | null | 'error'> {
  for (let attempt = 0; attempt < 3; attempt++) {
    await sleep(400);
    const res = await fetch(`https://api.rentcast.io/v1/properties?address=${encodeURIComponent(query)}`, { headers: { 'X-Api-Key': process.env.RENTCAST_API_KEY!, accept: 'application/json' }, signal: AbortSignal.timeout(30_000) }).catch(() => null);
    if (!res) return 'error';
    if (res.status === 429) { await sleep(3000); continue; }
    const d = await res.json().catch(() => null);
    return Array.isArray(d) ? (d[0] ?? null) : 'error';
  }
  return 'error';
}

/**
 * Registry-only matches carry just the permit holder. This looks up the county property record (via RentCast) for each, so the owner of record,
 * its type and the mailing address are known too. The permit holder stays on the record, so the two can be compared.
 */
export async function enrichAssessorOwners(db: SupabaseClient, opts: { limit: number; write: boolean }): Promise<{ checked: number; found: number; withMailing: number }> {
  if (!process.env.RENTCAST_API_KEY) return { checked: 0, found: 0, withMailing: 0 };
  const { data } = await db.from('str_listings').select('property_id,market,matched_address,matched_owner').eq('match_status', 'unique').not('matched_owner', 'is', null).limit(2000);
  const todo = (data ?? []).filter(r => r.matched_address && !(r.matched_owner as any).type && !(r.matched_owner as any).assessor).slice(0, opts.limit);
  let found = 0, withMailing = 0;
  for (const r of todo) {
    const o = r.matched_owner as Record<string, any>; const addr = fullAddress(r.matched_address, r.market); if (!addr) continue;
    const p = await parcelAt(addr.query); if (p === 'error') continue;
    const same = p && normStreet(p.addressLine1 ?? '') === normStreet(addr.street);
    const mailing = same ? p.owner?.mailingAddress?.formattedAddress ?? null : null;
    if (same && p.owner?.names?.length) { found++; if (mailing) withMailing++; }
    if (!opts.write) continue;
    const county = same && p.owner?.names?.length ? { names: p.owner.names, type: p.owner.type ?? 'Individual', mailing: mailing ?? o.mailing ?? null, ownerOccupied: p.ownerOccupied ?? null } : null;
    await db.from('str_listings').update({ matched_owner: { ...o, ...(county ?? {}), assessor: { at: new Date().toISOString(), found: !!county } } }).eq('property_id', r.property_id);
  }
  return { checked: todo.length, found, withMailing };
}
