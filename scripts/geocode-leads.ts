/* Geocodes real leads that still carry the default Denver pin. Uses the free US Census batch geocoder (street addresses only),
 * then estimates unmatched leads from matched neighbours in the same ZIP or city. Run: npx tsx scripts/geocode-leads.ts [--dry] */
import { createClient } from '@supabase/supabase-js';

const DEFAULT = { lat: 39.7392, lng: -104.9903 };
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const dry = process.argv.includes('--dry');
type Lead = { id: string; address: string; city: string; state: string; zip: string | null; lat: number | null; lng: number | null; geocode_source: string | null };

const isDefault = (l: Lead) => !l.lat || !l.lng || (Math.abs(l.lat - DEFAULT.lat) < 1e-4 && Math.abs(l.lng - DEFAULT.lng) < 1e-4);

async function census(batch: Lead[]) {
  const csv = batch.map(l => [l.id, l.address, l.city, l.state, (l.zip ?? '').slice(0, 5)].map(v => `"${String(v ?? '').replace(/"/g, '')}"`).join(',')).join('\n');
  const form = new FormData(); form.append('addressFile', new Blob([csv], { type: 'text/csv' }), 'a.csv'); form.append('benchmark', 'Public_AR_Current');
  const res = await fetch('https://geocoding.geo.census.gov/geocoder/locations/addressbatch', { method: 'POST', body: form, signal: AbortSignal.timeout(280_000) });
  if (!res.ok) throw new Error(`Census ${res.status}`);
  const out = new Map<string, { lat: number; lng: number }>();
  for (const line of (await res.text()).split('\n')) {
    const cells = line.match(/("([^"]*)"|[^,]+)/g)?.map(c => c.replace(/^"|"$/g, '')) ?? [];
    if (cells[2] !== 'Match') continue;
    const [lng, lat] = (cells[5] ?? '').split(',').map(Number);
    if (Number.isFinite(lat) && Number.isFinite(lng)) out.set(cells[0], { lat, lng });
  }
  return out;
}

async function main() {
  const leads: Lead[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from('leads').select('id,address,city,state,zip,lat,lng,geocode_source').eq('is_synthetic', false).range(from, from + 999);
    if (error) throw error; leads.push(...(data as Lead[])); if ((data ?? []).length < 1000) break;
  }
  const todo = leads.filter(l => !l.geocode_source && isDefault(l) && /^\d/.test(l.address));
  console.log(`${leads.length} real leads, ${todo.length} need geocoding`);

  const found = new Map<string, { lat: number; lng: number; source: string }>();
  for (let i = 0; i < todo.length; i += 1000) {
    const got = await census(todo.slice(i, i + 1000)); got.forEach((v, k) => found.set(k, { ...v, source: 'census' }));
    console.log(`batch ${i / 1000 + 1}: ${got.size} of ${Math.min(1000, todo.length - i)} matched`);
  }

  // Estimate the rest from matched leads in the same ZIP, then the same city.
  const avg = (pts: { lat: number; lng: number }[]) => ({ lat: pts.reduce((s, p) => s + p.lat, 0) / pts.length, lng: pts.reduce((s, p) => s + p.lng, 0) / pts.length });
  const known = [...leads.filter(l => !isDefault(l) && l.lat && l.lng).map(l => ({ l, lat: l.lat!, lng: l.lng! })), ...todo.filter(l => found.has(l.id)).map(l => ({ l, ...found.get(l.id)! }))];
  const byZip = new Map<string, { lat: number; lng: number }[]>(); const byCity = new Map<string, { lat: number; lng: number }[]>();
  for (const k of known) { const z = `${k.l.state}|${(k.l.zip ?? '').slice(0, 5)}`, c = `${k.l.state}|${k.l.city.toLowerCase()}`; (byZip.get(z) ?? byZip.set(z, []).get(z)!).push(k); (byCity.get(c) ?? byCity.set(c, []).get(c)!).push(k); }
  let est = 0;
  for (const l of leads.filter(l => !l.geocode_source && isDefault(l) && !found.has(l.id))) {
    const z = byZip.get(`${l.state}|${(l.zip ?? '').slice(0, 5)}`); const c = byCity.get(`${l.state}|${l.city.toLowerCase()}`);
    if (z?.length) { found.set(l.id, { ...avg(z), source: 'zip_estimate' }); est++; } else if (c?.length) { found.set(l.id, { ...avg(c), source: 'city_estimate' }); est++; }
  }
  console.log(`matched ${[...found.values()].filter(v => v.source === 'census').length}, estimated ${est}, unlocated ${todo.length + 0 - found.size}`);
  if (dry) return;

  const entries = [...found.entries()]; let done = 0; const at = new Date().toISOString();
  for (let i = 0; i < entries.length; i += 25) {
    await Promise.all(entries.slice(i, i + 25).map(async ([id, v]) => {
      const { error } = await db.from('leads').update({ lat: v.lat, lng: v.lng, geocode_source: v.source, geocoded_at: at }).eq('id', id);
      if (error) console.error(id, error.message); else done++;
    }));
  }
  console.log(`updated ${done} leads`);
}
main().catch(e => { console.error(e); process.exit(1); });
