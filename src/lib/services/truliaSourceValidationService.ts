/**
 * Trulia Source Validation Service
 *
 * Validates every configured Trulia source URL before activation.
 * Handles URL normalization, state matching, filter matching, tier preservation,
 * and duplicate detection.
 *
 * CRITICAL RULES:
 * - Never generate fake properties
 * - Source access unavailability must be reported, not silenced
 * - Failed access must NOT become "0 results"
 * - Listing status NEVER maps to TRAVLR pipeline stage
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type SourceValidationStatus =
  | 'VALID' |'INVALID_URL' |'STATE_MISMATCH' |'FILTER_MISMATCH' |'DUPLICATE_SOURCE' |'SOURCE_ACCESS_UNAVAILABLE' |'DISABLED';

export type SourceHealthStatus =
  | 'HEALTHY' |'PARTIAL' |'NO_RESULTS' |'SUSPECT_ZERO_RESULTS' |'INVALID_CONFIG' |'AUTH_ERROR' |'SOURCE_ERROR' |'PARSING_ERROR' |'VALIDATION_ERROR' |'DATA_ERROR' |'UNKNOWN';

export type SourceTier = 'STANDARD' | 'LUXURY';

export interface TruliaSourceConfig {
  sourceId: string;
  provider: 'TRULIA';
  stateCode: string;
  sourceUrlRaw: string;
  sourceUrlCanonical: string;
  sourceTier: SourceTier;
  minimumRent: number;
  propertyTypes: string[];
  furnishedRequired: boolean;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  lastAttemptAt: string | null;
  lastSuccessfulFetchAt: string | null;
  lastSuccessfulIngestionAt: string | null;
  lastError: string | null;
  healthStatus: SourceHealthStatus;
}

export interface SourceValidationResult {
  sourceId: string;
  stateCode: string;
  tier: SourceTier;
  minimumRent: number;
  rawUrl: string;
  canonicalUrl: string;
  urlValid: boolean;
  stateMatch: boolean;
  filterMatch: boolean;
  isDuplicate: boolean;
  active: boolean;
  status: SourceValidationStatus;
  validationNotes: string[];
}

export interface ParsedTruliaUrl {
  isValid: boolean;
  stateCode: string | null;
  minimumRent: number | null;
  propertyTypes: string[];
  furnished: boolean;
  canonicalUrl: string;
  parseErrors: string[];
}

// ─── URL Normalization ────────────────────────────────────────────────────────

/**
 * Normalize a Trulia URL to canonical form.
 * Handles: http vs https, www vs no-www, markdown escaping,
 * backslash escaping, trailing whitespace, trailing slash differences.
 *
 * Canonical format: https://www.trulia.com/for_rent/{STATE}/{RENT}p_price/...
 */
export function normalizeTruliaUrl(rawUrl: string): string {
  if (!rawUrl) return '';

  let url = rawUrl.trim();

  // Remove markdown link syntax: [text](url) or just the url part
  url = url.replace(/^\[.*?\]\((.+?)\)$/, '$1');

  // Remove backslash escaping
  url = url.replace(/\\/g, '');

  // Remove trailing whitespace
  url = url.trim();

  // Ensure https://www. prefix
  if (url.startsWith('http://www.trulia.com')) {
    url = 'https://www.trulia.com' + url.slice('http://www.trulia.com'.length);
  } else if (url.startsWith('https://trulia.com')) {
    url = 'https://www.trulia.com' + url.slice('https://trulia.com'.length);
  } else if (url.startsWith('http://trulia.com')) {
    url = 'https://www.trulia.com' + url.slice('http://trulia.com'.length);
  } else if (url.startsWith('trulia.com')) {
    url = 'https://www.trulia.com' + url.slice('trulia.com'.length);
  } else if (url.startsWith('www.trulia.com')) {
    url = 'https://www.trulia.com' + url.slice('www.trulia.com'.length);
  }

  // Ensure trailing slash
  if (!url.endsWith('/')) {
    url = url + '/';
  }

  return url;
}

/**
 * Parse a canonical Trulia URL to extract configuration metadata.
 * Pattern: https://www.trulia.com/for_rent/{STATE}/{RENT}p_price/{TYPES}_type/{FURNISHED}_furnished/
 */
export function parseTruliaUrl(url: string): ParsedTruliaUrl {
  const canonical = normalizeTruliaUrl(url);
  const errors: string[] = [];

  if (!canonical.startsWith('https://www.trulia.com/')) {
    return {
      isValid: false,
      stateCode: null,
      minimumRent: null,
      propertyTypes: [],
      furnished: false,
      canonicalUrl: canonical,
      parseErrors: ['URL does not start with https://www.trulia.com/'],
    };
  }

  // Pattern: /for_rent/STATE/RENTp_price/TYPES_type/FURNISHED_furnished/
  const pattern = /\/for_rent\/([A-Z]{2})\/(\d+)p_price\/([^/]+)_type\/(\d+)_furnished\//;
  const match = canonical.match(pattern);

  if (!match) {
    return {
      isValid: false,
      stateCode: null,
      minimumRent: null,
      propertyTypes: [],
      furnished: false,
      canonicalUrl: canonical,
      parseErrors: ['URL does not match expected Trulia rental filter pattern'],
    };
  }

  const stateCode = match[1];
  const minimumRent = parseInt(match[2], 10);
  const typesRaw = match[3];
  const furnishedFlag = parseInt(match[4], 10);

  const propertyTypes = typesRaw.split(',').map((t) => t.trim()).filter(Boolean);
  const furnished = furnishedFlag === 1;

  if (isNaN(minimumRent) || minimumRent <= 0) {
    errors.push(`Invalid minimum rent: ${match[2]}`);
  }

  return {
    isValid: errors.length === 0,
    stateCode,
    minimumRent: isNaN(minimumRent) ? null : minimumRent,
    propertyTypes,
    furnished,
    canonicalUrl: canonical,
    parseErrors: errors,
  };
}

/**
 * Validate a single source configuration.
 * Checks: URL validity, state match, filter match, duplicate detection.
 */
export function validateSourceConfig(
  config: {
    sourceId: string;
    stateCode: string;
    tier: SourceTier;
    minimumRent: number;
    rawUrl: string;
    active: boolean;
  },
  existingCanonicalUrls: string[] = []
): SourceValidationResult {
  const notes: string[] = [];
  const canonical = normalizeTruliaUrl(config.rawUrl);
  const parsed = parseTruliaUrl(config.rawUrl);

  // URL validity
  const urlValid = parsed.isValid;
  if (!urlValid) {
    notes.push(...parsed.parseErrors);
  }

  // State match
  let stateMatch = false;
  if (parsed.stateCode) {
    stateMatch = parsed.stateCode.toUpperCase() === config.stateCode.toUpperCase();
    if (!stateMatch) {
      notes.push(
        `STATE_MISMATCH: configured=${config.stateCode}, URL contains=${parsed.stateCode}`
      );
    }
  } else if (urlValid) {
    notes.push('Could not extract state code from URL');
  }

  // Filter match: rent threshold
  let filterMatch = false;
  if (parsed.minimumRent !== null) {
    filterMatch = parsed.minimumRent === config.minimumRent;
    if (!filterMatch) {
      notes.push(
        `FILTER_MISMATCH: configured rent=${config.minimumRent}, URL rent=${parsed.minimumRent}`
      );
    }
    // Property types
    const hasRequiredTypes =
      parsed.propertyTypes.includes('SINGLE-FAMILY_HOME') &&
      parsed.propertyTypes.includes('TOWNHOUSE');
    if (!hasRequiredTypes) {
      filterMatch = false;
      notes.push(
        `FILTER_MISMATCH: expected SINGLE-FAMILY_HOME,TOWNHOUSE, got ${parsed.propertyTypes.join(',')}`
      );
    }
    // Furnished
    if (!parsed.furnished) {
      filterMatch = false;
      notes.push('FILTER_MISMATCH: URL does not specify furnished (1_furnished)');
    }
  }

  // Duplicate detection: same canonical URL already in the list
  const isDuplicate = existingCanonicalUrls.filter((u) => u === canonical).length > 1;
  if (isDuplicate) {
    notes.push(`DUPLICATE_SOURCE: canonical URL already exists in source list`);
  }

  // Determine status
  let status: SourceValidationStatus;
  if (!config.active) {
    status = 'DISABLED';
  } else if (isDuplicate) {
    status = 'DUPLICATE_SOURCE';
  } else if (!urlValid) {
    status = 'INVALID_URL';
  } else if (!stateMatch) {
    status = 'STATE_MISMATCH';
  } else if (!filterMatch) {
    status = 'FILTER_MISMATCH';
  } else {
    status = 'VALID';
  }

  return {
    sourceId: config.sourceId,
    stateCode: config.stateCode,
    tier: config.tier,
    minimumRent: config.minimumRent,
    rawUrl: config.rawUrl,
    canonicalUrl: canonical,
    urlValid,
    stateMatch,
    filterMatch,
    isDuplicate,
    active: config.active,
    status,
    validationNotes: notes,
  };
}

/**
 * Validate all source configurations in a batch.
 * Detects duplicates across the full list.
 */
export function validateAllSourceConfigs(
  configs: Array<{
    sourceId: string;
    stateCode: string;
    tier: SourceTier;
    minimumRent: number;
    rawUrl: string;
    active: boolean;
  }>
): SourceValidationResult[] {
  // Build canonical URL list for duplicate detection
  const canonicalUrls = configs.map((c) => normalizeTruliaUrl(c.rawUrl));

  return configs.map((config) =>
    validateSourceConfig(config, canonicalUrls)
  );
}

// ─── Sync Counter Validation ──────────────────────────────────────────────────

export interface SyncCounters {
  sourceResultsReturned: number;
  recordsParsed: number;
  recordsNormalized: number;
  stateValidated: number;
  filterValidated: number;
  propertiesVerified: number;
  newProspectsInserted: number;
  existingProspectsUpdated: number;
  duplicatesMerged: number;
  rejectedInvalid: number;
  rejectedWrongState: number;
  rejectedFilterMismatch: number;
  errors: number;
}

/**
 * Validate sync counters — no counter may be undefined, NaN, or negative.
 * Returns -1 for any counter that is missing/invalid (DATA_ERROR sentinel).
 */
export function validateSyncCounters(raw: Partial<SyncCounters>): {
  counters: SyncCounters;
  hasDataError: boolean;
  dataErrorFields: string[];
} {
  const fields: (keyof SyncCounters)[] = [
    'sourceResultsReturned', 'recordsParsed', 'recordsNormalized',
    'stateValidated', 'filterValidated', 'propertiesVerified',
    'newProspectsInserted', 'existingProspectsUpdated', 'duplicatesMerged',
    'rejectedInvalid', 'rejectedWrongState', 'rejectedFilterMismatch', 'errors',
  ];

  const dataErrorFields: string[] = [];
  const counters = {} as SyncCounters;

  for (const field of fields) {
    const val = raw[field];
    if (val === undefined || val === null || typeof val !== 'number' || isNaN(val)) {
      counters[field] = -1;
      dataErrorFields.push(field);
    } else {
      counters[field] = val;
    }
  }

  return {
    counters,
    hasDataError: dataErrorFields.length > 0,
    dataErrorFields,
  };
}

/**
 * Determine health status from sync counters.
 * SUCCESS requires ALL pipeline stages to have completed with valid metrics.
 */
export function determineHealthStatus(
  counters: SyncCounters,
  accessSucceeded: boolean,
  responseSchemaValid: boolean,
  previousSuccessCount: number | null
): SourceHealthStatus {
  // Access failure is not zero results
  if (!accessSucceeded) return 'SOURCE_ERROR';

  // Schema invalid = parsing error
  if (!responseSchemaValid) return 'PARSING_ERROR';

  // Any DATA_ERROR sentinel (-1) means we can't determine health
  const hasDataError = Object.values(counters).some((v) => v === -1);
  if (hasDataError) return 'DATA_ERROR';

  // Errors present
  if (counters.errors > 0) {
    if (counters.newProspectsInserted > 0 || counters.existingProspectsUpdated > 0) {
      return 'PARTIAL';
    }
    return 'SOURCE_ERROR';
  }

  // Zero results
  if (counters.sourceResultsReturned === 0) {
    // Suspect if previously had results
    if (previousSuccessCount !== null && previousSuccessCount > 0) {
      return 'SUSPECT_ZERO_RESULTS';
    }
    return 'NO_RESULTS';
  }

  // Validation errors
  if (counters.stateValidated === -1 || counters.filterValidated === -1) {
    return 'VALIDATION_ERROR';
  }

  // Partial: some records rejected but some succeeded
  const totalRejected =
    counters.rejectedInvalid + counters.rejectedWrongState + counters.rejectedFilterMismatch;
  if (totalRejected > 0 && (counters.newProspectsInserted > 0 || counters.existingProspectsUpdated > 0)) {
    return 'PARTIAL';
  }

  // All pipeline stages must have valid non-negative values for SUCCESS
  const pipelineFields: (keyof SyncCounters)[] = [
    'sourceResultsReturned', 'recordsParsed', 'recordsNormalized',
    'stateValidated', 'filterValidated', 'propertiesVerified',
    'newProspectsInserted', 'existingProspectsUpdated', 'duplicatesMerged',
  ];
  const allPipelineValid = pipelineFields.every((f) => counters[f] >= 0);
  if (!allPipelineValid) return 'DATA_ERROR';

  return 'HEALTHY';
}

/**
 * Validate reconciliation equation:
 * validated = new + updated + deduped + rejected
 * No records may disappear silently.
 */
export function validateReconciliation(counters: SyncCounters): {
  valid: boolean;
  notes: string;
} {
  if (Object.values(counters).some((v) => v === -1)) {
    return { valid: false, notes: 'Cannot reconcile: DATA_ERROR in counters' };
  }

  const validated = counters.filterValidated;
  const accounted =
    counters.newProspectsInserted +
    counters.existingProspectsUpdated +
    counters.duplicatesMerged +
    counters.rejectedInvalid +
    counters.rejectedWrongState +
    counters.rejectedFilterMismatch;

  if (validated !== accounted) {
    return {
      valid: false,
      notes: `Reconciliation mismatch: validated=${validated}, accounted=${accounted} (new=${counters.newProspectsInserted}+updated=${counters.existingProspectsUpdated}+deduped=${counters.duplicatesMerged}+rejected=${counters.rejectedInvalid + counters.rejectedWrongState + counters.rejectedFilterMismatch})`,
    };
  }

  return { valid: true, notes: 'Reconciliation OK' };
}

// ─── Pipeline Stage Protection ────────────────────────────────────────────────

/**
 * Source sync MUST NEVER advance TRAVLR pipeline stage.
 * This function validates that a proposed stage value is safe for source-sync upsert.
 *
 * Returns the safe stage to use:
 * - If prospect is new: 'New Lead'
 * - If prospect exists: preserve existing stage (never overwrite with source data)
 */
export function getSafeStageForSourceSync(
  existingStage: string | null,
  isNewProspect: boolean
): string {
  if (isNewProspect) return 'New Lead';
  // Preserve existing stage — source sync cannot change it
  return existingStage || 'New Lead';
}

/**
 * Listing status values from external sources.
 * These MUST NEVER be mapped to TRAVLR pipeline stages.
 */
export const EXTERNAL_LISTING_STATUSES = [
  'Active', 'Pending', 'Off Market', 'Rented', 'Sold', 'Expired', 'Withdrawn',
] as const;

/**
 * TRAVLR pipeline stages that source sync must NEVER set.
 * Only real outreach events may advance to these stages.
 */
export const PROTECTED_PIPELINE_STAGES = [
  'Contacted', 'Interested', 'Qualified', 'Appointment Scheduled',
  'Proposal Sent', 'Under Contract', 'Live',
] as const;

/**
 * Validate that a stage value is safe to write during source sync.
 * Returns false if the stage would contaminate the pipeline.
 */
export function isStageSafeForSourceSync(stage: string): boolean {
  return !PROTECTED_PIPELINE_STAGES.includes(stage as typeof PROTECTED_PIPELINE_STAGES[number]);
}
