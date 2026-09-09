/**
 * Property Verification Service
 *
 * CORE RULE: A property must NEVER be inserted into the production database
 * merely because an external source returned a string containing an address.
 * Every candidate must pass this verification gate before insertion.
 *
 * Verification Status States:
 *   CANDIDATE           — raw record from source, not yet processed
 *   PENDING_VERIFICATION — normalization complete, awaiting provider check
 *   VERIFIED            — passed all verification checks (score >= 75)
 *   REJECTED            — failed verification, not suitable for production
 *   STALE_VERIFICATION  — previously verified but needs re-check
 *   QUARANTINED         — failed verification, preserved for audit
 *
 * Verification Score:
 *   100 = verified property with strong property-record match
 *   90  = verified address + property identifier
 *   75  = strong address match but limited property metadata
 *   50  = address/geocode match only (BLOCKED from production)
 *   25  = weak/incomplete candidate (BLOCKED from production)
 *   0   = no verified property match (BLOCKED from production)
 *
 * Production threshold: verification_score >= 75 AND verification_status = VERIFIED
 */

export type VerificationStatus =
  | 'CANDIDATE' |'PENDING_VERIFICATION' |'VERIFIED' |'REJECTED' |'STALE_VERIFICATION' |'QUARANTINED';

export interface NormalizedAddress {
  street_number: string;
  street_name: string;
  street_suffix: string;
  unit: string;
  city: string;
  state: string;
  zip: string;
  zip4: string;
  county: string;
  full_normalized: string;
  is_complete: boolean;
  missing_components: string[];
}

export interface VerificationResult {
  verification_status: VerificationStatus;
  verification_score: number;
  verification_method: string;
  verification_error: string | null;
  verification_notes: string;
  normalized_address: NormalizedAddress | null;
  verified_address: string | null;
  apn: string | null;
  parcel_id: string | null;
  property_provider: string | null;
  provider_property_id: string | null;
  latitude: number | null;
  longitude: number | null;
  county: string | null;
  property_type: string | null;
  bedrooms: number | null;
  bathrooms: number | null;
  square_feet: number | null;
  lot_size: number | null;
  year_built: number | null;
  verification_timestamp: string;
  raw_provider_response: Record<string, unknown> | null;
  rejection_reason: string | null;
}

export interface PropertyCandidate {
  raw_address: string;
  city: string;
  state: string;
  zip: string;
  source: string;
  source_record_id?: string;
  source_url?: string;
  listing_url?: string;
  latitude?: number;
  longitude?: number;
  bedrooms?: number;
  bathrooms?: number;
  square_feet?: number;
  year_built?: number;
  property_type?: string;
}

// ─── Street suffix normalization map ─────────────────────────────────────────

const STREET_SUFFIX_MAP: Record<string, string> = {
  'avenue': 'Ave', 'ave': 'Ave',
  'boulevard': 'Blvd', 'blvd': 'Blvd',
  'circle': 'Cir', 'cir': 'Cir',
  'court': 'Ct', 'ct': 'Ct',
  'drive': 'Dr', 'dr': 'Dr',
  'highway': 'Hwy', 'hwy': 'Hwy',
  'lane': 'Ln', 'ln': 'Ln',
  'parkway': 'Pkwy', 'pkwy': 'Pkwy',
  'place': 'Pl', 'pl': 'Pl',
  'road': 'Rd', 'rd': 'Rd',
  'street': 'St', 'st': 'St',
  'terrace': 'Ter', 'ter': 'Ter',
  'trail': 'Trl', 'trl': 'Trl',
  'way': 'Way',
};

const DIRECTIONAL_MAP: Record<string, string> = {
  'north': 'N', 'south': 'S', 'east': 'E', 'west': 'W',
  'northeast': 'NE', 'northwest': 'NW', 'southeast': 'SE', 'southwest': 'SW',
  'n.': 'N', 's.': 'S', 'e.': 'E', 'w.': 'W',
};

const STATE_ABBR_MAP: Record<string, string> = {
  'alabama': 'AL', 'alaska': 'AK', 'arizona': 'AZ', 'arkansas': 'AR',
  'california': 'CA', 'colorado': 'CO', 'connecticut': 'CT', 'delaware': 'DE',
  'florida': 'FL', 'georgia': 'GA', 'hawaii': 'HI', 'idaho': 'ID',
  'illinois': 'IL', 'indiana': 'IN', 'iowa': 'IA', 'kansas': 'KS',
  'kentucky': 'KY', 'louisiana': 'LA', 'maine': 'ME', 'maryland': 'MD',
  'massachusetts': 'MA', 'michigan': 'MI', 'minnesota': 'MN', 'mississippi': 'MS',
  'missouri': 'MO', 'montana': 'MT', 'nebraska': 'NE', 'nevada': 'NV',
  'new hampshire': 'NH', 'new jersey': 'NJ', 'new mexico': 'NM', 'new york': 'NY',
  'north carolina': 'NC', 'north dakota': 'ND', 'ohio': 'OH', 'oklahoma': 'OK',
  'oregon': 'OR', 'pennsylvania': 'PA', 'rhode island': 'RI', 'south carolina': 'SC',
  'south dakota': 'SD', 'tennessee': 'TN', 'texas': 'TX', 'utah': 'UT',
  'vermont': 'VT', 'virginia': 'VA', 'washington': 'WA', 'west virginia': 'WV',
  'wisconsin': 'WI', 'wyoming': 'WY', 'district of columbia': 'DC',
};

// ─── ZIP code → state validation ─────────────────────────────────────────────

const ZIP_PREFIX_STATE: Record<string, string> = {
  '800': 'CO', '801': 'CO', '802': 'CO', '803': 'CO', '804': 'CO', '805': 'CO',
  '806': 'CO', '807': 'CO', '808': 'CO', '809': 'CO', '810': 'CO', '811': 'CO',
  '812': 'CO', '813': 'CO', '814': 'CO', '815': 'CO', '816': 'CO',
  '890': 'NV', '891': 'NV', '893': 'NV', '894': 'NV', '895': 'NV', '897': 'NV', '898': 'NV',
  '980': 'WA', '981': 'WA', '982': 'WA', '983': 'WA', '984': 'WA', '985': 'WA',
  '986': 'WA', '988': 'WA', '989': 'WA', '990': 'WA', '991': 'WA', '992': 'WA',
  '993': 'WA', '994': 'WA',
  '330': 'FL', '331': 'FL', '332': 'FL', '333': 'FL', '334': 'FL', '335': 'FL',
  '336': 'FL', '337': 'FL', '338': 'FL', '339': 'FL', '341': 'FL', '342': 'FL',
  '344': 'FL', '346': 'FL', '347': 'FL', '349': 'FL',
  '750': 'TX', '751': 'TX', '752': 'TX', '753': 'TX', '754': 'TX', '755': 'TX',
  '756': 'TX', '757': 'TX', '758': 'TX', '759': 'TX', '760': 'TX', '761': 'TX',
  '762': 'TX', '763': 'TX', '764': 'TX', '765': 'TX', '766': 'TX', '767': 'TX',
  '768': 'TX', '769': 'TX', '770': 'TX', '771': 'TX', '772': 'TX', '773': 'TX',
  '774': 'TX', '775': 'TX', '776': 'TX', '777': 'TX', '778': 'TX', '779': 'TX',
  '841': 'UT', '842': 'UT', '843': 'UT', '844': 'UT', '845': 'UT', '846': 'UT', '847': 'UT',
  '020': 'MA', '021': 'MA', '022': 'MA', '023': 'MA', '024': 'MA', '025': 'MA',
  '026': 'MA', '027': 'MA',
  '210': 'MD', '211': 'MD', '212': 'MD', '214': 'MD', '215': 'MD', '216': 'MD',
  '217': 'MD', '218': 'MD', '219': 'MD',
  '970': 'OR', '971': 'OR', '972': 'OR', '973': 'OR', '974': 'OR', '975': 'OR',
  '976': 'OR', '977': 'OR', '978': 'OR', '979': 'OR',
  '900': 'CA', '901': 'CA', '902': 'CA', '903': 'CA', '904': 'CA', '905': 'CA',
  '906': 'CA', '907': 'CA', '908': 'CA', '910': 'CA', '911': 'CA', '912': 'CA',
  '913': 'CA', '914': 'CA', '915': 'CA', '916': 'CA', '917': 'CA', '918': 'CA',
  '919': 'CA', '920': 'CA', '921': 'CA', '922': 'CA', '923': 'CA', '924': 'CA',
  '925': 'CA', '926': 'CA', '927': 'CA', '928': 'CA', '930': 'CA', '931': 'CA',
  '932': 'CA', '933': 'CA', '934': 'CA', '935': 'CA', '936': 'CA', '937': 'CA',
  '938': 'CA', '939': 'CA', '940': 'CA', '941': 'CA', '942': 'CA', '943': 'CA',
  '944': 'CA', '945': 'CA', '946': 'CA', '947': 'CA', '948': 'CA', '949': 'CA',
  '950': 'CA', '951': 'CA', '952': 'CA', '953': 'CA', '954': 'CA', '955': 'CA',
  '956': 'CA', '957': 'CA', '958': 'CA', '959': 'CA', '960': 'CA', '961': 'CA',
  '040': 'ME', '041': 'ME', '042': 'ME', '043': 'ME', '044': 'ME', '045': 'ME',
  '046': 'ME', '047': 'ME', '048': 'ME', '049': 'ME',
};

// ─── Placeholder / synthetic address detection ────────────────────────────────

const PLACEHOLDER_PATTERNS = [
  /^(Zillow|HotPads|Apartments\.com|Craigslist|Facebook Marketplace|Realtor\.com|LoopNet|Trulia|Redfin|MLS|Airbnb|VRBO|Direct|Referral|Other|Unknown)\s+Listing\s+#\d+$/i,
  /^Imported Property/i,
  /^(TBD|N\/A|Unknown|Placeholder|Test|Sample|Demo|Example)\s*/i,
  /^\d{1,5}\s+(Main|First|Second|Third|Test|Sample|Fake|Mock)\s+St(reet)?$/i,
];

function isPlaceholderAddress(address: string): boolean {
  if (!address || address.trim().length < 6) return true;
  return PLACEHOLDER_PATTERNS.some(p => p.test(address.trim()));
}

// ─── STEP 1: Address Normalization ────────────────────────────────────────────

export function normalizeAddress(
  rawAddress: string,
  city: string,
  state: string,
  zip: string,
): NormalizedAddress {
  const missing: string[] = [];

  // Normalize state
  let normState = (state || '').trim();
  if (normState.length > 2) {
    normState = STATE_ABBR_MAP[normState.toLowerCase()] || normState.toUpperCase();
  } else {
    normState = normState.toUpperCase();
  }

  // Normalize ZIP
  let normZip = (zip || '').replace(/[^0-9-]/g, '').trim();
  let zip4 = '';
  if (normZip.includes('-')) {
    const parts = normZip.split('-');
    normZip = parts[0];
    zip4 = parts[1] || '';
  }
  if (normZip.length > 5) {
    zip4 = normZip.substring(5);
    normZip = normZip.substring(0, 5);
  }
  if (normZip.length < 5 && normZip.length > 0) {
    normZip = normZip.padStart(5, '0');
  }

  // Normalize city
  const normCity = (city || '').trim()
    .split(' ')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');

  // Parse street address
  const addrTrimmed = (rawAddress || '').trim();
  let streetNumber = '';
  let streetName = '';
  let streetSuffix = '';
  let unit = '';

  // Extract unit/apt
  const unitMatch = addrTrimmed.match(/\s+(apt|unit|suite|ste|#|apt\.?)\s*([a-z0-9-]+)$/i);
  let addrWithoutUnit = addrTrimmed;
  if (unitMatch) {
    unit = unitMatch[0].trim().replace(/^(apt|unit|suite|ste)\s*/i, '#').replace(/^#\s*/, '#');
    addrWithoutUnit = addrTrimmed.substring(0, addrTrimmed.length - unitMatch[0].length).trim();
  }

  // Extract street number
  const numMatch = addrWithoutUnit.match(/^(\d+[a-z]?)\s+/i);
  if (numMatch) {
    streetNumber = numMatch[1];
    const rest = addrWithoutUnit.substring(numMatch[0].length).trim();

    // Normalize directionals
    const tokens = rest.split(/\s+/);
    const normTokens: string[] = [];
    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i].toLowerCase().replace(/\.$/, '');
      if (DIRECTIONAL_MAP[t] && (i === 0 || i === tokens.length - 1)) {
        normTokens.push(DIRECTIONAL_MAP[t]);
      } else if (STREET_SUFFIX_MAP[t] && i === tokens.length - 1) {
        streetSuffix = STREET_SUFFIX_MAP[t];
      } else {
        normTokens.push(tokens[i].charAt(0).toUpperCase() + tokens[i].slice(1).toLowerCase());
      }
    }
    streetName = normTokens.join(' ');
  } else {
    // No street number found
    missing.push('street_number');
    streetName = addrWithoutUnit;
  }

  if (!streetName) missing.push('street_name');
  if (!normCity) missing.push('city');
  if (!normState) missing.push('state');
  if (!normZip) missing.push('zip');

  const fullNormalized = [
    streetNumber,
    streetName,
    streetSuffix,
    unit,
  ].filter(Boolean).join(' ').trim() + (normCity ? `, ${normCity}` : '') +
    (normState ? `, ${normState}` : '') +
    (normZip ? ` ${normZip}` : '') +
    (zip4 ? `-${zip4}` : '');

  return {
    street_number: streetNumber,
    street_name: streetName,
    street_suffix: streetSuffix,
    unit,
    city: normCity,
    state: normState,
    zip: normZip,
    zip4,
    county: '',
    full_normalized: fullNormalized.trim(),
    is_complete: missing.length === 0,
    missing_components: missing,
  };
}

// ─── STEP 2: ZIP/State consistency check ─────────────────────────────────────

function checkZipStateConsistency(zip: string, state: string): { valid: boolean; reason?: string } {
  if (!zip || zip.length < 3) return { valid: false, reason: 'ZIP code missing or too short' };
  const prefix = zip.substring(0, 3);
  const expectedState = ZIP_PREFIX_STATE[prefix];
  if (expectedState && expectedState !== state.toUpperCase()) {
    return {
      valid: false,
      reason: `ZIP ${zip} belongs to ${expectedState}, not ${state.toUpperCase()}`,
    };
  }
  return { valid: true };
}

// ─── STEP 3: Compute verification score ──────────────────────────────────────

export function computeVerificationScore(params: {
  hasStreetNumber: boolean;
  hasStreetName: boolean;
  hasCity: boolean;
  hasState: boolean;
  hasZip: boolean;
  zipStateConsistent: boolean;
  hasCoordinates: boolean;
  hasPropertyId: boolean;
  hasApn: boolean;
  hasPropertyType: boolean;
  hasPropertyDetails: boolean;
  providerMatch: boolean;
  isPlaceholder: boolean;
}): number {
  if (params.isPlaceholder) return 0;
  if (!params.hasStreetNumber || !params.hasStreetName) return 10;
  if (!params.hasCity || !params.hasState) return 15;
  if (!params.hasZip) return 20;
  if (!params.zipStateConsistent) return 20;

  let score = 0;

  // Base address completeness (up to 50 points)
  if (params.hasStreetNumber) score += 15;
  if (params.hasStreetName) score += 15;
  if (params.hasCity) score += 10;
  if (params.hasState) score += 5;
  if (params.hasZip && params.zipStateConsistent) score += 5;

  // Provider verification (up to 30 points)
  if (params.providerMatch) {
    score += 15;
    if (params.hasPropertyId) score += 10;
    if (params.hasApn) score += 5;
  }

  // Property details (up to 20 points)
  if (params.hasCoordinates) score += 5;
  if (params.hasPropertyType) score += 5;
  if (params.hasPropertyDetails) score += 10;

  return Math.min(100, score);
}

// ─── STEP 4: Determine verification status from score ────────────────────────

export function scoreToStatus(score: number, providerAvailable: boolean): VerificationStatus {
  if (!providerAvailable) return 'QUARANTINED';
  if (score >= 75) return 'VERIFIED';
  if (score >= 50) return 'REJECTED'; // score 50-74: address match only, not production-ready
  return 'REJECTED';
}

// ─── STEP 5: Main verification gate ──────────────────────────────────────────

/**
 * Verify a property candidate.
 *
 * This is the GATE that every candidate must pass before insertion.
 * It does NOT call external APIs (those require licensed keys).
 * It performs structural verification: normalization, ZIP/state consistency,
 * completeness checks, and placeholder detection.
 *
 * When a licensed property data provider (ATTOM, BatchData, etc.) is configured,
 * the sync route should call that provider and pass the response here.
 *
 * Returns a VerificationResult with status and score.
 * Only VERIFIED results with score >= 75 may enter production.
 */
export function verifyPropertyCandidate(
  candidate: PropertyCandidate,
  providerResponse?: {
    matched: boolean;
    provider: string;
    property_id?: string;
    apn?: string;
    verified_address?: string;
    latitude?: number;
    longitude?: number;
    county?: string;
    property_type?: string;
    bedrooms?: number;
    bathrooms?: number;
    square_feet?: number;
    lot_size?: number;
    year_built?: number;
    raw_response?: Record<string, unknown>;
  },
): VerificationResult {
  const timestamp = new Date().toISOString();
  const notes: string[] = [];

  // ── Guard: placeholder address ────────────────────────────────────────────
  if (isPlaceholderAddress(candidate.raw_address)) {
    return {
      verification_status: 'REJECTED',
      verification_score: 0,
      verification_method: 'placeholder_detection',
      verification_error: 'Address is a placeholder or synthetic value',
      verification_notes: 'Rejected: placeholder address detected',
      normalized_address: null,
      verified_address: null,
      apn: null,
      parcel_id: null,
      property_provider: null,
      provider_property_id: null,
      latitude: null,
      longitude: null,
      county: null,
      property_type: null,
      bedrooms: null,
      bathrooms: null,
      square_feet: null,
      lot_size: null,
      year_built: null,
      verification_timestamp: timestamp,
      raw_provider_response: null,
      rejection_reason: 'Placeholder or synthetic address — not a real property',
    };
  }

  // ── Step 1: Normalize address ─────────────────────────────────────────────
  const normalized = normalizeAddress(
    candidate.raw_address,
    candidate.city,
    candidate.state,
    candidate.zip,
  );

  if (!normalized.is_complete) {
    notes.push(`Missing address components: ${normalized.missing_components.join(', ')}`);
  }

  // ── Step 2: ZIP/state consistency ────────────────────────────────────────
  const zipCheck = checkZipStateConsistency(normalized.zip, normalized.state);
  if (!zipCheck.valid) {
    notes.push(`ZIP/state mismatch: ${zipCheck.reason}`);
  }

  // ── Step 3: Compute score ─────────────────────────────────────────────────
  const hasProviderMatch = providerResponse?.matched === true;
  const providerAvailable = providerResponse !== undefined;

  let score = computeVerificationScore({
    hasStreetNumber: !!normalized.street_number,
    hasStreetName: !!normalized.street_name,
    hasCity: !!normalized.city,
    hasState: !!normalized.state,
    hasZip: !!normalized.zip,
    zipStateConsistent: zipCheck.valid,
    hasCoordinates: !!(candidate.latitude && candidate.longitude) ||
      !!(providerResponse?.latitude && providerResponse?.longitude),
    hasPropertyId: !!providerResponse?.property_id,
    hasApn: !!providerResponse?.apn,
    hasPropertyType: !!(candidate.property_type || providerResponse?.property_type),
    hasPropertyDetails: !!(
      (candidate.bedrooms || providerResponse?.bedrooms) &&
      (candidate.bathrooms || providerResponse?.bathrooms)
    ),
    providerMatch: hasProviderMatch,
    isPlaceholder: false,
  });

  // ── Step 4: Determine status ──────────────────────────────────────────────
  // HARD FAIL: if provider is unavailable, quarantine — do NOT insert
  let status: VerificationStatus;
  let rejectionReason: string | null = null;

  if (!providerAvailable) {
    // No provider configured — use structural verification only
    // Score < 75 means we cannot verify the property exists
    if (score >= 75 && normalized.is_complete && zipCheck.valid) {
      // Structural pass — mark as PENDING_VERIFICATION (needs provider confirmation)
      status = 'PENDING_VERIFICATION';
      notes.push('Provider not configured — structural verification only; awaiting provider confirmation');
    } else {
      status = 'QUARANTINED';
      rejectionReason = notes.length > 0 ? notes.join('; ') : 'Incomplete address — cannot verify property exists';
    }
  } else if (!hasProviderMatch) {
    status = 'REJECTED';
    rejectionReason = 'Property data provider returned no match for this address';
    notes.push('Provider returned no match — property cannot be verified');
  } else {
    status = scoreToStatus(score, true);
    if (status !== 'VERIFIED') {
      rejectionReason = `Verification score ${score} below production threshold (75)`;
    }
  }

  const verifiedAddress = providerResponse?.verified_address || normalized.full_normalized;
  const verificationMethod = providerResponse
    ? `${providerResponse.provider}_address_match`
    : 'structural_normalization';

  return {
    verification_status: status,
    verification_score: score,
    verification_method: verificationMethod,
    verification_error: null,
    verification_notes: notes.join('; ') || 'Verification complete',
    normalized_address: normalized,
    verified_address: status === 'VERIFIED' ? verifiedAddress : null,
    apn: providerResponse?.apn || null,
    parcel_id: providerResponse?.apn || null,
    property_provider: providerResponse?.provider || null,
    provider_property_id: providerResponse?.property_id || null,
    latitude: providerResponse?.latitude || candidate.latitude || null,
    longitude: providerResponse?.longitude || candidate.longitude || null,
    county: providerResponse?.county || normalized.county || null,
    property_type: providerResponse?.property_type || candidate.property_type || null,
    bedrooms: providerResponse?.bedrooms || candidate.bedrooms || null,
    bathrooms: providerResponse?.bathrooms || candidate.bathrooms || null,
    square_feet: providerResponse?.square_feet || candidate.square_feet || null,
    lot_size: providerResponse?.lot_size || null,
    year_built: providerResponse?.year_built || candidate.year_built || null,
    verification_timestamp: timestamp,
    raw_provider_response: providerResponse?.raw_response || null,
    rejection_reason: rejectionReason,
  };
}

// ─── Deduplication key ────────────────────────────────────────────────────────

/**
 * Generate a deduplication key for a property.
 * Priority: provider_property_id > APN+county > normalized_address
 */
export function getDeduplicationKey(result: VerificationResult, candidate: PropertyCandidate): string {
  if (result.provider_property_id) {
    return `provider:${result.provider_property_id}`;
  }
  if (result.apn && result.county) {
    return `apn:${result.apn}:${result.county.toLowerCase().replace(/\s+/g, '_')}`;
  }
  if (result.normalized_address?.full_normalized) {
    return `addr:${result.normalized_address.full_normalized.toLowerCase().replace(/\s+/g, '_')}`;
  }
  return `raw:${candidate.raw_address.toLowerCase().replace(/\s+/g, '_')}:${candidate.state}`;
}

// ─── Sync pipeline report ─────────────────────────────────────────────────────

export interface SyncPipelineReport {
  portfolio: string;
  candidates_discovered: number;
  addresses_normalized: number;
  verification_attempts: number;
  verified: number;
  rejected: number;
  quarantined: number;
  pending_verification: number;
  duplicates: number;
  inserted: number;
  updated: number;
  verification_failures: {
    no_property_match: number;
    incomplete_address: number;
    invalid_zip: number;
    placeholder_address: number;
    provider_errors: number;
    score_too_low: number;
  };
  source_errors: string[];
  duration_ms: number;
  sync_complete: boolean;
  provider_available: boolean;
}

export function createEmptyReport(portfolio: string): SyncPipelineReport {
  return {
    portfolio,
    candidates_discovered: 0,
    addresses_normalized: 0,
    verification_attempts: 0,
    verified: 0,
    rejected: 0,
    quarantined: 0,
    pending_verification: 0,
    duplicates: 0,
    inserted: 0,
    updated: 0,
    verification_failures: {
      no_property_match: 0,
      incomplete_address: 0,
      invalid_zip: 0,
      placeholder_address: 0,
      provider_errors: 0,
      score_too_low: 0,
    },
    source_errors: [],
    duration_ms: 0,
    sync_complete: false,
    provider_available: false,
  };
}

export function formatSyncReport(report: SyncPipelineReport): string {
  return `
═══ ${report.portfolio.toUpperCase()} SYNC ═══

Candidates discovered:    ${report.candidates_discovered}
Addresses normalized:     ${report.addresses_normalized}
Verification attempts:    ${report.verification_attempts}
Verified:                 ${report.verified}
Rejected:                 ${report.rejected}
Quarantined:              ${report.quarantined}
Pending verification:     ${report.pending_verification}
Duplicates:               ${report.duplicates}
Inserted:                 ${report.inserted}
Updated:                  ${report.updated}

Verification failures:
  - ${report.verification_failures.no_property_match} no property match
  - ${report.verification_failures.incomplete_address} incomplete address
  - ${report.verification_failures.invalid_zip} invalid ZIP
  - ${report.verification_failures.placeholder_address} placeholder address
  - ${report.verification_failures.provider_errors} provider errors
  - ${report.verification_failures.score_too_low} score below threshold

Provider available: ${report.provider_available ? 'YES' : 'NO — candidates quarantined'}
${report.source_errors.length > 0 ? `\nSource errors:\n${report.source_errors.map(e => `  - ${e}`).join('\n')}` : ''}

SYNC ${report.sync_complete ? 'COMPLETE' : 'INCOMPLETE'}
`.trim();
}
