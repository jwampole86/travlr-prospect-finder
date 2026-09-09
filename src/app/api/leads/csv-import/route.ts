import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// ─── Luxury threshold map (per state, lowest luxury tier) ────────────────────
const LUXURY_THRESHOLDS: Record<string, number> = {
  AZ: 15000, CA: 15000, CO: 15000, FL: 15000, GA: 15000, ID: 15000, KS: 15000,
  MA: 10000, MD: 10000, MN: 10000, MO: 10000, MT: 10000, NC: 10000, NE: 7500,
  NH: 10000, NJ: 10000, NM: 10000, NV: 10000, NY: 15000, OR: 10000, TX: 10000,
  UT: 10000, VT: 10000, WA: 10000, WI: 10000, WY: 10000,
};

/** Returns true if the property qualifies as luxury based on state + price */
function isLuxuryProperty(stateCode: string, price: number | null): boolean {
  if (!stateCode || !price || price <= 0) return false;
  const threshold = LUXURY_THRESHOLDS[stateCode.toUpperCase()];
  if (!threshold) return false;
  return price >= threshold;
}

// ─── State name map ───────────────────────────────────────────────────────────
const STATE_NAMES: Record<string, string> = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California',
  CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', FL: 'Florida', GA: 'Georgia',
  HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa',
  KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland',
  MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri',
  MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey',
  NM: 'New Mexico', NY: 'New York', NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio',
  OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina',
  SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont',
  VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming',
  DC: 'District of Columbia',
};

const STATE_ABBR_MAP: Record<string, string> = {
  'alabama': 'AL', 'alaska': 'AK', 'arizona': 'AZ', 'arkansas': 'AR', 'california': 'CA',
  'colorado': 'CO', 'connecticut': 'CT', 'delaware': 'DE', 'florida': 'FL', 'georgia': 'GA',
  'hawaii': 'HI', 'idaho': 'ID', 'illinois': 'IL', 'indiana': 'IN', 'iowa': 'IA',
  'kansas': 'KS', 'kentucky': 'KY', 'louisiana': 'LA', 'maine': 'ME', 'maryland': 'MD',
  'massachusetts': 'MA', 'michigan': 'MI', 'minnesota': 'MN', 'mississippi': 'MS', 'missouri': 'MO',
  'montana': 'MT', 'nebraska': 'NE', 'nevada': 'NV', 'new hampshire': 'NH', 'new jersey': 'NJ',
  'new mexico': 'NM', 'new york': 'NY', 'north carolina': 'NC', 'north dakota': 'ND', 'ohio': 'OH',
  'oklahoma': 'OK', 'oregon': 'OR', 'pennsylvania': 'PA', 'rhode island': 'RI', 'south carolina': 'SC',
  'south dakota': 'SD', 'tennessee': 'TN', 'texas': 'TX', 'utah': 'UT', 'vermont': 'VT',
  'virginia': 'VA', 'washington': 'WA', 'west virginia': 'WV', 'wisconsin': 'WI', 'wyoming': 'WY',
  'district of columbia': 'DC',
};

const STREET_SUFFIX_MAP: Record<string, string> = {
  'avenue': 'Ave', 'ave': 'Ave', 'boulevard': 'Blvd', 'blvd': 'Blvd',
  'circle': 'Cir', 'cir': 'Cir', 'court': 'Ct', 'ct': 'Ct',
  'drive': 'Dr', 'dr': 'Dr', 'highway': 'Hwy', 'hwy': 'Hwy',
  'lane': 'Ln', 'ln': 'Ln', 'parkway': 'Pkwy', 'pkwy': 'Pkwy',
  'place': 'Pl', 'pl': 'Pl', 'road': 'Rd', 'rd': 'Rd',
  'street': 'St', 'st': 'St', 'terrace': 'Ter', 'ter': 'Ter',
  'trail': 'Trl', 'trl': 'Trl', 'way': 'Way',
};

// ─── Address normalization ────────────────────────────────────────────────────
function normalizeStateCode(state: string): string {
  if (!state) return '';
  const trimmed = state.trim();
  if (trimmed.length === 2) return trimmed.toUpperCase();
  return STATE_ABBR_MAP[trimmed.toLowerCase()] || trimmed.toUpperCase();
}

interface NormalizedAddress {
  streetAddress: string;
  city: string;
  state: string;
  zipCode: string;
  standardizedAddress: string;
  /** Compact fingerprint for dedup comparison */
  fingerprint: string;
}

function normalizeAddress(raw: string, city: string, state: string, zip: string): NormalizedAddress {
  const normState = normalizeStateCode(state);
  const normCity = (city || '').trim().toLowerCase().replace(/\s+/g, ' ');
  const normZip = (zip || '').replace(/\D/g, '').slice(0, 5);

  // Normalize street address
  let street = (raw || '').trim();
  // Remove trailing punctuation
  street = street.replace(/[.,]+$/, '');
  const parts = street.split(/\s+/);
  const normalized = parts.map((p, i) => {
    const lower = p.toLowerCase().replace(/[.,]/g, '');
    if (i > 0 && STREET_SUFFIX_MAP[lower]) return STREET_SUFFIX_MAP[lower];
    return p;
  });
  street = normalized.join(' ');

  const displayCity = (city || '').trim();
  const standardized = [street, displayCity, normState, normZip].filter(Boolean).join(', ');

  // Fingerprint: lowercase, no punctuation, normalized spaces
  const fingerprintParts = [
    street.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim(),
    normCity,
    normState.toLowerCase(),
    normZip,
  ].filter(Boolean);
  const fingerprint = fingerprintParts.join('|');

  return { streetAddress: street, city: displayCity, state: normState, zipCode: normZip, standardizedAddress: standardized, fingerprint };
}

// ─── Phone normalization to E.164 ────────────────────────────────────────────
function normalizePhone(phone: string): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits[0] === '1') return `+${digits}`;
  return null;
}

// ─── Revenue calculation (TRAVLR model) ──────────────────────────────────────
function calculateTravlrRevenue(beds: number, baths: number, state: string, currentRent: number | null) {
  const baseADR: Record<number, number> = { 1: 120, 2: 175, 3: 225, 4: 295, 5: 380, 6: 450 };
  const adr = baseADR[Math.min(beds || 3, 6)] || 225;
  const stateMultipliers: Record<string, number> = {
    CA: 1.35, NY: 1.30, WA: 1.20, CO: 1.15, FL: 1.25, TX: 1.10,
    NV: 1.20, MA: 1.25, OR: 1.10, ME: 1.05, UT: 1.10, MD: 1.15,
    AZ: 1.10, ID: 1.05, MT: 1.05, WY: 1.05,
  };
  const multiplier = stateMultipliers[state] || 1.0;
  const projectedADR = Math.round(adr * multiplier);
  const projectedOccupancy = Math.min(0.78, 0.62 + (beds || 3) * 0.02);
  const projectedMonthlyGross = Math.round(projectedADR * 30 * projectedOccupancy);
  const projectedAnnualGross = projectedMonthlyGross * 12;
  const estimatedManagementFee = 0.20;
  const projectedManagementRevenue = Math.round(projectedAnnualGross * estimatedManagementFee);
  const projectedOwnerGross = projectedAnnualGross - projectedManagementRevenue;
  const estimatedOperatingCosts = Math.round(projectedAnnualGross * 0.15);
  const projectedOwnerNet = projectedOwnerGross - estimatedOperatingCosts;
  let potentialUplift: number | null = null;
  let potentialUpliftPct: number | null = null;
  if (currentRent && currentRent > 0) {
    const annualCurrentRent = currentRent * 12;
    potentialUplift = projectedAnnualGross - annualCurrentRent;
    potentialUpliftPct = Math.round((potentialUplift / annualCurrentRent) * 100);
  }
  return {
    projectedADR, projectedOccupancy: Math.round(projectedOccupancy * 100),
    projectedMonthlyGross, projectedAnnualGross,
    estimatedManagementFee: Math.round(estimatedManagementFee * 100),
    projectedManagementRevenue, projectedOwnerGross, estimatedOperatingCosts,
    projectedOwnerNet, potentialUplift, potentialUpliftPct,
    calculationVersion: 'travlr-v1.0', calculatedAt: new Date().toISOString(),
  };
}

// ─── Prospect score calculation ───────────────────────────────────────────────
function calculateProspectScore(params: {
  verifiedOwner: boolean; verifiedAddress: boolean; verifiedNumber: boolean;
  isManualVerifiedImport: boolean; currentRent: number | null;
  projectedAnnualGross: number; beds: number; regulationStatus: string; hasPhone: boolean;
}): number {
  let score = 0;
  if (params.verifiedNumber) score += 50;
  if (params.verifiedOwner) score += 25;
  if (params.verifiedAddress) score += 20;
  if (params.isManualVerifiedImport) score += 20;
  if (params.projectedAnnualGross > 100000) score += 20;
  else if (params.projectedAnnualGross > 60000) score += 12;
  else if (params.projectedAnnualGross > 40000) score += 6;
  if (params.beds >= 4) score += 8;
  else if (params.beds >= 3) score += 5;
  else if (params.beds >= 2) score += 2;
  if (params.regulationStatus === 'Allowed') score += 10;
  else if (params.regulationStatus === 'Restricted') score += 3;
  if (params.hasPhone) score += 10;
  return Math.min(100, Math.max(0, score));
}

function getPriorityTier(verifiedOwner: boolean, verifiedAddress: boolean, verifiedNumber: boolean): number {
  if (verifiedOwner && verifiedAddress && verifiedNumber) return 1;
  if (verifiedOwner && verifiedAddress) return 2;
  return 3;
}

// ─── Verification score breakdown ────────────────────────────────────────────
function buildVerificationScore(params: {
  hasPhone: boolean; verifiedOwner: boolean; verifiedAddress: boolean;
  hasSourceId: boolean; hasAPN: boolean;
}): { score: number; breakdown: Record<string, number> } {
  const breakdown: Record<string, number> = {};
  let score = 0;
  if (params.verifiedOwner) { breakdown.verified_owner = 25; score += 25; }
  if (params.verifiedAddress) { breakdown.verified_address = 20; score += 20; }
  if (params.hasPhone) { breakdown.has_phone = 30; score += 30; }
  if (params.hasSourceId) { breakdown.has_source_id = 15; score += 15; }
  if (params.hasAPN) { breakdown.has_apn = 10; score += 10; }
  return { score: Math.min(100, score), breakdown };
}

// ─── Transient error detection ────────────────────────────────────────────────
function isTransientError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase();
  return msg.includes('timeout') || msg.includes('network') || msg.includes('econnreset') ||
    msg.includes('econnrefused') || msg.includes('rate limit') || msg.includes('503') ||
    msg.includes('502') || msg.includes('429');
}

// ─── Row type ─────────────────────────────────────────────────────────────────
interface CsvRow {
  address?: string; Address?: string;
  contact?: string; Contact?: string; owner?: string; Owner?: string;
  phone?: string; Phone?: string; contact_phone?: string;
  city?: string; City?: string;
  state?: string; State?: string;
  zip?: string; Zip?: string; zipcode?: string;
  beds?: string | number; Beds?: string | number;
  baths?: string | number; Baths?: string | number;
  price?: string | number; Price?: string | number;
  notes?: string; Notes?: string;
  link?: string; Link?: string; url?: string; URL?: string;
  source?: string; Source?: string;
  stage?: string; Stage?: string;
  source_property_id?: string; apn?: string; APN?: string;
  [key: string]: unknown;
}

// ─── Outcome type ─────────────────────────────────────────────────────────────
type RowOutcome = 'NEW' | 'UPDATED_EXISTING' | 'DUPLICATE_IN_FILE' | 'UNCHANGED_EXISTING' | 'REVIEW_REQUIRED' | 'ERROR';

interface RowResult {
  rowIndex: number;
  outcome: RowOutcome;
  leadId?: string;
  address: string;
  matchStrategy?: string;
  matchConfidence?: number;
  errorCode?: string;
  errorMessage?: string;
  normalizationResult?: Record<string, unknown>;
  verificationScore?: number;
}

// ─── Main import handler ──────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { rows, importFilename, importedBy, importBatchId } = body as {
      rows: CsvRow[];
      importFilename: string;
      importedBy?: string;
      importBatchId: string;
    };

    if (!rows || !Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ error: 'No rows provided' }, { status: 400 });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    // ── IDEMPOTENCY CHECK ─────────────────────────────────────────────────────
    // If this exact batch was already fully committed, return the existing summary.
    // This prevents double-submission from creating duplicate prospects.
    if (importBatchId) {
      const { data: existingBatch } = await supabase
        .from('csv_import_batches')
        .select('import_batch_id, status, rows_processed, new_prospects_created, existing_prospects_enriched, duplicates_merged, phone_numbers_imported, rent_prices_found, rent_prices_unavailable, new_portfolios_created, existing_portfolios_reused, errors, rows_new, rows_updated_existing, rows_duplicate_in_file, rows_unchanged_existing, rows_review_required, rows_error')
        .eq('import_batch_id', importBatchId)
        .eq('status', 'COMPLETED')
        .limit(1)
        .single();

      if (existingBatch && !('error' in (existingBatch as object))) {
        const b = existingBatch as Record<string, unknown>;
        return NextResponse.json({
          success: true,
          idempotent: true,
          message: 'This batch was already imported. No changes made.',
          summary: {
            rowsProcessed: b.rows_processed || 0,
            newProspectsCreated: b.new_prospects_created || 0,
            existingProspectsEnriched: b.existing_prospects_enriched || 0,
            duplicatesMerged: b.duplicates_merged || 0,
            addressesVerified: 0,
            addressesNeedingReview: 0,
            phoneNumbersImported: b.phone_numbers_imported || 0,
            propertiesEnriched: 0,
            rentPricesFound: b.rent_prices_found || 0,
            rentPricesUnavailable: b.rent_prices_unavailable || 0,
            newPortfoliosCreated: b.new_portfolios_created || 0,
            existingPortfoliosReused: b.existing_portfolios_reused || 0,
            errors: b.errors || 0,
            rowsNew: b.rows_new || 0,
            rowsUpdatedExisting: b.rows_updated_existing || 0,
            rowsDuplicateInFile: b.rows_duplicate_in_file || 0,
            rowsUnchangedExisting: b.rows_unchanged_existing || 0,
            rowsReviewRequired: b.rows_review_required || 0,
            rowsError: b.rows_error || 0,
          },
        });
      }
    }

    const now = new Date().toISOString();

    // ── Summary counters ──────────────────────────────────────────────────────
    const summary = {
      rowsProcessed: 0,
      newProspectsCreated: 0,
      existingProspectsEnriched: 0,
      duplicatesMerged: 0,
      addressesVerified: 0,
      addressesNeedingReview: 0,
      phoneNumbersImported: 0,
      propertiesEnriched: 0,
      rentPricesFound: 0,
      rentPricesUnavailable: 0,
      newPortfoliosCreated: 0,
      existingPortfoliosReused: 0,
      errors: 0,
      // Per-outcome counts
      rowsNew: 0,
      rowsUpdatedExisting: 0,
      rowsDuplicateInFile: 0,
      rowsUnchangedExisting: 0,
      rowsReviewRequired: 0,
      rowsError: 0,
    };

    const statesSeen = new Set<string>();
    const rowResults: RowResult[] = [];
    const rowOutcomes: Array<Record<string, unknown>> = [];

    // ── STEP 0: Auto-create missing state portfolios BEFORE processing rows ───
    // This ensures portfolios exist even if all CSV rows match existing records.
    // New portfolios are created independently of deduplication outcome.
    const portfoliosCreatedInStep0 = new Set<string>();
    const portfoliosReusedInStep0 = new Set<string>();

    // ── STEP 1: Parse and normalize all rows ─────────────────────────────────
    interface ParsedRow {
      rowIndex: number;
      rawAddress: string;
      rawContact: string;
      rawPhone: string;
      rawCity: string;
      rawState: string;
      rawZip: string;
      rawBeds: number;
      rawBaths: number;
      rawPrice: number;
      rawNotes: string;
      rawLink: string;
      rawSource: string;
      rawStage: string;
      rawSourcePropertyId: string | null;
      rawAPN: string | null;
      normalized: NormalizedAddress;
      normalizedPhone: string | null;
      hasPhone: boolean;
      verifiedOwner: boolean;
      currentRent: number | null;
      normalizationResult: Record<string, unknown>;
    }

    const parsedRows: ParsedRow[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rawAddress = String(row.address || row.Address || '').trim();
      const rawContact = String(row.contact || row.Contact || row.owner || row.Owner || '').trim();
      const rawPhone = String(row.phone || row.Phone || row.contact_phone || '').trim();
      const rawCity = String(row.city || row.City || '').trim();
      const rawState = String(row.state || row.State || '').trim();
      const rawZip = String(row.zip || row.Zip || row.zipcode || '').trim();
      const rawBeds = parseInt(String(row.beds || row.Beds || '3')) || 3;
      const rawBaths = parseFloat(String(row.baths || row.Baths || '2')) || 2;
      const rawPrice = parseFloat(String(row.price || row.Price || '0').replace(/[^0-9.]/g, '')) || 0;
      const rawNotes = String(row.notes || row.Notes || '').trim();
      const rawLink = String(row.link || row.Link || row.url || row.URL || '').trim();
      const rawSource = String(row.source || row.Source || 'Direct').trim();

      // ── CRITICAL BUSINESS RULE: CSV import MUST NOT advance pipeline stage ──
      // CSV import may enrich owner, phone, address, and verification data,
      // but it MUST NOT assign active pipeline stages (Contacted, Interested,
      // Proposal Sent, Under Contract). Only real authorized outreach events
      // (agent call outcomes, stage transitions) may advance pipeline.
      //
      // If a CSV contains a 'stage' column, we only honor it if it maps to
      // 'New Lead' or a terminal stage ('Not a Fit', 'Live').
      // Any active pipeline stage value in the CSV is silently overridden to 'New Lead'.
      //
      // LISTING STATUS != PIPELINE STATUS:
      //   A property's external listing status (Active, Pending, Under Contract, Rented)
      //   must NEVER be mapped to TRAVLR's lead stage. These are separate concepts.
      const ACTIVE_PIPELINE_STAGES_CSV = ['Contacted', 'Interested', 'Proposal Sent', 'Under Contract'];
      const csvRawStage = String(row.stage || row.Stage || 'New Lead').trim();
      // If CSV stage is an active pipeline stage, override to 'New Lead'.
      // Source ingestion cannot advance pipeline — only real outreach events can.
      const rawStage = ACTIVE_PIPELINE_STAGES_CSV.includes(csvRawStage) ? 'New Lead' : csvRawStage;

      const rawSourcePropertyId = String(row.source_property_id || '').trim() || null;
      const rawAPN = String(row.apn || row.APN || '').trim() || null;

      if (!rawAddress || rawAddress.length < 5) continue;

      const normalized = normalizeAddress(rawAddress, rawCity, rawState, rawZip);
      const normalizedPhone = normalizePhone(rawPhone);
      const hasPhone = !!normalizedPhone;
      const verifiedOwner = rawContact.length > 1;
      const currentRent = rawPrice > 0 && rawPrice < 50000 ? rawPrice : null;

      const normalizationResult = {
        rawAddress, rawCity, rawState, rawZip,
        normalizedStreet: normalized.streetAddress,
        normalizedCity: normalized.city,
        normalizedState: normalized.state,
        normalizedZip: normalized.zipCode,
        standardizedAddress: normalized.standardizedAddress,
        fingerprint: normalized.fingerprint,
        rawPhone, normalizedPhone,
        phoneValid: hasPhone,
      };

      parsedRows.push({
        rowIndex: i, rawAddress, rawContact, rawPhone, rawCity, rawState, rawZip,
        rawBeds, rawBaths, rawPrice, rawNotes, rawLink, rawSource, rawStage,
        rawSourcePropertyId, rawAPN, normalized, normalizedPhone, hasPhone,
        verifiedOwner, currentRent, normalizationResult,
      });

      if (normalized.state) statesSeen.add(normalized.state);
    }

    // ── STEP 0 (continued): Now that parsedRows is populated, create portfolios ─
    for (const stateCode of [...new Set(parsedRows.map(r => r.normalized.state).filter(Boolean))]) {
      if (!stateCode || stateCode.length !== 2) continue;
      const stateName = STATE_NAMES[stateCode];
      if (!stateName) continue;
      const portfolioKey = stateCode.toLowerCase();
      const portfolioLabel = `${stateName} Portfolio`;
      const { data: existing } = await supabase
        .from('portfolio_registry')
        .select('id')
        .eq('state_code', stateCode)
        .limit(1);
      if (!existing || existing.length === 0) {
        const { error: portfolioError } = await supabase
          .from('portfolio_registry')
          .insert({ state_code: stateCode, state_name: stateName, portfolio_key: portfolioKey, portfolio_label: portfolioLabel, is_active: true, auto_created: true });
        if (!portfolioError) portfoliosCreatedInStep0.add(stateCode);
      } else {
        portfoliosReusedInStep0.add(stateCode);
      }
    }

    summary.newPortfoliosCreated = portfoliosCreatedInStep0.size;
    summary.existingPortfoliosReused = portfoliosReusedInStep0.size;

    // ── STEP 2: Intra-CSV deduplication ──────────────────────────────────────
    // Collapse duplicate rows within the CSV itself before any DB lookup.
    // Keep the "best" row per fingerprint: prefer non-empty phone, more complete contact, verified values.
    const csvFingerprintMap = new Map<string, ParsedRow>();
    const csvDuplicateIndices = new Set<number>();

    for (const pr of parsedRows) {
      const fp = pr.normalized.fingerprint;
      if (!fp) continue;

      if (!csvFingerprintMap.has(fp)) {
        csvFingerprintMap.set(fp, pr);
      } else {
        const existing = csvFingerprintMap.get(fp)!;
        // Merge: prefer non-empty phone, longer contact name
        const betterPhone = pr.hasPhone && !existing.hasPhone;
        const betterContact = pr.rawContact.length > existing.rawContact.length;
        const betterRent = pr.currentRent !== null && existing.currentRent === null;

        if (betterPhone || betterContact || betterRent) {
          // Merge best fields into existing
          if (betterPhone) {
            existing.normalizedPhone = pr.normalizedPhone;
            existing.hasPhone = true;
            existing.rawPhone = pr.rawPhone;
          }
          if (betterContact) {
            existing.rawContact = pr.rawContact;
            existing.verifiedOwner = pr.verifiedOwner;
          }
          if (betterRent) {
            existing.currentRent = pr.currentRent;
          }
        }
        // Mark this row as duplicate-in-file
        csvDuplicateIndices.add(pr.rowIndex);
      }
    }

    // ── STEP 3: Build dedup candidates (unique rows only) ────────────────────
    const uniqueRows = parsedRows.filter(pr => !csvDuplicateIndices.has(pr.rowIndex));

    // ── STEP 4: Bulk-fetch existing leads for dedup ───────────────────────────
    // Collect all fingerprints, source IDs, APNs for a single batch query
    const fingerprints = uniqueRows.map(r => r.normalized.fingerprint).filter(Boolean);
    const sourceIds = uniqueRows.map(r => r.rawSourcePropertyId).filter(Boolean) as string[];
    const apns = uniqueRows.map(r => r.rawAPN).filter(Boolean) as string[];

    // Fetch existing leads matching any of these identifiers
    const existingLeadsMap = new Map<string, Record<string, unknown>>();

    if (fingerprints.length > 0) {
      const { data: byFingerprint } = await supabase
        .from('leads')
        .select('id, standardized_address, dedup_fingerprint, source_property_id, apn, contact_name, contact_phone, has_phone, verified_owner, verified_number, current_monthly_rent, primary_agent_id, primary_agent_name, assigned_agents, assigned_at, assigned_by, prospect_score, enrichment_status, outreach_status, created_at, notes')
        .in('dedup_fingerprint', fingerprints);

      if (byFingerprint) {
        for (const lead of byFingerprint) {
          const fp = (lead as Record<string, unknown>).dedup_fingerprint as string;
          if (fp) existingLeadsMap.set(`fp:${fp}`, lead as Record<string, unknown>);
        }
      }
    }

    if (sourceIds.length > 0) {
      const { data: bySourceId } = await supabase
        .from('leads')
        .select('id, standardized_address, dedup_fingerprint, source_property_id, apn, contact_name, contact_phone, has_phone, verified_owner, verified_number, current_monthly_rent, primary_agent_id, primary_agent_name, assigned_agents, assigned_at, assigned_by, prospect_score, enrichment_status, outreach_status, created_at, notes')
        .in('source_property_id', sourceIds);

      if (bySourceId) {
        for (const lead of bySourceId) {
          const sid = (lead as Record<string, unknown>).source_property_id as string;
          if (sid) existingLeadsMap.set(`sid:${sid}`, lead as Record<string, unknown>);
        }
      }
    }

    if (apns.length > 0) {
      const { data: byAPN } = await supabase
        .from('leads')
        .select('id, standardized_address, dedup_fingerprint, source_property_id, apn, contact_name, contact_phone, has_phone, verified_owner, verified_number, current_monthly_rent, primary_agent_id, primary_agent_name, assigned_agents, assigned_at, assigned_by, prospect_score, enrichment_status, outreach_status, created_at, notes')
        .in('apn', apns);

      if (byAPN) {
        for (const lead of byAPN) {
          const a = (lead as Record<string, unknown>).apn as string;
          if (a) existingLeadsMap.set(`apn:${a}`, lead as Record<string, unknown>);
        }
      }
    }

    // ── STEP 5: Process each unique row ───────────────────────────────────────
    for (const pr of uniqueRows) {
      summary.rowsProcessed++;

      try {
        const { normalized, normalizedPhone, hasPhone, verifiedOwner, currentRent, normalizationResult } = pr;

        if (hasPhone) summary.phoneNumbersImported++;

        // ── 5a. Dedup lookup using hierarchy ─────────────────────────────────
        // 1. Exact source property ID
        // 2. Exact APN / parcel number
        // 3. Standardized full address (fingerprint)
        // 4. Normalized street + city + state + ZIP (fallback DB query)
        let existingLead: Record<string, unknown> | null = null;
        let matchStrategy = '';
        let matchConfidence = 0;

        if (pr.rawSourcePropertyId) {
          const found = existingLeadsMap.get(`sid:${pr.rawSourcePropertyId}`);
          if (found) { existingLead = found; matchStrategy = 'source_property_id'; matchConfidence = 100; }
        }

        if (!existingLead && pr.rawAPN) {
          const found = existingLeadsMap.get(`apn:${pr.rawAPN}`);
          if (found) { existingLead = found; matchStrategy = 'apn'; matchConfidence = 100; }
        }

        if (!existingLead && normalized.fingerprint) {
          const found = existingLeadsMap.get(`fp:${normalized.fingerprint}`);
          if (found) { existingLead = found; matchStrategy = 'standardized_address'; matchConfidence = 95; }
        }

        // Fallback: DB query by standardized_address or address ilike
        if (!existingLead && normalized.standardizedAddress) {
          const { data: fallback } = await supabase
            .from('leads')
            .select('id, standardized_address, dedup_fingerprint, source_property_id, apn, contact_name, contact_phone, has_phone, verified_owner, verified_number, current_monthly_rent, primary_agent_id, primary_agent_name, assigned_agents, assigned_at, assigned_by, prospect_score, enrichment_status, outreach_status, created_at, notes')
            .or(`standardized_address.ilike.${normalized.standardizedAddress},address.ilike.${pr.rawAddress}`)
            .limit(1);

          if (fallback && fallback.length > 0) {
            existingLead = fallback[0] as Record<string, unknown>;
            matchStrategy = 'address_ilike';
            matchConfidence = 80;
          }
        }

        // ── 5b. Revenue & score ───────────────────────────────────────────────
        const revenue = calculateTravlrRevenue(pr.rawBeds, pr.rawBaths, normalized.state, currentRent);
        const prospectScore = calculateProspectScore({
          verifiedOwner, verifiedAddress: false, verifiedNumber: hasPhone,
          isManualVerifiedImport: true, currentRent,
          projectedAnnualGross: revenue.projectedAnnualGross,
          beds: pr.rawBeds, regulationStatus: 'Unknown', hasPhone,
        });
        const priorityTier = getPriorityTier(verifiedOwner, false, hasPhone);
        const { score: verificationScore, breakdown: verificationBreakdown } = buildVerificationScore({
          hasPhone, verifiedOwner, verifiedAddress: false,
          hasSourceId: !!pr.rawSourcePropertyId, hasAPN: !!pr.rawAPN,
        });

        const portfolioKey = normalized.state ? normalized.state.toLowerCase() : null;
        const portfolioName = normalized.state ? `${STATE_NAMES[normalized.state] || normalized.state} Portfolio` : null;

        if (existingLead) {
          // ── 5c. MERGE / ENRICH existing record ────────────────────────────
          // NEVER overwrite better existing data with blank/lower-confidence CSV data
          // ALWAYS preserve: primaryAgentId, assignedAgents, assignedAt, assignedBy, history, notes, createdAt

          const existingHasPhone = !!(existingLead.has_phone || existingLead.contact_phone);
          const existingContact = String(existingLead.contact_name || '');
          const existingRent = existingLead.current_monthly_rent as number | null;

          // Determine if this row actually changes anything
          const willUpdatePhone = hasPhone && !existingHasPhone;
          const willUpdateContact = verifiedOwner && rawContact_better(pr.rawContact, existingContact);
          const willUpdateRent = currentRent !== null && (existingRent === null || existingRent === 0);
          const willUpdateNotes = !!pr.rawNotes && !existingLead.notes;
          const hasChanges = willUpdatePhone || willUpdateContact || willUpdateRent || willUpdateNotes;

          // Always mark the existing record as having a CSV source, even if no field changes
          // This ensures the source provenance is tracked for cross-source dedup
          const existingIngestionSource = existingLead.ingestion_source as string | null;
          const existingSourceTypes = (existingLead.source_types as string[]) || [];
          const alreadyHasCSVSource = existingIngestionSource === 'MANUAL_CSV' || existingSourceTypes.includes('MANUAL_CSV');
          const newSourceTypes = alreadyHasCSVSource
            ? existingSourceTypes
            : [...new Set([...existingSourceTypes, 'MANUAL_CSV'])];
          const newIngestionSource = existingIngestionSource === 'LINK_SYNC' ?'MULTI_SOURCE' : (existingIngestionSource ||'MANUAL_CSV');
          const isMultiSource = newSourceTypes.length > 1;

          if (!hasChanges) {
            // UNCHANGED_EXISTING — no new information
            const result: RowResult = {
              rowIndex: pr.rowIndex, outcome: 'UNCHANGED_EXISTING',
              leadId: existingLead.id as string, address: pr.rawAddress,
              matchStrategy, matchConfidence, verificationScore,
              normalizationResult,
            };
            rowResults.push(result);
            summary.rowsUnchangedExisting++;
            rowOutcomes.push(buildRowOutcome(pr, result, importBatchId));
            continue;
          }

          const updateData: Record<string, unknown> = {
            updated_at: now,
            last_imported_at: now,
            last_import_batch_id: importBatchId,
            import_batch_id: importBatchId,
            import_filename: importFilename,
            is_verified_lead: true,
            priority_tier: priorityTier,
            match_strategy: matchStrategy,
            match_confidence: matchConfidence,
            dedup_fingerprint: normalized.fingerprint || null,
          };

          // Only update contact if new data is strictly better (longer, non-empty)
          if (willUpdateContact) {
            updateData.contact_name = pr.rawContact;
            updateData.owner_name = pr.rawContact;
            updateData.verified_owner = true;
            updateData.verified_owner_source = 'MANUAL_CSV';
            updateData.verified_owner_method = 'MANUAL_RESEARCH';
            updateData.owner_verification_source = 'Manual Research';
            updateData.owner_verified_at = now;
            updateData.owner_source = 'MANUAL_CSV';
          }
          // Only add phone if existing record has none
          if (willUpdatePhone) {
            updateData.contact_phone = normalizedPhone;
            updateData.has_phone = true;
            updateData.verified_number = true;
            updateData.verified_number_source = 'MANUAL_CSV';
            updateData.verified_number_method = 'MANUAL_RESEARCH';
            updateData.verified_number_at = now;
            updateData.phone_verification_source = 'Manual Research';
            updateData.phone_verified_at = now;
            updateData.phone_source = 'MANUAL_CSV';
          }
          // Luxury classification — if CSV price qualifies, mark luxury (never downgrade)
          const csvLuxury = isLuxuryProperty(normalized.state, currentRent);
          if (csvLuxury && !existingLead.luxury) {
            updateData.luxury = true;
            updateData.luxury_source_field = 'SOURCE_CONFIGURATION';
          }
          // Verified owner provenance
          if (willUpdateContact) {
            updateData.verified_owner_source = 'MANUAL_CSV';
            updateData.verified_owner_method = 'MANUAL_RESEARCH';
            updateData.owner_source = 'MANUAL_CSV';
          }
          // Only add rent if existing record has none
          if (willUpdateRent) {
            updateData.current_monthly_rent = currentRent;
            updateData.current_asking_rent = currentRent;
            updateData.rent_verification_status = 'FOUND';
            updateData.rent_source = 'Manual Research';
            updateData.rent_retrieved_at = now;
          }
          if (willUpdateNotes) {
            updateData.notes = pr.rawNotes;
          }
          // Update score/revenue
          updateData.prospect_score = Math.max(prospectScore, (existingLead.prospect_score as number) || 0);
          updateData.estimated_adr = revenue.projectedADR;
          updateData.estimated_occupancy = revenue.projectedOccupancy;
          updateData.estimated_gross_monthly = revenue.projectedMonthlyGross;
          updateData.estimated_net_monthly = revenue.projectedOwnerNet;
          updateData.enrichment_status = 'PENDING';
          updateData.calculation_version = revenue.calculationVersion;
          updateData.calculated_at = revenue.calculatedAt;
          updateData.verification_score = verificationScore;
          // Source provenance — always update to reflect CSV source
          updateData.ingestion_source = newIngestionSource;
          updateData.source_types = newSourceTypes;
          updateData.is_multi_source = isMultiSource;
          updateData.last_seen_at = now;

          // DO NOT touch: primary_agent_id, assigned_agents, assigned_at, assigned_by, created_at

          const { error: updateError } = await supabase
            .from('leads')
            .update(updateData)
            .eq('id', existingLead.id as string);

          if (updateError) {
            const result: RowResult = {
              rowIndex: pr.rowIndex, outcome: 'ERROR',
              address: pr.rawAddress, matchStrategy, matchConfidence,
              errorCode: 'DB_UPDATE_ERROR', errorMessage: updateError.message,
              normalizationResult, verificationScore,
            };
            rowResults.push(result);
            summary.errors++;
            summary.rowsError++;
            rowOutcomes.push(buildRowOutcome(pr, result, importBatchId));

            // Log enrichment error
            await logEnrichmentError(supabase, {
              leadId: existingLead.id as string,
              batchId: importBatchId,
              stage: 'import_merge',
              errorCode: 'DB_UPDATE_ERROR',
              errorMessage: updateError.message,
              normalizationResult,
              matchStrategy, matchConfidence,
              verificationScore, verificationBreakdown,
              isTransient: false,
            });
          } else {
            summary.existingProspectsEnriched++;
            summary.duplicatesMerged++;
            summary.rowsUpdatedExisting++;
            if (hasPhone) summary.phoneNumbersImported++;
            if (currentRent) summary.rentPricesFound++;
            else summary.rentPricesUnavailable++;

            const result: RowResult = {
              rowIndex: pr.rowIndex, outcome: 'UPDATED_EXISTING',
              leadId: existingLead.id as string, address: pr.rawAddress,
              matchStrategy, matchConfidence, verificationScore, normalizationResult,
            };
            rowResults.push(result);
            rowOutcomes.push(buildRowOutcome(pr, result, importBatchId));

            // Log activity
            await supabase.from('lead_activity_log').insert({
              lead_id: existingLead.id as string,
              activity_type: 'ENRICHMENT',
              description: `Prospect enriched from CSV import (batch: ${importBatchId}). Match strategy: ${matchStrategy}.`,
              metadata: { importBatchId, importFilename, matchStrategy, matchConfidence, fieldsUpdated: Object.keys(updateData) },
              created_at: now,
            }).catch(() => {});
          }
        } else {
          // ── 5d. CREATE new prospect ───────────────────────────────────────
          const newId = `lead-import-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

          const leadData: Record<string, unknown> = {
            id: newId,
            address: normalized.streetAddress || pr.rawAddress,
            city: normalized.city,
            state: normalized.state,
            zip: normalized.zipCode,
            beds: pr.rawBeds,
            baths: pr.rawBaths,
            price: currentRent || 0,
            price_type: 'rent',
            source: pr.rawSource,
            stage: pr.rawStage,
            notes: pr.rawNotes,
            listing_url: pr.rawLink || null,
            contact_name: pr.rawContact || null,
            contact_phone: normalizedPhone || (pr.rawPhone || null),
            regulation_status: 'Unknown',
            prospect_score: prospectScore,
            days_on_market: 0,
            last_checked: now.split('T')[0],
            tags: ['MANUAL_VERIFIED_IMPORT'],
            estimated_adr: revenue.projectedADR,
            estimated_occupancy: revenue.projectedOccupancy,
            estimated_gross_monthly: revenue.projectedMonthlyGross,
            estimated_net_monthly: revenue.projectedOwnerNet,
            photos: [],
            created_at: now,
            updated_at: now,
            // Import provenance
            original_address: pr.rawAddress,
            original_contact: pr.rawContact || null,
            original_phone: pr.rawPhone || null,
            import_batch_id: importBatchId,
            import_filename: importFilename,
            imported_at: now,
            imported_by: importedBy || null,
            last_imported_at: now,
            last_import_batch_id: importBatchId,
            record_source: 'Manual Zillow Research',
            source_type: 'MANUAL_VERIFIED_IMPORT',
            // Source provenance — unified ingestion tracking
            ingestion_source: 'MANUAL_CSV',
            source_types: ['MANUAL_CSV'],
            is_multi_source: false,
            first_seen_at: now,
            last_seen_at: now,
            // Address
            standardized_address: normalized.standardizedAddress,
            street_address: normalized.streetAddress,
            dedup_fingerprint: normalized.fingerprint || null,
            source_property_id: pr.rawSourcePropertyId,
            apn: pr.rawAPN,
            match_strategy: matchStrategy || null,
            match_confidence: matchConfidence,
            // Verification
            verified_owner: verifiedOwner,
            verified_number: hasPhone,
            has_phone: hasPhone,
            owner_name: pr.rawContact || null,
            owner_verification_source: verifiedOwner ? 'Manual Research' : null,
            owner_verified_at: verifiedOwner ? now : null,
            phone_verification_source: hasPhone ? 'Manual Research' : null,
            phone_verified_at: hasPhone ? now : null,
            address_verification_source: null,
            address_verified_at: null,
            verification_score: verificationScore,
            // Enrichment
            enrichment_status: 'PENDING',
            enrichment_retry_count: 0,
            rent_verification_status: currentRent ? 'FOUND' : 'NOT_FOUND',
            current_monthly_rent: currentRent,
            current_asking_rent: currentRent,
            rent_source: currentRent ? 'Manual Research' : null,
            rent_retrieved_at: currentRent ? now : null,
            listing_status: null,
            outreach_status: 'NOT_CONTACTED',
            // Agent assignment — null for new leads
            primary_agent_id: null,
            primary_agent_name: null,
            assigned_agents: [],
            // Portfolio
            portfolio_id: portfolioKey,
            portfolio_name: portfolioName,
            priority_tier: priorityTier,
            is_verified_lead: true,
            is_synthetic: false,
            verification_status: 'PENDING_VERIFICATION',
            verification_review_required: true,
            // Revenue
            calculation_version: revenue.calculationVersion,
            calculated_at: revenue.calculatedAt,
            // Source provenance
            address_source: 'MANUAL_IMPORT',
            owner_source: verifiedOwner ? 'MANUAL_IMPORT' : null,
            phone_source: hasPhone ? 'MANUAL_IMPORT' : null,
            rent_price_source: currentRent ? 'MANUAL_IMPORT' : null,
            rent_price_retrieved_at: currentRent ? now : null,
            // Luxury classification — derived from state + price
            luxury: isLuxuryProperty(normalized.state, currentRent),
            luxury_source_field: 'SOURCE_CONFIGURATION',
            // Verified fields with provenance
            verified_owner_source: verifiedOwner ? 'MANUAL_CSV' : null,
            verified_owner_method: verifiedOwner ? 'MANUAL_RESEARCH' : null,
            verified_number_source: hasPhone ? 'MANUAL_CSV' : null,
            verified_number_method: hasPhone ? 'MANUAL_RESEARCH' : null,
            verified_number_at: hasPhone ? now : null,
            // Fully verified: owner + address + number (address not yet verified at import time)
            fully_verified: false, // will be derived after address verification
          };

          const { data: inserted, error: insertError } = await supabase
            .from('leads')
            .insert(leadData)
            .select('id')
            .single();

          if (insertError) {
            const transient = isTransientError(insertError);
            const result: RowResult = {
              rowIndex: pr.rowIndex, outcome: 'ERROR',
              address: pr.rawAddress,
              errorCode: transient ? 'TRANSIENT_DB_ERROR' : 'DB_INSERT_ERROR',
              errorMessage: insertError.message,
              normalizationResult, verificationScore,
            };
            rowResults.push(result);
            summary.errors++;
            summary.rowsError++;
            rowOutcomes.push(buildRowOutcome(pr, result, importBatchId));

            // Log enrichment error
            await logEnrichmentError(supabase, {
              leadId: newId,
              batchId: importBatchId,
              stage: 'import_insert',
              errorCode: transient ? 'TRANSIENT_DB_ERROR' : 'DB_INSERT_ERROR',
              errorMessage: insertError.message,
              normalizationResult,
              matchStrategy: '', matchConfidence: 0,
              verificationScore, verificationBreakdown,
              isTransient: transient,
            });
          } else if (inserted) {
            summary.newProspectsCreated++;
            summary.rowsNew++;
            summary.addressesNeedingReview++;
            if (currentRent) summary.rentPricesFound++;
            else summary.rentPricesUnavailable++;

            const result: RowResult = {
              rowIndex: pr.rowIndex, outcome: 'NEW',
              leadId: inserted.id, address: pr.rawAddress,
              verificationScore, normalizationResult,
            };
            rowResults.push(result);
            rowOutcomes.push(buildRowOutcome(pr, result, importBatchId));
          }
        }
      } catch (rowErr) {
        const transient = isTransientError(rowErr);
        const result: RowResult = {
          rowIndex: pr.rowIndex, outcome: 'ERROR',
          address: pr.rawAddress,
          errorCode: transient ? 'TRANSIENT_ERROR' : 'UNEXPECTED_ERROR',
          errorMessage: rowErr instanceof Error ? rowErr.message : 'Unknown error',
          normalizationResult: pr.normalizationResult,
        };
        rowResults.push(result);
        summary.errors++;
        summary.rowsError++;
        rowOutcomes.push(buildRowOutcome(pr, result, importBatchId));

        // Log enrichment error
        await logEnrichmentError(supabase, {
          leadId: `unknown-${pr.rowIndex}`,
          batchId: importBatchId,
          stage: 'import_row',
          errorCode: transient ? 'TRANSIENT_ERROR' : 'UNEXPECTED_ERROR',
          errorMessage: rowErr instanceof Error ? rowErr.message : 'Unknown error',
          normalizationResult: pr.normalizationResult,
          matchStrategy: '', matchConfidence: 0,
          verificationScore: 0, verificationBreakdown: {},
          isTransient: transient,
        });
      }
    }

    // ── STEP 6: Record intra-CSV duplicates ───────────────────────────────────
    for (const rowIndex of csvDuplicateIndices) {
      const pr = parsedRows.find(r => r.rowIndex === rowIndex);
      if (!pr) continue;
      summary.rowsProcessed++;
      summary.rowsDuplicateInFile++;
      const result: RowResult = {
        rowIndex, outcome: 'DUPLICATE_IN_FILE',
        address: pr.rawAddress,
        normalizationResult: pr.normalizationResult,
      };
      rowResults.push(result);
      rowOutcomes.push(buildRowOutcome(pr, result, importBatchId));
    }

    // ── STEP 7: Persist per-row outcomes ─────────────────────────────────────
    if (rowOutcomes.length > 0) {
      // Insert in chunks of 100
      for (let i = 0; i < rowOutcomes.length; i += 100) {
        await supabase.from('csv_import_row_outcomes').insert(rowOutcomes.slice(i, i + 100)).catch(() => {});
      }
    }

    // ── STEP 8: Auto-create missing state portfolios ──────────────────────────
    // NOTE: Portfolio creation now happens in STEP 0 above.
    // This step is kept only to update summary counts for any states
    // discovered during row processing that weren't in the initial parse.
    for (const stateCode of statesSeen) {
      if (!stateCode || stateCode.length !== 2) continue;
      const stateName = STATE_NAMES[stateCode];
      if (!stateName) continue;
      if (portfoliosCreatedInStep0.has(stateCode) || portfoliosReusedInStep0.has(stateCode)) continue;
      const portfolioKey = stateCode.toLowerCase();
      const portfolioLabel = `${stateName} Portfolio`;
      const { data: existing } = await supabase
        .from('portfolio_registry')
        .select('id')
        .eq('state_code', stateCode)
        .limit(1);
      if (!existing || existing.length === 0) {
        const { error: portfolioError } = await supabase
          .from('portfolio_registry')
          .insert({ state_code: stateCode, state_name: stateName, portfolio_key: portfolioKey, portfolio_label: portfolioLabel, is_active: true, auto_created: true });
        if (!portfolioError) summary.newPortfoliosCreated++;
      } else {
        summary.existingPortfoliosReused++;
      }
    }

    // ── STEP 9: Save import batch summary ────────────────────────────────────
    await supabase.from('csv_import_batches').upsert({
      import_batch_id: importBatchId,
      import_filename: importFilename,
      imported_at: now,
      imported_by: importedBy || null,
      record_source: 'Manual Zillow Research',
      source_type: 'MANUAL_VERIFIED_IMPORT',
      rows_processed: summary.rowsProcessed,
      new_prospects_created: summary.newProspectsCreated,
      existing_prospects_enriched: summary.existingProspectsEnriched,
      duplicates_merged: summary.duplicatesMerged,
      addresses_verified: summary.addressesVerified,
      addresses_needing_review: summary.addressesNeedingReview,
      phone_numbers_imported: summary.phoneNumbersImported,
      properties_enriched: summary.propertiesEnriched,
      rent_prices_found: summary.rentPricesFound,
      rent_prices_unavailable: summary.rentPricesUnavailable,
      new_portfolios_created: summary.newPortfoliosCreated,
      existing_portfolios_reused: summary.existingPortfoliosReused,
      errors: summary.errors,
      rows_new: summary.rowsNew,
      rows_updated_existing: summary.rowsUpdatedExisting,
      rows_duplicate_in_file: summary.rowsDuplicateInFile,
      rows_unchanged_existing: summary.rowsUnchangedExisting,
      rows_review_required: summary.rowsReviewRequired,
      rows_error: summary.rowsError,
      status: 'COMPLETED',
    }, { onConflict: 'import_batch_id' });

    // ── STEP 10: Emit activity events for Dashboard Recent Activity ───────────
    const activityMessages: string[] = [];
    if (summary.newProspectsCreated > 0) {
      activityMessages.push(`CSV import completed — ${summary.newProspectsCreated} new prospect${summary.newProspectsCreated !== 1 ? 's' : ''} created.`);
    }
    if (summary.existingProspectsEnriched > 0) {
      activityMessages.push(`${summary.existingProspectsEnriched} existing prospect${summary.existingProspectsEnriched !== 1 ? 's' : ''} enriched from CSV import.`);
    }
    if (summary.phoneNumbersImported > 0) {
      activityMessages.push(`${summary.phoneNumbersImported} prospect${summary.phoneNumbersImported !== 1 ? 's' : ''} gained verified phone numbers.`);
    }
    if (summary.newPortfoliosCreated > 0) {
      activityMessages.push(`${summary.newPortfoliosCreated} new state portfolio${summary.newPortfoliosCreated !== 1 ? 's' : ''} created from CSV import.`);
    }

    for (const msg of activityMessages) {
      await supabase.from('activity_events').insert({
        event_type: 'CSV_IMPORT',
        description: msg,
        metadata: {
          importBatchId,
          importFilename,
          newProspects: summary.newProspectsCreated,
          enriched: summary.existingProspectsEnriched,
          phoneNumbers: summary.phoneNumbersImported,
          newPortfolios: summary.newPortfoliosCreated,
        },
        created_at: now,
      }).catch(() => {});
    }

    // ── STEP 11: Backfill is_high_priority for newly created/updated leads ────
    // Run async — do not block the response
    const newAndUpdatedIds = rowResults
      .filter(r => r.outcome === 'NEW' || r.outcome === 'UPDATED_EXISTING')
      .map(r => r.leadId)
      .filter(Boolean) as string[];

    if (newAndUpdatedIds.length > 0) {
      supabase
        .from('leads')
        .update({ is_high_priority: true, updated_at: now })
        .in('id', newAndUpdatedIds)
        .eq('verified_owner', true)
        .eq('verified_number', true)
        .not('verified_address', 'is', null)
        .neq('verified_address', '')
        .not('stage', 'in', '("Not a Fit","Archived","Closed","Disqualified")')
        .catch(() => {});
    }

    return NextResponse.json({ success: true, summary, results: rowResults });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Import failed' },
      { status: 500 }
    );
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Returns true if newContact is strictly better than existingContact */
function rawContact_better(newContact: string, existingContact: string): boolean {
  if (!newContact || newContact.length <= 1) return false;
  if (!existingContact || existingContact.length <= 1) return true;
  // Prefer longer, more complete name
  return newContact.length > existingContact.length;
}

function buildRowOutcome(pr: { rowIndex: number; rawAddress: string; rawContact: string; rawPhone: string; rawState: string; normalized: NormalizedAddress; normalizedPhone: string | null; hasPhone: boolean; verifiedOwner: boolean; normalizationResult: Record<string, unknown> }, result: RowResult, importBatchId: string): Record<string, unknown> {
  return {
    import_batch_id: importBatchId,
    row_index: pr.rowIndex,
    raw_address: pr.rawAddress,
    raw_contact: pr.rawContact,
    raw_phone: pr.rawPhone,
    raw_state: pr.rawState,
    normalized_address: pr.normalized.standardizedAddress,
    normalized_phone: pr.normalizedPhone,
    normalization_result: pr.normalizationResult,
    match_strategy: result.matchStrategy || null,
    match_found: !!result.leadId && result.outcome !== 'NEW',
    matched_lead_id: result.outcome !== 'NEW' ? result.leadId : null,
    match_confidence: result.matchConfidence || 0,
    outcome: result.outcome,
    outcome_lead_id: result.leadId || null,
    outcome_detail: result.errorMessage || null,
    verification_score: result.verificationScore || 0,
    verified_owner: pr.verifiedOwner,
    verified_number: pr.hasPhone,
    verified_address: false,
    error_code: result.errorCode || null,
    error_message: result.errorMessage || null,
  };
}

async function logEnrichmentError(
  supabase: ReturnType<typeof createClient>,
  params: {
    leadId: string; batchId: string; stage: string;
    errorCode: string; errorMessage: string;
    normalizationResult: Record<string, unknown>;
    matchStrategy: string; matchConfidence: number;
    verificationScore: number; verificationBreakdown: Record<string, number>;
    isTransient: boolean;
  }
) {
  try {
    await supabase.from('enrichment_error_logs').insert({
      lead_id: params.leadId,
      batch_id: params.batchId,
      stage: params.stage,
      error_code: params.errorCode,
      error_message: params.errorMessage,
      normalization_result: params.normalizationResult,
      normalized_address: (params.normalizationResult.standardizedAddress as string) || null,
      raw_address: (params.normalizationResult.rawAddress as string) || null,
      match_strategy: params.matchStrategy || null,
      match_found: params.matchConfidence > 0,
      match_confidence: params.matchConfidence,
      verification_score: params.verificationScore,
      verification_score_breakdown: params.verificationBreakdown,
      is_transient: params.isTransient,
      resolved: false,
    });
  } catch {
    // Non-blocking — never fail the import because of error logging
  }
}
