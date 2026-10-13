import 'server-only';
import type { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { getRentalEstimate } from '@/lib/services/airdnaService';

type Db = ReturnType<typeof getSupabaseAdmin>;
export interface AirdnaFigures { adr: number; occupancy: number; annualRevenue: number | null; confidence: string | null }

const FRESH_DAYS = 90;
const RETRY_DAYS = 7;
const DAILY_CAP = Number(process.env.AIRDNA_DAILY_LOOKUPS ?? 250);

/**
 * AirDNA's estimate for one lead's address. Stored on the lead, so each home costs one request per 90 days (a miss is retried after a week),
 * and capped per day so the monthly request allowance is never drained by page views.
 */
export async function airdnaFiguresFor(db: Db, lead: { id: string; address: string; beds: number | null; baths: number | null; airdna_adr?: number | null; airdna_occupancy?: number | null; airdna_checked_at?: string | null }): Promise<AirdnaFigures | null> {
  const has = Number(lead.airdna_adr) > 0 && Number(lead.airdna_occupancy) > 0;
  const age = lead.airdna_checked_at ? (Date.now() - Date.parse(lead.airdna_checked_at)) / 86_400_000 : Infinity;
  if (has && age < FRESH_DAYS) return { adr: Number(lead.airdna_adr), occupancy: Number(lead.airdna_occupancy), annualRevenue: null, confidence: null };
  if (!has && age < RETRY_DAYS) return null;

  const since = new Date(Date.now() - 86_400_000).toISOString();
  const { count } = await db.from('leads').select('id', { count: 'exact', head: true }).gte('airdna_checked_at', since);
  if ((count ?? 0) >= DAILY_CAP) return has ? { adr: Number(lead.airdna_adr), occupancy: Number(lead.airdna_occupancy), annualRevenue: null, confidence: null } : null;

  const res = await getRentalEstimate({ address: lead.address, bedrooms: lead.beds ?? undefined, bathrooms: lead.baths ?? undefined, currency: 'usd' }).catch(() => null);
  const e = res?.ok ? res.estimate : null;
  const occ = e?.occupancyRate != null ? (e.occupancyRate <= 1 ? e.occupancyRate * 100 : e.occupancyRate) : null;
  const ok = !!e && Number(e.avgDailyRate) > 0 && occ != null && occ > 0;
  const conf = (e?.raw as { property_statistics?: { confidence_score?: { level?: string } } } | undefined)?.property_statistics?.confidence_score?.level ?? null;
  await db.from('leads').update(ok
    ? { airdna_adr: Math.round(Number(e!.avgDailyRate)), airdna_occupancy: Math.round(occ!), airdna_annual_revenue: e!.annualRevenue ? Math.round(e!.annualRevenue) : null, airdna_confidence: conf, airdna_checked_at: new Date().toISOString() }
    : { airdna_checked_at: new Date().toISOString() }).eq('id', lead.id);
  return ok ? { adr: Math.round(Number(e!.avgDailyRate)), occupancy: Math.round(occ!), annualRevenue: e!.annualRevenue ?? null, confidence: conf } : null;
}
