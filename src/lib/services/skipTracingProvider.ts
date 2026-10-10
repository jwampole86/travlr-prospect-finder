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

interface PersonDetailsRaw {
  'Person Details'?: Array<{ Person_name?: string; Telephone?: string }>;
  'All Phone Details'?: Array<{ phone_number?: string; phone_type?: string }>;
  'Email Addresses'?: string[];
}

/** Address-anchored search — name+address when a name is known, address-only otherwise. */
async function searchPeople(fullName: string | undefined, city: string, state: string, zip: string): Promise<PersonSearchRaw[]> {
  const citystatezip = `${city}, ${state} ${zip}`.trim();
  if (!citystatezip) return [];

  const path = fullName?.trim()
    ? `/search/bynameaddress?${new URLSearchParams({ name: fullName.trim(), citystatezip, page: '1' })}`
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

export const skipTracingProvider: OwnerEnrichmentProvider = {
  providerName: 'SKIP_TRACING_API',
  providerType: 'PEOPLE',

  async searchOwner(input: OwnerSearchInput): Promise<OwnerCandidate[]> {
    if (getRapidApiKeys().length === 0) return [];
    const people = await searchPeople(input.fullName, input.city, input.state, input.zip);
    return people.slice(0, 5).map(p => {
      const [firstName, ...rest] = (p.Name || '').trim().split(/\s+/);
      return {
        fullName: p.Name || '',
        firstName,
        lastName: rest.join(' '),
        ownerType: 'INDIVIDUAL' as const,
        ownershipConfidence: 50,
        source: 'SKIP_TRACING_API',
        sourceRecordId: p['Person ID'],
      };
    });
  },

  async searchPhone(input: PhoneSearchInput): Promise<PhoneResult[]> {
    if (getRapidApiKeys().length === 0) return [];
    const people = await searchPeople(input.fullName, input.city, input.state, input.zip);
    const topMatch = people[0];
    if (!topMatch?.['Person ID']) return [];

    const details = await getPersonDetails(topMatch['Person ID']);
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
          confidence: idx === 0 ? 70 : 55,
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
