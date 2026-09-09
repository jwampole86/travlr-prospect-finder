/**
 * TRAVLR — Provider-Agnostic Owner & Phone Enrichment Service
 *
 * Architecture:
 *   OwnerEnrichmentProvider interface → concrete provider adapters
 *   MatchEngine → multi-signal scoring
 *   EnrichmentOrchestrator → waterfall + job queue
 *
 * COMPLIANCE NOTICE:
 *   - No unauthorized scraping of Zillow, Trulia, TruePeopleSearch
 *   - No CAPTCHA bypass, no proxy rotation for evasion
 *   - Phone found ≠ SMS consent
 *   - Manual data protected from lower-confidence automated overwrites
 */

// ─── Provider Interfaces ─────────────────────────────────────────────────────

export interface PropertyLookupInput {
  address: string;
  city: string;
  state: string;
  zip: string;
  apn?: string;
  propertyProviderId?: string;
}

export interface PropertyLookupResult {
  verified: boolean;
  apn?: string;
  parcelId?: string;
  ownerOfRecord?: string;
  ownerType?: string;
  mailingAddress?: string;
  propertyType?: string;
  county?: string;
  providerPropertyId?: string;
  provider: string;
  rawResponse?: Record<string, unknown>;
}

export interface OwnerSearchInput {
  fullName?: string;
  propertyAddress: string;
  city: string;
  state: string;
  zip: string;
  mailingAddress?: string;
  apn?: string;
  propertyId?: string;
}

export interface OwnerCandidate {
  fullName: string;
  firstName?: string;
  lastName?: string;
  ownerType: 'INDIVIDUAL' | 'JOINT_OWNERS' | 'LLC' | 'TRUST' | 'CORPORATION' | 'UNKNOWN';
  ownershipConfidence: number;
  source: string;
  sourceRecordId?: string;
  mailingAddress?: string;
  mailingCity?: string;
  mailingState?: string;
  mailingZip?: string;
  isEntity?: boolean;
}

export interface PhoneSearchInput {
  fullName: string;
  propertyAddress: string;
  city: string;
  state: string;
  zip: string;
  mailingAddress?: string;
  apn?: string;
}

export interface PhoneResult {
  phoneE164: string;
  phoneRaw: string;
  phoneType: 'MOBILE' | 'LANDLINE' | 'VOIP' | 'UNKNOWN';
  confidence: number;
  source: string;
  providerRecordId?: string;
  associationType?: string;
  rankOrder?: number;
}

export interface OwnerEnrichmentProvider {
  providerName: string;
  providerType: 'PROPERTY' | 'PEOPLE' | 'PHONE' | 'IDENTITY' | 'COMBINED';
  searchOwner(input: OwnerSearchInput): Promise<OwnerCandidate[]>;
  searchPhone(input: PhoneSearchInput): Promise<PhoneResult[]>;
  verifyProperty?(input: PropertyLookupInput): Promise<PropertyLookupResult>;
}

// ─── Match Scoring Engine ────────────────────────────────────────────────────

export interface MatchSignal {
  signal: string;
  score: number;
  present: boolean;
  evidence?: string;
}

export interface MatchResult {
  totalScore: number;
  confidence: 'VERIFIED' | 'HIGH_CONFIDENCE' | 'MEDIUM_CONFIDENCE' | 'LOW_CONFIDENCE' | 'NO_MATCH' | 'CONFLICT';
  signals: MatchSignal[];
  autoAccept: boolean;
  requiresReview: boolean;
  doNotAttach: boolean;
  matchReasons: string[];
}

export interface MatchInput {
  candidateName?: string;
  candidateLastName?: string;
  propertyAddressMatch: boolean;
  apnLinkedOwner: boolean;
  ownerMailingAddressMatch: boolean;
  fullNameExactMatch: boolean;
  lastNamePropertyAssociation: boolean;
  cityStateRelationship: boolean;
  phoneAddressAssociation: boolean;
  firstNameOnlyMatch: boolean;
  sameCityOnly: boolean;
  conflictingAddress: boolean;
  conflictingOwnerRecord: boolean;
}

const SCORING_CONFIG = {
  apnLinkedOwner: 50,
  propertyAddressMatch: 35,
  fullNameExactMatch: 25,
  ownerMailingAddressMatch: 20,
  phoneAddressAssociation: 20,
  lastNamePropertyAssociation: 5,
  cityStateRelationship: 3,
  firstNameOnlyMatch: 2,
  sameCityOnly: 1,
  conflictingAddress: -30,
  conflictingOwnerRecord: -50,
};

const AUTO_ACCEPT_THRESHOLD = 85;
const REVIEW_THRESHOLD = 65;

export function scoreOwnerMatch(input: MatchInput): MatchResult {
  const signals: MatchSignal[] = [];
  let totalScore = 0;

  const addSignal = (key: keyof typeof SCORING_CONFIG, present: boolean, evidence?: string) => {
    const score = SCORING_CONFIG[key];
    if (present) totalScore += score;
    signals.push({ signal: key, score, present, evidence });
  };

  addSignal('apnLinkedOwner', input.apnLinkedOwner, input.apnLinkedOwner ? 'APN/property ID directly linked to owner record' : undefined);
  addSignal('propertyAddressMatch', input.propertyAddressMatch, input.propertyAddressMatch ? 'Exact property address match confirmed' : undefined);
  addSignal('fullNameExactMatch', input.fullNameExactMatch, input.fullNameExactMatch ? `Full name exact match: ${input.candidateName}` : undefined);
  addSignal('ownerMailingAddressMatch', input.ownerMailingAddressMatch, input.ownerMailingAddressMatch ? 'Owner mailing address associated' : undefined);
  addSignal('phoneAddressAssociation', input.phoneAddressAssociation, input.phoneAddressAssociation ? 'Phone historically associated with owner/address' : undefined);
  addSignal('lastNamePropertyAssociation', input.lastNamePropertyAssociation, input.lastNamePropertyAssociation ? `Last name + property association: ${input.candidateLastName}` : undefined);
  addSignal('cityStateRelationship', input.cityStateRelationship, undefined);
  addSignal('firstNameOnlyMatch', input.firstNameOnlyMatch, undefined);
  addSignal('sameCityOnly', input.sameCityOnly, undefined);
  addSignal('conflictingAddress', input.conflictingAddress, input.conflictingAddress ? 'Conflicting address detected' : undefined);
  addSignal('conflictingOwnerRecord', input.conflictingOwnerRecord, input.conflictingOwnerRecord ? 'Conflicting owner record detected' : undefined);

  // Require multi-signal match — name alone is insufficient
  const hasMultiSignal = (input.apnLinkedOwner || input.propertyAddressMatch) && (input.fullNameExactMatch || input.ownerMailingAddressMatch);

  let confidence: MatchResult['confidence'];
  if (input.conflictingOwnerRecord) {
    confidence = 'CONFLICT';
  } else if (totalScore >= AUTO_ACCEPT_THRESHOLD && hasMultiSignal) {
    confidence = 'VERIFIED';
  } else if (totalScore >= AUTO_ACCEPT_THRESHOLD) {
    confidence = 'HIGH_CONFIDENCE';
  } else if (totalScore >= REVIEW_THRESHOLD) {
    confidence = 'MEDIUM_CONFIDENCE';
  } else if (totalScore > 0) {
    confidence = 'LOW_CONFIDENCE';
  } else {
    confidence = 'NO_MATCH';
  }

  const matchReasons = signals
    .filter(s => s.present && s.score > 0 && s.evidence)
    .map(s => s.evidence as string);

  return {
    totalScore,
    confidence,
    signals,
    autoAccept: totalScore >= AUTO_ACCEPT_THRESHOLD && hasMultiSignal && !input.conflictingOwnerRecord,
    requiresReview: totalScore >= REVIEW_THRESHOLD && totalScore < AUTO_ACCEPT_THRESHOLD,
    doNotAttach: totalScore < REVIEW_THRESHOLD || input.conflictingOwnerRecord,
    matchReasons,
  };
}

// ─── Address Normalization ───────────────────────────────────────────────────

export interface NormalizedAddressResult {
  rawAddress: string;
  normalizedAddress: string;
  standardizedAddress: string;
  streetNumber: string;
  streetName: string;
  streetSuffix: string;
  unit: string;
  city: string;
  state: string;
  zip: string;
  isComplete: boolean;
}

export function normalizeAddress(
  address: string,
  city: string,
  state: string,
  zip: string
): NormalizedAddressResult {
  const raw = `${address}, ${city}, ${state} ${zip}`.trim();

  // Basic normalization: uppercase state, trim whitespace, standardize abbreviations
  const normalizedState = state.toUpperCase().trim();
  const normalizedZip = zip.replace(/[^0-9-]/g, '').trim();
  const normalizedCity = city.trim().replace(/\s+/g, ' ');

  // Parse street components
  const parts = address.trim().split(/\s+/);
  const streetNumber = /^\d+/.test(parts[0]) ? parts[0] : '';
  const streetName = parts.slice(streetNumber ? 1 : 0, -1).join(' ');
  const streetSuffix = parts[parts.length - 1] || '';

  const normalized = `${address.trim()}, ${normalizedCity}, ${normalizedState} ${normalizedZip}`;
  const standardized = normalized.toUpperCase();

  return {
    rawAddress: raw,
    normalizedAddress: normalized,
    standardizedAddress: standardized,
    streetNumber,
    streetName,
    streetSuffix,
    unit: '',
    city: normalizedCity,
    state: normalizedState,
    zip: normalizedZip,
    isComplete: !!(streetNumber && streetName && normalizedCity && normalizedState && normalizedZip),
  };
}

// ─── Phone Normalization ─────────────────────────────────────────────────────

export function normalizePhoneE164(phone: string): string | null {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return null;
}

// ─── BatchData Provider Adapter ──────────────────────────────────────────────
// Uses the existing BATCHDATA_API_KEY env variable

export const batchDataProvider: OwnerEnrichmentProvider = {
  providerName: 'BATCHDATA',
  providerType: 'COMBINED',

  async verifyProperty(input: PropertyLookupInput): Promise<PropertyLookupResult> {
    const apiKey = process.env.BATCHDATA_API_KEY;
    if (!apiKey || apiKey === 'your-batchdata-api-key-here') {
      return { verified: false, provider: 'BATCHDATA' };
    }
    try {
      const res = await fetch('https://api.batchdata.com/api/v1/property/lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey },
        body: JSON.stringify({
          requests: [{
            address: { street: input.address, city: input.city, state: input.state, zip: input.zip },
          }],
        }),
      });
      if (!res.ok) return { verified: false, provider: 'BATCHDATA' };
      const data = await res.json();
      const prop = data?.results?.[0]?.property;
      if (!prop) return { verified: false, provider: 'BATCHDATA' };
      return {
        verified: true,
        apn: prop.apn || prop.parcelNumber,
        parcelId: prop.parcelId,
        ownerOfRecord: prop.ownerName || prop.owner?.name,
        ownerType: prop.ownerType,
        mailingAddress: prop.ownerMailingAddress,
        propertyType: prop.propertyType,
        county: prop.county,
        providerPropertyId: prop.propertyId,
        provider: 'BATCHDATA',
        rawResponse: prop,
      };
    } catch {
      return { verified: false, provider: 'BATCHDATA' };
    }
  },

  async searchOwner(input: OwnerSearchInput): Promise<OwnerCandidate[]> {
    const apiKey = process.env.BATCHDATA_API_KEY;
    if (!apiKey || apiKey === 'your-batchdata-api-key-here') return [];
    try {
      const res = await fetch('https://api.batchdata.com/api/v1/person/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey },
        body: JSON.stringify({
          name: input.fullName,
          address: input.propertyAddress,
          city: input.city,
          state: input.state,
          zip: input.zip,
        }),
      });
      if (!res.ok) return [];
      const data = await res.json();
      return (data?.results || []).map((r: Record<string, unknown>) => ({
        fullName: r.fullName as string || '',
        firstName: r.firstName as string,
        lastName: r.lastName as string,
        ownerType: 'INDIVIDUAL' as const,
        ownershipConfidence: (r.confidence as number) || 50,
        source: 'BATCHDATA',
        sourceRecordId: r.id as string,
        mailingAddress: r.address as string,
        mailingCity: r.city as string,
        mailingState: r.state as string,
        mailingZip: r.zip as string,
      }));
    } catch {
      return [];
    }
  },

  async searchPhone(input: PhoneSearchInput): Promise<PhoneResult[]> {
    const apiKey = process.env.BATCHDATA_API_KEY;
    if (!apiKey || apiKey === 'your-batchdata-api-key-here') return [];
    try {
      const res = await fetch('https://api.batchdata.com/api/v1/person/phone', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey },
        body: JSON.stringify({
          name: input.fullName,
          address: input.propertyAddress,
          city: input.city,
          state: input.state,
          zip: input.zip,
        }),
      });
      if (!res.ok) return [];
      const data = await res.json();
      return (data?.phones || []).map((p: Record<string, unknown>, idx: number) => ({
        phoneE164: normalizePhoneE164(p.number as string || '') || '',
        phoneRaw: p.number as string || '',
        phoneType: ((p.type as string) || 'UNKNOWN').toUpperCase() as PhoneResult['phoneType'],
        confidence: (p.confidence as number) || 50,
        source: 'BATCHDATA',
        providerRecordId: p.id as string,
        associationType: p.associationType as string,
        rankOrder: idx + 1,
      })).filter((p: PhoneResult) => p.phoneE164);
    } catch {
      return [];
    }
  },
};

// ─── Manual Research Provider (always enabled, no automation) ────────────────

export const manualResearchProvider: OwnerEnrichmentProvider = {
  providerName: 'MANUAL_RESEARCH',
  providerType: 'PEOPLE',
  async searchOwner(): Promise<OwnerCandidate[]> { return []; },
  async searchPhone(): Promise<PhoneResult[]> { return []; },
};

// ─── Provider Registry ───────────────────────────────────────────────────────

export const PROVIDER_REGISTRY: Record<string, OwnerEnrichmentProvider> = {
  BATCHDATA: batchDataProvider,
  MANUAL_RESEARCH: manualResearchProvider,
};

export function getProvider(name: string): OwnerEnrichmentProvider | null {
  return PROVIDER_REGISTRY[name] || null;
}

// ─── Confidence Helpers ──────────────────────────────────────────────────────

export function confidenceLabel(confidence: string): string {
  const labels: Record<string, string> = {
    VERIFIED: 'Verified',
    HIGH_CONFIDENCE: 'High Confidence',
    MEDIUM_CONFIDENCE: 'Medium — Review Required',
    LOW_CONFIDENCE: 'Low — Do Not Attach',
    NO_MATCH: 'No Match',
    CONFLICT: 'Conflict — Review Required',
  };
  return labels[confidence] || confidence;
}

export function confidenceColor(confidence: string): string {
  const colors: Record<string, string> = {
    VERIFIED: 'text-emerald-600 bg-emerald-500/10 border-emerald-500/20',
    HIGH_CONFIDENCE: 'text-blue-600 bg-blue-500/10 border-blue-500/20',
    MEDIUM_CONFIDENCE: 'text-amber-600 bg-amber-500/10 border-amber-500/20',
    LOW_CONFIDENCE: 'text-orange-600 bg-orange-500/10 border-orange-500/20',
    NO_MATCH: 'text-muted-foreground bg-muted border-border',
    CONFLICT: 'text-red-600 bg-red-500/10 border-red-500/20',
  };
  return colors[confidence] || 'text-muted-foreground bg-muted border-border';
}

export const AUTO_ACCEPT_SCORE = AUTO_ACCEPT_THRESHOLD;
export const REVIEW_SCORE = REVIEW_THRESHOLD;
