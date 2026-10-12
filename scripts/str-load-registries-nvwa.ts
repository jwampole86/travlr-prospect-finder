/**
 * Loads the Nevada and Washington public STR registries into str_registry (same table as Summit County and Aspen):
 *   douglas_nv      Douglas County NV (Lake Tahoe: Stateline, Zephyr Cove, Glenbrook), owner, mailing address, phone, email, bedrooms
 *   san_juan_wa     San Juan County WA (San Juan, Orcas, Lopez islands), owner, contact phone and email
 *   seattle         City of Seattle open data, address, bedrooms, status (no owner names)
 *   henderson_nv    City of Henderson NV, business name and property manager
 *   las_vegas_nv    City of Las Vegas via Clark County open data, business name
 *   north_las_vegas_nv  City of North Las Vegas via Clark County open data, owner name
 * All are published by the governments themselves through public ArcGIS / Socrata endpoints.
 *
 *   npx tsx scripts/str-load-registries-nvwa.ts
 */
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { normStreet } from './lib/normStreet';

type Feature = { attributes: Record<string, any>; geometry?: { x?: number; y?: number; rings?: number[][][] }; centroid?: { x: number; y: number } };
type Row = Record<string, unknown>;

async function arcgis(url: string, centroid = true): Promise<Feature[]> {
  const out: Feature[] = [];
  for (let offset = 0; ; offset += 1000) {
    const q = new URLSearchParams({ where: '1=1', outFields: '*', outSR: '4326', returnGeometry: 'true', ...(centroid ? { returnCentroid: 'true' } : {}), resultOffset: String(offset), resultRecordCount: '1000', f: 'json' });
    const res = await fetch(`${url}/query?${q}`, { signal: AbortSignal.timeout(90_000) });
    const d = await res.json() as { features?: Feature[]; exceededTransferLimit?: boolean; error?: { message: string } };
    // Point layers reject returnCentroid.
    if (d.error && centroid) return arcgis(url, false);
    if (d.error) throw new Error(`${url}: ${d.error.message}`);
    out.push(...(d.features ?? []));
    if (!d.features?.length || (d.features.length < 1000 && !d.exceededTransferLimit)) break;
  }
  return out;
}
const point = (f: Feature): { lat: number | null; lng: number | null } => {
  const ring = f.geometry?.rings?.[0];
  const mid = ring?.length ? { x: ring.reduce((s, c) => s + c[0], 0) / ring.length, y: ring.reduce((s, c) => s + c[1], 0) / ring.length } : null;
  const p = f.centroid ?? (f.geometry && typeof f.geometry.x === 'number' ? { x: f.geometry.x, y: f.geometry.y as number } : mid);
  return p && Math.abs(p.x) <= 180 && Math.abs(p.y) <= 90 ? { lat: p.y, lng: p.x } : { lat: null, lng: null };
};
const clean = (v: unknown) => String(v ?? '').replace(/\s+/g, ' ').trim();
const street = (full: string) => clean(full).split(',')[0];
const wholeBeds = (v: unknown) => { const n = Number(v); return v === null || v === undefined || v === '' || !Number.isFinite(n) ? null : Math.floor(n); };
const bedsOf = (v: unknown) => { const m = String(v ?? '').match(/(\d+)\s*bed/i); return m ? Number(m[1]) : null; };

(async () => {
  const db = getSupabaseAdmin(); const now = new Date().toISOString(); const rows: Row[] = [];

  // Douglas County NV
  const DOUGLAS = 'https://gisservices.douglasnv.us/server/rest/services/VHR_Occupancy/MapServer/0';
  for (const f of await arcgis(DOUGLAS)) {
    const a = f.attributes; const addr = clean(a.VHR_Unit_Address); const id = clean(a.Accela || a.APN); if (!addr || !id) continue;
    const contact = { ownerMailing: clean(a.Owner_Address) || null, phone: clean(a.Owner_Phone) || null, email: clean(a.Owner_Email) || null, managerEmail: clean(a.Property_Manager_Email) || null, neighborhood: clean(a.Neighborhood) || null };
    rows.push({ jurisdiction: 'douglas_nv', permit_id: id, address: addr, address_norm: normStreet(street(addr)), parcel: a.APN != null ? String(a.APN) : null, lat: a.LATITUDE ?? point(f).lat, lng: a.LONGITUDE ?? point(f).lng,
      holder_name: clean(a.Owner_Name) || null, license_type: clean(a.Tier) || null, active: a.Permit_Status === 'Current', bedrooms: wholeBeds(a.Bedrooms), contact, source_url: DOUGLAS, pulled_at: now });
  }

  // San Juan County WA
  const SANJUAN = 'https://gis.sanjuancountywa.gov/arcgis/rest/services/Planning/Vacation_Rental_Permits/FeatureServer/1';
  for (const f of await arcgis(SANJUAN)) {
    const a = f.attributes; const st = clean(a.SitusAddr); const id = clean(a.License_Nu || a.Permit_Num); if (!st || !id) continue;
    const mailing = [a.Address_1, a.Address_2, a.Address_3].map(clean).filter(Boolean).join(' ');
    const contact = { ownerMailing: [mailing, [clean(a.City), clean(a.State), clean(a.Zip)].filter(Boolean).join(' ')].filter(Boolean).join(', ') || null, contactName: clean(a.Contact_na) && clean(a.Contact_na) !== 'N/A' ? clean(a.Contact_na) : null, phone: clean(a.Contact_Nu) || null, email: clean(a.Contact_em) || null, island: clean(a.Region) || null };
    rows.push({ jurisdiction: 'san_juan_wa', permit_id: id, address: `${st}, ${clean(a.SitusCity)}, WA ${clean(a.SitusZip)}`.trim(), address_norm: normStreet(st), parcel: a.Parcel_Num != null ? String(a.Parcel_Num) : null, ...point(f),
      holder_name: clean(a.Owner) || null, license_type: 'Vacation rental permit', active: true, bedrooms: null, contact, source_url: SANJUAN, pulled_at: now });
  }

  // Henderson NV
  const HENDERSON = 'https://maps.cityofhenderson.com/arcgis/rest/services/public/OpenDataDevelopment/MapServer/14';
  for (const f of await arcgis(HENDERSON)) {
    const a = f.attributes; const st = clean(a.REGISTERED_ADDRESS); const id = clean(a.REGISTRATION_NUMBER); if (!st || !id) continue;
    rows.push({ jurisdiction: 'henderson_nv', permit_id: id, address: `${st}${clean(a.REGISTERED_UNIT_NUMBER) ? ` #${clean(a.REGISTERED_UNIT_NUMBER)}` : ''}, Henderson, NV`, address_norm: normStreet(st), parcel: clean(a.PARCEL) || null, ...point(f),
      holder_name: clean(a.BUSINESS_NAME) || null, license_type: 'Short-term vacation rental', active: /active/i.test(clean(a.STATUS)), bedrooms: wholeBeds(a.PERMIT_BEDROOMS),
      contact: { propertyManager: clean(a.PROPERTY_MANAGER_NAME) || null, propertyManagerNumber: clean(a.PROPERTY_MANAGER_NUMBER) || null }, source_url: HENDERSON, pulled_at: now });
  }

  // Clark County open data: City of Las Vegas and City of North Las Vegas
  const CLARK = 'https://maps.clarkcountynv.gov/arcgis/rest/services/OpenData/ShortTermRentalData/MapServer';
  for (const f of await arcgis(`${CLARK}/0`)) {
    const a = f.attributes; const st = clean(a.BUS_ADDRES); const id = clean(a.LICENSENO); if (!st || !id) continue;
    rows.push({ jurisdiction: 'las_vegas_nv', permit_id: id, address: `${st}, ${clean(a.BUS_CITY_S)}`, address_norm: normStreet(st), parcel: clean(a.PRCLID) || null, ...point(f), holder_name: clean(a.BUS_NAME) || null,
      license_type: clean(a.LICENSECAT) || null, active: /active/i.test(clean(a.LICSTATUS)), bedrooms: bedsOf(a.BUS_TYPE), contact: null, source_url: `${CLARK}/0`, pulled_at: now });
  }
  for (const f of await arcgis(`${CLARK}/1`)) {
    const a = f.attributes; const st = clean(a.ADDRESS); const id = clean(a.CUP_NUMBER || a.APN); if (!st || !id) continue;
    rows.push({ jurisdiction: 'north_las_vegas_nv', permit_id: id, address: `${st}, North Las Vegas, NV`, address_norm: normStreet(st), parcel: clean(a.APN) || null, ...point(f), holder_name: clean(a.OWNER) || null,
      license_type: 'Conditional use permit', active: true, bedrooms: null, contact: null, source_url: `${CLARK}/1`, pulled_at: now });
  }

  // Seattle (Socrata)
  const SEATTLE = 'https://cos-data.seattle.gov/resource/s7df-xba4.json';
  const sea = await (await fetch(`${SEATTLE}?$limit=50000`, { signal: AbortSignal.timeout(90_000) })).json() as Array<Record<string, string>>;
  for (const a of sea) {
    const st = [a.housenumber, a.prefixdirection, a.streetname, a.suffixdirection, a.suffix].map(clean).filter(Boolean).join(' '); const id = clean(a.unitid); if (!st || !id) continue;
    const unit = clean(a.unitnumber); const lat = Number(a.latitude); const lng = Number(a.longitude);
    rows.push({ jurisdiction: 'seattle', permit_id: id, address: `${st}${unit && unit !== 'NA' ? ` #${unit}` : ''}, Seattle, WA ${clean(a.zipcode)}`.trim(), address_norm: normStreet(st), parcel: null, lat: Number.isFinite(lat) && lat ? lat : null, lng: Number.isFinite(lng) && lng ? lng : null,
      holder_name: null, license_type: clean(a.propertytype) || null, active: a.licensestatus === 'Active' && a.unitstatus === 'Active', bedrooms: wholeBeds(a.bedroomcount),
      contact: { primaryResidence: clean(a.primaryresidence) || null, region: clean(a.geographicregion) || null }, source_url: SEATTLE, pulled_at: now });
  }

  const seen = new Set<string>(); const unique = rows.filter(r => { const k = `${r.jurisdiction}|${r.permit_id}`; if (seen.has(k)) return false; seen.add(k); return true; });
  for (let i = 0; i < unique.length; i += 200) { const { error } = await db.from('str_registry').upsert(unique.slice(i, i + 200), { onConflict: 'jurisdiction,permit_id' }); if (error) throw error; }
  const by: Record<string, { all: number; active: number; coords: number; owner: number; contact: number; br3: number }> = {};
  for (const r of unique) {
    const e = (by[r.jurisdiction as string] ??= { all: 0, active: 0, coords: 0, owner: 0, contact: 0, br3: 0 }); e.all++;
    if (r.active) { e.active++; if ((r.bedrooms as number) >= 3) e.br3++; } if (r.lat != null) e.coords++; if (r.holder_name) e.owner++;
    const c = r.contact as Record<string, unknown> | null; if (c && (c.email || c.phone)) e.contact++;
  }
  console.table(by);
})().catch(e => { console.error(e); process.exit(1); });
