import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// ─── Constants ────────────────────────────────────────────────────────────────
const SOURCE_TYPE = 'MANUAL_RESEARCH_CSV';
const SOURCE_NAME = 'ZILLOW_LEADS_09_2026';
const RESEARCH_SOURCE = 'TruePeopleSearch';

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

// ─── Types ────────────────────────────────────────────────────────────────────
export type TpsRowOutcome =
  | 'NEW' |'UPDATED_EXISTING' |'UNCHANGED_EXISTING' |'DUPLICATE_IN_CSV' |'REVIEW_REQUIRED' |'ERROR';

export interface TpsRowResult {
  rowIndex: number;
  outcome: TpsRowOutcome;
  leadId?: string;
  contact: string;
  address: string;
  state: string;
  phones: string[];
  matchStrategy?: string;
  errorCode?: string;
  errorMessage?: string;
  reviewReason?: string;
}

export interface TpsImportSummary {
  importFile: string;
  sourceRows: number;
  valid: number;
  newLeads: number;
  updatedExisting: number;
  unchangedExisting: number;
  duplicateInCsv: number;
  reviewRequired: number;
  errors: number;
  phonesStored: number;
  newlyPhoneAvailable: number;
  newlyFullyVerified: number;
  importBatchId: string;
  rowResults: TpsRowResult[];
  reviewRows: TpsRowResult[];
}

// ─── Address parsing ──────────────────────────────────────────────────────────
/**
 * Parse embedded address like "7730 E Gold Dust Ave Scottsdale, AZ 85258"
 * Returns { street, city, state, zip }
 */
function parseEmbeddedAddress(raw: string): {
  street: string; city: string; state: string; zip: string;
} {
  if (!raw) return { street: '', city: '', state: '', zip: '' };

  // Pattern: "STREET, CITY, ST ZIP" or "STREET CITY, ST ZIP"
  // Try: last token is ZIP (5 digits), before it is state (2 letters), before comma is city
  const zipMatch = raw.match(/\b(\d{5})(?:-\d{4})?\s*$/);
  const zip = zipMatch ? zipMatch[1] : '';
  let remainder = zip ? raw.slice(0, raw.lastIndexOf(zipMatch![0])).trim() : raw;

  // Remove trailing comma
  remainder = remainder.replace(/,\s*$/, '').trim();

  // State: last 2-letter word
  const stateMatch = remainder.match(/\b([A-Z]{2})\s*$/);
  const state = stateMatch ? stateMatch[1] : '';
  if (state) {
    remainder = remainder.slice(0, remainder.lastIndexOf(stateMatch![0])).trim().replace(/,\s*$/, '').trim();
  }

  // City: after last comma
  const lastComma = remainder.lastIndexOf(',');
  let city = '';
  let street = remainder;
  if (lastComma >= 0) {
    city = remainder.slice(lastComma + 1).trim();
    street = remainder.slice(0, lastComma).trim();
  } else {
    // No comma — try to split by known city patterns (heuristic: last 1-2 words are city)
    // For addresses like "7730 E Gold Dust Ave Scottsdale" — city is last word
    const parts = remainder.split(/\s+/);
    if (parts.length > 3) {
      city = parts[parts.length - 1];
      street = parts.slice(0, parts.length - 1).join(' ');
    }
  }

  return { street: street.trim(), city: city.trim(), state: state.trim(), zip: zip.trim() };
}

function normalizeStateCode(state: string): string {
  if (!state) return '';
  const trimmed = state.trim();
  if (trimmed.length === 2) return trimmed.toUpperCase();
  return STATE_ABBR_MAP[trimmed.toLowerCase()] || trimmed.toUpperCase();
}

function normalizeStreet(raw: string): string {
  if (!raw) return '';
  let street = raw.trim().replace(/[.,]+$/, '');
  const parts = street.split(/\s+/);
  let normalized = parts.map((p, i) => {
    const lower = p.toLowerCase().replace(/[.,]/g, '');
    if (i > 0 && STREET_SUFFIX_MAP[lower]) return STREET_SUFFIX_MAP[lower];
    return p;
  });
  return normalized.join(' ');
}

function buildFingerprint(street: string, city: string, state: string, zip: string): string {
  return [
    street.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim(),
    city.toLowerCase().trim(),
    state.toLowerCase().trim(),
    zip.trim(),
  ].filter(Boolean).join('|');
}

// ─── Phone parsing ────────────────────────────────────────────────────────────
/**
 * Parse a Phones_Found cell that may contain multiple phones separated by " / "
 * Returns array of E.164 normalized phones (valid only).
 */
function parsePhonesFound(raw: string): { normalized: string; rawPhone: string }[] {
  if (!raw || raw.trim() === '') return [];

  // Split on " / " or "/" or "," or ";" separators
  const parts = raw.split(/\s*[\/,;]\s*/);
  const results: { normalized: string; rawPhone: string }[] = [];
  const seen = new Set<string>();

  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const digits = trimmed.replace(/\D/g, '');
    let normalized: string | null = null;
    if (digits.length === 10) normalized = `+1${digits}`;
    else if (digits.length === 11 && digits[0] === '1') normalized = `+${digits}`;
    // Reject invalid lengths
    if (!normalized) continue;
    // Reject obviously fake numbers
    if (/^(\d)\1{9,}$/.test(digits.slice(-10))) continue;
    if (!seen.has(normalized)) {
      seen.add(normalized);
      results.push({ normalized, rawPhone: trimmed });
    }
  }

  return results;
}

// ─── Revenue calculation ──────────────────────────────────────────────────────
function calculateRevenue(beds: number, state: string) {
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
  const projectedManagementRevenue = Math.round(projectedAnnualGross * 0.20);
  const projectedOwnerGross = projectedAnnualGross - projectedManagementRevenue;
  const estimatedOperatingCosts = Math.round(projectedAnnualGross * 0.15);
  const projectedOwnerNet = projectedOwnerGross - estimatedOperatingCosts;
  return { projectedADR, projectedOccupancy: Math.round(projectedOccupancy * 100), projectedMonthlyGross, projectedAnnualGross, projectedManagementRevenue, projectedOwnerNet };
}

// ─── Prospect score ───────────────────────────────────────────────────────────
function calculateScore(params: {
  verifiedOwner: boolean; hasPhone: boolean; phoneCount: number;
  projectedAnnualGross: number; state: string;
}): number {
  let score = 0;
  if (params.hasPhone) score += 50;
  if (params.phoneCount > 1) score += 5; // bonus for multiple phones
  if (params.verifiedOwner) score += 25;
  // Address is manually researched — treat as verified
  score += 20;
  if (params.projectedAnnualGross > 100000) score += 20;
  else if (params.projectedAnnualGross > 60000) score += 12;
  else if (params.projectedAnnualGross > 40000) score += 6;
  return Math.min(100, Math.max(0, score));
}

// ─── Main handler ─────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      rows,
      importFilename,
      importedBy,
      importBatchId,
      previewOnly = false,
    } = body as {
      rows: Record<string, string>[];
      importFilename: string;
      importedBy?: string;
      importBatchId: string;
      previewOnly?: boolean;
    };

    if (!rows || !Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ error: 'No rows provided' }, { status: 400 });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    // ── Idempotency check ─────────────────────────────────────────────────────
    if (!previewOnly && importBatchId) {
      const { data: existingBatch } = await supabase
        .from('csv_import_batches')
        .select('import_batch_id, status, rows_processed, new_prospects_created, existing_prospects_enriched, rows_new, rows_updated_existing, rows_duplicate_in_file, rows_unchanged_existing, rows_review_required, rows_error, phone_numbers_imported')
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
            importFile: importFilename,
            sourceRows: (b.rows_processed as number) || 0,
            newLeads: (b.rows_new as number) || 0,
            updatedExisting: (b.rows_updated_existing as number) || 0,
            unchangedExisting: (b.rows_unchanged_existing as number) || 0,
            duplicateInCsv: (b.rows_duplicate_in_file as number) || 0,
            reviewRequired: (b.rows_review_required as number) || 0,
            errors: (b.rows_error as number) || 0,
            phonesStored: (b.phone_numbers_imported as number) || 0,
            importBatchId,
          },
        });
      }
    }

    const now = new Date().toISOString();

    // ── STEP 1: Parse and normalize all rows ─────────────────────────────────
    interface ParsedTpsRow {
      rowIndex: number;
      rawState: string;
      rawContact: string;
      rawAddress: string;
      tpsNameUrl: string;
      tpsAddressUrl: string;
      rawPhonesFound: string;
      // Parsed
      parsedStreet: string;
      parsedCity: string;
      parsedState: string;
      parsedZip: string;
      standardizedAddress: string;
      fingerprint: string;
      phones: { normalized: string; rawPhone: string }[];
      primaryPhone: string | null;
      hasPhone: boolean;
      verifiedOwner: boolean;
      contactCleaned: string;
      // Flags
      missingState: boolean;
      invalidState: boolean;
      ambiguousAddress: boolean;
    }

    const parsedRows: ParsedTpsRow[] = [];
    const skippedRows: TpsRowResult[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];

      // Handle BOM in first column key
      const stateKey = Object.keys(row).find(k => k.replace(/^\uFEFF/, '').trim().toLowerCase() === 'state') || 'State';
      const rawState = String(row[stateKey] || row['State'] || row['state'] || '').trim();
      const rawContact = String(row['Contact'] || row['contact'] || '').trim();
      const rawAddress = String(row['Address'] || row['address'] || '').trim();
      const tpsNameUrl = String(row['TruePeopleSearch_Name'] || row['truepeoplesearch_name'] || '').trim();
      const tpsAddressUrl = String(row['TruePeopleSearch_Address'] || row['truepeoplesearch_address'] || '').trim();
      // Handle both CSV formats: Phones_Found (TPS CSV) and Phone (simple CSV)
      const rawPhonesFound = String(
        row['Phones_Found'] || row['phones_found'] ||
        row['Phone'] || row['phone'] || ''
      ).trim();

      // Validate required fields
      if (!rawAddress || rawAddress.length < 5) {
        skippedRows.push({
          rowIndex: i, outcome: 'ERROR', contact: rawContact, address: rawAddress,
          state: rawState, phones: [], errorCode: 'MISSING_ADDRESS', errorMessage: 'Address is empty or too short',
        });
        continue;
      }

      // Parse embedded address (city/state/zip may be inside the address field)
      const parsed = parseEmbeddedAddress(rawAddress);

      // Determine state: prefer explicit State column, fallback to parsed
      let stateCode = normalizeStateCode(rawState || parsed.state);
      const missingState = !stateCode;
      const invalidState = !!stateCode && !STATE_NAMES[stateCode];

      if (!stateCode && parsed.state) stateCode = normalizeStateCode(parsed.state);

      let street = normalizeStreet(parsed.street || rawAddress);
      let city = parsed.city;
      const zip = parsed.zip;
      const standardizedAddress = [street, city, stateCode, zip].filter(Boolean).join(', ');
      const fingerprint = buildFingerprint(street, city, stateCode, zip);

      // Parse phones
      const phones = parsePhonesFound(rawPhonesFound);
      const primaryPhone = phones.length > 0 ? phones[0].normalized : null;
      const hasPhone = phones.length > 0;

      // Clean contact name (remove parenthetical aliases like "Al (Almahdi Amtoun)")
      const contactCleaned = rawContact.replace(/\s*\(.*?\)\s*/g, '').trim() || rawContact;
      const verifiedOwner = contactCleaned.length > 1;

      // Flag ambiguous address
      const ambiguousAddress = !street || street.length < 3 || !city;

      parsedRows.push({
        rowIndex: i, rawState, rawContact, rawAddress, tpsNameUrl, tpsAddressUrl,
        rawPhonesFound, parsedStreet: street, parsedCity: city, parsedState: stateCode,
        parsedZip: zip, standardizedAddress, fingerprint, phones, primaryPhone,
        hasPhone, verifiedOwner, contactCleaned, missingState, invalidState, ambiguousAddress,
      });
    }

    // ── STEP 2: Intra-CSV deduplication ──────────────────────────────────────
    const csvFingerprintMap = new Map<string, ParsedTpsRow>();
    const csvDuplicateIndices = new Set<number>();

    for (const pr of parsedRows) {
      const fp = pr.fingerprint;
      if (!fp) continue;
      if (!csvFingerprintMap.has(fp)) {
        csvFingerprintMap.set(fp, pr);
      } else {
        const existing = csvFingerprintMap.get(fp)!;
        // Merge: prefer more phones, longer contact
        if (pr.phones.length > existing.phones.length) {
          // Merge phones into existing
          const existingPhoneSet = new Set(existing.phones.map(p => p.normalized));
          for (const ph of pr.phones) {
            if (!existingPhoneSet.has(ph.normalized)) {
              existing.phones.push(ph);
              existingPhoneSet.add(ph.normalized);
            }
          }
          if (!existing.primaryPhone && pr.primaryPhone) {
            existing.primaryPhone = pr.primaryPhone;
            existing.hasPhone = true;
          }
        }
        if (pr.contactCleaned.length > existing.contactCleaned.length) {
          existing.contactCleaned = pr.contactCleaned;
          existing.rawContact = pr.rawContact;
          existing.verifiedOwner = pr.verifiedOwner;
        }
        if (!existing.tpsNameUrl && pr.tpsNameUrl) existing.tpsNameUrl = pr.tpsNameUrl;
        if (!existing.tpsAddressUrl && pr.tpsAddressUrl) existing.tpsAddressUrl = pr.tpsAddressUrl;
        csvDuplicateIndices.add(pr.rowIndex);
      }
    }

    const uniqueRows = parsedRows.filter(pr => !csvDuplicateIndices.has(pr.rowIndex));

    // ── STEP 3: Bulk-fetch existing leads ────────────────────────────────────
    const fingerprints = uniqueRows.map(r => r.fingerprint).filter(Boolean);
    const existingLeadsMap = new Map<string, Record<string, unknown>>();

    if (fingerprints.length > 0) {
      // Fetch in chunks of 500
      for (let i = 0; i < fingerprints.length; i += 500) {
        const chunk = fingerprints.slice(i, i + 500);
        const { data: byFp } = await supabase
          .from('leads')
          .select('id, dedup_fingerprint, standardized_address, address, contact_name, contact_phone, has_phone, verified_owner, verified_number, verified_address, prospect_score, stage, primary_agent_id, created_at, tps_name_url, tps_address_url, secondary_phones, import_batch_id, is_synthetic')
          .in('dedup_fingerprint', chunk);
        if (byFp) {
          for (const lead of byFp) {
            const fp = (lead as Record<string, unknown>).dedup_fingerprint as string;
            if (fp) existingLeadsMap.set(`fp:${fp}`, lead as Record<string, unknown>);
          }
        }
      }
    }

    // ── STEP 4: Preview mode — return analysis without committing ─────────────
    if (previewOnly) {
      let newCount = 0, updateCount = 0, unchangedCount = 0, reviewCount = 0;
      let newPhoneAvailable = 0, newFullyVerified = 0;

      for (const pr of uniqueRows) {
        if (pr.ambiguousAddress || pr.invalidState) { reviewCount++; continue; }
        const existing = existingLeadsMap.get(`fp:${pr.fingerprint}`);
        if (!existing) {
          newCount++;
          if (pr.hasPhone) newPhoneAvailable++;
        } else {
          const existingHasPhone = !!(existing.has_phone || existing.contact_phone);
          const willGainPhone = pr.hasPhone && !existingHasPhone;
          if (willGainPhone || (pr.verifiedOwner && !existing.verified_owner)) {
            updateCount++;
            if (willGainPhone) newPhoneAvailable++;
          } else {
            unchangedCount++;
          }
        }
      }

      return NextResponse.json({
        preview: {
          csvRows: rows.length,
          validRows: parsedRows.length,
          uniqueAfterCsvDedup: uniqueRows.length,
          duplicateInCsv: csvDuplicateIndices.size,
          newProspects: newCount,
          existingToUpdate: updateCount,
          unchangedExisting: unchangedCount,
          reviewRequired: reviewCount,
          errors: skippedRows.length,
          willNewlyPhoneAvailable: newPhoneAvailable,
          willNewlyFullyVerified: newFullyVerified,
          willIncreaseTotalLeads: newCount,
        },
      });
    }

    // ── STEP 5: Ensure state portfolios exist ─────────────────────────────────
    const statesSeen = new Set(uniqueRows.map(r => r.parsedState).filter(Boolean));
    for (let stateCode of statesSeen) {
      if (!stateCode || stateCode.length !== 2 || !STATE_NAMES[stateCode]) continue;
      const stateName = STATE_NAMES[stateCode];
      const { data: existing } = await supabase
        .from('portfolio_registry')
        .select('id')
        .eq('state_code', stateCode)
        .limit(1);
      if (!existing || existing.length === 0) {
        await supabase.from('portfolio_registry').insert({
          state_code: stateCode,
          state_name: stateName,
          portfolio_key: stateCode.toLowerCase(),
          portfolio_label: `${stateName} Portfolio`,
          is_active: true,
          auto_created: true,
        }).catch(() => {});
      }
    }

    // ── STEP 6: Process each unique row ───────────────────────────────────────
    const summary: TpsImportSummary = {
      importFile: importFilename,
      sourceRows: rows.length,
      valid: parsedRows.length,
      newLeads: 0,
      updatedExisting: 0,
      unchangedExisting: 0,
      duplicateInCsv: csvDuplicateIndices.size,
      reviewRequired: 0,
      errors: skippedRows.length,
      phonesStored: 0,
      newlyPhoneAvailable: 0,
      newlyFullyVerified: 0,
      importBatchId,
      rowResults: [],
      reviewRows: [],
    };

    const rowOutcomes: Record<string, unknown>[] = [];

    for (const pr of uniqueRows) {
      try {
        // Flag review-required rows
        if (pr.ambiguousAddress || pr.invalidState || pr.missingState) {
          const reason = pr.missingState ? 'MISSING_STATE' : pr.invalidState ?'INVALID_STATE' :'AMBIGUOUS_ADDRESS';
          const result: TpsRowResult = {
            rowIndex: pr.rowIndex, outcome: 'REVIEW_REQUIRED',
            contact: pr.rawContact, address: pr.rawAddress,
            state: pr.parsedState, phones: pr.phones.map(p => p.normalized),
            reviewReason: reason,
          };
          summary.reviewRequired++;
          summary.rowResults.push(result);
          summary.reviewRows.push(result);
          rowOutcomes.push(buildTpsRowOutcome(pr, result, importBatchId));
          continue;
        }

        const revenue = calculateRevenue(3, pr.parsedState);
        const prospectScore = calculateScore({
          verifiedOwner: pr.verifiedOwner,
          hasPhone: pr.hasPhone,
          phoneCount: pr.phones.length,
          projectedAnnualGross: revenue.projectedAnnualGross,
          state: pr.parsedState,
        });

        const existingLead = existingLeadsMap.get(`fp:${pr.fingerprint}`);

        if (existingLead) {
          // ── MERGE existing record ─────────────────────────────────────────
          const existingHasPhone = !!(existingLead.has_phone || existingLead.contact_phone);
          const existingContact = String(existingLead.contact_name || '');
          const existingVerifiedNumber = existingLead.verified_number === true;
          const existingVerifiedOwner = existingLead.verified_owner === true;
          const existingVerifiedAddress = !!(existingLead.verified_address &&
            existingLead.verified_address !== '' &&
            existingLead.verified_address !== 'false');

          // willUpdatePhone: phone is new OR phone exists but verified_number is not yet set
          const willUpdatePhone = pr.hasPhone && (!existingHasPhone || !existingVerifiedNumber);
          // willUpdateContact: contact is new/longer OR contact exists but verified_owner is not yet set
          const willUpdateContact = pr.verifiedOwner && (
            pr.contactCleaned.length > existingContact.length || !existingVerifiedOwner
          );
          // willUpdateVerifiedAddress: address not yet verified on existing record
          const willUpdateVerifiedAddress = !pr.ambiguousAddress && !existingVerifiedAddress;
          const willUpdateTps = (!existingLead.tps_name_url && pr.tpsNameUrl) || (!existingLead.tps_address_url && pr.tpsAddressUrl);
          const hasChanges = willUpdatePhone || willUpdateContact || willUpdateVerifiedAddress || willUpdateTps;

          if (!hasChanges) {
            const result: TpsRowResult = {
              rowIndex: pr.rowIndex, outcome: 'UNCHANGED_EXISTING',
              leadId: existingLead.id as string,
              contact: pr.rawContact, address: pr.rawAddress,
              state: pr.parsedState, phones: pr.phones.map(p => p.normalized),
              matchStrategy: 'standardized_address',
            };
            summary.unchangedExisting++;
            summary.rowResults.push(result);
            rowOutcomes.push(buildTpsRowOutcome(pr, result, importBatchId));
            continue;
          }

          const updateData: Record<string, unknown> = {
            updated_at: now,
            last_imported_at: now,
            last_import_batch_id: importBatchId,
            import_source_name: SOURCE_NAME,
            import_source_file: importFilename,
            research_source: RESEARCH_SOURCE,
          };

          if (willUpdateContact) {
            updateData.contact_name = pr.contactCleaned;
            updateData.owner_name = pr.contactCleaned;
            updateData.verified_owner = true;
            updateData.verified_owner_source = SOURCE_TYPE;
            updateData.verified_owner_method = 'MANUAL_RESEARCH';
            updateData.owner_verified_at = now;
          } else if (pr.verifiedOwner && !existingVerifiedOwner) {
            // Contact name unchanged but verification flag missing — set it
            updateData.verified_owner = true;
            updateData.verified_owner_source = SOURCE_TYPE;
            updateData.verified_owner_method = 'MANUAL_RESEARCH';
            updateData.owner_verified_at = now;
          }

          if (willUpdatePhone) {
            if (!existingHasPhone) {
              // New phone — store it on the lead record
              updateData.contact_phone = pr.primaryPhone;
              updateData.has_phone = true;
            }
            // Always set verification flags when phone qualifies (even if phone was already stored)
            updateData.verified_number = true;
            updateData.verified_number_source = SOURCE_TYPE;
            updateData.verified_number_method = 'MANUAL_RESEARCH';
            updateData.verified_number_at = now;
            updateData.phone_verification_source = RESEARCH_SOURCE;
            updateData.phone_verified_at = now;
          }

          if (willUpdateVerifiedAddress) {
            updateData.verified_address = 'MANUAL_RESEARCH';
            updateData.address_verification_source = SOURCE_TYPE;
            updateData.address_verified_at = now;
          }

          if (pr.tpsNameUrl) updateData.tps_name_url = pr.tpsNameUrl;
          if (pr.tpsAddressUrl) updateData.tps_address_url = pr.tpsAddressUrl;
          if (pr.phones.length > 1) {
            updateData.secondary_phones = pr.phones.slice(1).map(p => p.normalized);
            updateData.all_phones_raw = pr.rawPhonesFound;
          }
          // Preserve existing score unless new score is higher
          const existingScore = (existingLead.prospect_score as number) || 0;
          if (prospectScore > existingScore) {
            updateData.prospect_score = prospectScore;
          }

          // Derive fully_verified after applying updates
          const willBeVerifiedOwner = !!(updateData.verified_owner !== undefined ? updateData.verified_owner : existingVerifiedOwner);
          const willBeVerifiedNumber = !!(updateData.verified_number !== undefined ? updateData.verified_number : existingVerifiedNumber);
          const willBeVerifiedAddress = !!(updateData.verified_address !== undefined ? updateData.verified_address : (existingVerifiedAddress ? 'MANUAL_RESEARCH' : null));
          const willBeFullyVerified = willBeVerifiedOwner && willBeVerifiedNumber && willBeVerifiedAddress;
          updateData.fully_verified = willBeFullyVerified;

          const { error: updateError } = await supabase
            .from('leads')
            .update(updateData)
            .eq('id', existingLead.id as string);

          if (updateError) {
            const result: TpsRowResult = {
              rowIndex: pr.rowIndex, outcome: 'ERROR',
              leadId: existingLead.id as string,
              contact: pr.rawContact, address: pr.rawAddress,
              state: pr.parsedState, phones: pr.phones.map(p => p.normalized),
              errorCode: 'DB_UPDATE_ERROR', errorMessage: updateError.message,
            };
            summary.errors++;
            summary.rowResults.push(result);
            rowOutcomes.push(buildTpsRowOutcome(pr, result, importBatchId));
          } else {
            summary.updatedExisting++;
            // Count newly phone available: phone was not verified before
            if (willUpdatePhone && !existingVerifiedNumber) {
              summary.newlyPhoneAvailable++;
            }
            // Count newly fully verified: was not fully verified before, is now
            const wasFullyVerified = existingVerifiedOwner && existingVerifiedNumber && existingVerifiedAddress;
            if (willBeFullyVerified && !wasFullyVerified) {
              summary.newlyFullyVerified++;
            }

            // Store all phones in enriched_phones
            for (let pi = 0; pi < pr.phones.length; pi++) {
              const ph = pr.phones[pi];
              await supabase.rpc('upsert_lead_phone', {
                p_lead_id: existingLead.id as string,
                p_normalized_phone: ph.normalized,
                p_raw_phone: ph.rawPhone,
                p_is_primary: pi === 0,
                p_phone_rank: pi + 1,
                p_verification_method: 'MANUAL_RESEARCH',
                p_verification_source: RESEARCH_SOURCE,
                p_import_batch_id: importBatchId,
                p_research_source_url: pr.tpsNameUrl || null,
              }).catch(() => {});
              summary.phonesStored++;
            }

            const result: TpsRowResult = {
              rowIndex: pr.rowIndex, outcome: 'UPDATED_EXISTING',
              leadId: existingLead.id as string,
              contact: pr.rawContact, address: pr.rawAddress,
              state: pr.parsedState, phones: pr.phones.map(p => p.normalized),
              matchStrategy: 'standardized_address',
            };
            summary.rowResults.push(result);
            rowOutcomes.push(buildTpsRowOutcome(pr, result, importBatchId));

            // Activity log
            await supabase.from('lead_activity_log').insert({
              lead_id: existingLead.id as string,
              activity_type: 'MANUAL_CONTACT_DATA_UPDATED',
              description: `Manual research data updated from ${SOURCE_NAME} (batch: ${importBatchId}). ${pr.phones.length} phone(s) stored. verified_owner=${willBeVerifiedOwner}, verified_number=${willBeVerifiedNumber}, verified_address=${willBeVerifiedAddress}, fully_verified=${willBeFullyVerified}.`,
              metadata: { importBatchId, importFilename, tpsNameUrl: pr.tpsNameUrl, tpsAddressUrl: pr.tpsAddressUrl, phoneCount: pr.phones.length, willBeFullyVerified },
              created_at: now,
            }).catch(() => {});
          }
        } else {
          // ── CREATE new prospect ───────────────────────────────────────────
          const newId = `lead-tps-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
          const portfolioKey = pr.parsedState ? pr.parsedState.toLowerCase() : null;
          const portfolioName = pr.parsedState ? `${STATE_NAMES[pr.parsedState] || pr.parsedState} Portfolio` : null;

          // verifiedAddress: address was manually researched — mark as MANUAL_RESEARCH
          // but only if address is unambiguous
          const verifiedAddress = !pr.ambiguousAddress ? 'MANUAL_RESEARCH' : null;

          const leadData: Record<string, unknown> = {
            id: newId,
            address: pr.parsedStreet || pr.rawAddress,
            city: pr.parsedCity,
            state: pr.parsedState,
            zip: pr.parsedZip,
            beds: 3,
            baths: 2,
            price: 0,
            price_type: 'rent',
            source: 'Zillow',
            stage: 'New Lead',
            contact_name: pr.contactCleaned || null,
            contact_phone: pr.primaryPhone || null,
            regulation_status: 'Unknown',
            prospect_score: prospectScore,
            days_on_market: 0,
            last_checked: now.split('T')[0],
            tags: ['MANUAL_RESEARCH_IMPORT', 'TRUEPEOPLESEARCH'],
            estimated_adr: revenue.projectedADR,
            estimated_occupancy: revenue.projectedOccupancy,
            estimated_gross_monthly: revenue.projectedMonthlyGross,
            estimated_net_monthly: revenue.projectedOwnerNet,
            photos: [],
            created_at: now,
            updated_at: now,
            // Address provenance
            original_address: pr.rawAddress,
            raw_imported_address: pr.rawAddress,
            standardized_address: pr.standardizedAddress,
            street_address: pr.parsedStreet,
            dedup_fingerprint: pr.fingerprint,
            // Import provenance
            import_batch_id: importBatchId,
            import_filename: importFilename,
            import_source_name: SOURCE_NAME,
            import_source_file: importFilename,
            research_source: RESEARCH_SOURCE,
            imported_at: now,
            imported_by: importedBy || null,
            last_imported_at: now,
            last_import_batch_id: importBatchId,
            record_source: SOURCE_NAME,
            source_type: SOURCE_TYPE,
            ingestion_source: 'MANUAL_CSV',
            source_types: ['MANUAL_CSV', 'TRUEPEOPLESEARCH'],
            is_multi_source: false,
            first_seen_at: now,
            last_seen_at: now,
            // TruePeopleSearch provenance
            tps_name_url: pr.tpsNameUrl || null,
            tps_address_url: pr.tpsAddressUrl || null,
            all_phones_raw: pr.rawPhonesFound || null,
            secondary_phones: pr.phones.length > 1 ? pr.phones.slice(1).map(p => p.normalized) : null,
            // Verification
            verified_owner: pr.verifiedOwner,
            verified_number: pr.hasPhone,
            verified_address: verifiedAddress,
            has_phone: pr.hasPhone,
            owner_name: pr.contactCleaned || null,
            owner_verification_source: pr.verifiedOwner ? SOURCE_TYPE : null,
            owner_verified_at: pr.verifiedOwner ? now : null,
            verified_owner_source: pr.verifiedOwner ? SOURCE_TYPE : null,
            verified_owner_method: pr.verifiedOwner ? 'MANUAL_RESEARCH' : null,
            phone_verification_source: pr.hasPhone ? RESEARCH_SOURCE : null,
            phone_verified_at: pr.hasPhone ? now : null,
            verified_number_source: pr.hasPhone ? SOURCE_TYPE : null,
            verified_number_method: pr.hasPhone ? 'MANUAL_RESEARCH' : null,
            verified_number_at: pr.hasPhone ? now : null,
            address_verification_source: verifiedAddress ? SOURCE_TYPE : null,
            address_verified_at: verifiedAddress ? now : null,
            // Fully verified: owner + address + number
            // Derived field — set true only when all three are verified
            fully_verified: pr.verifiedOwner && pr.hasPhone && !!verifiedAddress,
            // Enrichment
            enrichment_status: 'PENDING',
            enrichment_retry_count: 0,
            rent_verification_status: 'NOT_FOUND',
            outreach_status: 'NOT_CONTACTED',
            // Agent assignment — null for new leads
            primary_agent_id: null,
            primary_agent_name: null,
            assigned_agents: [],
            // Portfolio
            portfolio_id: portfolioKey,
            portfolio_name: portfolioName,
            priority_tier: pr.verifiedOwner && pr.hasPhone && !!verifiedAddress ? 1 : pr.verifiedOwner ? 2 : 3,
            is_verified_lead: true,
            is_synthetic: false,
            verification_status: verifiedAddress ? 'VERIFIED' : 'PENDING_VERIFICATION',
            verification_review_required: !verifiedAddress,
            // Source provenance
            address_source: 'MANUAL_IMPORT',
            owner_source: pr.verifiedOwner ? 'MANUAL_IMPORT' : null,
            phone_source: pr.hasPhone ? 'MANUAL_IMPORT' : null,
            // Revenue
            calculation_version: 'travlr-v1.0',
            calculated_at: now,
          };

          const { data: inserted, error: insertError } = await supabase
            .from('leads')
            .insert(leadData)
            .select('id')
            .single();

          if (insertError) {
            const result: TpsRowResult = {
              rowIndex: pr.rowIndex, outcome: 'ERROR',
              contact: pr.rawContact, address: pr.rawAddress,
              state: pr.parsedState, phones: pr.phones.map(p => p.normalized),
              errorCode: 'DB_INSERT_ERROR', errorMessage: insertError.message,
            };
            summary.errors++;
            summary.rowResults.push(result);
            rowOutcomes.push(buildTpsRowOutcome(pr, result, importBatchId));
          } else if (inserted) {
            summary.newLeads++;
            if (pr.hasPhone) summary.newlyPhoneAvailable++;
            if (pr.verifiedOwner && pr.hasPhone && !!verifiedAddress) summary.newlyFullyVerified++;

            // Store all phones in enriched_phones
            for (let pi = 0; pi < pr.phones.length; pi++) {
              const ph = pr.phones[pi];
              await supabase.rpc('upsert_lead_phone', {
                p_lead_id: inserted.id,
                p_normalized_phone: ph.normalized,
                p_raw_phone: ph.rawPhone,
                p_is_primary: pi === 0,
                p_phone_rank: pi + 1,
                p_verification_method: 'MANUAL_RESEARCH',
                p_verification_source: RESEARCH_SOURCE,
                p_import_batch_id: importBatchId,
                p_research_source_url: pr.tpsNameUrl || null,
              }).catch(() => {});
              summary.phonesStored++;
            }

            const result: TpsRowResult = {
              rowIndex: pr.rowIndex, outcome: 'NEW',
              leadId: inserted.id,
              contact: pr.rawContact, address: pr.rawAddress,
              state: pr.parsedState, phones: pr.phones.map(p => p.normalized),
            };
            summary.rowResults.push(result);
            rowOutcomes.push(buildTpsRowOutcome(pr, result, importBatchId));

            // Activity log
            await supabase.from('lead_activity_log').insert({
              lead_id: inserted.id,
              activity_type: 'MANUAL_RESEARCH_LEAD_IMPORTED',
              description: `New lead imported from ${SOURCE_NAME} via TruePeopleSearch research (batch: ${importBatchId}).`,
              metadata: { importBatchId, importFilename, tpsNameUrl: pr.tpsNameUrl, tpsAddressUrl: pr.tpsAddressUrl, phoneCount: pr.phones.length, phones: pr.phones.map(p => p.normalized) },
              created_at: now,
            }).catch(() => {});
          }
        }
      } catch (rowErr) {
        const result: TpsRowResult = {
          rowIndex: pr.rowIndex, outcome: 'ERROR',
          contact: pr.rawContact, address: pr.rawAddress,
          state: pr.parsedState, phones: pr.phones.map(p => p.normalized),
          errorCode: 'UNEXPECTED_ERROR',
          errorMessage: rowErr instanceof Error ? rowErr.message : 'Unknown error',
        };
        summary.errors++;
        summary.rowResults.push(result);
        rowOutcomes.push(buildTpsRowOutcome(pr, result, importBatchId));
      }
    }

    // ── STEP 7: Record intra-CSV duplicates ───────────────────────────────────
    for (const rowIndex of csvDuplicateIndices) {
      const pr = parsedRows.find(r => r.rowIndex === rowIndex);
      if (!pr) continue;
      const result: TpsRowResult = {
        rowIndex, outcome: 'DUPLICATE_IN_CSV',
        contact: pr.rawContact, address: pr.rawAddress,
        state: pr.parsedState, phones: pr.phones.map(p => p.normalized),
      };
      summary.rowResults.push(result);
      rowOutcomes.push(buildTpsRowOutcome(pr, result, importBatchId));
    }

    // Add skipped (error) rows
    summary.rowResults.push(...skippedRows);

    // ── STEP 8: Persist per-row outcomes ─────────────────────────────────────
    if (rowOutcomes.length > 0) {
      for (let i = 0; i < rowOutcomes.length; i += 100) {
        await supabase.from('csv_import_row_outcomes').insert(rowOutcomes.slice(i, i + 100)).catch(() => {});
      }
    }

    // ── STEP 9: Save import batch summary ────────────────────────────────────
    await supabase.from('csv_import_batches').upsert({
      import_batch_id: importBatchId,
      import_filename: importFilename,
      imported_at: now,
      imported_by: importedBy || null,
      record_source: SOURCE_NAME,
      source_type: SOURCE_TYPE,
      rows_processed: summary.valid + summary.duplicateInCsv + summary.errors,
      new_prospects_created: summary.newLeads,
      existing_prospects_enriched: summary.updatedExisting,
      duplicates_merged: summary.duplicateInCsv,
      phone_numbers_imported: summary.phonesStored,
      errors: summary.errors,
      rows_new: summary.newLeads,
      rows_updated_existing: summary.updatedExisting,
      rows_duplicate_in_file: summary.duplicateInCsv,
      rows_unchanged_existing: summary.unchangedExisting,
      rows_review_required: summary.reviewRequired,
      rows_error: summary.errors,
      status: 'COMPLETED',
    }, { onConflict: 'import_batch_id' }).catch(() => {});

    // ── STEP 10: Admin-level import event ─────────────────────────────────────
    await supabase.from('activity_events').insert({
      event_type: 'CSV_IMPORT_COMPLETED',
      description: `TruePeopleSearch CSV import completed — ${summary.newLeads} new + ${summary.updatedExisting} updated. Source: ${SOURCE_NAME}.`,
      metadata: {
        importBatchId,
        sourceFile: importFilename,
        sourceName: SOURCE_NAME,
        researchSource: RESEARCH_SOURCE,
        rowsProcessed: summary.valid,
        newProspects: summary.newLeads,
        updatedProspects: summary.updatedExisting,
        unchanged: summary.unchangedExisting,
        reviewRequired: summary.reviewRequired,
        errors: summary.errors,
        phonesStored: summary.phonesStored,
      },
      created_at: now,
    }).catch(() => {});

    return NextResponse.json({ success: true, summary });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Import failed' },
      { status: 500 }
    );
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function buildTpsRowOutcome(
  pr: { rowIndex: number; rawAddress: string; rawContact: string; parsedState: string; fingerprint: string; hasPhone: boolean; verifiedOwner: boolean; phones: { normalized: string }[] },
  result: TpsRowResult,
  importBatchId: string
): Record<string, unknown> {
  return {
    import_batch_id: importBatchId,
    row_index: pr.rowIndex,
    raw_address: pr.rawAddress,
    raw_contact: pr.rawContact,
    raw_state: pr.parsedState,
    normalized_address: pr.fingerprint,
    normalized_phone: pr.phones[0]?.normalized || null,
    match_strategy: result.matchStrategy || null,
    match_found: !!result.leadId && result.outcome !== 'NEW',
    matched_lead_id: result.outcome !== 'NEW' ? result.leadId : null,
    match_confidence: result.matchStrategy === 'standardized_address' ? 95 : 0,
    outcome: result.outcome,
    outcome_lead_id: result.leadId || null,
    outcome_detail: result.errorMessage || result.reviewReason || null,
    verification_score: (pr.hasPhone ? 50 : 0) + (pr.verifiedOwner ? 25 : 0) + 20,
    verified_owner: pr.verifiedOwner,
    verified_number: pr.hasPhone,
    verified_address: false,
    error_code: result.errorCode || null,
    error_message: result.errorMessage || null,
  };
}
