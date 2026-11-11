/**
 * Checks a broker's license against the state's own published records where the state publishes them in a machine-readable form:
 *  - Colorado: the Division of Real Estate's open data on data.colorado.gov
 *  - Arizona: the Department of Real Estate's public database download (individual licenses)
 * Other states (Nevada among them) have only a lookup page, so they stay a person's check against the official site.
 * A match is never accepted on the number alone: the name or brokerage on the record has to match the partner too.
 */
export type LicenseOutcome = 'verified' | 'needs_review' | 'inactive' | 'not_found' | 'manual' | 'error';

export interface LicenseRecord {
  name: string;
  type: string;
  status: string;
  expires: string | null;
  employer: string | null;
  discipline: string | null;
  url: string | null;
}

export interface LicenseResult {
  state: string;
  number: string;
  outcome: LicenseOutcome;
  record?: LicenseRecord;
  source: string;
  message: string;
  checkedAt: string;
}

export const AUTOMATIC_STATES = ['AZ', 'CO'] as const;
export const isAutomatic = (state: string | null | undefined) => !!state && (AUTOMATIC_STATES as readonly string[]).includes(state.toUpperCase());

export const normalizeLicense = (n: string) => n.toUpperCase().replace(/[^A-Z0-9]/g, '');
const digitsOf = (n: string) => n.replace(/\D/g, '');

/** A number matches when it is the same once spaces and punctuation are gone, or when only the digits were typed and they are the same. */
export function sameLicenseNumber(typed: string, recordNumber: string): boolean {
  const a = normalizeLicense(typed), b = normalizeLicense(recordNumber);
  if (!a || !b) return false;
  if (a === b) return true;
  if (/^\d+$/.test(a)) return digitsOf(b) === a && /^[A-Z]{1,3}\d+$/.test(b);
  return false;
}

const tokens = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter((t) => t.length >= 3 && !['llc', 'inc', 'the', 'and', 'realty', 'real', 'estate', 'group', 'team', 'company', 'homes', 'properties'].includes(t));

/** The partner is who the record says if its last name, or a significant word of its brokerage, appears in what we know of the partner. */
export function nameMatches(recordName: string, employer: string | null, known: Array<string | null | undefined>): boolean {
  const mine = new Set(known.filter(Boolean).flatMap((k) => tokens(String(k))));
  if (!mine.size) return false;
  const rec = tokens(recordName);
  const last = rec[rec.length - 1];
  if (last && mine.has(last)) return true;
  if (rec.some((t) => mine.has(t)) && rec.length === 1) return true;
  return tokens(employer ?? '').some((t) => mine.has(t)) || rec.filter((t) => mine.has(t)).length >= 2;
}

const isRealEstateType = (t: string) => /broker|sales ?person|salesperson|real estate/i.test(t) && !/apprais/i.test(t);

function decide(partnerNames: Array<string | null | undefined>, rec: LicenseRecord, active: boolean): { outcome: LicenseOutcome; message: string } {
  if (!active) return { outcome: 'inactive', message: `The state record shows this license as ${rec.status || 'not active'}.` };
  if (!nameMatches(rec.name, rec.employer, partnerNames)) return { outcome: 'needs_review', message: `Active, but the name on the record (${rec.name}${rec.employer ? `, ${rec.employer}` : ''}) does not match this partner. Check the number.` };
  const sp = /sales ?person/i.test(rec.type) ? ' This is a salesperson license: the fee has to be paid through the employing broker.' : '';
  return { outcome: 'verified', message: `Active ${rec.type}${rec.expires ? `, expires ${rec.expires}` : ''}.${sp}` };
}

type FetchLike = (url: string, init?: { signal?: AbortSignal }) => Promise<Response>;
const now = () => new Date().toISOString();

// ─── Colorado ────────────────────────────────────────────────────────────────

export const CO_DATASET = 'https://data.colorado.gov/resource/4zse-6bnw.json';

export async function verifyColorado(number: string, partnerNames: Array<string | null | undefined>, fetchImpl: FetchLike = fetch as FetchLike): Promise<LicenseResult> {
  const digits = digitsOf(number);
  const base = { state: 'CO', number, source: 'Colorado Division of Real Estate open data (data.colorado.gov)', checkedAt: now() };
  if (!digits) return { ...base, outcome: 'not_found', message: 'Enter the license number first.' };
  try {
    const res = await fetchImpl(`${CO_DATASET}?licensenumber=${encodeURIComponent(digits)}&$limit=20`, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) return { ...base, outcome: 'error', message: `The Colorado records service answered ${res.status}.` };
    const rows = (await res.json()) as Array<Record<string, string>>;
    const row = (Array.isArray(rows) ? rows : []).find((r) => isRealEstateType(String(r.licensetype ?? '')));
    if (!row) return { ...base, outcome: 'not_found', message: 'No Colorado real estate license with that number was found.' };
    const record: LicenseRecord = {
      name: row.entityname || [row.firstname, row.lastname].filter(Boolean).join(' '),
      type: row.licensetype, status: row.licensestatus, expires: row.licenseexpirationdate || null, employer: null,
      discipline: row.programaction && row.programaction !== 'None' ? row.programaction : row.casenumber && row.casenumber !== 'None' ? `Case ${row.casenumber}` : null,
      url: row.verifylicense || null
    };
    return { ...base, record, ...decide(partnerNames, record, /^active$/i.test(row.licensestatus ?? '')) };
  } catch (e) {
    return { ...base, outcome: 'error', message: `Could not reach the Colorado records service (${(e as Error).message}).` };
  }
}

// ─── Arizona ─────────────────────────────────────────────────────────────────

export const AZ_INDIVIDUALS = 'https://services.azre.gov/PdbWeb/List/DownloadList/1';

/** Splits one CSV line into fields (quotes, commas inside quotes, doubled quotes). */
export function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) { if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true;
    else if (c === ',') { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out;
}

/** Reads the download as it arrives and stops at the first line for this license, so the whole file is never held in memory. */
export async function scanArizonaCsv(body: ReadableStream<Uint8Array>, number: string): Promise<Record<string, string> | null> {
  const reader = body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  let cols: string[] | null = null;
  const want = normalizeLicense(number);
  const check = (line: string): Record<string, string> | null => {
    if (!line.trim()) return null;
    const f = parseCsvLine(line);
    if (!cols) { cols = f.map((c) => c.trim()); return null; }
    const lic = f[cols.indexOf('LicNumber')] ?? '';
    if (!sameLicenseNumber(want, lic)) return null;
    return Object.fromEntries(cols.map((c, i) => [c, (f[i] ?? '').trim()]));
  };
  for (;;) {
    const { done, value } = await reader.read();
    if (value) buf += dec.decode(value, { stream: !done });
    let nl: number;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const hit = check(buf.slice(0, nl).replace(/\r$/, ''));
      buf = buf.slice(nl + 1);
      if (hit) { await reader.cancel().catch(() => {}); return hit; }
    }
    if (done) break;
  }
  return buf ? check(buf) : null;
}

export async function verifyArizona(number: string, partnerNames: Array<string | null | undefined>, fetchImpl: FetchLike = fetch as FetchLike): Promise<LicenseResult> {
  const base = { state: 'AZ', number, source: 'Arizona Department of Real Estate public database (individual licenses)', checkedAt: now() };
  if (!normalizeLicense(number)) return { ...base, outcome: 'not_found', message: 'Enter the license number first.' };
  try {
    const res = await fetchImpl(AZ_INDIVIDUALS, { signal: AbortSignal.timeout(55_000) });
    if (!res.ok || !res.body) return { ...base, outcome: 'error', message: `The Arizona records download answered ${res.status}.` };
    const row = await scanArizonaCsv(res.body, number);
    if (!row) return { ...base, outcome: 'not_found', message: 'No Arizona individual license with that number was found. A brokerage (entity) license has to be checked on the ADRE site.' };
    const record: LicenseRecord = {
      name: [row.FirstName, row.MiddleName, row.LastName].filter(Boolean).join(' '),
      type: [row.LicCategory, row.LicType].filter(Boolean).join(' '), status: row.LicStatus, expires: row.ExpireDate ? row.ExpireDate.split(' ')[0] : null,
      employer: row.EmployerLegalName || row.EmployerDBAName || null, discipline: null, url: 'https://services.azre.gov/PdbWeb/'
    };
    return { ...base, record, ...decide(partnerNames, record, /^active$/i.test(row.LicStatus ?? '')) };
  } catch (e) {
    return { ...base, outcome: 'error', message: `Could not read the Arizona records download (${(e as Error).message}).` };
  }
}

/** Runs the automatic check for a state, or says that this state has to be checked by hand on its official site. */
export async function verifyLicense(state: string, number: string, partnerNames: Array<string | null | undefined>, fetchImpl?: FetchLike): Promise<LicenseResult> {
  const s = state.toUpperCase();
  if (s === 'CO') return verifyColorado(number, partnerNames, fetchImpl);
  if (s === 'AZ') return verifyArizona(number, partnerNames, fetchImpl);
  return { state: s, number, outcome: 'manual', source: 'No machine-readable source', checkedAt: now(), message: `${s} does not publish license records in a form AVYRO can read. Check the official lookup and record the date.` };
}
