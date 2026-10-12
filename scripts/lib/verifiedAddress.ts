/** Splits an authoritative "street city, ST zip" string into parts; shared by the campaign repair scripts. */
import fs from 'fs';

const KNOWN: Record<string, string[]> = JSON.parse(fs.readFileSync('/tmp/known_cities.json', 'utf8'));
const SFX = /\b(?:St|Street|Ave|Avenue|Blvd|Boulevard|Dr|Drive|Rd|Road|Ln|Lane|Ct|Court|Cir|Circle|Way|Pl|PI|Place|Ter|Terrace|Trl|Trail|Pkwy|Parkway|Hwy|Loop|Cross|Bch|Beach|Walk|Path|Run|Row|Cv|Cove|Pt|Point|Rdg|Ridge|Cres|Crescent|Pass)\.?$/i;
// Cases the automatic split gets wrong or cannot split (checked by hand against the addresses).
export const MANUAL: Record<string, [string, string]> = {
  '45447 Camino Del Rey Indian Wells, CA 92210': ['45447 Camino Del Rey', 'Indian Wells'],
  '7970 County Road 41 Fort Calhoun, NE 68023': ['7970 County Road 41', 'Fort Calhoun'],
  '6183 Point Glover Ln E Port Orchard, WA 98366': ['6183 Point Glover Ln E', 'Port Orchard'],
};

export function parse(v: string): { street: string; city: string; state: string; zip: string } | null {
  v = v.trim();
  const m = v.match(/^(.*?)[,\s]+([A-Za-z]{2})\s*(\d{5})?(?:-\d{4})?$/);
  if (!m) return null;
  const [, body, st, zp] = m; const state = st.toUpperCase(); const zip = zp || '';
  if (MANUAL[v]) return { street: MANUAL[v][0], city: MANUAL[v][1], state, zip };
  if (body.includes(',')) { const i = body.lastIndexOf(','); return { street: body.slice(0, i).trim(), city: body.slice(i + 1).trim(), state, zip }; }
  // Prefer a city that is known for this state and follows a street suffix.
  for (const c of [...(KNOWN[state] ?? [])].sort((a, b) => b.length - a.length)) {
    const rest = body.toLowerCase().endsWith(' ' + c.toLowerCase()) ? body.slice(0, body.length - c.length).trim() : null;
    if (rest && rest.length > 3 && SFX.test(rest)) return { street: rest, city: c, state, zip };
  }
  for (const c of [...(KNOWN[state] ?? [])].sort((a, b) => b.length - a.length)) {
    const rest = body.toLowerCase().endsWith(' ' + c.toLowerCase()) ? body.slice(0, body.length - c.length).trim() : null;
    if (rest && rest.length > 3) return { street: rest, city: c, state, zip };
  }
  // Unknown city: split after the first street-type word (lazy), e.g. "150 Bird Dr Ketchum".
  const sfx = SFX.source.replace(/\\b/, '').replace(/\$$/, '');
  const mm = body.match(new RegExp(`^(.*?\\b${sfx})\\s+([A-Za-z][A-Za-z .'-]+)$`, 'i'));
  if (mm) return { street: mm[1].trim(), city: mm[2].trim(), state, zip };
  return null;
}

