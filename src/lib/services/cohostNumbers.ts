import type { SupabaseClient } from '@supabase/supabase-js';

/** Fewer booked nights than this and a listing's yearly figures (earnings, nightly rate, occupancy) say more about a few stays than about the home. */
export const MIN_BOOKED_NIGHTS = 20;

export interface DataQuality { reliable: boolean; bookedNights: number; reasons: string[] }

type NightsInput = { occupancy_pct?: number | null; days_available_ltm?: number | null; adr?: number | null; revenue_ltm?: number | null };
/** Booked nights from occupancy, cross-checked against revenue divided by nightly rate; when the two disagree the lower one is the safer reading. */
export function bookedNightsOf(l: NightsInput): number {
  const fromOcc = (Number(l.occupancy_pct ?? 0) / 100) * Number(l.days_available_ltm ?? 0);
  const adr = Number(l.adr ?? 0), rev = Number(l.revenue_ltm ?? 0);
  const fromRev = adr > 0 && rev > 0 ? rev / adr : fromOcc;
  return Math.round(Math.min(fromOcc, fromRev));
}

/** A low review count is not a reason to withhold potential: few reviews usually means weak positioning, which is the opportunity. Real booked nights and listing time still are. */
export function assessData(l: NightsInput & { reviews?: number | null; is_luxury?: boolean | null; is_elite?: boolean | null }): DataQuality {
  const avail = Number(l.days_available_ltm ?? 0);
  const booked = bookedNightsOf(l); const reasons: string[] = [];
  if (booked < MIN_BOOKED_NIGHTS) reasons.push(`only ${booked} booked ${booked === 1 ? 'night' : 'nights'} in the last 12 months`);
  if (avail > 0 && avail < 60) reasons.push(`listed for only ${Math.round(avail)} days`);
  return { reliable: reasons.length === 0, bookedNights: booked, reasons };
}

export interface Benchmark { typical: number; strong: number; adr: number | null; occupancyPct: number | null; sample: number; bedrooms: number | null }

const pct = (sorted: number[], p: number) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
const round500 = (n: number) => Math.round(n / 500) * 500;

/**
 * What comparable homes in the same market earn: homes of the same size (one bedroom either way) with a full year of real bookings behind them.
 * Used when a listing's own numbers are too thin to quote. Needs at least 8 comparable homes, otherwise there is no benchmark.
 */
export async function marketBenchmark(db: SupabaseClient, market: string, bedrooms: number | null): Promise<Benchmark | null> {
  let q = db.from('str_listings').select('revenue_ltm,adr,occupancy_pct,days_available_ltm,reviews').eq('market', market).gt('revenue_ltm', 0).limit(2000);
  if (bedrooms) q = q.gte('bedrooms', bedrooms - 1).lte('bedrooms', bedrooms + 1);
  const { data } = await q;
  const comps = (data ?? []).filter(r => Number(r.days_available_ltm) >= 180 && Number(r.reviews) >= 10 && (Number(r.occupancy_pct) / 100) * Number(r.days_available_ltm) >= 60);
  if (comps.length < 8) return null;
  const rev = comps.map(r => Number(r.revenue_ltm)).sort((a, b) => a - b);
  const adr = comps.map(r => Number(r.adr)).filter(Boolean).sort((a, b) => a - b); const occ = comps.map(r => Number(r.occupancy_pct)).sort((a, b) => a - b);
  return { typical: round500(pct(rev, 0.5)), strong: round500(pct(rev, 0.75)), adr: adr.length ? Math.round(pct(adr, 0.5)) : null, occupancyPct: occ.length ? Math.round(pct(occ, 0.5)) : null, sample: comps.length, bedrooms };
}

/** Same size bands as the market occupancy function (str_market_occupancy). */
export const occupancyBand = (bedrooms: number | null | undefined) => (!bedrooms || bedrooms <= 3 ? '3' : bedrooms === 4 ? '4' : bedrooms === 5 ? '5' : '6+');

export interface OccupancyView {
  /** Share of the nights the home was open to guests that were booked: the figure to show. */
  headlinePct: number; reportedPct: number; revenueImpliedPct: number | null;
  bookedNights: number; openDays: number;
  /** Booked nights as a share of the whole year, which is lower whenever the home was blocked for part of it. */
  yearPct: number;
  marketMedianPct: number | null; marketSample: number;
  note: string | null;
}

/**
 * AirDNA's occupancy is booked nights over the nights the home was open, not over the year. Earnings never exceed rate x booked nights,
 * so when earnings fall well short of what the reported rate implies (a few high-priced stays can skew the average rate), the reported
 * rate is the weaker figure and the one backed by earnings is shown instead.
 */
export function occupancyView(l: NightsInput, market?: { median: number; n: number } | null): OccupancyView | null {
  const reported = Number(l.occupancy_pct); const open = Number(l.days_available_ltm ?? 0);
  if (!Number.isFinite(reported) || !(open > 0)) return null;
  const adr = Number(l.adr ?? 0), rev = Number(l.revenue_ltm ?? 0);
  const implied = adr > 0 && rev > 0 ? Math.min(100, (rev / (adr * open)) * 100) : null;
  const useImplied = implied != null && implied < reported * 0.75;
  const headline = useImplied ? implied : reported;
  const booked = Math.round((headline / 100) * open);
  return {
    headlinePct: Math.round(headline), reportedPct: Math.round(reported), revenueImpliedPct: implied == null ? null : Math.round(implied), bookedNights: booked, openDays: Math.round(open),
    yearPct: Math.round((booked / 365) * 100), marketMedianPct: market ? Math.round(market.median) : null, marketSample: market?.n ?? 0,
    note: useImplied ? `The source reports ${Math.round(reported)}% booked, but this home's earnings and nightly rate only support about ${Math.round(implied!)}%, so that is the figure shown.` : null,
  };
}
