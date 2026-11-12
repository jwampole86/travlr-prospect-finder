/**
 * Finding broker partners online. AVA (Claude with live web search) looks for licensed brokerages and agents in a state, checks each one for
 * the things that make a good listing partner (takes referrals, sells investment and second homes, licensed there, reachable), and AVYRO
 * ranks them best match first. Every claim has to point at a page the search really returned, so a guess never counts toward the rank.
 * Nothing here sends or shares anything: the results are leads for recruiting, to be checked by a person before any outreach.
 */
export type Check = 'yes' | 'no' | 'unknown';

export interface PartnerCandidate {
  name: string;
  brokerage: string | null;
  city: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  why: string | null;
  sourceUrl: string;
  /** The page says they take or pay referrals ('yes'), says they do not ('no'), or says nothing ('unknown'). */
  acceptsReferrals: Check;
  referralEvidence: string | null;
  referralUrl: string | null;
  handlesInvestment: Check;
  licensedInState: Check;
  /** 0-100, best first. */
  matchScore: number;
  /** What moved the score, for the person reading the list. */
  signals: string[];
}

const clean = (v: unknown, max: number) => (typeof v === 'string' && v.trim() && !/^(null|n\/a|none|unknown)$/i.test(v.trim()) ? v.trim().slice(0, max) : null);
const check = (v: unknown): Check => (v === 'yes' || v === 'no' ? v : 'unknown');

export function buildDiscoveryPrompt(state: string, city: string | null, focus: 'listing' | 'buyer' = 'listing'): string {
  const where = city ? `${city}, ${state} (and the surrounding area)` : `${state}, covering its biggest second-home and investment markets`;
  const role = focus === 'buyer'
    ? "to represent buyers who want a property in the area (a buyer's agent partner, for homes that are already listed with another broker)"
    : 'to be its listing partner';
  const fit = focus === 'buyer'
    ? `A good partner is licensed in ${state}, represents buyers (buyer's agent or buyer representation pages), works with investors, second-home and out-of-area buyers, and takes or pays referrals.`
    : `A good partner is licensed in ${state}, lists and sells residential homes, works with investment properties or second homes, and takes or pays referrals.`;
  return `Find real estate brokerages and agents in ${where}, USA, that a home-sales referral company could approach ${role}, then check each one.

${fit} Look at brokerage and agent pages, Realtor.com, Zillow, Homes.com and the state real estate commission's licensee pages. Skip lead-selling or referral-fee marketplaces, and skip anyone you cannot tie to a page you actually opened.

For your top candidates, run a search that checks whether the brokerage or agent takes or pays referrals (a referral program, "refer a client" page, referral fee terms, an out-of-area referral network). Judge only from pages you opened.

Rules for honesty:
- Give a phone number or email ONLY when it is written on a page you retrieved. Never guess, build or complete one (for example, never invent first.last@brokerage.com). Use null when it is not on the page.
- sourceUrl is the exact page where you saw the business and its contact details. referralUrl is the exact page that shows they take referrals, or null.
- acceptsReferrals is "yes" only when a retrieved page says so, "no" only when a page says they do not, otherwise "unknown". Same for handlesInvestment and licensedInState.
- Do not claim a license is active beyond what a page states. You are finding leads to check, not verifying anyone.
- matchScore is your overall 0-100 judgment of fit as a partner for second-home and investment clients, using only what the pages show.

Return ONE JSON object and nothing else, with up to 8 candidates:
{"candidates":[{"name":"person or team name","brokerage":"company or null","city":"city or null","phone":"as printed or null","email":"as printed or null","website":"company site or null","why":"one short line: what the page shows that makes them a fit","sourceUrl":"https://...","acceptsReferrals":"yes|no|unknown","referralEvidence":"what the page says about referrals, or null","referralUrl":"https://... or null","handlesInvestment":"yes|no|unknown","licensedInState":"yes|no|unknown","matchScore":0}]}`;
}

/** AVA's own score nudged by what the pages prove, so a confident guess cannot outrank a verified referral partner. */
export function rankScore(c: Omit<PartnerCandidate, 'matchScore' | 'signals'>, ava: number, city: string | null): { score: number; signals: string[] } {
  const signals: string[] = [];
  let score = Math.max(0, Math.min(100, Number.isFinite(ava) ? ava : 50)) * 0.4;
  const add = (points: number, text: string) => { score += points; signals.push(`${points > 0 ? '+' : ''}${points} ${text}`); };
  if (c.acceptsReferrals === 'yes') add(25, 'takes referrals (page cited)');
  else if (c.acceptsReferrals === 'no') add(-30, 'says it does not take referrals');
  else add(0, 'referrals not stated');
  if (c.handlesInvestment === 'yes') add(12, 'works with investment or second homes');
  if (c.licensedInState === 'yes') add(10, 'licensed in the state per its page');
  if (c.phone) add(6, 'phone on the page');
  if (c.email) add(4, 'email on the page');
  if (city && c.city && c.city.toLowerCase().includes(city.toLowerCase())) add(8, `in ${city}`);
  return { score: Math.max(0, Math.min(100, Math.round(score))), signals: signals.filter((s) => !s.startsWith('+0') && !s.startsWith('0 ')) };
}

/** Keeps only candidates that cite a page the search really returned, drops duplicates, scores them and sorts best match first. */
export function parseCandidates(raw: string, foundUrls: string[], city: string | null = null): PartnerCandidate[] {
  const start = raw.indexOf('{"candidates"') >= 0 ? raw.indexOf('{"candidates"') : raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) return [];
  let parsed: { candidates?: unknown };
  try { parsed = JSON.parse(raw.slice(start, end + 1)); } catch { return []; }
  const found = new Set(foundUrls);
  const seen = new Set<string>();
  const out: PartnerCandidate[] = [];
  for (const item of Array.isArray(parsed.candidates) ? parsed.candidates : []) {
    const c = item as Record<string, unknown>;
    const name = clean(c.name, 160);
    const sourceUrl = clean(c.sourceUrl, 600);
    if (!name || !sourceUrl || !found.has(sourceUrl)) continue;
    const key = `${name}|${clean(c.brokerage, 160) ?? ''}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const email = clean(c.email, 160);
    const referralUrl = clean(c.referralUrl, 600);
    // A referral claim only counts when the page it cites was really retrieved.
    const referralsProven = referralUrl !== null && found.has(referralUrl);
    const base = {
      name,
      brokerage: clean(c.brokerage, 160),
      city: clean(c.city, 80),
      phone: clean(c.phone, 40),
      email: email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null,
      website: clean(c.website, 300),
      why: clean(c.why, 240),
      sourceUrl,
      acceptsReferrals: referralsProven || check(c.acceptsReferrals) === 'no' ? check(c.acceptsReferrals) : ('unknown' as Check),
      referralEvidence: referralsProven ? clean(c.referralEvidence, 240) : null,
      referralUrl: referralsProven ? referralUrl : null,
      handlesInvestment: check(c.handlesInvestment),
      licensedInState: check(c.licensedInState),
    };
    const ranked = rankScore(base, Number(c.matchScore), city);
    out.push({ ...base, matchScore: ranked.score, signals: ranked.signals });
  }
  return out.sort((a, b) => b.matchScore - a.matchScore);
}
