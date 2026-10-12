import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { classifyNiches } from '@/lib/niches';
import { MIN_BOOKED_NIGHTS, bookedNightsOf } from '@/lib/services/cohostNumbers';

type Row = Record<string, any>;
const clamp = (n: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, n));
const sizeBand = (b: number | null) => (!b || b <= 3 ? '3' : b === 4 ? '4' : b === 5 ? '5' : '6+');
const median = (a: number[]) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0; };

/** LUXURY starts at $1,000 a night; ELITE, the ultra-luxury tier, starts at $4,995 a night and is also counted as luxury. */
export const LUXURY_ADR = 1000;
export const ELITE_ADR = 4995;

function percentileRank(sorted: number[], v: number): number {
  if (sorted.length < 2) return 0.5;
  let lo = 0, hi = sorted.length; while (lo < hi) { const m = (lo + hi) >> 1; if (sorted[m] < v) lo = m + 1; else hi = m; }
  return lo / (sorted.length - 1);
}

export interface ScoreSummary { scored: number; segments: Record<string, number>; candidatesByMarket: Record<string, number>; luxuryCandidates: number; eliteCandidates: number }

/**
 * Scores stored listings for co-listing outreach and writes the result back to str_listings.
 * Underperformance is measured against comparable homes (same market, same size band), not fixed thresholds, because ratings are
 * near-perfect almost everywhere and occupancy and revenue-versus-potential are what actually separate listings.
 * Homes run by large managers and homes the owner blocks heavily are labelled separately so they do not pollute the owner list.
 */
export async function scoreListings(db: SupabaseClient, opts: { markets?: string[]; write: boolean }): Promise<ScoreSummary> {
  const rows: Row[] = [];
  const cols = 'property_id,market,title,bedrooms,bathrooms,accommodates,adr,occupancy_pct,days_available_ltm,revenue_ltm,revenue_potential_ltm,rating,reviews,host_listing_count';
  const chunks = opts.markets ? Array.from({ length: Math.ceil(opts.markets.length / 40) }, (_, i) => opts.markets!.slice(i * 40, i * 40 + 40)) : [null];
  for (const chunk of chunks) {
    for (let from = 0; ; from += 1000) {
      let q = db.from('str_listings').select(cols).order('property_id');
      if (chunk) q = q.in('market', chunk);
      const { data, error } = await q.range(from, from + 999);
      if (error) throw error; rows.push(...(data ?? [])); if ((data ?? []).length < 1000) break;
    }
  }
  const groups = new Map<string, Row[]>();
  for (const r of rows) { const k = `${r.market}|${sizeBand(r.bedrooms)}`; (groups.get(k) ?? groups.set(k, []).get(k)!).push(r); }
  const stats = new Map<string, { occ: number[]; adrMed: number }>();
  for (const [k, g] of groups) stats.set(k, { occ: g.map(r => Number(r.occupancy_pct ?? 0)).sort((a, b) => a - b), adrMed: median(g.map(r => Number(r.adr ?? 0)).filter(Boolean)) });
  const out: Row[] = [];
  for (const r of rows) {
    const st = stats.get(`${r.market}|${sizeBand(r.bedrooms)}`)!;
    const occ = Number(r.occupancy_pct ?? 0), adr = Number(r.adr ?? 0), avail = Number(r.days_available_ltm ?? 0);
    const rev = Number(r.revenue_ltm ?? 0), pot = Number(r.revenue_potential_ltm ?? 0), rating = r.rating == null ? null : Number(r.rating), reviews = Number(r.reviews ?? 0);
    const reasons: string[] = [];

    const occGap = 1 - percentileRank(st.occ, occ);               // 1 = lowest occupancy among comparable homes
    const revGap = pot > 0 ? clamp(1 - rev / pot) : 0;
    const ratingPen = rating != null && reviews >= 10 ? (rating < 4.5 ? 1 : rating < 4.7 ? 0.7 : rating < 4.8 ? 0.35 : 0) : 0;
    const thin = avail >= 200 ? (reviews < 5 ? 1 : reviews < 15 ? 0.5 : 0) : 0;
    // Rate comparisons need enough booked nights behind them to mean anything.
    const bookedNights = (occ / 100) * avail;
    const over = bookedNights >= 20 && st.adrMed > 0 && adr > st.adrMed * 1.25 && occGap > 0.6;
    const under = bookedNights >= 20 && st.adrMed > 0 && adr < st.adrMed * 0.75 && occGap < 0.4;
    const pricing = over ? 1 : under ? 0.6 : 0;

    if (occGap >= 0.6) reasons.push(`occupancy ${occ.toFixed(0)}% is in the bottom ${Math.max(5, Math.round((1 - occGap) * 100 + 5))}% of comparable ${sizeBand(r.bedrooms)}-bedroom homes in ${r.market.split(',')[0]}`);
    if (revGap >= 0.4 && pot > 0) reasons.push(`earned about ${Math.round((rev / pot) * 100)}% of its estimated revenue potential`);
    if (ratingPen >= 0.7) reasons.push(`rating ${rating?.toFixed(1)} across ${reviews} reviews`);
    if (thin > 0) reasons.push(reviews < 5 ? `only ${reviews} ${reviews === 1 ? 'review' : 'reviews'} despite being listed most of the year` : `thin review history (${reviews} reviews)`);
    if (over) reasons.push(adr / st.adrMed >= 2 ? `nightly rate about ${(adr / st.adrMed).toFixed(1)}x comparable homes while occupancy lags` : `nightly rate about ${Math.round((adr / st.adrMed - 1) * 100)}% above comparable homes while occupancy lags`);
    if (under) reasons.push(`rate about ${Math.round((1 - adr / st.adrMed) * 100)}% below comparable homes, which may be leaving money on the table`);

    const score = Math.round(100 * (0.4 * occGap + 0.3 * (avail >= 180 ? revGap : revGap * 0.4) + 0.15 * ratingPen + 0.1 * thin + 0.05 * pricing));
    const hostCount = Number(r.host_listing_count ?? 1);
    // Very few reviews means the listing is probably new or dormant, so its last-12-month numbers say little about performance.
    const segment = hostCount >= 5 ? 'professional_manager' : avail < 150 ? 'owner_blocked' : reviews <= 3 ? 'new_or_dormant' : score >= 45 ? 'candidate' : 'performing';
    // A rate averaged over a handful of stays is not a nightly rate the home can be said to command.
    const rateIsReal = bookedNightsOf({ occupancy_pct: occ, days_available_ltm: avail, adr, revenue_ltm: rev }) >= MIN_BOOKED_NIGHTS;
    const isLux = adr >= LUXURY_ADR && rateIsReal;
    const isElite = adr >= ELITE_ADR && rateIsReal;
    const c = classifyNiches({ title: r.title, market: r.market, bedrooms: r.bedrooms, bathrooms: r.bathrooms, accommodates: r.accommodates, adr, is_luxury: isLux, is_elite: isElite });
    const niche = { niches: c.niches, primary_niche: c.primary };
    out.push({ property_id: r.property_id, market: r.market, under_score: score, under_reasons: reasons, segment, is_luxury: isLux, is_elite: isElite, ...niche, scored_at: new Date().toISOString() });
  }

  const count = (f: (r: Row) => string) => out.reduce<Record<string, number>>((a, r) => { const k = f(r); a[k] = (a[k] ?? 0) + 1; return a; }, {});
  const cands = out.filter(r => r.segment === 'candidate');
  if (opts.write) for (let i = 0; i < out.length; i += 200) { const { error } = await db.from('str_listings').upsert(out.slice(i, i + 200), { onConflict: 'property_id' }); if (error) throw error; }
  return { scored: out.length, segments: count(r => r.segment), candidatesByMarket: count(r => (r.segment === 'candidate' ? r.market : '-')), luxuryCandidates: cands.filter(r => r.is_luxury).length, eliteCandidates: cands.filter(r => r.is_elite).length };
}
