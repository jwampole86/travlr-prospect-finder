import { NextRequest, NextResponse } from 'next/server';
import { requireLeadAccess } from '@/lib/auth/apiAuthorization';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { normStreet } from '@/lib/normStreet';

export const maxDuration = 30;

const miles = (aLat: number, aLng: number, bLat: number, bLng: number) => {
  const r = Math.PI / 180, dLat = (bLat - aLat) * r, dLng = (bLng - aLng) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * r) * Math.cos(bLat * r) * Math.sin(dLng / 2) ** 2;
  return 3958.8 * 2 * Math.asin(Math.sqrt(h));
};
const n = (v: unknown) => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));

/** GET /api/leads/records?leadId=  Ownership evidence and comparable short-term rentals for the lead profile, from what is already stored. */
export async function GET(req: NextRequest) {
  const leadId = new URL(req.url).searchParams.get('leadId') ?? '';
  if (!leadId) return NextResponse.json({ error: 'leadId is required' }, { status: 400 });
  const auth = await requireLeadAccess(req, leadId);
  if (!auth.actor) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const db = getSupabaseAdmin();
  const { data: l } = await db.from('leads').select('address,city,state,lat,lng,beds,owner_name,owner_source,verified_owner,verified_owner_method,verified_owner_source,owner_verified_at,ownership_record_verified,tax_assessment,apn,county,skip_trace_result,airdna_data').eq('id', leadId).maybeSingle();
  if (!l) return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
  const lat = n(l.lat), lng = n(l.lng), beds = n(l.beds);

  const [matchRes, registryRes, nearbyRes] = await Promise.all([
    db.from('lead_master_homeowner_matches').select('match_score,match_strategy,master_record_id').eq('lead_id', leadId).order('match_score', { ascending: false }).limit(1),
    l.address ? db.from('str_registry').select('jurisdiction,permit_id,holder_name,license_type,active,source_url,lat,lng,address').eq('address_norm', normStreet(String(l.address))).limit(10) : Promise.resolve({ data: [] }),
    lat && lng ? db.from('str_listings').select('property_id,title,airbnb_url,vrbo_url,bedrooms,bathrooms,adr,occupancy_pct,revenue_ltm,rating,reviews,lat,lng').gte('lat', lat - 0.12).lte('lat', lat + 0.12).gte('lng', lng - 0.15).lte('lng', lng + 0.15).gt('adr', 0).gt('occupancy_pct', 0).limit(400) : Promise.resolve({ data: [] }),
  ]);

  const match = matchRes.data?.[0];
  const { data: master } = match ? await db.from('master_homeowner_records').select('owner_name,apn,county,residence_type,home_age,estimated_home_value,ownership_status').eq('id', match.master_record_id).maybeSingle() : { data: null };

  const city = String(l.city ?? '').toLowerCase();
  const registry = (registryRes.data ?? []).filter(r => (lat && lng && n(r.lat) && n(r.lng)) ? miles(lat, lng, Number(r.lat), Number(r.lng)) < 0.3 : city && String(r.jurisdiction ?? '').toLowerCase().includes(city))
    .map(r => ({ holder: r.holder_name, permitId: r.permit_id, license: r.license_type, active: r.active, jurisdiction: r.jurisdiction, url: r.source_url }));

  const st = l.skip_trace_result as { primary?: { name?: string }; matchType?: string; confidence?: string; alternates?: Array<{ name?: string }> } | null;
  const ownership = {
    ownerName: l.owner_name || master?.owner_name || st?.primary?.name || null,
    ownerSource: l.owner_source || (l.owner_name ? null : master?.owner_name ? 'Homeowner records' : st?.primary?.name ? 'Skip trace' : null),
    verified: !!(l.verified_owner || l.ownership_record_verified), verifiedMethod: l.verified_owner_method ?? l.verified_owner_source ?? null, verifiedAt: l.owner_verified_at ?? null,
    apn: l.apn || master?.apn || null, county: l.county || master?.county || null, taxAssessment: n(l.tax_assessment),
    homeValue: n(master?.estimated_home_value), homeAge: master?.home_age ?? null, residenceType: master?.residence_type ?? null, ownershipStatus: master?.ownership_status ?? null,
    recordMatch: match ? { score: match.match_score, strategy: match.match_strategy } : null,
    registry,
    skipTrace: st?.primary?.name ? { name: st.primary.name, matchType: st.matchType ?? null, confidence: st.confidence ?? null, alternates: (st.alternates ?? []).map(a => a.name).filter(Boolean).slice(0, 3) } : null,
  };

  type Comp = { title: string | null; url: string | null; beds: number | null; baths: number | null; miles: number | null; adr: number | null; occupancy: number | null; revenue: number | null; rating: number | null; reviews: number | null; source: string };
  const comps: Comp[] = [];
  const seen = new Set<string>();
  const ad = (l.airdna_data ?? {}) as { comps?: Array<Record<string, any>> };
  for (const c of ad.comps ?? []) {
    if (c.url) seen.add(String(c.url));
    comps.push({ title: c.title ?? null, url: c.url ?? null, beds: n(c.beds), baths: n(c.baths), miles: n(c.meters) != null ? Math.round(Number(c.meters) / 160.934) / 10 : null, adr: n(c.adr), occupancy: n(c.occupancy) != null ? Math.round(Number(c.occupancy) * 100) : null, revenue: n(c.revenue), rating: n(c.rating), reviews: n(c.reviews), source: 'AirDNA comparable' });
  }
  const nearby = (nearbyRes.data ?? []).filter(s => s.lat != null && s.lng != null && (!beds || Math.abs(Number(s.bedrooms) - beds) <= 1))
    .map(s => ({ s, d: miles(lat!, lng!, Number(s.lat), Number(s.lng)) })).filter(x => x.d < 8).sort((a, b) => a.d - b.d);
  for (const { s, d } of nearby) {
    const url = s.airbnb_url || s.vrbo_url || null;
    if (url && seen.has(String(url))) continue;
    if (comps.length >= 8) break;
    comps.push({ title: s.title ?? null, url, beds: n(s.bedrooms), baths: n(s.bathrooms), miles: Math.round(d * 10) / 10, adr: n(s.adr), occupancy: n(s.occupancy_pct), revenue: n(s.revenue_ltm), rating: n(s.rating), reviews: n(s.reviews), source: 'Active STR nearby' });
  }
  return NextResponse.json({ ownership, comparables: comps });
}
