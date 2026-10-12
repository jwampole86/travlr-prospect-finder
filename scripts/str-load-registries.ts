/**
 * Loads public STR license registries into str_registry:
 *   - Summit County, CO (unincorporated, incl. Upper Blue Basin): ArcGIS feature service, address + parcel + point, no names.
 *   - City of Aspen, CO: ArcGIS feature service, address + parcel + permit holder name + point.
 * Both are published by the governments as open data through their public ArcGIS REST endpoints.
 *
 *   npx tsx scripts/str-load-registries.ts
 */
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { normStreet } from './lib/normStreet';

const SUMMIT = 'https://services6.arcgis.com/dmNYNuTJZDtkcRJq/arcgis/rest/services/STR_Licenses_October_2026_Public/FeatureServer/0';
const ASPEN = 'https://services3.arcgis.com/5FkYBrhNzpVtlA6F/arcgis/rest/services/STR/FeatureServer/0';

async function all(url: string): Promise<Array<{ attributes: Record<string, any>; geometry?: { x: number; y: number } }>> {
  const out: Array<{ attributes: Record<string, any>; geometry?: { x: number; y: number } }> = [];
  for (let offset = 0; ; offset += 1000) {
    const q = new URLSearchParams({ where: '1=1', outFields: '*', outSR: '4326', returnGeometry: 'true', resultOffset: String(offset), resultRecordCount: '1000', f: 'json' });
    const res = await fetch(`${url}/query?${q}`, { signal: AbortSignal.timeout(60_000) });
    const d = await res.json() as { features?: typeof out; exceededTransferLimit?: boolean };
    out.push(...(d.features ?? []));
    if (!d.features?.length || (d.features.length < 1000 && !d.exceededTransferLimit)) break;
  }
  return out;
}

(async () => {
  const db = getSupabaseAdmin();
  const rows: Array<Record<string, unknown>> = [];
  const now = new Date().toISOString();

  for (const f of await all(SUMMIT)) {
    const a = f.attributes; const addr = String(a.HC_RegistrationsOriginalCleaned_Registered_Address ?? '');
    const unit = String(a.HC_RegistrationsOriginalCleaned_Registered_Unit_Number ?? '').trim();
    if (!addr || !a.HC_RegistrationsOriginalCleaned_Registration_Number) continue;
    rows.push({ jurisdiction: 'summit_county', permit_id: String(a.HC_RegistrationsOriginalCleaned_Registration_Number), address: unit ? `${addr} #${unit}` : addr, address_norm: normStreet(addr),
      parcel: a.HC_RegistrationsOriginalCleaned_Parcel_Number ?? null, lat: f.geometry?.y ?? null, lng: f.geometry?.x ?? null, holder_name: null,
      license_type: a.HC_RegistrationsOriginalCleaned_License_Type ?? null, active: String(a.HC_RegistrationsOriginalCleaned_Active).toLowerCase() === 'yes', source_url: SUMMIT, pulled_at: now });
  }
  for (const f of await all(ASPEN)) {
    const a = f.attributes; if (!a.FullAddress || a.PermitNum == null) continue;
    const name = [a.First_, a.Last_].filter(Boolean).join(' ').trim();
    rows.push({ jurisdiction: 'aspen', permit_id: String(a.PermitNum), address: `${String(a.FullAddress).replace(/\s+/g, ' ').trim()}, Aspen, CO ${a.Zip ?? ''}`.trim(), address_norm: normStreet(String(a.FullAddress)),
      parcel: a.Parcel != null ? String(a.Parcel) : null, lat: f.geometry?.y ?? null, lng: f.geometry?.x ?? null, holder_name: name || null, license_type: a.PermitType ?? null, active: true, source_url: ASPEN, pulled_at: now });
  }
  // A property can hold more than one permit row; keep one per jurisdiction and permit.
  for (let i = 0; i < rows.length; i += 200) { const { error } = await db.from('str_registry').upsert(rows.slice(i, i + 200), { onConflict: 'jurisdiction,permit_id' }); if (error) throw error; }
  const by = rows.reduce<Record<string, number>>((m, r) => { const k = `${r.jurisdiction}${r.active ? ' (active)' : ' (inactive)'}`; m[k] = (m[k] ?? 0) + 1; return m; }, {});
  console.log('stored', rows.length, by, '| with coordinates:', rows.filter(r => r.lat != null).length, '| with holder name:', rows.filter(r => r.holder_name).length);
})().catch(e => { console.error(e); process.exit(1); });
