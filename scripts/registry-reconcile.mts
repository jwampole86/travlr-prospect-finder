// Brings the property registry in line with the current address rules, after the rules were tightened (city/state/ZIP inside the street line,
// "#penthouse 5" units, unit-less addresses linking to their building). It only touches registry tables; no lead is read for writing.
//   npx tsx scripts/registry-reconcile.mts            (dry run: counts and examples, changes nothing)
//   npx tsx scripts/registry-reconcile.mts --apply    (does it; safe to run again)
// What it does: re-reads each property's address under the current rules; where two properties turn out to be the exact same address it folds the later
// one into the earlier (links, units and observations move over); then rebuilds the open "possible duplicate" cases, which are suggestions nobody acted on.
import { readFileSync } from 'node:fs';
import { normalizeAddress, type NormalizedAddress } from '../src/lib/registry/address.ts';
import { resolveIdentity, type PropertyRef } from '../src/lib/registry/identity.ts';

const APPLY = process.argv.includes('--apply');
const env: Record<string, string> = {};
for (const l of readFileSync(new URL('../.env', import.meta.url), 'utf8').split('\n')) { const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, ''); }
const base = env.NEXT_PUBLIC_SUPABASE_URL + '/rest/v1/';
const H = { apikey: env.SUPABASE_SERVICE_ROLE_KEY, authorization: 'Bearer ' + env.SUPABASE_SERVICE_ROLE_KEY, 'content-type': 'application/json' };

type Row = Record<string, any>;
async function call(path: string, init: RequestInit & { headers?: Record<string, string> } = {}) {
  for (let attempt = 0; ; attempt++) {
    try {
      const r = await fetch(base + path, { ...init, headers: { ...H, ...(init.headers ?? {}) } });
      if (!r.ok && r.status >= 500 && attempt < 3) { await new Promise((s) => setTimeout(s, 800 * (attempt + 1))); continue; }
      if (!r.ok) throw new Error(`${init.method ?? 'GET'} ${path.slice(0, 80)} -> ${r.status} ${(await r.text()).slice(0, 200)}`);
      return r;
    } catch (e) { if (attempt >= 3) throw e; await new Promise((s) => setTimeout(s, 800 * (attempt + 1))); }
  }
}
async function all(path: string): Promise<Row[]> {
  const out: Row[] = [];
  for (let off = 0; ; off += 1000) {
    const r = await call(path, { headers: { Range: `${off}-${off + 999}` } });
    const j = (await r.json()) as Row[]; out.push(...j); if (j.length < 1000) break;
  }
  return out;
}
async function pool<T>(items: T[], n: number, fn: (t: T) => Promise<void>) { let i = 0; await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) await fn(items[i++]); })); }
const chunk = <T,>(a: T[], n: number) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));
const inList = (ids: string[]) => `in.(${ids.join(',')})`;

console.log(APPLY ? 'APPLYING' : 'DRY RUN (nothing is changed)');
const props = await all('properties?select=id,organization_id,kind,street_number,street_name,city,state,zip5,address_key,lat,lng,created_at&status=eq.active&order=created_at.asc,id.asc');
const units = await all('property_units?select=id,property_id,unit_label');
const unitsBy = new Map<string, Row[]>(); for (const u of units) unitsBy.set(u.property_id, [...(unitsBy.get(u.property_id) ?? []), u]);
console.log('active properties', props.length, '| units', units.length);

// 1. Re-read every address under the current rules.
interface Fixed { row: Row; n: NormalizedAddress; changed: boolean }
const fixed: Fixed[] = props.map((row) => {
  const n = normalizeAddress({ address: `${row.street_number} ${row.street_name}`, city: row.city, state: row.state, zip: row.zip5 });
  const usable = n.usable && n.zip5 === row.zip5;
  return { row, n, changed: usable && (n.key !== row.address_key || n.streetName !== row.street_name || n.unit !== null) };
}).map((f) => (f.n.usable && f.n.zip5 === f.row.zip5 ? f : { ...f, n: { ...f.n, key: f.row.address_key } }));
const changed = fixed.filter((f) => f.changed);
console.log('addresses that read differently now:', changed.length);
for (const f of changed.slice(0, 5)) console.log('  ', `${f.row.street_number} ${f.row.street_name}`, '->', `${f.n.streetNumber} ${f.n.streetName}${f.n.unit ? ' #' + f.n.unit : ''}`);

// 2. Properties that are now exactly the same address.
const groups = new Map<string, Fixed[]>();
for (const f of fixed) { const k = `${f.row.organization_id}|${f.n.key}`; groups.set(k, [...(groups.get(k) ?? []), f]); }
const dupGroups = [...groups.values()].filter((g) => g.length > 1);
const foldedAway = dupGroups.reduce((n, g) => n + g.length - 1, 0);
console.log('same-address groups to fold:', dupGroups.length, '| properties folded away:', foldedAway);
for (const g of dupGroups.slice(0, 4)) console.log('  ', g.map((f) => `${f.row.street_number} ${f.n.streetName}`).join('  +  '));

// 3. What the review queue will be after that.
const survivors: Fixed[] = [...groups.values()].map((g) => g[0]);
const byZipNumber = new Map<string, Fixed[]>();
for (const f of survivors) { const k = `${f.row.organization_id}|${f.n.zip5}|${f.n.streetNumber}`; byZipNumber.set(k, [...(byZipNumber.get(k) ?? []), f]); }
const reviewRows: Row[] = [];
const refOf = (f: Fixed): PropertyRef => ({ id: f.row.id, address: { ...f.n, unit: null, usable: true }, lat: f.row.lat, lng: f.row.lng, units: (unitsBy.get(f.row.id) ?? []).map((u) => u.unit_label) });
for (const g of byZipNumber.values()) {
  if (g.length < 2 || g.length > 40) continue;
  for (const f of g) {
    const res = resolveIdentity({ address: { ...f.n, unit: null }, lat: f.row.lat, lng: f.row.lng }, g.filter((o) => o !== f).map(refOf));
    if (res.action !== 'create') continue;
    for (const r of res.reviews) if (r.candidateId > f.row.id) reviewRows.push({ organization_id: f.row.organization_id, property_id: f.row.id, candidate_property_id: r.candidateId, reason: r.reason, score: r.score, details: { detail: r.detail } });
  }
}
const mix: Record<string, number> = {}; for (const r of reviewRows) mix[r.reason] = (mix[r.reason] ?? 0) + 1;
const openNow = (await call('identity_review_cases?select=id&status=eq.open', { headers: { Prefer: 'count=exact', Range: '0-0' } })).headers.get('content-range');
const settled = (await call('identity_review_cases?select=id&status=neq.open', { headers: { Prefer: 'count=exact', Range: '0-0' } })).headers.get('content-range');
console.log('open cases now:', openNow, '| settled by a person:', settled, '| open cases after:', reviewRows.length, JSON.stringify(mix));
for (const r of reviewRows.slice(0, 6)) console.log('  ', r.reason, r.details.detail);

if (!APPLY) { console.log('\nDry run only. Re-run with --apply to make these changes.'); process.exit(0); }
if (!settled?.startsWith('*/0') && !settled?.endsWith('/0')) { console.log('Some cases were settled by a person; refusing to rebuild the case list automatically.'); process.exit(1); }

// APPLY a: correct the stored address of every changed property, and give a "#unit" its own unit row.
let done = 0;
await pool(changed, 8, async (f) => {
  await call(`properties?id=eq.${f.row.id}`, { method: 'PATCH', body: JSON.stringify({ street_name: f.n.streetName, street_number: f.n.streetNumber, address_key: f.n.key }) });
  if (f.n.unit) {
    const have = (unitsBy.get(f.row.id) ?? []).find((u) => u.unit_label === f.n.unit);
    let unitId = have?.id;
    if (!unitId) {
      const r = await call('property_units', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ organization_id: f.row.organization_id, property_id: f.row.id, unit_label: f.n.unit }) });
      unitId = ((await r.json()) as Row[])[0].id; unitsBy.set(f.row.id, [...(unitsBy.get(f.row.id) ?? []), { id: unitId, property_id: f.row.id, unit_label: f.n.unit }]);
    }
    await call(`property_source_links?property_id=eq.${f.row.id}&unit_id=is.null`, { method: 'PATCH', body: JSON.stringify({ unit_id: unitId }) });
  }
  if (++done % 500 === 0) console.log('  corrected', done);
});
console.log('corrected', done);

// APPLY b: fold exact duplicates into the earliest property.
let folded = 0;
for (const g of dupGroups) {
  const [keep, ...rest] = g;
  const keepUnits = new Map((unitsBy.get(keep.row.id) ?? []).map((u) => [u.unit_label, u.id as string]));
  for (const d of rest) {
    for (const u of unitsBy.get(d.row.id) ?? []) {
      if (keepUnits.has(u.unit_label)) {
        await call(`property_source_links?unit_id=eq.${u.id}`, { method: 'PATCH', body: JSON.stringify({ unit_id: keepUnits.get(u.unit_label) }) });
        await call(`property_units?id=eq.${u.id}`, { method: 'DELETE' });
      } else {
        await call(`property_units?id=eq.${u.id}`, { method: 'PATCH', body: JSON.stringify({ property_id: keep.row.id }) });
        keepUnits.set(u.unit_label, u.id);
      }
    }
    await call(`property_source_links?property_id=eq.${d.row.id}`, { method: 'PATCH', body: JSON.stringify({ property_id: keep.row.id }) });
    await call(`property_observations?property_id=eq.${d.row.id}`, { method: 'PATCH', body: JSON.stringify({ property_id: keep.row.id }) });
    await call(`properties?id=eq.${d.row.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'merged', merged_into: keep.row.id }) });
    if (++folded % 200 === 0) console.log('  folded', folded);
  }
}
console.log('folded', folded);

// APPLY c: rebuild the open cases (all machine-made suggestions; none was ever settled by a person).
await call('identity_review_cases?status=eq.open', { method: 'DELETE' });
for (const part of chunk(reviewRows, 200)) await call('identity_review_cases', { method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' }, body: JSON.stringify(part) });
console.log('open cases rebuilt:', reviewRows.length);
