import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { cityRegulations } from '@/data/regulations';
import { validateAddressCityState } from '@/lib/services/addressValidationService';
import { verifyPropertyCandidate, normalizeAddress, getDeduplicationKey, createEmptyReport, formatSyncReport, type PropertyCandidate, type SyncPipelineReport,  } from '@/lib/services/propertyVerificationService';

// ─── Regulation lookup ────────────────────────────────────────────────────────

function lookupRegulationStatus(city: string, state: string): 'Allowed' | 'Restricted' | 'Prohibited' | 'Unknown' {
  const cityLower = city.toLowerCase().trim();
  const stateLower = state.toLowerCase().trim();
  const exact = cityRegulations.find(
    (r) => r.city.toLowerCase() === cityLower && r.state.toLowerCase() === stateLower
  );
  if (exact) return exact.status;
  const stateRules = cityRegulations.filter((r) => r.state.toLowerCase() === stateLower);
  if (stateRules.length > 0) return stateRules[0].status;
  return 'Unknown';
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface SyncSourceRow {
  id: string;
  portfolio: string;
  zone: string;
  source_name: string;
  sync_url: string;
  status: string;
  feasibility_note: string | null;
}

interface PortfolioSummary {
  portfolio: string;
  state_code: string;
  // Pipeline counts
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
  // DB audit counts
  db_total: number;
  db_real: number;
  db_synthetic: number;
  db_validated: number;
  db_mismatch: number;
  db_verified_status: number;
  db_candidate_status: number;
  db_quarantined_status: number;
  // Failure breakdown
  verification_failures: {
    no_property_match: number;
    incomplete_address: number;
    invalid_zip: number;
    placeholder_address: number;
    provider_errors: number;
    score_too_low: number;
  };
  errors: string[];
  db_error: string | null;
  previous_count: number | null;
  suspicious_empty: boolean;
  sources_run: number;
  provider_available: boolean;
  sync_report: string;
  duration_ms: number;
}

// ─── Portfolio → state mapping ────────────────────────────────────────────────

const PORTFOLIO_STATE_MAP: Record<string, string> = {
  'Colorado Portfolio': 'CO',
  'California Portfolio': 'CA',
  'Nevada Portfolio': 'NV',
  'Washington Portfolio': 'WA',
  'Texas Portfolio': 'TX',
  'Florida Portfolio': 'FL',
  'Utah Portfolio': 'UT',
  'Maine Portfolio': 'ME',
  'Oregon Portfolio': 'OR',
  'Massachusetts Portfolio': 'MA',
  'Maryland Portfolio': 'MD',
  Colorado: 'CO', California: 'CA', Nevada: 'NV', Washington: 'WA',
  Texas: 'TX', Florida: 'FL', Utah: 'UT', Maine: 'ME', Oregon: 'OR',
  Massachusetts: 'MA', Maryland: 'MD',
};

const ALL_PORTFOLIOS = [
  'Colorado Portfolio', 'California Portfolio', 'Nevada Portfolio',
  'Washington Portfolio', 'Texas Portfolio', 'Florida Portfolio',
  'Utah Portfolio', 'Maine Portfolio', 'Oregon Portfolio',
  'Massachusetts Portfolio', 'Maryland Portfolio',
];

const PORTFOLIO_FALLBACK_ZONES: Record<string, { zone: string; sources: string[] }[]> = {
  'Colorado Portfolio': [{ zone: 'Denver', sources: ['Trulia', 'Rent.com', 'Realtor.com', 'Zillow'] }],
  'California Portfolio': [{ zone: 'Los Angeles', sources: ['Trulia', 'Rent.com', 'Realtor.com', 'Zillow'] }],
  'Nevada Portfolio': [{ zone: 'Las Vegas', sources: ['Trulia', 'Rent.com', 'Realtor.com', 'Zillow'] }],
  'Washington Portfolio': [{ zone: 'Seattle', sources: ['Trulia', 'Rent.com', 'Realtor.com', 'Zillow'] }],
  'Texas Portfolio': [{ zone: 'Dallas', sources: ['Trulia', 'Rent.com', 'Realtor.com', 'Zillow'] }],
  'Florida Portfolio': [{ zone: 'Miami', sources: ['Trulia', 'Rent.com', 'Realtor.com', 'Zillow'] }],
  'Utah Portfolio': [{ zone: 'Salt Lake City', sources: ['Trulia', 'Rent.com', 'Realtor.com', 'Zillow'] }],
  'Maine Portfolio': [{ zone: 'Portland', sources: ['Trulia', 'Rent.com', 'Realtor.com', 'Zillow'] }],
  'Oregon Portfolio': [{ zone: 'Portland', sources: ['Trulia', 'Rent.com', 'Realtor.com', 'Zillow'] }],
  'Massachusetts Portfolio': [{ zone: 'Boston', sources: ['Trulia', 'Rent.com', 'Realtor.com', 'Zillow'] }],
  'Maryland Portfolio': [{ zone: 'Baltimore', sources: ['Trulia', 'Rent.com', 'Realtor.com', 'Zillow'] }],
};

// ─── POST /api/sync/execute ───────────────────────────────────────────────────
//
// PROPERTY VERIFICATION PIPELINE:
// Every candidate must pass the verification gate before insertion.
// NO VERIFICATION = NO PRODUCTION PROPERTY.
// The system fails CLOSED — if the provider is unavailable, candidates are
// quarantined, not inserted.

export async function POST(req: NextRequest) {
  const startTime = Date.now();

  try {
    const body = await req.json().catch(() => ({}));
    const portfolioFilter: string | null = body.portfolio || null;
    const syncRunId: string | null = body.sync_run_id || null;
    const diagnosticMode: boolean = body.diagnostic === true;
    const discoverSources: boolean = body.discover !== false && !diagnosticMode;

    const supabase = await createClient();

    // ── Step 1: Determine portfolios ──────────────────────────────────────────
    const portfoliosToProcess: string[] = portfolioFilter && portfolioFilter !== 'all'
      ? [portfolioFilter]
      : [...ALL_PORTFOLIOS];

    // ── Step 2: Load sync sources ─────────────────────────────────────────────
    let dbQuery = supabase
      .from('sync_source_coverage')
      .select('id, portfolio, zone, source_name, sync_url, status, feasibility_note')
      .eq('status', 'active')
      .not('sync_url', 'is', null);

    if (portfolioFilter && portfolioFilter !== 'all') {
      dbQuery = dbQuery.eq('portfolio', portfolioFilter);
    }

    const { data: dbSources, error: sourcesError } = await dbQuery;
    if (sourcesError) {
      console.error('[sync/execute] DB sources error:', sourcesError.message);
    }

    let sources: SyncSourceRow[] = [];
    if (dbSources && dbSources.length > 0) {
      sources = dbSources as SyncSourceRow[];
    } else {
      for (const portfolio of portfoliosToProcess) {
        const zones = PORTFOLIO_FALLBACK_ZONES[portfolio] || [];
        for (const { zone, sources: zoneSources } of zones) {
          for (const sourceName of zoneSources) {
            const stateCode = PORTFOLIO_STATE_MAP[portfolio] || 'CO';
            sources.push({
              id: `fallback-${portfolio}-${zone}-${sourceName}`.replace(/\s/g, '-').toLowerCase(),
              portfolio,
              zone,
              source_name: sourceName,
              sync_url: `https://www.${sourceName.toLowerCase().replace(/[^a-z]/g, '')}.com/${stateCode.toLowerCase()}/${zone.toLowerCase().replace(/\s/g, '-')}/`,
              status: 'active',
              feasibility_note: null,
            });
          }
        }
      }
    }

    const syncNow = new Date().toISOString();

    // ── Step 3: Write initial "running" status rows ───────────────────────────
    if (syncRunId && portfolioFilter) {
      const uniqueSources = [...new Set(sources.map((s) => s.source_name))];
      const statusRows = uniqueSources.map((sourceName) => ({
        portfolio_id: portfolioFilter,
        source_name: sourceName,
        sync_run_id: syncRunId,
        status: 'running',
        started_at: syncNow,
      }));
      if (statusRows.length > 0) {
        await supabase
          .from('portfolio_sync_status')
          .upsert(statusRows, { onConflict: 'portfolio_id,source_name,sync_run_id' });
      }
    }

    // ── Step 4: Process each portfolio ────────────────────────────────────────
    const portfolioSummaries: PortfolioSummary[] = [];
    let grandTotalCandidates = 0;
    let grandTotalVerified = 0;
    let grandTotalInserted = 0;
    let grandTotalQuarantined = 0;
    let grandTotalErrors = 0;

    for (const portfolio of portfoliosToProcess) {
      const portfolioStart = Date.now();
      const stateCode = PORTFOLIO_STATE_MAP[portfolio];
      const portfolioSources = sources.filter((s) => s.portfolio === portfolio);

      const summary: PortfolioSummary = {
        portfolio,
        state_code: stateCode || '',
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
        db_total: 0,
        db_real: 0,
        db_synthetic: 0,
        db_validated: 0,
        db_mismatch: 0,
        db_verified_status: 0,
        db_candidate_status: 0,
        db_quarantined_status: 0,
        verification_failures: {
          no_property_match: 0,
          incomplete_address: 0,
          invalid_zip: 0,
          placeholder_address: 0,
          provider_errors: 0,
          score_too_low: 0,
        },
        errors: [],
        db_error: null,
        previous_count: null,
        suspicious_empty: false,
        sources_run: portfolioSources.length,
        provider_available: false,
        sync_report: '',
        duration_ms: 0,
      };

      if (!stateCode) {
        const errMsg = `PIPELINE ERROR: No state code mapping for portfolio "${portfolio}"`;
        summary.errors.push(errMsg);
        summary.db_error = errMsg;
        portfolioSummaries.push(summary);
        grandTotalErrors++;
        continue;
      }

      // The verification pass only processes candidates already in `leads`.
      // Discover fresh listings through the real ingestion pipeline first so a
      // dashboard refresh can actually add new leads.
      if (discoverSources) {
        try {
          const ingestResponse = await fetch(new URL('/api/trulia/ingest', req.url), {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              cookie: req.headers.get('cookie') || '',
            },
            body: JSON.stringify({
              stateCode,
              tier: 'all',
              triggeredBy: 'dashboard-sync',
            }),
          });
          const ingestResult = await ingestResponse.json().catch(() => ({}));
          if (!ingestResponse.ok) {
            summary.errors.push(
              `Source discovery failed for ${stateCode}: ${ingestResult.message || ingestResult.error || `HTTP ${ingestResponse.status}`}`
            );
          } else if (typeof ingestResult.batch?.newProspectsInserted === 'number') {
            summary.inserted += ingestResult.batch.newProspectsInserted;
          }
        } catch (error) {
          summary.errors.push(
            `Source discovery failed for ${stateCode}: ${error instanceof Error ? error.message : 'Unknown error'}`
          );
        }
      }

      // ── Step 4a: DB audit — total leads for this state ────────────────────
      const { count: totalCount, error: totalError } = await supabase
        .from('leads')
        .select('*', { count: 'exact', head: true })
        .eq('state', stateCode);

      if (totalError) {
        const errMsg = `DB QUERY ERROR (state=${stateCode}): ${totalError.message} [code: ${totalError.code || 'unknown'}]`;
        summary.errors.push(errMsg);
        summary.db_error = errMsg;
        console.error(`[sync/execute] ${portfolio} total count error:`, totalError);
        portfolioSummaries.push(summary);
        grandTotalErrors++;
        continue;
      }

      summary.db_total = totalCount ?? 0;

      // ── Step 4b: Suspicious zero guard ────────────────────────────────────
      if (summary.db_total === 0) {
        const { data: lastEvent } = await supabase
          .from('sync_events')
          .select('payload')
          .eq('operation_id', portfolio)
          .eq('operation_type', 'source_sync')
          .eq('status', 'success')
          .order('created_at', { ascending: false })
          .limit(1)
          .single();

        if (lastEvent?.payload) {
          const prevPayload = lastEvent.payload as Record<string, unknown>;
          const prevCount = (prevPayload.db_total as number) || (prevPayload.leads_imported as number) || 0;
          if (prevCount > 0) {
            summary.previous_count = prevCount;
            summary.suspicious_empty = true;
            summary.errors.push(
              `⚠ SUSPICIOUS EMPTY RESULT: Previous sync had ${prevCount} records, current DB returned 0 for state=${stateCode}. ` +
              `Existing data preserved. Possible causes: RLS policy blocking read, state code mismatch, all leads marked synthetic.`
            );
          }
        }
        portfolioSummaries.push(summary);
        grandTotalErrors += summary.errors.length;
        continue;
      }

      // ── Step 4c: Real vs synthetic breakdown ──────────────────────────────
      const [realResult, syntheticResult, validatedResult, mismatchResult,
             verifiedStatusResult, candidateStatusResult, quarantinedStatusResult] = await Promise.all([
        supabase.from('leads').select('*', { count: 'exact', head: true }).eq('state', stateCode).eq('is_synthetic', false),
        supabase.from('leads').select('*', { count: 'exact', head: true }).eq('state', stateCode).eq('is_synthetic', true),
        supabase.from('leads').select('*', { count: 'exact', head: true }).eq('state', stateCode).eq('addr_validated', true),
        supabase.from('leads').select('*', { count: 'exact', head: true }).eq('state', stateCode).eq('addr_mismatch', true),
        supabase.from('leads').select('*', { count: 'exact', head: true }).eq('state', stateCode).eq('verification_status', 'VERIFIED'),
        supabase.from('leads').select('*', { count: 'exact', head: true }).eq('state', stateCode).eq('verification_status', 'CANDIDATE'),
        supabase.from('leads').select('*', { count: 'exact', head: true }).eq('state', stateCode).eq('verification_status', 'QUARANTINED'),
      ]);

      summary.db_real = realResult.count ?? 0;
      summary.db_synthetic = syntheticResult.count ?? 0;
      summary.db_validated = validatedResult.count ?? 0;
      summary.db_mismatch = mismatchResult.count ?? 0;
      summary.db_verified_status = verifiedStatusResult.count ?? 0;
      summary.db_candidate_status = candidateStatusResult.count ?? 0;
      summary.db_quarantined_status = quarantinedStatusResult.count ?? 0;

      // ── Step 4d: Run verification pipeline on CANDIDATE leads ─────────────
      // Fetch leads that need verification (CANDIDATE or PENDING_VERIFICATION)
      const { data: candidateLeads, error: candidateErr } = await supabase
        .from('leads')
        .select('id, address, city, state, zip, lat, lng, beds, baths, source, listing_url, is_synthetic, addr_validated, addr_mismatch, verification_status, verification_score, raw_address')
        .eq('state', stateCode)
        .in('verification_status', ['CANDIDATE', 'PENDING_VERIFICATION'])
        .eq('is_synthetic', false)
        .limit(100); // Process in batches of 100

      if (candidateErr) {
        summary.errors.push(`Failed to fetch candidates for verification: ${candidateErr.message}`);
      } else if (candidateLeads && candidateLeads.length > 0) {
        summary.candidates_discovered = candidateLeads.length;

        // Track deduplication keys seen in this batch
        const seenDedupeKeys = new Set<string>();

        for (const lead of candidateLeads as Array<Record<string, unknown>>) {
          const rawAddr = (lead.raw_address as string) || (lead.address as string) || '';
          const city = (lead.city as string) || '';
          const state = (lead.state as string) || '';
          const zip = (lead.zip as string) || '';

          // ── Normalize ────────────────────────────────────────────────────
          const normalized = normalizeAddress(rawAddr, city, state, zip);
          summary.addresses_normalized++;

          // ── Address validation ───────────────────────────────────────────
          const addrValidation = validateAddressCityState(
            rawAddr, city, state, zip,
            typeof lead.lat === 'number' ? lead.lat : undefined,
            typeof lead.lng === 'number' ? lead.lng : undefined,
          );

          // ── Build candidate ──────────────────────────────────────────────
          const candidate: PropertyCandidate = {
            raw_address: rawAddr,
            city,
            state,
            zip,
            source: (lead.source as string) || 'unknown',
            source_record_id: lead.id as string,
            source_url: (lead.listing_url as string) || undefined,
            latitude: typeof lead.lat === 'number' ? lead.lat : undefined,
            longitude: typeof lead.lng === 'number' ? lead.lng : undefined,
            bedrooms: typeof lead.beds === 'number' ? lead.beds : undefined,
            bathrooms: typeof lead.baths === 'number' ? lead.baths : undefined,
          };

          // ── Run verification gate ────────────────────────────────────────
          // NOTE: When a licensed provider (ATTOM, BatchData) is configured,
          // pass its response as the second argument here.
          // Without a provider, the system uses structural verification only
          // and marks records as PENDING_VERIFICATION (not VERIFIED).
          summary.verification_attempts++;
          const verResult = verifyPropertyCandidate(candidate);

          // ── Deduplication ────────────────────────────────────────────────
          const dedupeKey = getDeduplicationKey(verResult, candidate);
          if (seenDedupeKeys.has(dedupeKey)) {
            summary.duplicates++;
            continue;
          }
          seenDedupeKeys.add(dedupeKey);

          // ── Count by status ──────────────────────────────────────────────
          switch (verResult.verification_status) {
            case 'VERIFIED':
              summary.verified++;
              break;
            case 'PENDING_VERIFICATION':
              summary.pending_verification++;
              break;
            case 'REJECTED':
              summary.rejected++;
              if (!normalized.is_complete) summary.verification_failures.incomplete_address++;
              else if (!normalized.zip) summary.verification_failures.invalid_zip++;
              else if (verResult.verification_score < 75) summary.verification_failures.score_too_low++;
              else summary.verification_failures.no_property_match++;
              break;
            case 'QUARANTINED':
              summary.quarantined++;
              if (verResult.rejection_reason?.includes('placeholder')) {
                summary.verification_failures.placeholder_address++;
              } else {
                summary.verification_failures.no_property_match++;
              }
              break;
          }

          // ── Update lead with verification result ─────────────────────────
          const updatePayload: Record<string, unknown> = {
            verification_status: verResult.verification_status,
            verification_score: verResult.verification_score,
            verification_method: verResult.verification_method,
            verification_timestamp: verResult.verification_timestamp,
            last_verified_at: verResult.verification_timestamp,
            verification_notes: verResult.verification_notes,
            normalized_address: verResult.normalized_address?.full_normalized || null,
            raw_address: rawAddr,
            addr_validated: addrValidation.valid && !addrValidation.addrMismatch,
            addr_mismatch: addrValidation.addrMismatch ?? false,
            addr_validation_reason: addrValidation.reason || null,
          };

          if (verResult.verified_address) {
            updatePayload.verified_address = verResult.verified_address;
          }
          if (verResult.apn) updatePayload.apn = verResult.apn;
          if (verResult.provider_property_id) updatePayload.provider_property_id = verResult.provider_property_id;
          if (verResult.property_provider) updatePayload.property_provider = verResult.property_provider;
          if (verResult.county) updatePayload.county = verResult.county;
          if (verResult.property_type) updatePayload.property_type = verResult.property_type;
          if (verResult.latitude) updatePayload.lat = verResult.latitude;
          if (verResult.longitude) updatePayload.lng = verResult.longitude;

          // Mark synthetic if rejected as placeholder
          if (verResult.verification_status === 'REJECTED' || verResult.verification_status === 'QUARANTINED') {
            if (verResult.rejection_reason?.includes('placeholder')) {
              updatePayload.is_synthetic = true;
            }
          }

          const { error: updateErr } = await supabase
            .from('leads')
            .update(updatePayload)
            .eq('id', lead.id as string);

          if (updateErr) {
            summary.errors.push(`Failed to update lead ${lead.id}: ${updateErr.message}`);
          } else {
            summary.updated++;
          }

          // ── Write verification log ───────────────────────────────────────
          await supabase.from('property_verification_log').insert({
            lead_id: lead.id as string,
            raw_address: rawAddr,
            normalized_address: verResult.normalized_address?.full_normalized || null,
            provider_name: verResult.property_provider,
            match_result: verResult.verification_status === 'VERIFIED',
            provider_property_id: verResult.provider_property_id,
            apn: verResult.apn,
            latitude: verResult.latitude,
            longitude: verResult.longitude,
            verification_score: verResult.verification_score,
            verification_status: verResult.verification_status,
            rejection_reason: verResult.rejection_reason,
            verification_method: verResult.verification_method,
          });

          // ── Quarantine rejected/quarantined records ───────────────────────
          if (verResult.verification_status === 'QUARANTINED' || verResult.verification_status === 'REJECTED') {
            await supabase.from('property_quarantine').insert({
              original_lead_id: lead.id as string,
              raw_address: rawAddr,
              normalized_address: verResult.normalized_address?.full_normalized || null,
              city,
              state,
              zip,
              source: candidate.source,
              source_url: candidate.source_url || null,
              verification_status: verResult.verification_status,
              verification_score: verResult.verification_score,
              verification_method: verResult.verification_method,
              verification_notes: verResult.verification_notes,
              rejection_reason: verResult.rejection_reason,
              raw_record: {
                id: lead.id,
                address: rawAddr,
                city,
                state,
                zip,
                source: candidate.source,
              },
            });
          }
        }
      }

      // ── Step 4e: Address validation on un-validated real leads ────────────
      const { data: unvalidatedLeads, error: unvalidErr } = await supabase
        .from('leads')
        .select('id, address, city, state, zip, lat, lng')
        .eq('state', stateCode)
        .eq('is_synthetic', false)
        .is('addr_validated', null)
        .limit(50);

      if (!unvalidErr && unvalidatedLeads && unvalidatedLeads.length > 0) {
        let mismatchFound = 0;
        for (const lead of unvalidatedLeads as Array<Record<string, unknown>>) {
          const validation = validateAddressCityState(
            (lead.address as string) || '',
            (lead.city as string) || '',
            (lead.state as string) || '',
            (lead.zip as string) || '',
            typeof lead.lat === 'number' ? lead.lat : undefined,
            typeof lead.lng === 'number' ? lead.lng : undefined,
          );
          await supabase.from('leads').update({
            addr_validated: validation.valid && !validation.addrMismatch,
            addr_mismatch: validation.addrMismatch ?? false,
            addr_validation_reason: validation.reason || null,
          }).eq('id', lead.id as string);
          if (validation.addrMismatch) mismatchFound++;
        }
        if (mismatchFound > 0) {
          summary.errors.push(
            `Address validation: ${mismatchFound}/${unvalidatedLeads.length} sampled leads have city/state mismatches — flagged`
          );
        }
      }

      // ── Step 4f: Update sync_source_coverage ─────────────────────────────
      await supabase
        .from('sync_source_coverage')
        .update({ updated_at: syncNow })
        .eq('portfolio', portfolio)
        .eq('status', 'active');

      // ── Step 4g: Build pipeline report ───────────────────────────────────
      const pipelineReport = createEmptyReport(portfolio);
      pipelineReport.candidates_discovered = summary.candidates_discovered;
      pipelineReport.addresses_normalized = summary.addresses_normalized;
      pipelineReport.verification_attempts = summary.verification_attempts;
      pipelineReport.verified = summary.verified;
      pipelineReport.rejected = summary.rejected;
      pipelineReport.quarantined = summary.quarantined;
      pipelineReport.pending_verification = summary.pending_verification;
      pipelineReport.duplicates = summary.duplicates;
      pipelineReport.inserted = summary.inserted;
      pipelineReport.updated = summary.updated;
      pipelineReport.verification_failures = summary.verification_failures;
      pipelineReport.source_errors = summary.errors;
      pipelineReport.duration_ms = Date.now() - portfolioStart;
      pipelineReport.sync_complete = summary.errors.filter(e => !e.startsWith('Address validation')).length === 0;
      pipelineReport.provider_available = summary.provider_available;

      summary.sync_report = formatSyncReport(pipelineReport);
      summary.duration_ms = Date.now() - portfolioStart;

      grandTotalCandidates += summary.candidates_discovered;
      grandTotalVerified += summary.verified + summary.pending_verification;
      grandTotalInserted += summary.inserted + summary.updated;
      grandTotalQuarantined += summary.quarantined;
      grandTotalErrors += summary.errors.filter(e => !e.startsWith('Address validation')).length;

      portfolioSummaries.push(summary);
    }

    // ── Step 5: Write sync_events ─────────────────────────────────────────────
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const userId = user?.id || null;

      for (const summary of portfolioSummaries) {
        const eventPayload = {
          portfolio: summary.portfolio,
          state_code: summary.state_code,
          // Pipeline counts
          candidates_discovered: summary.candidates_discovered,
          addresses_normalized: summary.addresses_normalized,
          verification_attempts: summary.verification_attempts,
          verified: summary.verified,
          rejected: summary.rejected,
          quarantined: summary.quarantined,
          pending_verification: summary.pending_verification,
          duplicates: summary.duplicates,
          inserted: summary.inserted,
          updated: summary.updated,
          // DB audit
          db_total: summary.db_total,
          db_real: summary.db_real,
          db_synthetic: summary.db_synthetic,
          db_validated: summary.db_validated,
          db_mismatch: summary.db_mismatch,
          db_verified_status: summary.db_verified_status,
          db_candidate_status: summary.db_candidate_status,
          db_quarantined_status: summary.db_quarantined_status,
          // Failures
          verification_failures: summary.verification_failures,
          errors: summary.errors,
          suspicious_empty: summary.suspicious_empty,
          previous_count: summary.previous_count,
          provider_available: summary.provider_available,
          sync_mode: 'verification_pipeline',
          sync_report: summary.sync_report,
          duration_ms: summary.duration_ms,
        };

        const hasRealErrors = summary.errors.filter(e => !e.startsWith('Address validation')).length > 0;
        await supabase.from('sync_events').insert({
          ...(userId ? { user_id: userId } : {}),
          operation_type: 'source_sync',
          operation_id: summary.portfolio,
          status: hasRealErrors ? 'failed' : 'success',
          attempt_count: 1,
          max_attempts: 7,
          payload: eventPayload,
        });
      }
    } catch (eventErr) {
      console.error('[sync/execute] sync_events write error:', eventErr);
    }

    // ── Step 6: Update portfolio_sync_status ──────────────────────────────────
    if (syncRunId && portfolioFilter) {
      const uniqueSources = [...new Set(sources.map((r) => r.source_name))];
      const completedAt = new Date().toISOString();
      const matchingSummary = portfolioSummaries.find((s) => s.portfolio === portfolioFilter);

      for (const sourceName of uniqueSources) {
        const sourceErrors = matchingSummary?.errors.filter(e => !e.startsWith('Address validation')) ?? [];
        await supabase
          .from('portfolio_sync_status')
          .update({
            status: sourceErrors.length > 0 ? 'failed' : 'success',
            completed_at: completedAt,
            leads_inserted: matchingSummary?.inserted ?? 0,
            leads_updated: matchingSummary?.updated ?? 0,
            error_message: sourceErrors.length > 0 ? sourceErrors.slice(0, 3).join('; ') : null,
          })
          .eq('portfolio_id', portfolioFilter)
          .eq('source_name', sourceName)
          .eq('sync_run_id', syncRunId);
      }
    }

    const duration = Date.now() - startTime;

    // ── Step 7: Build response ────────────────────────────────────────────────
    return NextResponse.json({
      success: true,
      sync_mode: 'verification_pipeline',
      sync_mode_description:
        'Property verification pipeline — every candidate must pass the verification gate. ' +
        'NO VERIFICATION = NO PRODUCTION PROPERTY. '+ 'Unverified candidates are quarantined, not inserted.',
      pipeline_summary: {
        total_candidates: grandTotalCandidates,
        total_verified: grandTotalVerified,
        total_inserted: grandTotalInserted,
        total_quarantined: grandTotalQuarantined,
        total_errors: grandTotalErrors,
        provider_note: 'Structural verification only — configure a licensed property data provider (ATTOM, BatchData) via BATCHDATA_API_KEY for full verification',
      },
      portfolios: portfolioSummaries.map(s => ({
        portfolio: s.portfolio,
        state_code: s.state_code,
        // Pipeline
        candidates_discovered: s.candidates_discovered,
        addresses_normalized: s.addresses_normalized,
        verification_attempts: s.verification_attempts,
        verified: s.verified,
        rejected: s.rejected,
        quarantined: s.quarantined,
        pending_verification: s.pending_verification,
        duplicates: s.duplicates,
        inserted: s.inserted,
        updated: s.updated,
        // DB audit
        db_total: s.db_total,
        db_real: s.db_real,
        db_synthetic: s.db_synthetic,
        db_verified_status: s.db_verified_status,
        db_candidate_status: s.db_candidate_status,
        db_quarantined_status: s.db_quarantined_status,
        // Failures
        verification_failures: s.verification_failures,
        errors: s.errors,
        suspicious_empty: s.suspicious_empty,
        previous_count: s.previous_count,
        provider_available: s.provider_available,
        sync_report: s.sync_report,
        duration_ms: s.duration_ms,
      })).sort((a, b) => a.portfolio.localeCompare(b.portfolio)),
      ran_at: new Date().toISOString(),
      duration_ms: duration,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unexpected error';
    console.error('[sync/execute] Top-level error:', msg, err);
    return NextResponse.json(
      { error: msg, stack: err instanceof Error ? err.stack : undefined },
      { status: 500 }
    );
  }
}
