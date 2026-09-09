import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

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

function normalizeStateCode(state: string): string {
  if (!state) return '';
  const trimmed = state.trim();
  if (trimmed.length === 2) return trimmed.toUpperCase();
  return STATE_ABBR_MAP[trimmed.toLowerCase()] || trimmed.toUpperCase();
}

function normalizeAddress(raw: string, city: string, state: string, zip: string) {
  const normState = normalizeStateCode(state);
  const normCity = (city || '').trim().toLowerCase().replace(/\s+/g, ' ');
  const normZip = (zip || '').replace(/\D/g, '').slice(0, 5);
  let street = (raw || '').trim().replace(/[.,]+$/, '');
  const parts = street.split(/\s+/);
  const normalized = parts.map((p, i) => {
    const lower = p.toLowerCase().replace(/[.,]/g, '');
    if (i > 0 && STREET_SUFFIX_MAP[lower]) return STREET_SUFFIX_MAP[lower];
    return p;
  });
  street = normalized.join(' ');
  const displayCity = (city || '').trim();
  const standardized = [street, displayCity, normState, normZip].filter(Boolean).join(', ');
  const fingerprintParts = [
    street.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim(),
    normCity,
    normState.toLowerCase(),
    normZip,
  ].filter(Boolean);
  const fingerprint = fingerprintParts.join('|');
  return { streetAddress: street, city: displayCity, state: normState, zipCode: normZip, standardizedAddress: standardized, fingerprint };
}

function normalizePhone(phone: string): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits[0] === '1') return `+${digits}`;
  return null;
}

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
  source_property_id?: string; apn?: string; APN?: string;
  [key: string]: unknown;
}

export interface PreviewRowResult {
  rowIndex: number;
  outcome: 'NEW' | 'UPDATED_EXISTING' | 'UNCHANGED_EXISTING' | 'DUPLICATE_IN_FILE' | 'REVIEW_REQUIRED' | 'ERROR';
  address: string;
  normalizedAddress?: string;
  matchStrategy?: string;
  matchConfidence?: number;
  existingLeadId?: string;
  hasPhone: boolean;
  hasContact: boolean;
  stateCode: string;
  willAddPhone?: boolean;
  willAddContact?: boolean;
  willAddRent?: boolean;
  reviewReason?: string;
}

export interface ImportPreview {
  csvRows: number;
  uniquePropertiesAfterCsvDedup: number;
  newProspects: number;
  existingMatches: number;
  existingToEnrich: number;
  unchangedExisting: number;
  duplicatesWithinCsv: number;
  reviewRequired: number;
  newStatesDetected: number;
  newPortfoliosToCreate: number;
  existingPortfoliosToReuse: number;
  newPhoneNumbers: number;
  verifiedPhoneLeads: number;
  stateBreakdown: Record<string, number>;
  newStates: string[];
  existingStates: string[];
  rowResults: PreviewRowResult[];
  importBatchId: string;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { rows, importBatchId } = body as { rows: CsvRow[]; importBatchId: string };

    if (!rows || !Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ error: 'No rows provided' }, { status: 400 });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    // ── STEP 1: Parse and normalize all rows ─────────────────────────────────
    interface ParsedRow {
      rowIndex: number;
      rawAddress: string;
      rawContact: string;
      rawPhone: string;
      rawState: string;
      rawSourcePropertyId: string | null;
      rawAPN: string | null;
      rawPrice: number;
      normalized: ReturnType<typeof normalizeAddress>;
      normalizedPhone: string | null;
      hasPhone: boolean;
      hasContact: boolean;
      currentRent: number | null;
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
      const rawPrice = parseFloat(String(row.price || row.Price || '0').replace(/[^0-9.]/g, '')) || 0;
      const rawSourcePropertyId = String(row.source_property_id || '').trim() || null;
      const rawAPN = String(row.apn || row.APN || '').trim() || null;

      if (!rawAddress || rawAddress.length < 5) continue;

      const normalized = normalizeAddress(rawAddress, rawCity, rawState, rawZip);
      const normalizedPhone = normalizePhone(rawPhone);
      const hasPhone = !!normalizedPhone;
      const hasContact = rawContact.length > 1;
      const currentRent = rawPrice > 0 && rawPrice < 50000 ? rawPrice : null;

      parsedRows.push({
        rowIndex: i, rawAddress, rawContact, rawPhone, rawState,
        rawSourcePropertyId, rawAPN, rawPrice,
        normalized, normalizedPhone, hasPhone, hasContact, currentRent,
      });
    }

    // ── STEP 2: Intra-CSV deduplication ──────────────────────────────────────
    const csvFingerprintMap = new Map<string, ParsedRow>();
    const csvDuplicateIndices = new Set<number>();

    for (const pr of parsedRows) {
      const fp = pr.normalized.fingerprint;
      if (!fp) continue;
      if (!csvFingerprintMap.has(fp)) {
        csvFingerprintMap.set(fp, pr);
      } else {
        const existing = csvFingerprintMap.get(fp)!;
        if (pr.hasPhone && !existing.hasPhone) existing.hasPhone = true;
        if (pr.rawContact.length > existing.rawContact.length) existing.rawContact = pr.rawContact;
        csvDuplicateIndices.add(pr.rowIndex);
      }
    }

    const uniqueRows = parsedRows.filter(pr => !csvDuplicateIndices.has(pr.rowIndex));

    // ── STEP 3: Bulk-fetch existing leads ────────────────────────────────────
    const fingerprints = uniqueRows.map(r => r.normalized.fingerprint).filter(Boolean);
    const sourceIds = uniqueRows.map(r => r.rawSourcePropertyId).filter(Boolean) as string[];
    const apns = uniqueRows.map(r => r.rawAPN).filter(Boolean) as string[];

    const existingLeadsMap = new Map<string, Record<string, unknown>>();

    if (fingerprints.length > 0) {
      const { data } = await supabase
        .from('leads')
        .select('id, dedup_fingerprint, source_property_id, apn, contact_name, contact_phone, has_phone, current_monthly_rent')
        .in('dedup_fingerprint', fingerprints);
      if (data) {
        for (const lead of data) {
          const fp = (lead as Record<string, unknown>).dedup_fingerprint as string;
          if (fp) existingLeadsMap.set(`fp:${fp}`, lead as Record<string, unknown>);
        }
      }
    }
    if (sourceIds.length > 0) {
      const { data } = await supabase
        .from('leads')
        .select('id, dedup_fingerprint, source_property_id, apn, contact_name, contact_phone, has_phone, current_monthly_rent')
        .in('source_property_id', sourceIds);
      if (data) {
        for (const lead of data) {
          const sid = (lead as Record<string, unknown>).source_property_id as string;
          if (sid) existingLeadsMap.set(`sid:${sid}`, lead as Record<string, unknown>);
        }
      }
    }
    if (apns.length > 0) {
      const { data } = await supabase
        .from('leads')
        .select('id, dedup_fingerprint, source_property_id, apn, contact_name, contact_phone, has_phone, current_monthly_rent')
        .in('apn', apns);
      if (data) {
        for (const lead of data) {
          const a = (lead as Record<string, unknown>).apn as string;
          if (a) existingLeadsMap.set(`apn:${a}`, lead as Record<string, unknown>);
        }
      }
    }

    // ── STEP 4: Check existing portfolios ────────────────────────────────────
    const uniqueStates = [...new Set(uniqueRows.map(r => r.normalized.state).filter(s => s && s.length === 2))];
    const { data: existingPortfolios } = await supabase
      .from('portfolio_registry')
      .select('state_code')
      .in('state_code', uniqueStates);
    const existingPortfolioStates = new Set((existingPortfolios || []).map((p: Record<string, unknown>) => p.state_code as string));

    // ── STEP 5: Classify each unique row ─────────────────────────────────────
    const rowResults: PreviewRowResult[] = [];
    const stateBreakdown: Record<string, number> = {};
    let newProspects = 0, existingMatches = 0, existingToEnrich = 0;
    let unchangedExisting = 0, reviewRequired = 0, newPhoneNumbers = 0;

    for (const pr of uniqueRows) {
      const stateCode = pr.normalized.state;
      stateBreakdown[stateCode] = (stateBreakdown[stateCode] || 0) + 1;

      // Dedup lookup
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
      if (!existingLead && pr.normalized.fingerprint) {
        const found = existingLeadsMap.get(`fp:${pr.normalized.fingerprint}`);
        if (found) { existingLead = found; matchStrategy = 'standardized_address'; matchConfidence = 95; }
      }
      // Fallback address lookup for preview
      if (!existingLead && pr.normalized.standardizedAddress) {
        const { data: fallback } = await supabase
          .from('leads')
          .select('id, contact_name, contact_phone, has_phone, current_monthly_rent')
          .or(`standardized_address.ilike.${pr.normalized.standardizedAddress},address.ilike.${pr.rawAddress}`)
          .limit(1);
        if (fallback && fallback.length > 0) {
          existingLead = fallback[0] as Record<string, unknown>;
          matchStrategy = 'address_ilike';
          matchConfidence = 80;
        }
      }

      if (existingLead) {
        existingMatches++;
        const existingHasPhone = !!(existingLead.has_phone || existingLead.contact_phone);
        const existingContact = String(existingLead.contact_name || '');
        const existingRent = existingLead.current_monthly_rent as number | null;
        const willAddPhone = pr.hasPhone && !existingHasPhone;
        const willAddContact = pr.hasContact && pr.rawContact.length > existingContact.length;
        const willAddRent = pr.currentRent !== null && (existingRent === null || existingRent === 0);
        const hasChanges = willAddPhone || willAddContact || willAddRent;

        if (hasChanges) {
          existingToEnrich++;
          if (willAddPhone) newPhoneNumbers++;
          rowResults.push({
            rowIndex: pr.rowIndex, outcome: 'UPDATED_EXISTING',
            address: pr.rawAddress, normalizedAddress: pr.normalized.standardizedAddress,
            matchStrategy, matchConfidence, existingLeadId: existingLead.id as string,
            hasPhone: pr.hasPhone, hasContact: pr.hasContact, stateCode,
            willAddPhone, willAddContact, willAddRent,
          });
        } else {
          unchangedExisting++;
          rowResults.push({
            rowIndex: pr.rowIndex, outcome: 'UNCHANGED_EXISTING',
            address: pr.rawAddress, normalizedAddress: pr.normalized.standardizedAddress,
            matchStrategy, matchConfidence, existingLeadId: existingLead.id as string,
            hasPhone: pr.hasPhone, hasContact: pr.hasContact, stateCode,
          });
        }
      } else {
        newProspects++;
        if (pr.hasPhone) newPhoneNumbers++;
        rowResults.push({
          rowIndex: pr.rowIndex, outcome: 'NEW',
          address: pr.rawAddress, normalizedAddress: pr.normalized.standardizedAddress,
          hasPhone: pr.hasPhone, hasContact: pr.hasContact, stateCode,
        });
      }
    }

    // Duplicate-in-file rows
    for (const rowIndex of csvDuplicateIndices) {
      const pr = parsedRows.find(r => r.rowIndex === rowIndex);
      if (!pr) continue;
      rowResults.push({
        rowIndex, outcome: 'DUPLICATE_IN_FILE',
        address: pr.rawAddress, normalizedAddress: pr.normalized.standardizedAddress,
        hasPhone: pr.hasPhone, hasContact: pr.hasContact, stateCode: pr.normalized.state,
      });
    }

    const newStates = uniqueStates.filter(s => !existingPortfolioStates.has(s));
    const existingStates = uniqueStates.filter(s => existingPortfolioStates.has(s));

    const preview: ImportPreview = {
      csvRows: rows.length,
      uniquePropertiesAfterCsvDedup: uniqueRows.length,
      newProspects,
      existingMatches,
      existingToEnrich,
      unchangedExisting,
      duplicatesWithinCsv: csvDuplicateIndices.size,
      reviewRequired,
      newStatesDetected: newStates.length,
      newPortfoliosToCreate: newStates.length,
      existingPortfoliosToReuse: existingStates.length,
      newPhoneNumbers,
      verifiedPhoneLeads: uniqueRows.filter(r => r.hasPhone).length,
      stateBreakdown,
      newStates: newStates.map(s => `${STATE_NAMES[s] || s} (${s})`),
      existingStates: existingStates.map(s => `${STATE_NAMES[s] || s} (${s})`),
      rowResults,
      importBatchId,
    };

    return NextResponse.json({ success: true, preview });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Preview failed' },
      { status: 500 }
    );
  }
}
