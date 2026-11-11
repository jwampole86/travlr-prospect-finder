/**
 * Which signed partner should get a lead. Hard rules first (a partner who fails any of them is never suggested, and the reasons are
 * shown), then the survivors are ranked. Pure, so the rules are tested and the same everywhere.
 */
import { partnerCoversState } from './stateActivation';
import type { PartnerScore } from './partnerReferrals';

export interface MatchPartner {
  id: string; name: string; relationship_status: string; license_status: string; legal_reviewed: boolean; agreement_on_file: boolean;
  license_state: string | null; states: string[]; markets: string[]; property_types: string[]; price_min: number | null; price_max: number | null;
  max_open_leads: number | null; do_not_assign: boolean; match_boost: number; accepts_referrals?: string | null; exclusive_territory?: string | null;
}
export interface MatchLead { state: string | null; city: string | null; county: string | null; propertyType: string | null; salePrice: number | null }
export interface MatchStats { openLeads: number; score: PartnerScore; closed: number; assigned: number }
export interface Suggestion { partner: MatchPartner; score: number; reasons: string[] }
export interface Rejection { partner: MatchPartner; why: string[] }

const norm = (s: string | null | undefined) => (s ?? '').toLowerCase().replace(/\bcounty\b/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const inList = (list: string[], v: string | null | undefined) => !!v && list.some((x) => norm(x) === norm(v));

/** Hard rules. An empty markets list means the partner has not said where they work, which counts for less when ranking. */
export function hardFailures(p: MatchPartner, lead: MatchLead, st: MatchStats): string[] {
  const why: string[] = [];
  if (p.relationship_status !== 'active') why.push(`Partner is ${p.relationship_status}`);
  if (p.do_not_assign) why.push('Marked do not assign');
  if (p.license_status !== 'verified') why.push('License not verified');
  if (!p.legal_reviewed || !p.agreement_on_file) why.push('Agreement or legal review missing');
  if (p.accepts_referrals === 'no') why.push('Does not accept referrals');
  if (!partnerCoversState(p, lead.state)) why.push(`Not licensed in ${lead.state ?? 'the lead\'s state'}`);
  if (p.markets.length && !inList(p.markets, lead.city) && !inList(p.markets, lead.county)) why.push(`Does not cover ${lead.city ?? 'this market'}`);
  if (lead.propertyType && p.property_types.length && !p.property_types.map(norm).includes(norm(lead.propertyType))) why.push(`Does not take ${lead.propertyType}`);
  if (lead.salePrice != null) {
    if (p.price_min != null && lead.salePrice < p.price_min) why.push('Below their price range');
    if (p.price_max != null && lead.salePrice > p.price_max) why.push('Above their price range');
  }
  if (p.max_open_leads != null && st.openLeads >= p.max_open_leads) why.push(`At capacity (${st.openLeads} of ${p.max_open_leads} open)`);
  if (st.score.flag === 'stopped') why.push('Has stopped reporting');
  return why;
}

export function rank(p: MatchPartner, lead: MatchLead, st: MatchStats): Suggestion {
  let score = 0;
  const reasons: string[] = [];
  const add = (n: number, why: string) => { score += n; reasons.push(why); };
  if (inList(p.markets, lead.city)) add(30, `Works in ${lead.city}`);
  else if (inList(p.markets, lead.county)) add(15, `Covers ${lead.county} County`);
  else if (!p.markets.length) add(0, 'No markets listed');
  if (lead.salePrice != null && p.price_min != null && p.price_max != null && p.price_max > p.price_min) {
    const pos = (lead.salePrice - p.price_min) / (p.price_max - p.price_min);
    if (pos >= 0.25 && pos <= 0.75) add(10, 'Price sits in the middle of their range');
  }
  if (st.score.rate !== null && st.score.rate >= 0.7) add(15, `Reports back (${Math.round(st.score.rate * 100)}% update rate)`);
  if (st.score.flag === 'watch') add(-10, 'Reporting needs watching');
  if (st.closed > 0) add(15, `${st.closed} closed from earlier referrals`);
  else if (st.score.listed + st.score.underContract > 0) add(8, 'Has listed earlier referrals');
  if (p.exclusive_territory && inList(p.exclusive_territory.split(',').map((x) => x.trim()), lead.city)) add(20, 'Holds this territory exclusively');
  if (p.match_boost) add(p.match_boost, `Preferred partner (+${p.match_boost})`);
  if (st.openLeads === 0) add(2, 'No open leads yet');
  return { partner: p, score, reasons };
}

export function matchPartners(partners: MatchPartner[], lead: MatchLead, stats: Map<string, MatchStats>): { suggestions: Suggestion[]; rejected: Rejection[] } {
  const suggestions: Suggestion[] = [];
  const rejected: Rejection[] = [];
  for (const p of partners) {
    const st = stats.get(p.id);
    if (!st) continue;
    const why = hardFailures(p, lead, st);
    if (why.length) rejected.push({ partner: p, why }); else suggestions.push(rank(p, lead, st));
  }
  suggestions.sort((a, b) => b.score - a.score || a.partner.name.localeCompare(b.partner.name));
  return { suggestions, rejected };
}
