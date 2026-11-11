/**
 * Finding broker partners online. Claude searches the web for licensed brokerages and agents in a state (or a market inside it) and
 * returns candidates with the contact details printed on the pages it read. Nothing here sends or shares anything: the results are
 * leads for recruiting, shown with the page each came from so a person can check them before any outreach.
 */
export interface PartnerCandidate {
  name: string;
  brokerage: string | null;
  city: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  why: string | null;
  sourceUrl: string;
}

const clean = (v: unknown, max: number) => (typeof v === 'string' && v.trim() && !/^(null|n\/a|none|unknown)$/i.test(v.trim()) ? v.trim().slice(0, max) : null);

export function buildDiscoveryPrompt(state: string, city: string | null): string {
  const where = city ? `${city}, ${state} (and the surrounding area)` : `${state}, covering its biggest second-home and investment markets`;
  return `Find real estate brokerages and agents in ${where}, USA, that a home-sales referral company could approach to be its listing partner.

A good partner is licensed in ${state}, lists and sells residential homes, and works with investment properties or second homes. Look for brokerages and agents with an official website, a Realtor.com, Zillow, Homes.com or brokerage-company agent page, or the state real estate commission's licensee pages. Skip lead-selling or referral-fee marketplaces, and skip anyone you cannot tie to a page you actually opened.

Rules for honesty:
- Give a phone number or email ONLY when it is written on a page you retrieved. Never guess, build or complete one (for example, never invent first.last@brokerage.com). Use null when it is not on the page.
- sourceUrl must be the exact page where you saw the business and its contact details.
- Do not claim a license is active. You are finding leads to check, not verifying anyone.

Return ONE JSON object and nothing else, with up to 6 candidates, best fit first:
{"candidates":[{"name":"person or team name","brokerage":"company or null","city":"city or null","phone":"as printed or null","email":"as printed or null","website":"company site or null","why":"one short line: what the page shows that makes them a fit","sourceUrl":"https://..."}]}`;
}

/** Keeps only candidates that cite a page the search really returned, drops duplicates, and trims every field. */
export function parseCandidates(raw: string, foundUrls: string[]): PartnerCandidate[] {
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
    out.push({
      name,
      brokerage: clean(c.brokerage, 160),
      city: clean(c.city, 80),
      phone: clean(c.phone, 40),
      email: email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null,
      website: clean(c.website, 300),
      why: clean(c.why, 240),
      sourceUrl,
    });
  }
  return out;
}
