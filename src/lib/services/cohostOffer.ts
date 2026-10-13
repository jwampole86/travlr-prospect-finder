import 'server-only';
import type { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { assessData, marketBenchmark, type Benchmark } from '@/lib/services/cohostNumbers';
import { EXPECTED_GAP_SHARE } from '@/lib/cohostFees';

type Db = ReturnType<typeof getSupabaseAdmin>;
const ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789';

export const OFFER_SITE = (process.env.NEXT_PUBLIC_SITE_URL || 'https://prospect.staytrvlr.com').replace(/\/$/, '');
export const offerUrl = (code: string) => `${OFFER_SITE}/h/${code}`;

export interface Scenario { key: 'conservative' | 'expected' | 'stretch'; label: string; share: number; annual: number; monthly: number; gain: number; gainPct: number | null }
export interface OfferData {
  code: string; title: string; city: string; state: string; bedrooms: number | null; bathrooms: number | null; luxury: boolean; rating: number | null; reviews: number | null;
  current: { revenue: number; adr: number | null; occupancyPct: number | null; daysAvailable: number | null };
  potential: number; gap: number; scenarios: Scenario[];
  /** own: the listing's figures are backed by enough bookings to quote. benchmark: too little history, so comparable homes are shown instead. none: neither is available. */
  mode: 'own' | 'benchmark' | 'none'; benchmark: Benchmark | null;
  findings: string[]; photo: { score: number | null; hero: string | null; fixes: string[]; missingShots: string[]; looksDated: boolean };
  optedOut: boolean; requested: boolean;
}

const num = (v: unknown) => (v === null || v === undefined || v === '' || Number.isNaN(Number(v)) ? null : Number(v));
const SCENARIOS: Array<[Scenario['key'], string, number]> = [['conservative', 'Conservative', 0.2], ['expected', 'Expected', EXPECTED_GAP_SHARE], ['stretch', 'Stretch', 0.65]];

/** Illustrative only: assumes we close a share of the gap between what the home earns now and what comparable demand supports. */
export function buildScenarios(current: number, potential: number): { gap: number; scenarios: Scenario[] } {
  const pot = Math.max(potential, current); const gap = pot - current;
  return {
    gap, scenarios: SCENARIOS.map(([key, label, share]) => {
      const gain = Math.round((gap * share) / 100) * 100;
      return { key, label, share, gain, annual: Math.round(current + gain), monthly: Math.round((current + gain) / 12), gainPct: current > 0 ? Math.round((gain / current) * 100) : null };
    }),
  };
}

/** Returns the existing short code for a prospect listing, or creates one. */
export async function ensureOfferLink(db: Db, propertyId: string): Promise<string | null> {
  const { data: existing } = await db.from('cohost_offer_links').select('code').eq('property_id', propertyId).maybeSingle();
  if (existing?.code) return existing.code as string;
  const { data: listing } = await db.from('str_listings').select('property_id').eq('property_id', propertyId).maybeSingle();
  if (!listing) return null;
  for (let attempt = 0; attempt < 6; attempt++) {
    const code = Array.from({ length: 7 }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join('');
    const { error } = await db.from('cohost_offer_links').insert({ code, property_id: propertyId });
    if (!error) return code;
    const { data: again } = await db.from('cohost_offer_links').select('code').eq('property_id', propertyId).maybeSingle();
    if (again?.code) return again.code as string;
  }
  return null;
}

/** What the public page may show: the listing's own public data and our analysis of it. No owner name, no street address, no contact details. */
export async function getOfferData(db: Db, code: string): Promise<OfferData | null> {
  if (!/^[a-z0-9]{4,16}$/i.test(code)) return null;
  const { data: link } = await db.from('cohost_offer_links').select('code,property_id,requested_at,opted_out_at').eq('code', code).maybeSingle();
  if (!link) return null;
  const { data: l } = await db.from('str_listings').select('title,market,bedrooms,bathrooms,adr,occupancy_pct,days_available_ltm,revenue_ltm,revenue_potential_ltm,rating,reviews,is_luxury,is_elite,under_reasons,photo_score,photo_notes').eq('property_id', link.property_id).maybeSingle();
  if (!l) return null;
  const [city, state] = String(l.market ?? '').split(',').map(s => s.trim());
  const revenue = Math.round(num(l.revenue_ltm) ?? 0); const potential = Math.round(num(l.revenue_potential_ltm) ?? 0);
  const { gap, scenarios } = buildScenarios(revenue, potential);
  const quality = assessData(l);
  const benchmark = quality.reliable ? null : await marketBenchmark(db, String(l.market ?? ''), num(l.bedrooms));
  const mode: OfferData['mode'] = quality.reliable ? 'own' : benchmark ? 'benchmark' : 'none';
  const pn = (l.photo_notes ?? {}) as { hero?: string; fixes?: string[]; missingShots?: string[]; looksDated?: boolean; complete?: boolean };
  // A review built on a sample of the photos can wrongly call a space missing, so owners only see findings from a review of every photo.
  const full = pn.complete === true;
  return {
    code, title: String(l.title ?? 'Your listing').slice(0, 120), city: city ?? '', state: state ?? '', bedrooms: num(l.bedrooms), bathrooms: num(l.bathrooms), luxury: !!l.is_luxury, rating: num(l.rating), reviews: num(l.reviews),
    current: { revenue, adr: num(l.adr), occupancyPct: num(l.occupancy_pct), daysAvailable: num(l.days_available_ltm) },
    potential: Math.max(potential, revenue), gap, scenarios, mode, benchmark,
    // Findings built on thin booking numbers (occupancy rank, share of potential) would not hold up, so only review and rating notes are kept for those listings.
    findings: ((l.under_reasons ?? []) as string[]).filter(f => quality.reliable || /review|rating/i.test(f)).slice(0, 4),
    photo: { score: full ? num(l.photo_score) : null, hero: full ? pn.hero ?? null : null, fixes: full ? (pn.fixes ?? []).slice(0, 3) : [], missingShots: full ? (pn.missingShots ?? []).slice(0, 4) : [], looksDated: full && !!pn.looksDated },
    optedOut: !!link.opted_out_at, requested: !!link.requested_at,
  };
}

const usd = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;

/** Ready-to-edit drafts for the team to paste into an email or text. The text draft is for review only; co-host prospects are not texted automatically. */
export function offerDrafts(d: Pick<OfferData, 'title' | 'city' | 'current' | 'scenarios' | 'gap' | 'mode' | 'benchmark' | 'bedrooms'>, url: string) {
  const exp = d.scenarios.find(s => s.key === 'expected');
  const earn = d.mode === 'own' && d.gap > 0 && exp ? `We think there is roughly ${usd(exp.gain)} a year of upside.`
    : d.mode === 'benchmark' && d.benchmark ? `Comparable ${d.bedrooms ? `${d.bedrooms}-bedroom ` : ''}homes in ${d.city} typically earn about ${usd(d.benchmark.typical)} a year, and the top quarter about ${usd(d.benchmark.strong)}.`
    : 'We found a few ways to lift bookings and rates.';
  return {
    subject: `Ideas to lift bookings for "${d.title.slice(0, 60)}"`,
    email: `Hi,\n\nI'm reaching out from TRAVLR Vacation Homes. We run our own luxury vacation homes and help owners who already host on Airbnb or Vrbo earn more, either as a co-host on your existing listing or with full management.\n\nWe took a look at your listing in ${d.city} using public booking data. ${earn} I put together a short, free page that shows what we noticed and what it could look like for you:\n\n${url}\n\nIf it's useful, reply and we'll do a free listing audit. If not, no problem. Just let me know and I won't follow up.\n\nBest,\nTRAVLR Vacation Homes${process.env.COMPANY_POSTAL_ADDRESS ? `\n${process.env.COMPANY_POSTAL_ADDRESS}` : ''}`,
    sms: `TRAVLR Vacation Homes: we put together a short look at your ${d.city.slice(0, 24)} listing: ${url}\nReply STOP to opt out`,
  };
}
