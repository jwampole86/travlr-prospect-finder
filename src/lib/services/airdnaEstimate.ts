import 'server-only';
import type { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { getRentalEstimate } from '@/lib/services/airdnaService';
import { rescoreLeadsByIds } from '@/lib/services/leadScoringService';

type Db = ReturnType<typeof getSupabaseAdmin>;
export interface AirdnaFigures { adr: number; occupancy: number; annualRevenue: number | null; confidence: string | null; scope: 'property' | 'area' }
export interface AirdnaLead { id: string; address: string; beds: number | null; baths: number | null; city?: string | null; state?: string | null; zip?: string | null; airdna_adr?: number | null; airdna_occupancy?: number | null; airdna_checked_at?: string | null }

const FRESH_DAYS = 90;
const RETRY_DAYS = 7;
const DAILY_CAP = Number(process.env.AIRDNA_DAILY_LOOKUPS ?? 250);
const MIN_AREA_HOMES = 4;

/** Street, city, state and ZIP in one string; a bare street address is ambiguous to AirDNA and misses. */
export function airdnaAddress(l: { address: string; city?: string | null; state?: string | null; zip?: string | null }): string {
  if (/,\s*[A-Za-z .'-]+,?\s+[A-Z]{2}\b/.test(l.address)) return l.address;
  return [l.address, l.city, [l.state, l.zip].filter(Boolean).join(' ')].filter(Boolean).join(', ');
}

let lastCall = 0;
// The plan allows about one request a second.
async function paced() {
  const wait = Math.max(0, lastCall + 1300 - Date.now());
  lastCall = Date.now() + wait;
  if (wait) await new Promise(r => setTimeout(r, wait));
}

const num = (v: unknown) => (Number.isFinite(Number(v)) && v !== null && v !== '' ? Number(v) : null);

/** The parts of a Rentalizer answer worth keeping: the market, the nearest comparable listings and the home's value. */
function compact(raw: Record<string, any>) {
  const info = raw.combined_market_info ?? {};
  const stats = raw.property_statistics ?? {};
  const revenues: unknown[] = Array.isArray(raw.comps_revenues) ? raw.comps_revenues : [];
  const comps = (Array.isArray(raw.comps) ? raw.comps : []).slice(0, 8).map((c: Record<string, any>, i: number) => ({
    title: c.title ?? null, url: c.airbnb_listing_url ?? c.vrbo_listing_url ?? c.listing_url ?? null, beds: num(c.bedrooms), baths: num(c.bathrooms), sleeps: num(c.accommodates),
    meters: num(c.distance_meters), rating: num(c.rating), reviews: num(c.reviews), adr: num(c.stats?.adr?.ltm), occupancy: num(c.stats?.occupancy?.ltm), revenue: num(c.stats?.revenue?.ltm) ?? num(revenues[i]), type: c.property_type ?? null,
  }));
  const am = raw.compset_amenities ?? {};
  return {
    market: info.airdna_market_name ?? null, submarket: info.airdna_submarket_name ?? null, marketScore: num(info.market_score), submarketScore: num(info.submarket_score), marketType: info.market_type ?? null,
    homeValue: num(raw.property_details?.property_value), cleaningFee: num(stats.cleaning_fee?.ltm), confidenceScore: num(stats.confidence_score?.score), totalComps: num(stats.total_comps),
    pctPool: num(am.percent_with_pool), pctHotTub: num(am.percent_with_hottub), comps,
  };
}

export interface LookupResult { figures: AirdnaFigures | null; /** The request itself failed, so nothing was recorded and it can be retried now. */ transient: boolean; quotaRemaining: number | null }

/** One Rentalizer request for a lead, saved on the lead. A failed request is not recorded as a miss. */
export async function lookupAirdna(db: Db, lead: AirdnaLead): Promise<LookupResult> {
  await paced();
  const res = await getRentalEstimate({ address: airdnaAddress({ address: lead.address, city: lead.city, state: lead.state, zip: lead.zip }), bedrooms: lead.beds ?? undefined, bathrooms: lead.baths ?? undefined, currency: 'usd' }).catch(() => null);
  const quotaRemaining = res?.quotaRemaining ?? null;
  if (!res?.ok) return { figures: null, transient: true, quotaRemaining };

  const e = res.estimate;
  const occ = e?.occupancyRate != null ? (e.occupancyRate <= 1 ? e.occupancyRate * 100 : e.occupancyRate) : null;
  const ok = !!e && Number(e.avgDailyRate) > 0 && occ != null && occ > 0;
  const conf = (e?.raw as { property_statistics?: { confidence_score?: { level?: string } } } | undefined)?.property_statistics?.confidence_score?.level ?? null;
  const now = new Date().toISOString();
  if (!ok) { await db.from('leads').update({ airdna_checked_at: now }).eq('id', lead.id); return { figures: null, transient: false, quotaRemaining }; }
  const figures: AirdnaFigures = { adr: Math.round(Number(e!.avgDailyRate)), occupancy: Math.round(occ!), annualRevenue: e!.annualRevenue ? Math.round(e!.annualRevenue) : null, confidence: conf, scope: 'property' };
  await db.from('leads').update({ airdna_adr: figures.adr, airdna_occupancy: figures.occupancy, airdna_annual_revenue: figures.annualRevenue, airdna_confidence: conf, airdna_checked_at: now, airdna_data: compact(e!.raw) }).eq('id', lead.id);
  await rescoreLeadsByIds(db, [lead.id]).catch(() => 0);
  return { figures, transient: false, quotaRemaining };
}

/** Median of AirDNA's own figures for other homes in the same city and a similar size, once enough have been looked up. */
export async function areaFigures(db: Db, where: { city?: string | null; state?: string | null; beds?: number | null }): Promise<AirdnaFigures | null> {
  if (!where.city || !where.state) return null;
  let q = db.from('leads').select('airdna_adr,airdna_occupancy,airdna_annual_revenue').eq('state', where.state).ilike('city', where.city.replace(/[%_\\,()]/g, ' ').trim()).gt('airdna_adr', 0).gt('airdna_occupancy', 0).limit(80);
  if (where.beds) q = q.gte('beds', where.beds - 1).lte('beds', where.beds + 1);
  const { data } = await q;
  if (!data || data.length < MIN_AREA_HOMES) return null;
  const med = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
  const rev = data.map(d => Number(d.airdna_annual_revenue)).filter(n => n > 0);
  return { adr: Math.round(med(data.map(d => Number(d.airdna_adr)))), occupancy: Math.round(med(data.map(d => Number(d.airdna_occupancy)))), annualRevenue: rev.length ? Math.round(med(rev)) : null, confidence: null, scope: 'area' };
}

/**
 * AirDNA's figures for one lead: its own lookup (made once, kept 90 days, capped per day so page views never drain the allowance),
 * else the median of nearby homes already looked up.
 */
export async function airdnaFiguresFor(db: Db, lead: AirdnaLead): Promise<AirdnaFigures | null> {
  const has = Number(lead.airdna_adr) > 0 && Number(lead.airdna_occupancy) > 0;
  const age = lead.airdna_checked_at ? (Date.now() - Date.parse(lead.airdna_checked_at)) / 86_400_000 : Infinity;
  const own: AirdnaFigures | null = has ? { adr: Number(lead.airdna_adr), occupancy: Number(lead.airdna_occupancy), annualRevenue: null, confidence: null, scope: 'property' } : null;
  const area = () => areaFigures(db, { city: lead.city, state: lead.state, beds: lead.beds });
  if (own && age < FRESH_DAYS) return own;
  if (!has && age < RETRY_DAYS) return area();

  const since = new Date(Date.now() - 86_400_000).toISOString();
  const { count } = await db.from('leads').select('id', { count: 'exact', head: true }).gte('airdna_checked_at', since);
  if ((count ?? 0) >= DAILY_CAP) return own ?? area();

  const r = await lookupAirdna(db, lead);
  return r.figures ?? own ?? area();
}
