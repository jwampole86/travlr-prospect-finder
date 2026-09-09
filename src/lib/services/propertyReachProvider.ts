/**
 * TRAVLR — PropertyReach Provider Module
 *
 * SECURITY: PROPERTYREACH_API_KEY is SERVER-SIDE ONLY.
 * This file must NEVER be imported by browser/client code.
 * All calls go: Browser → TRAVLR API → PropertyReach
 *
 * ARCHITECTURE:
 *   PropertyReach is a DATA SOURCE.
 *   TRAVLR remains the canonical system of record.
 *   Results flow into existing verifiedOwner / verifiedNumber /
 *   verifiedAddress / fullyVerified / phoneAvailable fields.
 *
 * COMPLIANCE:
 *   - Phone found ≠ SMS consent
 *   - Manual research data is protected from lower-confidence overwrites
 *   - Wrong homeowner is worse than no result — optimize for precision
 */

import {
  OwnerEnrichmentProvider,
  OwnerSearchInput,
  OwnerCandidate,
  PhoneSearchInput,
  PhoneResult,
  PropertyLookupInput,
  PropertyLookupResult,
  normalizePhoneE164,
  scoreOwnerMatch,
  MatchResult,
} from './ownerEnrichmentService';

// ─── PropertyReach-specific types ────────────────────────────────────────────

export type PropertyMatchStatus =
  | 'PROPERTY_MATCHED' |'PROPERTY_MATCH_AMBIGUOUS' |'PROPERTY_NOT_FOUND' |'PROPERTY_CONFLICT' |'INVALID_ADDRESS' |'PROVIDER_ERROR';

export type OwnerType =
  | 'INDIVIDUAL' |'JOINT_OWNERS' |'LLC' |'TRUST' |'CORPORATION' |'PARTNERSHIP' |'OTHER_ENTITY' |'UNKNOWN';

export type PhoneType = 'MOBILE' | 'LANDLINE' | 'VOIP' | 'UNKNOWN';

export type EmailStatus =
  | 'HIGH_CONFIDENCE' |'MEDIUM_CONFIDENCE' |'UNVERIFIED' |'HISTORICAL' |'INVALID';

export interface PropertyReachPropertyResult {
  propertyReachId: string;
  apn?: string;
  fips?: string;
  parcelId?: string;
  providerPropertyId?: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  county?: string;
  propertyType?: string;
  ownerOfRecord?: string;
  ownerType?: OwnerType;
  ownerMailingAddress?: string;
  rawResponse: Record<string, unknown>;
}

export interface PropertyReachOwnerCandidate {
  fullName: string;
  firstName?: string;
  middleName?: string;
  lastName?: string;
  ownerType: OwnerType;
  mailingAddress?: string;
  mailingCity?: string;
  mailingState?: string;
  mailingZip?: string;
  providerRelationship?: string;
  providerConfidence?: number;
  sourceRecordId?: string;
  isEntity: boolean;
  legalOwnerName?: string;
  associatedContactName?: string;
}

export interface PropertyReachPhoneCandidate {
  phoneE164: string;
  phoneRaw: string;
  phoneType: PhoneType;
  confidence: number;
  providerRecordId?: string;
  associationType?: string;
  rankOrder: number;
  firstSeenAt?: string;
  lastSeenAt?: string;
  lastVerifiedAt?: string;
}

export interface PropertyReachEmailCandidate {
  email: string;
  emailStatus: EmailStatus;
  emailConfidence: number;
  emailSource?: string;
}

export interface PropertyReachEnrichmentResult {
  propertyMatchStatus: PropertyMatchStatus;
  property?: PropertyReachPropertyResult;
  ownerCandidates: PropertyReachOwnerCandidate[];
  phoneCandidates: PropertyReachPhoneCandidate[];
  emailCandidates: PropertyReachEmailCandidate[];
  providerRequestId?: string;
  providerCostCents?: number;
  rawPropertyResponse?: Record<string, unknown>;
  rawOwnerResponse?: Record<string, unknown>;
  rawContactResponse?: Record<string, unknown>;
}

// ─── PropertyReach API client ─────────────────────────────────────────────────

const PR_BASE_URL = 'https://api.propertyreach.com/v1';

function getApiKey(): string | null {
  const key = process.env.PROPERTYREACH_API_KEY;
  if (!key || key === 'your-propertyreach-api-key-here' || key.trim() === '') {
    return null;
  }
  return key;
}

async function prFetch(
  endpoint: string,
  body: Record<string, unknown>
): Promise<{ ok: boolean; data: Record<string, unknown> | null; status: number }> {
  const apiKey = getApiKey();
  if (!apiKey) {
    return { ok: false, data: null, status: 401 };
  }

  try {
    const res = await fetch(`${PR_BASE_URL}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'X-API-Key': apiKey,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      console.error(`[PropertyReach] ${endpoint} failed: ${res.status} ${errText}`);
      return { ok: false, data: null, status: res.status };
    }

    const data = await res.json();
    return { ok: true, data, status: res.status };
  } catch (err) {
    console.error(`[PropertyReach] ${endpoint} error:`, err);
    return { ok: false, data: null, status: 500 };
  }
}

// ─── Address lookup / property search ────────────────────────────────────────

export async function findProperty(
  address: string,
  city: string,
  state: string,
  zip: string,
  apn?: string
): Promise<{ status: PropertyMatchStatus; property?: PropertyReachPropertyResult }> {
  const apiKey = getApiKey();
  if (!apiKey) {
    return { status: 'PROVIDER_ERROR' };
  }

  const { ok, data } = await prFetch('/property/search', {
    address,
    city,
    state,
    zip,
    ...(apn ? { apn } : {}),
  });

  if (!ok || !data) {
    return { status: 'PROVIDER_ERROR' };
  }

  // Normalize PropertyReach response
  const results = (data.results as Record<string, unknown>[] | undefined) || [];
  if (results.length === 0) {
    return { status: 'PROPERTY_NOT_FOUND' };
  }

  if (results.length > 1) {
    // Multiple matches — ambiguous
    return { status: 'PROPERTY_MATCH_AMBIGUOUS' };
  }

  const prop = results[0] as Record<string, unknown>;
  const normalized = normalizePropertyReachResponse(prop);

  // Verify address components match canonical input
  const addressMatch = verifyAddressMatch(
    { address, city, state, zip, apn },
    normalized
  );

  if (!addressMatch.isMatch) {
    return { status: 'PROPERTY_CONFLICT' };
  }

  return {
    status: 'PROPERTY_MATCHED',
    property: normalized,
  };
}

// ─── Property details ─────────────────────────────────────────────────────────

export async function getPropertyDetails(
  propertyReachId: string
): Promise<PropertyReachPropertyResult | null> {
  const { ok, data } = await prFetch('/property/details', { propertyId: propertyReachId });
  if (!ok || !data) return null;
  return normalizePropertyReachResponse(data as Record<string, unknown>);
}

// ─── Skip trace / owner contact enrichment ───────────────────────────────────

export async function skipTraceProperty(
  propertyReachId: string,
  address: string,
  city: string,
  state: string,
  zip: string,
  apn?: string
): Promise<{
  ownerCandidates: PropertyReachOwnerCandidate[];
  phoneCandidates: PropertyReachPhoneCandidate[];
  emailCandidates: PropertyReachEmailCandidate[];
  rawOwnerResponse?: Record<string, unknown>;
  rawContactResponse?: Record<string, unknown>;
}> {
  const { ok, data } = await prFetch('/property/skip-trace', {
    propertyId: propertyReachId,
    address,
    city,
    state,
    zip,
    ...(apn ? { apn } : {}),
  });

  if (!ok || !data) {
    return { ownerCandidates: [], phoneCandidates: [], emailCandidates: [] };
  }

  const owners = normalizeOwnerCandidates(data);
  const phones = normalizePhoneCandidates(data);
  const emails = normalizeEmailCandidates(data);

  return {
    ownerCandidates: owners,
    phoneCandidates: phones,
    emailCandidates: emails,
    rawOwnerResponse: (data.owners as Record<string, unknown>) || data,
    rawContactResponse: (data.contacts as Record<string, unknown>) || data,
  };
}

// ─── Response normalizers ─────────────────────────────────────────────────────

export function normalizePropertyReachResponse(
  raw: Record<string, unknown>
): PropertyReachPropertyResult {
  return {
    propertyReachId: (raw.propertyId as string) || (raw.id as string) || '',
    apn: (raw.apn as string) || (raw.parcelNumber as string) || undefined,
    fips: (raw.fips as string) || undefined,
    parcelId: (raw.parcelId as string) || undefined,
    providerPropertyId: (raw.propertyId as string) || undefined,
    address: (raw.address as string) || (raw.streetAddress as string) || '',
    city: (raw.city as string) || '',
    state: (raw.state as string) || '',
    zip: (raw.zip as string) || (raw.postalCode as string) || '',
    county: (raw.county as string) || undefined,
    propertyType: (raw.propertyType as string) || undefined,
    ownerOfRecord:
      (raw.ownerName as string) ||
      ((raw.owner as Record<string, unknown>)?.name as string) ||
      undefined,
    ownerType: normalizeOwnerType(
      (raw.ownerType as string) || ((raw.owner as Record<string, unknown>)?.type as string)
    ),
    ownerMailingAddress: (raw.ownerMailingAddress as string) || undefined,
    rawResponse: raw,
  };
}

function normalizeOwnerType(raw?: string): OwnerType {
  if (!raw) return 'UNKNOWN';
  const upper = raw.toUpperCase();
  if (upper.includes('LLC') || upper.includes('LIMITED LIABILITY')) return 'LLC';
  if (upper.includes('TRUST')) return 'TRUST';
  if (upper.includes('CORP') || upper.includes('INC') || upper.includes('INCORPORATED')) return 'CORPORATION';
  if (upper.includes('PARTNER')) return 'PARTNERSHIP';
  if (upper.includes('JOINT') || upper.includes('AND ') || upper.includes(' & ')) return 'JOINT_OWNERS';
  if (upper === 'INDIVIDUAL' || upper === 'PERSON') return 'INDIVIDUAL';
  return 'UNKNOWN';
}

function normalizeOwnerCandidates(data: Record<string, unknown>): PropertyReachOwnerCandidate[] {
  const rawOwners =
    (data.owners as Record<string, unknown>[]) ||
    (data.ownerCandidates as Record<string, unknown>[]) ||
    [];

  return rawOwners.map((o: Record<string, unknown>) => {
    const ownerType = normalizeOwnerType(o.ownerType as string);
    const isEntity = ['LLC', 'TRUST', 'CORPORATION', 'PARTNERSHIP', 'OTHER_ENTITY'].includes(ownerType);

    // For entities, keep legal name separate from associated human contact
    const legalOwnerName = isEntity ? ((o.fullName as string) || (o.name as string)) : undefined;
    const associatedContactName = isEntity
      ? ((o.associatedContact as string) || (o.contactName as string) || undefined)
      : undefined;

    return {
      fullName: (o.fullName as string) || (o.name as string) || '',
      firstName: o.firstName as string | undefined,
      middleName: o.middleName as string | undefined,
      lastName: o.lastName as string | undefined,
      ownerType,
      mailingAddress: o.mailingAddress as string | undefined,
      mailingCity: o.mailingCity as string | undefined,
      mailingState: o.mailingState as string | undefined,
      mailingZip: o.mailingZip as string | undefined,
      providerRelationship: o.relationship as string | undefined,
      providerConfidence: o.confidence as number | undefined,
      sourceRecordId: (o.id as string) || (o.recordId as string) || undefined,
      isEntity,
      legalOwnerName,
      associatedContactName,
    };
  });
}

function normalizePhoneCandidates(data: Record<string, unknown>): PropertyReachPhoneCandidate[] {
  const rawPhones =
    (data.phones as Record<string, unknown>[]) ||
    (data.phoneNumbers as Record<string, unknown>[]) ||
    [];

  const normalized: PropertyReachPhoneCandidate[] = [];

  rawPhones.forEach((p: Record<string, unknown>, idx: number) => {
    const raw = (p.number as string) || (p.phone as string) || '';
    const e164 = normalizePhoneE164(raw);
    if (!e164) return; // Skip malformed numbers

    const phoneType = normalizePhoneType(p.type as string);

    normalized.push({
      phoneE164: e164,
      phoneRaw: raw,
      phoneType,
      confidence: (p.confidence as number) || 50,
      providerRecordId: (p.id as string) || undefined,
      associationType: p.associationType as string | undefined,
      rankOrder: idx + 1,
      firstSeenAt: p.firstSeenAt as string | undefined,
      lastSeenAt: p.lastSeenAt as string | undefined,
      lastVerifiedAt: p.lastVerifiedAt as string | undefined,
    });
  });

  // Rank: prefer high-confidence mobile numbers
  return normalized.sort((a, b) => {
    const typeScore = (t: PhoneType) => (t === 'MOBILE' ? 2 : t === 'LANDLINE' ? 1 : 0);
    const scoreDiff = b.confidence - a.confidence;
    if (Math.abs(scoreDiff) > 10) return scoreDiff;
    return typeScore(b.phoneType) - typeScore(a.phoneType);
  }).map((p, idx) => ({ ...p, rankOrder: idx + 1 }));
}

function normalizePhoneType(raw?: string): PhoneType {
  if (!raw) return 'UNKNOWN';
  const upper = raw.toUpperCase();
  if (upper.includes('MOBILE') || upper.includes('CELL')) return 'MOBILE';
  if (upper.includes('LAND') || upper.includes('HOME') || upper.includes('WORK')) return 'LANDLINE';
  if (upper.includes('VOIP') || upper.includes('DIGITAL')) return 'VOIP';
  return 'UNKNOWN';
}

function normalizeEmailCandidates(data: Record<string, unknown>): PropertyReachEmailCandidate[] {
  const rawEmails =
    (data.emails as Record<string, unknown>[]) ||
    (data.emailAddresses as Record<string, unknown>[]) ||
    [];

  return rawEmails
    .filter((e: Record<string, unknown>) => {
      const email = (e.email as string) || (e.address as string) || '';
      return email.includes('@') && email.includes('.');
    })
    .map((e: Record<string, unknown>) => ({
      email: (e.email as string) || (e.address as string) || '',
      emailStatus: normalizeEmailStatus(e.status as string, e.confidence as number),
      emailConfidence: (e.confidence as number) || 50,
      emailSource: e.source as string | undefined,
    }));
}

function normalizeEmailStatus(status?: string, confidence?: number): EmailStatus {
  if (status) {
    const upper = status.toUpperCase();
    if (upper === 'VALID' || upper === 'VERIFIED') return 'HIGH_CONFIDENCE';
    if (upper === 'PROBABLE') return 'MEDIUM_CONFIDENCE';
    if (upper === 'HISTORICAL' || upper === 'OLD') return 'HISTORICAL';
    if (upper === 'INVALID' || upper === 'BOUNCED') return 'INVALID';
  }
  if (confidence !== undefined) {
    if (confidence >= 80) return 'HIGH_CONFIDENCE';
    if (confidence >= 60) return 'MEDIUM_CONFIDENCE';
  }
  return 'UNVERIFIED';
}

// ─── Address match verification ───────────────────────────────────────────────

function verifyAddressMatch(
  canonical: { address: string; city: string; state: string; zip: string; apn?: string },
  provider: PropertyReachPropertyResult
): { isMatch: boolean; score: number } {
  let score = 0;

  // Street number match (strongest signal)
  const canonicalNum = canonical.address.match(/^\d+/)?.[0] || '';
  const providerNum = provider.address.match(/^\d+/)?.[0] || '';
  if (canonicalNum && providerNum && canonicalNum === providerNum) score += 40;

  // Street name match
  const canonicalStreet = canonical.address.toLowerCase().replace(/[^a-z0-9\s]/g, '');
  const providerStreet = provider.address.toLowerCase().replace(/[^a-z0-9\s]/g, '');
  if (canonicalStreet && providerStreet && canonicalStreet.includes(providerStreet.split(' ')[1] || '')) score += 20;

  // City match
  if (canonical.city.toLowerCase().trim() === provider.city.toLowerCase().trim()) score += 15;

  // State match
  if (canonical.state.toUpperCase().trim() === provider.state.toUpperCase().trim()) score += 15;

  // ZIP match
  const canonicalZip = canonical.zip.replace(/[^0-9]/g, '').substring(0, 5);
  const providerZip = provider.zip.replace(/[^0-9]/g, '').substring(0, 5);
  if (canonicalZip && providerZip && canonicalZip === providerZip) score += 10;

  // APN match (bonus)
  if (canonical.apn && provider.apn && canonical.apn === provider.apn) score += 20;

  return { isMatch: score >= 70, score };
}

// ─── Full enrichment pipeline ─────────────────────────────────────────────────

export async function runPropertyReachEnrichment(input: {
  leadId: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  apn?: string;
  existingManualOwner?: string;
  existingManualPhone?: string;
}): Promise<PropertyReachEnrichmentResult> {
  const apiKey = getApiKey();
  if (!apiKey) {
    return {
      propertyMatchStatus: 'PROVIDER_ERROR',
      ownerCandidates: [],
      phoneCandidates: [],
      emailCandidates: [],
    };
  }

  // Step 1: Find and verify property
  const propertyResult = await findProperty(
    input.address,
    input.city,
    input.state,
    input.zip,
    input.apn
  );

  if (propertyResult.status !== 'PROPERTY_MATCHED' || !propertyResult.property) {
    return {
      propertyMatchStatus: propertyResult.status,
      ownerCandidates: [],
      phoneCandidates: [],
      emailCandidates: [],
    };
  }

  const property = propertyResult.property;

  // Step 2: Skip trace for owner + contact data
  const skipTraceResult = await skipTraceProperty(
    property.propertyReachId,
    input.address,
    input.city,
    input.state,
    input.zip,
    property.apn || input.apn
  );

  return {
    propertyMatchStatus: 'PROPERTY_MATCHED',
    property,
    ownerCandidates: skipTraceResult.ownerCandidates,
    phoneCandidates: skipTraceResult.phoneCandidates,
    emailCandidates: skipTraceResult.emailCandidates,
    rawPropertyResponse: property.rawResponse,
    rawOwnerResponse: skipTraceResult.rawOwnerResponse,
    rawContactResponse: skipTraceResult.rawContactResponse,
  };
}

// ─── TRAVLR Matching Engine integration ──────────────────────────────────────

export function scorePropertyReachMatch(
  property: PropertyReachPropertyResult,
  owner: PropertyReachOwnerCandidate,
  canonicalAddress: string,
  canonicalCity: string,
  canonicalState: string,
  existingManualOwner?: string
): MatchResult {
  const addressMatch = verifyAddressMatch(
    { address: canonicalAddress, city: canonicalCity, state: canonicalState, zip: '' },
    property
  );

  const fullNameExact =
    !!existingManualOwner &&
    owner.fullName.toLowerCase().trim() === existingManualOwner.toLowerCase().trim();

  const conflictingOwner =
    !!existingManualOwner &&
    !fullNameExact &&
    owner.fullName.trim().length > 0;

  return scoreOwnerMatch({
    candidateName: owner.fullName,
    candidateLastName: owner.lastName,
    propertyAddressMatch: addressMatch.isMatch,
    apnLinkedOwner: !!(property.apn && owner.sourceRecordId),
    ownerMailingAddressMatch: !!(owner.mailingAddress),
    fullNameExactMatch: fullNameExact,
    lastNamePropertyAssociation: !!(
      owner.lastName &&
      property.ownerOfRecord?.toLowerCase().includes(owner.lastName.toLowerCase())
    ),
    cityStateRelationship:
      owner.mailingState?.toUpperCase() === canonicalState.toUpperCase(),
    phoneAddressAssociation: false, // evaluated separately
    firstNameOnlyMatch: false,
    sameCityOnly: owner.mailingCity?.toLowerCase() === canonicalCity.toLowerCase(),
    conflictingAddress: !addressMatch.isMatch && addressMatch.score < 40,
    conflictingOwnerRecord: conflictingOwner,
  });
}

// ─── Provider health check ────────────────────────────────────────────────────

export async function getProviderHealth(): Promise<{
  status: 'ACTIVE' | 'DEGRADED' | 'AUTH_ERROR' | 'DISABLED';
  message: string;
  hasApiKey: boolean;
}> {
  const apiKey = getApiKey();
  if (!apiKey) {
    return {
      status: 'DISABLED',
      message: 'PROPERTYREACH_API_KEY not configured',
      hasApiKey: false,
    };
  }

  try {
    const res = await fetch(`${PR_BASE_URL}/health`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${apiKey}`, 'X-API-Key': apiKey },
      signal: AbortSignal.timeout(5000),
    });

    if (res.status === 401 || res.status === 403) {
      return { status: 'AUTH_ERROR', message: 'API key invalid or unauthorized', hasApiKey: true };
    }
    if (!res.ok) {
      return { status: 'DEGRADED', message: `Provider returned ${res.status}`, hasApiKey: true };
    }
    return { status: 'ACTIVE', message: 'PropertyReach API is reachable', hasApiKey: true };
  } catch {
    return { status: 'DEGRADED', message: 'PropertyReach API unreachable', hasApiKey: true };
  }
}

// ─── OwnerEnrichmentProvider interface implementation ────────────────────────

export const propertyReachProvider: OwnerEnrichmentProvider = {
  providerName: 'PROPERTYREACH',
  providerType: 'COMBINED',

  async verifyProperty(input: PropertyLookupInput): Promise<PropertyLookupResult> {
    const result = await findProperty(input.address, input.city, input.state, input.zip, input.apn);
    if (result.status !== 'PROPERTY_MATCHED' || !result.property) {
      return { verified: false, provider: 'PROPERTYREACH' };
    }
    const p = result.property;
    return {
      verified: true,
      apn: p.apn,
      parcelId: p.parcelId,
      ownerOfRecord: p.ownerOfRecord,
      ownerType: p.ownerType,
      mailingAddress: p.ownerMailingAddress,
      propertyType: p.propertyType,
      county: p.county,
      providerPropertyId: p.propertyReachId,
      provider: 'PROPERTYREACH',
      rawResponse: p.rawResponse,
    };
  },

  async searchOwner(input: OwnerSearchInput): Promise<OwnerCandidate[]> {
    // Requires a propertyReachId — look it up first if not provided
    const propResult = await findProperty(
      input.propertyAddress,
      input.city,
      input.state,
      input.zip,
      input.apn
    );
    if (propResult.status !== 'PROPERTY_MATCHED' || !propResult.property) return [];

    const skipResult = await skipTraceProperty(
      propResult.property.propertyReachId,
      input.propertyAddress,
      input.city,
      input.state,
      input.zip,
      propResult.property.apn
    );

    return skipResult.ownerCandidates.map(o => ({
      fullName: o.fullName,
      firstName: o.firstName,
      lastName: o.lastName,
      ownerType: o.ownerType as OwnerCandidate['ownerType'],
      ownershipConfidence: o.providerConfidence || 50,
      source: 'PROPERTYREACH',
      sourceRecordId: o.sourceRecordId,
      mailingAddress: o.mailingAddress,
      mailingCity: o.mailingCity,
      mailingState: o.mailingState,
      mailingZip: o.mailingZip,
      isEntity: o.isEntity,
    }));
  },

  async searchPhone(input: PhoneSearchInput): Promise<PhoneResult[]> {
    const propResult = await findProperty(
      input.propertyAddress,
      input.city,
      input.state,
      input.zip,
      input.apn
    );
    if (propResult.status !== 'PROPERTY_MATCHED' || !propResult.property) return [];

    const skipResult = await skipTraceProperty(
      propResult.property.propertyReachId,
      input.propertyAddress,
      input.city,
      input.state,
      input.zip,
      propResult.property.apn
    );

    return skipResult.phoneCandidates.map(p => ({
      phoneE164: p.phoneE164,
      phoneRaw: p.phoneRaw,
      phoneType: p.phoneType as PhoneResult['phoneType'],
      confidence: p.confidence,
      source: 'PROPERTYREACH',
      providerRecordId: p.providerRecordId,
      associationType: p.associationType,
      rankOrder: p.rankOrder,
    }));
  },
};
