/**
 * Skip Tracing Working API (RapidAPI, by ONEAPI) — people-search / contact
 * discovery provider. Fills in homeowner phone numbers + emails that
 * BatchData/PropertyReach miss. Reuses the same account-level RAPIDAPI_KEY_*
 * rotation as rapidApiRealEstateService.ts (RapidAPI subscriptions are
 * account-level — any configured key works against this host too).
 *
 * Endpoints verified live 2026-10-10 via the account's own exported OpenAPI
 * document (rapidapi.com/oneapiproject/api/skip-tracing-working-api):
 *   GET /search/byname         — name required, page optional
 *   GET /search/byaddress      — street + citystatezip required, page optional
 *   GET /search/bynameaddress  — name + citystatezip required, page optional
 *   GET /search/byphone        — phoneno required, page optional
 *   GET /search/byemail        — email required, phone optional
 *   GET /search/detailsbyID    — peo_id required → full phone/email detail
 *
 * Workflow (confirmed live): the search endpoints only return a short list of
 * `PeopleDetails` candidates (name, age, city, a `Person ID`) — never contact
 * info directly. `detailsbyID` must be called with that `Person ID` to get
 * the actual `All Phone Details` / `Email Addresses` arrays.
 */

import type { OwnerEnrichmentProvider, OwnerCandidate, OwnerSearchInput, PhoneResult, PhoneSearchInput } from './ownerEnrichmentService';

const SKIP_TRACING_HOST = 'skip-tracing-working-api.p.rapidapi.com';

function getRapidApiKeys(): string[] {
  return [process.env.RAPIDAPI_KEY_1, process.env.RAPIDAPI_KEY_2, process.env.RAPIDAPI_KEY_3]
    .filter((k): k is string => typeof k === 'string' && k.trim() !== '' && !/your-rapidapi-key/i.test(k));
}

function normalizePhoneE164(phone: string): string | null {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return null;
}

interface SkipTraceFetchResult {
  ok: boolean;
  status?: number;
  data?: unknown;
  error?: string;
}

// Leave headroom for owner-listed leads and manual lookups once the monthly allowance runs low.
const QUOTA_RESERVE = 150;
let lastKnownRemaining: number | null = null;

async function skipTraceFetch(path: string): Promise<SkipTraceFetchResult> {
  const keys = getRapidApiKeys();
  if (keys.length === 0) return { ok: false, error: 'No RAPIDAPI_KEY_* configured' };

  let lastStatus: number | undefined;
  let lastError: string | undefined;

  for (const key of keys) {
    try {
      const res = await fetch(`https://${SKIP_TRACING_HOST}${path}`, {
        headers: { 'X-RapidAPI-Key': key, 'X-RapidAPI-Host': SKIP_TRACING_HOST },
        signal: AbortSignal.timeout(20000),
      });

      if (res.status === 401 || res.status === 403 || res.status === 429) {
        lastStatus = res.status;
        lastError = `HTTP ${res.status}`;
        continue;
      }

      const remainingHeader = res.headers.get('x-ratelimit-requests-remaining');
      if (remainingHeader !== null && Number.isFinite(Number(remainingHeader))) lastKnownRemaining = Number(remainingHeader);

      const data = await res.json().catch(() => null);
      if (!res.ok) {
        return { ok: false, status: res.status, data, error: (data as { Message?: string })?.Message || `HTTP ${res.status}` };
      }
      return { ok: true, status: res.status, data };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'Request failed' };
    }
  }

  return { ok: false, status: lastStatus, error: lastError || 'All RapidAPI keys failed' };
}

interface PersonSearchRaw {
  Name?: string;
  'Person ID'?: string;
  Age?: number | string;
  'Lives in'?: string;
}

interface AddressDetailRaw {
  street_address?: string; streetAddress?: string;
  address_locality?: string; addressLocality?: string;
  address_region?: string; addressRegion?: string;
  postal_code?: string; postalCode?: string;
  date_range?: string; timespan?: string;
}

interface PersonDetailsRaw {
  'Person Details'?: Array<{ Person_name?: string; Telephone?: string }>;
  'Current Address Details List'?: AddressDetailRaw[];
  'Previous Address Details'?: AddressDetailRaw[];
  'All Phone Details'?: Array<{ phone_number?: string; phone_type?: string; phone_info?: string; last_reported?: string }>;
  'Email Addresses'?: string[];
}

const STREET_WORDS: Record<string, string> = {
  road: 'rd', street: 'st', avenue: 'ave', drive: 'dr', circle: 'cir', court: 'ct', lane: 'ln',
  place: 'pl', boulevard: 'blvd', terrace: 'ter', trail: 'trl', highway: 'hwy', parkway: 'pkwy',
  north: 'n', south: 's', east: 'e', west: 'w',
};

function normalizeStreet(street: string): string {
  return street.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
    .split(' ').map(w => STREET_WORDS[w] ?? w).join(' ');
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/** Months since a "(Jan 2020 - Oct 2026)" range ended; 0 when open-ended or unparseable. */
function monthsSinceRangeEnd(range?: string): number {
  const m = /-\s*([A-Za-z]{3})[a-z]*\.?\s+(\d{4})/.exec(range || '');
  if (!m) return 0;
  const month = MONTHS.indexOf(m[1].toLowerCase());
  if (month < 0) return 0;
  const now = new Date();
  return (now.getFullYear() - Number(m[2])) * 12 + (now.getMonth() - month);
}

/** Same street AND same state plus either city or ZIP, so an identical street name elsewhere never matches. */
function sameAddress(a: AddressDetailRaw, target: string, input: { city: string; state: string; zip: string }): boolean {
  const street = a.street_address || a.streetAddress;
  if (!street || normalizeStreet(street) !== target) return false;
  const region = (a.address_region || a.addressRegion || '').trim().toLowerCase();
  if (region && region !== input.state.trim().toLowerCase()) return false;
  const locality = (a.address_locality || a.addressLocality || '').trim().toLowerCase();
  const zip5 = (a.postal_code || a.postalCode || '').slice(0, 5);
  const cityOk = !!locality && locality === input.city.trim().toLowerCase();
  const zipOk = !!zip5 && zip5 === input.zip.slice(0, 5);
  return cityOk || zipOk || (!locality && !zip5);
}

/**
 * Address-anchored search. Uses /search/bynameaddress when an owner name is
 * already known (higher precision), otherwise falls back to /search/byaddress
 * — this is the critical path for freshly-imported leads that have NO owner
 * name yet, which is the most common case (RapidAPI listing scrapes never
 * include an owner name, only the property address).
 */
async function searchPeople(fullName: string | undefined, street: string, city: string, state: string, zip: string): Promise<PersonSearchRaw[]> {
  const citystatezip = `${city}, ${state} ${zip}`.trim();
  if (!citystatezip) return [];

  const path = fullName?.trim()
    ? `/search/bynameaddress?${new URLSearchParams({ name: fullName.trim(), citystatezip, page: '1' })}`
    : street.trim()
      ? `/search/byaddress?${new URLSearchParams({ street: street.trim(), citystatezip, page: '1' })}`
      : null;
  if (!path) return [];

  const result = await skipTraceFetch(path);
  if (!result.ok) return [];
  const data = result.data as { PeopleDetails?: PersonSearchRaw[] };
  return data?.PeopleDetails || [];
}

async function getPersonDetails(personId: string): Promise<PersonDetailsRaw | null> {
  const result = await skipTraceFetch(`/search/detailsbyID?${new URLSearchParams({ peo_id: personId })}`);
  if (!result.ok) return null;
  return result.data as PersonDetailsRaw;
}

/**
 * Address-only searches return several loosely-related candidates (relatives,
 * past residents in other states). Confirm the best match by checking each
 * candidate's "Current Address Details List" against the target street —
 * capped at 3 lookups to stay within free-tier quota.
 */
async function findBestCurrentResident(people: PersonSearchRaw[], street: string): Promise<{ person: PersonSearchRaw; details: PersonDetailsRaw } | null> {
  const targetStreet = normalizeStreet(street);
  for (const person of people.slice(0, 3)) {
    if (!person['Person ID']) continue;
    const details = await getPersonDetails(person['Person ID']);
    if (!details) continue;
    const isCurrentResident = (details['Current Address Details List'] || [])
      .some(a => a.street_address && normalizeStreet(a.street_address) === targetStreet);
    if (isCurrentResident) return { person, details };
  }
  return null;
}

export interface ResidentMatch {
  personId: string;
  name: string;
  age?: number | string;
  matchType: 'CURRENT_RESIDENT' | 'PREVIOUS_RESIDENT';
  phones: Array<{ e164: string; raw: string; type: PhoneResult['phoneType']; isPrimary: boolean; lastReported?: string }>;
  emails: string[];
}

export interface ResidentLookupResult {
  status: 'FOUND' | 'NO_MATCH' | 'RATE_LIMITED' | 'ERROR';
  matches: ResidentMatch[];
  apiCalls: number;
  error?: string;
}

/**
 * One address search plus at most `maxDetailLookups` detail calls, returning only people
 * whose current or previous address list contains the exact target street. Cheaper than
 * calling searchOwner + searchPhone, which each repeat the same search and detail calls.
 * A match is a resident of record at that address, not proof of ownership.
 */
export async function resolveResidentsByAddress(
  input: { street: string; city: string; state: string; zip: string },
  maxDetailLookups = 3
): Promise<ResidentLookupResult> {
  if (getRapidApiKeys().length === 0) return { status: 'ERROR', matches: [], apiCalls: 0, error: 'No RAPIDAPI_KEY_* configured' };
  if (lastKnownRemaining !== null && lastKnownRemaining < QUOTA_RESERVE) {
    return { status: 'RATE_LIMITED', matches: [], apiCalls: 0, error: `Skip Tracing quota reserve reached (${lastKnownRemaining} calls left)` };
  }
  const citystatezip = `${input.city}, ${input.state} ${input.zip}`.trim();
  const search = await skipTraceFetch(`/search/byaddress?${new URLSearchParams({ street: input.street.trim(), citystatezip, page: '1' })}`);
  let apiCalls = 1;
  if (!search.ok) {
    const limited = search.status === 401 || search.status === 403 || search.status === 429;
    return { status: limited ? 'RATE_LIMITED' : 'ERROR', matches: [], apiCalls, error: search.error };
  }
  const people = ((search.data as { PeopleDetails?: PersonSearchRaw[] })?.PeopleDetails || []).filter(p => p['Person ID']);
  if (people.length === 0) return { status: 'NO_MATCH', matches: [], apiCalls };

  // People living in the lead's own city are the likeliest matches; try them first to save detail calls.
  const cityKey = `${input.city}, ${input.state}`.toLowerCase();
  const ranked = [...people].sort((a, b) =>
    Number((b['Lives in'] || '').toLowerCase().includes(cityKey)) - Number((a['Lives in'] || '').toLowerCase().includes(cityKey)));

  const target = normalizeStreet(input.street);
  const matches: ResidentMatch[] = [];
  for (const person of ranked.slice(0, maxDetailLookups)) {
    const res = await skipTraceFetch(`/search/detailsbyID?${new URLSearchParams({ peo_id: person['Person ID']! })}`);
    apiCalls++;
    if (!res.ok) {
      if (res.status === 401 || res.status === 403 || res.status === 429) {
        return { status: 'RATE_LIMITED', matches, apiCalls, error: res.error };
      }
      continue;
    }
    const details = res.data as PersonDetailsRaw;
    const currentRecord = (details['Current Address Details List'] || []).find(a => sameAddress(a, target, input));
    // A "current" address last reported over two years ago is a former resident, not someone to call as the owner.
    const isCurrent = !!currentRecord && monthsSinceRangeEnd(currentRecord.date_range) <= 24;
    const isPrevious = !isCurrent && (
      !!currentRecord
      || (details['Previous Address Details'] || []).some(a => sameAddress(a, target, input))
    );
    if (!isCurrent && !isPrevious) continue;
    const name = person.Name || details['Person Details']?.[0]?.Person_name || '';
    if (!name.trim()) continue;

    const phones = (details['All Phone Details'] || []).flatMap(p => {
      const e164 = normalizePhoneE164(p.phone_number || '');
      if (!e164) return [];
      const t = (p.phone_type || '').toLowerCase();
      const type: PhoneResult['phoneType'] = t.includes('wireless') ? 'MOBILE' : t.includes('landline') ? 'LANDLINE' : t.includes('voip') ? 'VOIP' : 'UNKNOWN';
      return [{ e164, raw: p.phone_number || '', type, isPrimary: /primary/i.test(p.phone_info || ''), lastReported: p.last_reported }];
    }).slice(0, 5);

    matches.push({
      personId: person['Person ID']!,
      name,
      age: person.Age,
      matchType: isCurrent ? 'CURRENT_RESIDENT' : 'PREVIOUS_RESIDENT',
      phones,
      emails: (details['Email Addresses'] || []).slice(0, 5),
    });
    if (matches.length >= 2) break;
  }
  matches.sort((a, b) => Number(b.matchType === 'CURRENT_RESIDENT') - Number(a.matchType === 'CURRENT_RESIDENT'));
  return { status: matches.length > 0 ? 'FOUND' : 'NO_MATCH', matches, apiCalls };
}

export const skipTracingProvider: OwnerEnrichmentProvider = {
  providerName: 'SKIP_TRACING_API',
  providerType: 'PEOPLE',

  async searchOwner(input: OwnerSearchInput): Promise<OwnerCandidate[]> {
    if (getRapidApiKeys().length === 0) return [];
    const people = await searchPeople(input.fullName, input.propertyAddress, input.city, input.state, input.zip);
    if (people.length === 0) return [];

    // When searching by address only, confirm which candidate(s) actually
    // live there now — a confirmed current resident gets a much higher
    // ownership-confidence score than an unconfirmed loose match.
    const best = input.fullName ? null : await findBestCurrentResident(people, input.propertyAddress);

    return people.slice(0, 5).map(p => {
      const [firstName, ...rest] = (p.Name || '').trim().split(/\s+/);
      const isConfirmedCurrent = best?.person['Person ID'] === p['Person ID'];
      return {
        fullName: p.Name || '',
        firstName,
        lastName: rest.join(' '),
        ownerType: 'INDIVIDUAL' as const,
        ownershipConfidence: isConfirmedCurrent ? 75 : 40,
        source: 'SKIP_TRACING_API',
        sourceRecordId: p['Person ID'],
      };
    });
  },

  async searchPhone(input: PhoneSearchInput): Promise<PhoneResult[]> {
    if (getRapidApiKeys().length === 0) return [];
    const people = await searchPeople(input.fullName, input.propertyAddress, input.city, input.state, input.zip);
    if (people.length === 0) return [];

    // Prefer a candidate confirmed to currently live at the target address;
    // fall back to the top-ranked search result if none can be confirmed.
    const best = await findBestCurrentResident(people, input.propertyAddress);
    const details = best?.details ?? (people[0]?.['Person ID'] ? await getPersonDetails(people[0]['Person ID']) : null);
    const phones = details?.['All Phone Details'] || [];

    return phones
      .map((p, idx) => {
        const e164 = normalizePhoneE164(p.phone_number || '');
        if (!e164) return null;
        const typeRaw = (p.phone_type || '').toLowerCase();
        const phoneType: PhoneResult['phoneType'] = typeRaw.includes('wireless')
          ? 'MOBILE'
          : typeRaw.includes('landline')
            ? 'LANDLINE'
            : typeRaw.includes('voip')
              ? 'VOIP'
              : 'UNKNOWN';
        return {
          phoneE164: e164,
          phoneRaw: p.phone_number || '',
          phoneType,
          // First-listed phone is the provider's own "Possible Primary Phone" pick.
          // Confirmed-current-resident matches outrank unconfirmed ones.
          confidence: (best ? 15 : 0) + (idx === 0 ? 70 : 55),
          source: 'SKIP_TRACING_API',
          rankOrder: idx + 1,
        } as PhoneResult;
      })
      .filter((p): p is PhoneResult => p !== null);
  },
};

/** Lightweight reachability check for the integration-health dashboard. */
export async function getSkipTracingHealth(): Promise<{ status: 'ACTIVE' | 'AUTH_ERROR' | 'DISABLED' | 'DEGRADED'; message: string; hasApiKey: boolean }> {
  const keys = getRapidApiKeys();
  if (keys.length === 0) {
    return { status: 'DISABLED', message: 'No RAPIDAPI_KEY_* configured', hasApiKey: false };
  }
  const result = await skipTraceFetch(`/search/byname?${new URLSearchParams({ name: 'James E Whitsitt', page: '1' })}`);
  if (result.status === 401 || result.status === 403) {
    return { status: 'AUTH_ERROR', message: 'RapidAPI key not subscribed to Skip Tracing Working API', hasApiKey: true };
  }
  if (!result.ok) {
    return { status: 'DEGRADED', message: result.error || 'Skip Tracing Working API request failed', hasApiKey: true };
  }
  return { status: 'ACTIVE', message: 'Skip Tracing Working API is reachable', hasApiKey: true };
}
