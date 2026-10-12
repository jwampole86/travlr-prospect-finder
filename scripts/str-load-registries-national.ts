/**
 * Loads the nationwide public STR registries found by str-discover-registries.ts into str_registry.
 * Only genuine permit or licence lists are kept (hotel "lodging" layers, zoning parcels and traffic data are dropped), and the
 * curated source list is written to scripts/data/national-registries.json so the load can be repeated.
 * Rows without coordinates are geocoded with the US Census geocoder (free, public).
 *
 *   npx tsx scripts/str-load-registries-national.ts            (dry run: prints what would load)
 *   npx tsx scripts/str-load-registries-national.ts --go
 */
import fs from 'fs';
import path from 'path';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { normStreet } from './lib/normStreet';

const GO = process.argv.includes('--go');
const KEEP = /short[- ]?term|vacation rental|\bstr\b|\bstvr\b|\bvhr\b/i;
const DROP = /exclude|buffer|lodging|hotel|parcel|ptc|traffic|expired and active|nonregistered|unlicensed|pending|pre short|proximi|multi family|\bstr \d|all short|approved str parcels|shopping|january|february|march|april|may 20|june|july|august|september|snapshots/i;
// Newest monthly snapshot only; the other months of the same list are dropped above.
const KEEP_EXTRA = /October 2026/i;
const DEFAULT_PLACE: Array<[RegExp, string, string]> = [[/austin/i, 'Austin', 'TX'], [/orlando/i, 'Orlando', 'FL'], [/virginia beach/i, 'Virginia Beach', 'VA'], [/cambridge/i, 'Cambridge', 'MA'], [/bend/i, 'Bend', 'OR']];

type Src = { kind: 'arcgis' | 'socrata'; org: string; name: string; url: string; state: string; count: number; geometry: string | null; fields: Record<string, string | null> };
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 36);
const clean = (v: unknown) => String(v ?? '').replace(/\s+/g, ' ').trim();
const ACTIVE = /active|current|issued|approved|valid|licensed|permitted|open|^y(es)?$/i; const INACTIVE = /expire|revok|inactive|closed|denied|withdraw|cancel|suspend|lapse|terminated|void|delinquent|pending/i;

async function arcgisAll(url: string): Promise<Array<{ a: Record<string, any>; lat: number | null; lng: number | null }>> {
  const out: Array<{ a: Record<string, any>; lat: number | null; lng: number | null }> = [];
  for (let offset = 0; offset < 60_000; offset += 1000) {
    const q = new URLSearchParams({ where: '1=1', outFields: '*', outSR: '4326', returnGeometry: 'true', resultOffset: String(offset), resultRecordCount: '1000', f: 'json' });
    const res = await fetch(`${url}/query?${q}`, { signal: AbortSignal.timeout(90_000) }).catch(() => null); const d = await res?.json().catch(() => null) as { features?: any[]; exceededTransferLimit?: boolean; error?: unknown } | null;
    if (!d || d.error || !d.features) break;
    for (const f of d.features) {
      const g = f.geometry ?? {}; const ring = g.rings?.[0]; let lat: number | null = null; let lng: number | null = null;
      if (typeof g.x === 'number' && Math.abs(g.x) <= 180 && Math.abs(g.y) <= 90) { lng = g.x; lat = g.y; } else if (ring?.length) { lng = ring.reduce((s: number, c: number[]) => s + c[0], 0) / ring.length; lat = ring.reduce((s: number, c: number[]) => s + c[1], 0) / ring.length; if (Math.abs(lng) > 180 || Math.abs(lat) > 90) { lat = null; lng = null; } }
      out.push({ a: f.attributes ?? {}, lat, lng });
    }
    if (d.features.length < 1000 && !d.exceededTransferLimit) break;
  }
  return out;
}
async function socrataAll(url: string) {
  const res = await fetch(`${url}?$limit=50000`, { signal: AbortSignal.timeout(90_000) }); const rows = await res.json() as Array<Record<string, any>>;
  return rows.map(a => { const loc = a.location ?? a.geocoded_column ?? a.point; const c = loc?.coordinates; const lat = Number(a.latitude ?? a.lat ?? loc?.latitude ?? c?.[1]); const lng = Number(a.longitude ?? a.lng ?? a.long ?? loc?.longitude ?? c?.[0]); return { a, lat: Number.isFinite(lat) && lat ? lat : null, lng: Number.isFinite(lng) && lng ? lng : null }; });
}

/** US Census batch geocoder: street, city, state, zip in; coordinates out. */
async function censusGeocode(items: Array<{ id: string; street: string; city: string; state: string; zip: string }>): Promise<Map<string, { lat: number; lng: number }>> {
  const out = new Map<string, { lat: number; lng: number }>();
  for (let i = 0; i < items.length; i += 1500) {
    const part = items.slice(i, i + 1500); const csv = part.map(r => [r.id, r.street, r.city, r.state, r.zip].map(v => `"${String(v).replace(/"/g, '')}"`).join(',')).join('\n');
    const form = new FormData(); form.append('addressFile', new Blob([csv], { type: 'text/csv' }), 'a.csv'); form.append('benchmark', 'Public_AR_Current');
    const res = await fetch('https://geocoding.geo.census.gov/geocoder/locations/addressbatch', { method: 'POST', body: form, signal: AbortSignal.timeout(240_000) }).catch(() => null); if (!res?.ok) continue;
    for (const line of (await res.text()).split('\n')) { const m = line.match(/^"([^"]*)".*?"(-?\d+\.\d+),(-?\d+\.\d+)"/); if (m) out.set(m[1], { lng: Number(m[2]), lat: Number(m[3]) }); }
    process.stdout.write('g');
  }
  return out;
}

(async () => {
  const all = JSON.parse(fs.readFileSync('/tmp/registry-candidates.json', 'utf8')) as Src[];
  const srcs = all.filter(s => (KEEP.test(s.name)) && (!DROP.test(s.name) || KEEP_EXTRA.test(s.name)) && s.count <= 30_000 && !/New Bern|Lewisville|NCDOT|Santee|Moses Lake/i.test(`${s.org} ${s.name}`));
  fs.mkdirSync(path.join(__dirname, 'data'), { recursive: true }); fs.writeFileSync(path.join(__dirname, 'data', 'national-registries.json'), JSON.stringify(srcs.map(s => ({ ...s, fields: s.fields })), null, 1));
  console.log(`curated ${srcs.length} registries from ${all.length} candidates, states: ${[...new Set(srcs.map(s => s.state))].sort().join(' ')}`);
  if (!GO) { for (const s of srcs) console.log(`  ${s.state} ${s.org.slice(0, 30).padEnd(30)} ${s.name.slice(0, 38).padEnd(38)} ${s.count}`); console.log('\nDRY RUN: nothing loaded. Re-run with --go.'); return; }

  const db = getSupabaseAdmin(); const now = new Date().toISOString(); const summary: Array<Record<string, any>> = [];
  for (const s of srcs) {
    const f = s.fields; const raw = s.kind === 'arcgis' ? await arcgisAll(s.url) : await socrataAll(s.url);
    const place = DEFAULT_PLACE.find(([re]) => re.test(`${s.org} ${s.name} ${s.url}`)); const juris = `${s.state.toLowerCase()}_${slug(s.org || s.name)}_${slug(s.name).slice(0, 14)}`;
    const rows: Array<Record<string, any>> = []; const seen = new Set<string>(); const needGeo: Array<{ id: string; street: string; city: string; state: string; zip: string }> = [];
    for (const [idx, r] of raw.entries()) {
      const a = r.a; const full = clean(a[f.address!]); if (!full || !/\d/.test(full)) continue;
      const street = full.split(',')[0]; const city = clean(f.city ? a[f.city] : '') || (full.split(',')[1] ? clean(full.split(',')[1]) : '') || place?.[1] || ''; const zip = clean(f.zip ? a[f.zip] : '') || full.match(/\b\d{5}\b/)?.[0] || '';
      let pid = clean(f.id ? a[f.id] : '') || `${idx}`; if (seen.has(pid)) pid = `${pid}#${idx}`; seen.add(pid);
      const stat = clean(f.status ? a[f.status] : ''); const active = stat ? (INACTIVE.test(stat) ? false : ACTIVE.test(stat) || !/\w/.test(stat) ? true : true) : true;
      const beds = f.beds ? Math.floor(Number(a[f.beds])) : NaN;
      const lat = r.lat ?? (f.lat && Number(a[f.lat]) ? Number(a[f.lat]) : null); const lng = r.lng ?? (f.lng && Number(a[f.lng]) ? Number(a[f.lng]) : null);
      if (lat == null || lng == null) needGeo.push({ id: pid, street, city, state: place?.[2] ?? s.state, zip });
      rows.push({ jurisdiction: juris, permit_id: pid.slice(0, 120), address: `${street}${city ? `, ${city}` : ''}, ${s.state}${zip ? ` ${zip}` : ''}`, address_norm: normStreet(street), parcel: null, lat, lng, holder_name: clean(f.holder ? a[f.holder] : '') || null, license_type: s.name.slice(0, 80), active, bedrooms: Number.isFinite(beds) && beds > 0 && beds < 30 ? beds : null, contact: null, source_url: s.url, pulled_at: now });
    }
    if (needGeo.length && needGeo.length <= 12_000) { const g = await censusGeocode(needGeo); for (const r of rows) if (r.lat == null) { const hit = g.get(r.permit_id); if (hit) { r.lat = hit.lat; r.lng = hit.lng; } } }
    for (let i = 0; i < rows.length; i += 200) { const { error } = await db.from('str_registry').upsert(rows.slice(i, i + 200), { onConflict: 'jurisdiction,permit_id' }); if (error) throw error; }
    const e = { state: s.state, jurisdiction: juris, loaded: rows.length, active: rows.filter(r => r.active).length, coords: rows.filter(r => r.lat != null).length, holder: rows.filter(r => r.holder_name).length, beds: rows.filter(r => r.bedrooms).length };
    summary.push(e); console.log(`\n${e.state} ${juris}: ${e.loaded} rows, ${e.active} active, ${e.coords} with coordinates, ${e.holder} with holder, ${e.beds} with bedrooms`);
  }
  const byState = summary.reduce<Record<string, number>>((m, e) => { m[e.state] = (m[e.state] ?? 0) + e.active; return m; }, {});
  console.log('\nactive rows by state:', JSON.stringify(byState));
})().catch(e => { console.error(e); process.exit(1); });
