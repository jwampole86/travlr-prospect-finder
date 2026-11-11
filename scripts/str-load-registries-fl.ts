/**
 * Loads Florida's licensed vacation rentals (Division of Hotels and Restaurants, DBPR) into str_registry.
 * DBPR publishes the active lodging licences as public CSV extracts. Vacation rentals are license types 2006 (condominium) and 2007
 * (dwelling); status 20 is an active licence. Only dwellings are loaded by default: a condominium licence belongs to the association and covers
 * every unit in the building, so it cannot point to one owner (add --condos to load them anyway). The files have no coordinates, so each distinct street address is geocoded with the free
 * US Census batch geocoder (results are cached in /tmp so a re-run only geocodes what is new).
 *
 *   npx tsx scripts/str-load-registries-fl.ts            (dry run: counts only)
 *   npx tsx scripts/str-load-registries-fl.ts --go
 */
import fs from 'fs';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { normStreet } from './lib/normStreet';

const GO = process.argv.includes('--go');
const BASE = 'https://www2.myfloridalicense.com/sto/file_download/extracts';
const CACHE = '/tmp/fl-dbpr';
const PAGE = 'https://www2.myfloridalicense.com/hotels-restaurants/lodging-public-records/';
const JURIS = 'fl_dbpr_vacation_rental';
const TYPES: Record<string, string> = { '2007': 'Vacation rental, dwelling', ...(process.argv.includes('--condos') ? { '2006': 'Vacation rental, condominium' } : {}) };

const clean = (v: unknown) => String(v ?? '').replace(/\s+/g, ' ').trim();
const title = (s: string) => s.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase());

/** The extracts quote every field and escape quotes by doubling them. */
function parseCsv(text: string): Array<Record<string, string>> {
  const rows: string[][] = []; let row: string[] = []; let field = ''; let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false; } else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n') { row.push(field.replace(/\r$/, '')); rows.push(row); row = []; field = ''; }
    else field += ch;
  }
  if (field || row.length) { row.push(field.replace(/\r$/, '')); rows.push(row); }
  const head = rows.shift() ?? [];
  return rows.filter((r) => r.length === head.length).map((r) => Object.fromEntries(head.map((h, i) => [h, r[i]])));
}

async function download(n: number): Promise<string> {
  fs.mkdirSync(CACHE, { recursive: true });
  const file = `${CACHE}/hrlodge${n}.csv`;
  if (!fs.existsSync(file) || fs.statSync(file).size < 100_000) {
    const res = await fetch(`${BASE}/hrlodge${n}.csv`, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(180_000) });
    if (!res.ok) throw new Error(`DBPR hrlodge${n}.csv: HTTP ${res.status}`);
    fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  }
  return fs.readFileSync(file, 'latin1');
}

/** US Census batch geocoder: id, street, city, state, zip in; coordinates out. */
async function censusGeocode(items: Array<{ id: string; street: string; city: string; zip: string }>): Promise<Map<string, { lat: number; lng: number }>> {
  const out = new Map<string, { lat: number; lng: number }>();
  const csv = items.map((r) => [r.id, r.street, r.city, 'FL', r.zip].map((v) => `"${String(v).replace(/"/g, '')}"`).join(',')).join('\n');
  const form = new FormData();
  form.append('addressFile', new Blob([csv], { type: 'text/csv' }), 'a.csv');
  form.append('benchmark', 'Public_AR_Current');
  const res = await fetch('https://geocoding.geo.census.gov/geocoder/locations/addressbatch', { method: 'POST', body: form, signal: AbortSignal.timeout(600_000) }).catch(() => null);
  if (!res?.ok) return out;
  for (const line of (await res.text()).split('\n')) {
    const m = line.match(/^"([^"]*)".*?"(-?\d+\.\d+),(-?\d+\.\d+)"/);
    if (m) out.set(m[1], { lng: Number(m[2]), lat: Number(m[3]) });
  }
  return out;
}

(async () => {
  const licences: Array<Record<string, string>> = [];
  for (let n = 1; n <= 7; n++) {
    const rows = parseCsv(await download(n));
    licences.push(...rows.filter((r) => TYPES[r['License Type Code']] && r['Primary Status Code'] === '20'));
    process.stdout.write(`district ${n}: ${licences.length} active vacation rentals so far\n`);
  }
  // One licence number can cover many homes (a property manager's licence), so a home is identified by the licence plus its address.
  const idOf = (r: Record<string, string>) => `${r['License Number']}|${clean(r['Location Street Address'])}|${clean(r['Location Address Line 2'])}`.slice(0, 120);
  const seenIds = new Set<string>();
  const unique = licences.filter((r) => (seenIds.has(idOf(r)) ? false : (seenIds.add(idOf(r)), true)));

  // One geocode per distinct street address, because a condominium building holds hundreds of licences.
  const addrKey = (r: Record<string, string>) => `${normStreet(clean(r['Location Street Address']))}|${clean(r['Location City']).toUpperCase()}|${clean(r['Location Zip Code']).slice(0, 5)}`;
  const addrs = new Map<string, { street: string; city: string; zip: string }>();
  for (const r of unique) {
    const street = clean(r['Location Street Address']);
    if (!/\d/.test(street)) continue;
    const k = addrKey(r);
    if (!addrs.has(k)) addrs.set(k, { street, city: clean(r['Location City']), zip: clean(r['Location Zip Code']).slice(0, 5) });
  }
  console.log(`${unique.length} active vacation-rental licences at ${addrs.size} distinct addresses`);
  if (!GO) { console.log('\nDRY RUN: nothing loaded. Re-run with --go.'); return; }

  const cacheFile = `${CACHE}/geocode.json`;
  const geo: Record<string, { lat: number; lng: number } | null> = fs.existsSync(cacheFile) ? JSON.parse(fs.readFileSync(cacheFile, 'utf8')) : {};
  const todo = [...addrs.entries()].filter(([k]) => !(k in geo));
  console.log(`geocoding ${todo.length} addresses (${addrs.size - todo.length} cached)`);
  const CHUNK = 5000;
  for (let i = 0; i < todo.length; i += CHUNK) {
    const part = todo.slice(i, i + CHUNK);
    const hits = await censusGeocode(part.map(([, a], j) => ({ id: String(j), ...a })));
    part.forEach(([k], j) => { geo[k] = hits.get(String(j)) ?? null; });
    fs.writeFileSync(cacheFile, JSON.stringify(geo));
    console.log(`  geocoded ${Math.min(i + CHUNK, todo.length)}/${todo.length}, ${part.filter(([k]) => geo[k]).length} of this batch found`);
  }

  const db = getSupabaseAdmin();
  const now = new Date().toISOString();
  const rows = unique.map((r) => {
    const street = clean(r['Location Street Address']);
    const unit = clean(r['Location Address Line 2']);
    const city = title(clean(r['Location City']));
    const zip = clean(r['Location Zip Code']).slice(0, 5);
    const g = geo[addrKey(r)] ?? null;
    const mail = [clean(r['Mailing Street Address']), clean(r['Mailing City']), clean(r['Mailing State Code']), clean(r['Mailing Zip Code']).slice(0, 5)].filter(Boolean).join(', ');
    return {
      jurisdiction: JURIS, permit_id: idOf(r), address: `${title(street)}${unit ? ` ${unit}` : ''}, ${city}, FL${zip ? ` ${zip}` : ''}`, address_norm: normStreet(street), parcel: null,
      lat: g?.lat ?? null, lng: g?.lng ?? null, holder_name: clean(r['Licensee Name']) || null, license_type: TYPES[r['License Type Code']], active: true, bedrooms: null,
      contact: { ownerMailing: mail || null, phone: clean(r['Primary Phone Number']) || null, businessName: clean(r['Business Name']) || null },
      source_url: PAGE, pulled_at: now,
    };
  });
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await db.from('str_registry').upsert(rows.slice(i, i + 500), { onConflict: 'jurisdiction,permit_id' });
    if (error) throw error;
    if (i % 20_000 === 0) console.log(`  saved ${i}/${rows.length}`);
  }
  // Licences that lapsed since the last load are no longer active.
  const { error: lapsed } = await db.from('str_registry').update({ active: false }).eq('jurisdiction', JURIS).lt('pulled_at', now);
  if (lapsed) throw lapsed;
  console.log(`loaded ${rows.length} licences, ${rows.filter((r) => r.lat != null).length} with coordinates`);
})().catch((e) => { console.error(e); process.exit(1); });
