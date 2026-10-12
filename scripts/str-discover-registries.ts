/**
 * Finds public short-term-rental registries across the US (ArcGIS Hub and Socrata open-data catalogs), probes each one and
 * writes the usable ones to /tmp/registry-candidates.json for str-load-registries-national.ts.
 *
 *   npx tsx scripts/str-discover-registries.ts
 *
 * Everything it reads is published by governments through public endpoints. California, Colorado, Nevada and Washington are skipped
 * (California by request, the others are already loaded by hand).
 */
import fs from 'fs';

const SKIP_STATES = new Set(['CA', 'CO', 'NV', 'WA']);
const STATES: Record<string, string> = { AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CT: 'Connecticut', DE: 'Delaware', FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York', NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont', VA: 'Virginia', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming', DC: 'District of Columbia' };
const NAME_OK = /short[- ]?term|vacation rental|\bstr\b|\bstvr\b|\bvhr\b|transient|holiday rental|nightly rental|tourist (home|rental)|lodging|airbnb|vrbo/i;
const NAME_BAD = /zone|zoning|district|boundar|buffer|overlay|\barea\b|areas\b|restrict|allocation|\bcap\b|sector|setback|density|ordinance|violation|complaint|inspection|code enforcement|survey|neighbor|lookup|application|eligib|hotel tax|occupancy tax|revenue|parcel boundary|history|renewal|waitlist|statistics|dashboard|story|hub\b|template|test/i;
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function j(url: string, ms = 30_000): Promise<any> {
  try { const r = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(ms) }); return await r.json(); } catch { return null; }
}
async function pool<T, R>(items: T[], size: number, fn: (x: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length); let next = 0;
  await Promise.all(Array.from({ length: size }, async () => { while (next < items.length) { const i = next++; out[i] = await fn(items[i], i); } }));
  return out;
}

interface Cand { kind: 'arcgis' | 'socrata'; org: string; name: string; url: string; domain?: string; id?: string; hint?: string }

async function hubSearch(q: string): Promise<Cand[]> {
  const out: Cand[] = []; let u: string | undefined = `https://hub.arcgis.com/api/v3/datasets?q=${encodeURIComponent(q)}&page%5Bsize%5D=100`;
  for (let p = 0; p < 4 && u; p++) {
    const d = await j(u); if (!d?.data) break;
    for (const x of d.data) { const a = x.attributes ?? {}; const url = String(a.url ?? ''); if (!/FeatureServer|MapServer/.test(url)) continue; out.push({ kind: 'arcgis', org: String(a.orgName ?? ''), name: String(a.name ?? ''), url: url.replace(/\/query.*$/, ''), hint: String(a.searchDescription ?? '').slice(0, 80) }); }
    u = d.links?.next;
  }
  return out;
}
async function socrataSearch(q: string): Promise<Cand[]> {
  const d = await j(`https://api.us.socrata.com/api/catalog/v1?q=${encodeURIComponent(q)}&only=datasets&limit=200`); const out: Cand[] = [];
  for (const r of d?.results ?? []) out.push({ kind: 'socrata', org: String(r.metadata?.domain ?? ''), name: String(r.resource?.name ?? ''), url: String(r.permalink ?? ''), domain: r.metadata?.domain, id: r.resource?.id });
  return out;
}

const stateOfText = (t: string): string | null => { const m = t.match(/,\s*([A-Z]{2})\s*,?\s*\d{5}/) ?? t.match(/\b([A-Z]{2})\s+\d{5}\b/); return m && (STATES[m[1]] || ['CA'].includes(m[1])) ? m[1] : null; };
async function stateByPoint(lng: number, lat: number): Promise<string | null> {
  const d = await j(`https://geo.fcc.gov/api/census/block/find?latitude=${lat}&longitude=${lng}&format=json`, 15_000);
  return d?.State?.code ?? null;
}

interface Probed { source: string; kind: string; org: string; name: string; url: string; state: string; count: number; geometry: string | null; fields: Record<string, string | null>; sample: Record<string, any>[]; score: number }

const pick = (fields: string[], re: RegExp, bad?: RegExp) => fields.find(f => re.test(f) && !(bad && bad.test(f))) ?? null;
function mapFields(fields: string[]) {
  return {
    address: pick(fields, /^(situs.?addr|registered.?address|property.?address|rental.?address|unit.?address|full.?address|str.?address|location.?address|bus.?address|street.?address|address)/i) ?? pick(fields, /address|addr|situs|premise|location/i, /mail|email|owner.?addr|city|state|zip|geocode/i),
    id: pick(fields, /(permit|license|licence|registration|reg|cert|str).?(no|num|number|id|#)|^(permit|license|registration)$/i) ?? pick(fields, /^(objectid|id)$/i),
    holder: pick(fields, /(owner|holder|licensee|operator|applicant|business|contact).?(name|nm)?$/i, /phone|mail|addr|zip|city|state|type|date|status/i),
    status: pick(fields, /status|active|state$/i, /state$/i),
    beds: pick(fields, /bed.?room|bedrooms|beds|^br$/i, /bath/i),
    city: pick(fields, /^(situs.?city|city|municipality|town)$/i),
    zip: pick(fields, /^(situs.?zip|zip|zip.?code|postal)/i),
    lat: pick(fields, /^(lat|latitude|y)$/i), lng: pick(fields, /^(lon|lng|long|longitude|x)$/i),
  };
}

async function probeArcgis(c: Cand): Promise<Probed | null> {
  let layers: Array<{ url: string; name: string }> = [];
  if (/\/(Feature|Map)Server\/\d+$/.test(c.url)) layers = [{ url: c.url, name: c.name }];
  else { const s = await j(`${c.url}?f=json`); layers = (s?.layers ?? []).filter((l: any) => NAME_OK.test(l.name) && !NAME_BAD.test(l.name)).slice(0, 3).map((l: any) => ({ url: `${c.url}/${l.id}`, name: l.name })); }
  for (const l of layers) {
    const meta = await j(`${l.url}?f=json`); if (!meta?.fields) continue;
    const fields: string[] = meta.fields.map((f: any) => f.name); const m = mapFields(fields);
    if (!m.address) continue;
    const cnt = await j(`${l.url}/query?where=1%3D1&returnCountOnly=true&f=json`); const count = cnt?.count ?? 0; if (count < 15) continue;
    const q = await j(`${l.url}/query?where=1%3D1&outFields=*&resultRecordCount=5&outSR=4326&returnGeometry=true&f=json`); const feats = q?.features ?? []; if (!feats.length) continue;
    const addrs = feats.map((f: any) => String(f.attributes?.[m.address!] ?? '').trim()); const filled = addrs.filter((a: string) => a.length > 4 && /\d/.test(a)).length; if (filled < Math.max(2, feats.length - 1)) continue;
    let state: string | null = null;
    for (const f of feats) { const t = [f.attributes?.[m.address!], m.city && f.attributes?.[m.city], m.zip && f.attributes?.[m.zip], ...Object.values(f.attributes ?? {}).filter(v => typeof v === 'string' && /,\s*[A-Z]{2}\s*\d{5}/.test(v as string))].filter(Boolean).join(', '); state = stateOfText(t); if (state) break; }
    if (!state) { const g = feats[0]?.geometry; const pt = g?.rings?.[0]?.[0] ?? (g?.x != null ? [g.x, g.y] : null); if (pt && Math.abs(pt[0]) < 180) state = await stateByPoint(pt[0], pt[1]); }
    if (!state) continue;
    const score = (m.holder ? 2 : 0) + (m.beds ? 2 : 0) + (m.status ? 1 : 0) + (m.id ? 1 : 0) + (meta.geometryType ? 1 : 0);
    return { source: c.org, kind: 'arcgis', org: c.org, name: l.name, url: l.url, state, count, geometry: meta.geometryType ?? null, fields: m, sample: feats.slice(0, 2).map((f: any) => f.attributes), score };
  }
  return null;
}

async function probeSocrata(c: Cand): Promise<Probed | null> {
  const meta = await j(`https://${c.domain}/api/views/${c.id}.json`); if (!meta?.columns) return null;
  const fields: string[] = meta.columns.map((x: any) => x.fieldName).filter((f: string) => !f.startsWith(':')); const m = mapFields(fields); if (!m.address) return null;
  const rows = await j(`https://${c.domain}/resource/${c.id}.json?$limit=5`); if (!Array.isArray(rows) || !rows.length) return null;
  const cnt = await j(`https://${c.domain}/resource/${c.id}.json?$select=count(*)`); const count = Number(cnt?.[0]?.count ?? 0); if (count < 15) return null;
  const txt = rows.map((r: any) => Object.values(r).map(v => (typeof v === 'string' ? v : '')).join(', ')).join(' | ');
  const state = stateOfText(txt) ?? null; if (!state) return null;
  const score = (m.holder ? 2 : 0) + (m.beds ? 2 : 0) + (m.status ? 1 : 0) + (m.id ? 1 : 0);
  return { source: c.domain!, kind: 'socrata', org: c.domain!, name: c.name, url: `https://${c.domain}/resource/${c.id}.json`, state, count, geometry: null, fields: m, sample: rows.slice(0, 2), score };
}

(async () => {
  const queries = ['short term rental', 'vacation rental', 'short-term rental permit', 'short term rental license', 'short term rental registration', 'STR permits', 'STVR', 'transient lodging', 'vacation rental permit', 'short term rentals registered'];
  const stateQ = Object.values(STATES).filter(n => !['California', 'Colorado', 'Nevada', 'Washington'].includes(n)).flatMap(n => [`short term rental ${n}`, `vacation rental ${n}`]);
  console.log(`catalog searches: ${queries.length} general + ${stateQ.length} per-state`);
  const hub = (await pool([...queries, ...stateQ], 6, hubSearch)).flat();
  const soc = (await pool([...queries, 'airbnb', 'short term rental licenses', 'vacation rental registry', 'short term rental registrations'], 4, socrataSearch)).flat();
  const seen = new Set<string>(); const cands = [...hub, ...soc].filter(c => NAME_OK.test(c.name) && !NAME_BAD.test(c.name)).filter(c => { const k = c.url.toLowerCase().replace(/\/query.*$/, ''); if (seen.has(k)) return false; seen.add(k); return true; });
  console.log(`catalog hits ${hub.length + soc.length} -> candidates by name ${cands.length}`);
  const probed = (await pool(cands, 8, async (c, i) => { if (i % 40 === 0) process.stdout.write(`.`); return c.kind === 'arcgis' ? probeArcgis(c) : probeSocrata(c); })).filter((p): p is Probed => !!p);
  console.log(`\nusable registries (before state filter): ${probed.length}`);
  // The same publisher often lists the same table more than once; keep the biggest, best-mapped copy.
  const best = new Map<string, Probed>();
  for (const p of probed) { const k = `${p.state}|${p.org}|${p.name.toLowerCase().replace(/[^a-z]/g, '').slice(0, 20)}`; const cur = best.get(k); if (!cur || p.score > cur.score || (p.score === cur.score && p.count > cur.count)) best.set(k, p); }
  const final = [...best.values()].filter(p => !SKIP_STATES.has(p.state)).sort((a, b) => a.state.localeCompare(b.state) || b.count - a.count);
  fs.writeFileSync('/tmp/registry-candidates.json', JSON.stringify(final, null, 1));
  const byState = final.reduce<Record<string, number>>((m, p) => { m[p.state] = (m[p.state] ?? 0) + p.count; return m; }, {});
  console.log(`kept ${final.length} registries in ${Object.keys(byState).length} states (skipped CA/CO/NV/WA)`);
  console.log(final.map(p => `${p.state} | ${p.org.slice(0, 34).padEnd(34)} | ${p.name.slice(0, 40).padEnd(40)} | ${String(p.count).padStart(6)} | owner:${p.fields.holder ? 'Y' : '-'} beds:${p.fields.beds ? 'Y' : '-'} geo:${p.geometry ? 'Y' : '-'}`).join('\n'));
  console.log('\nstates with NO registry found:', Object.keys(STATES).filter(s => !SKIP_STATES.has(s) && !byState[s]).join(' '));
})();
