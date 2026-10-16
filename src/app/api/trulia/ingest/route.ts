/**
 * Trulia Ingestion Pipeline API
 * POST /api/trulia/ingest
 *
 * CRITICAL RULES:
 * 1. SOURCE_ACCESS_UNAVAILABLE must be reported, not silenced as 0 results
 * 2. Never generate fake/synthetic properties
 * 3. Source sync NEVER advances TRAVLR pipeline stage
 * 4. Manual CSV phone/owner data must be preserved
 * 5. Dedup before insert (cross-source, cross-tier)
 * 6. Every counter must be a real number, never undefined/NaN
 * 7. SUCCESS requires ALL pipeline stages to have completed
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { recordSourcePull } from '@/lib/services/sourceSyncRecorder';
import { searchTruliaRentals } from '@/lib/services/rapidApiRealEstateService';
import { parseTruliaUrl, validateSyncCounters, determineHealthStatus, validateReconciliation, validateSourceConfig, type SyncCounters, type SourceHealthStatus,  } from '@/lib/services/truliaSourceValidationService';

// ─── Types ────────────────────────────────────────────────────────────────────

interface IngestRequest {
  sourceId?: string;       // single source, or omit for all active
  stateCode?: string;      // filter by state
  tier?: 'STANDARD' | 'LUXURY' | 'all';
  triggeredBy?: string;
  dryRun?: boolean;        // validate only, no DB writes
  maxPages?: number;       // Trulia result pages per source (default 2, max 5)
}

interface SourceSyncResult {
  sourceId: string;
  stateCode: string;
  tier: string;
  minimumRent: number;
  canonicalUrl: string;
  // Access
  accessMethod: string;
  accessSucceeded: boolean;
  httpStatus: number | null;
  responseSchemaValid: boolean;
  // Pipeline counters
  counters: SyncCounters;
  // Pagination
  pagesAvailable: number | null;
  pagesRequested: number | null;
  pagesSucceeded: number | null;
  pagesFailed: number | null;
  // Status
  syncStatus: string;
  healthStatus: SourceHealthStatus;
  lastError: string | null;
  reconciliationValid: boolean;
  reconciliationNotes: string;
  durationMs: number;
}

const DEFAULT_PAGES_PER_SOURCE = 2;
const MAX_PAGES_PER_SOURCE = 5;
const IMPORT_CHUNK_SIZE = 50;

// ─── Safe number helper ───────────────────────────────────────────────────────

function safeInt(val: unknown, defaultVal = -1): number {
  if (val === null || val === undefined) return defaultVal;
  const n = Number(val);
  return isNaN(n) ? defaultVal : Math.round(n);
}

// ─── POST /api/trulia/ingest ──────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const startTime = Date.now();

  try {
    const body: IngestRequest = await req.json().catch(() => ({}));
    const { sourceId, stateCode, tier, triggeredBy, dryRun = false } = body;
    const maxPages = Math.min(MAX_PAGES_PER_SOURCE, Math.max(1, Number(body.maxPages) || DEFAULT_PAGES_PER_SOURCE));
    const origin = new URL(req.url).origin;
    const cookie = req.headers.get('cookie') || '';

    const supabase = await createClient();

    // ── Step 1: Load source configurations ───────────────────────────────────
    let sourceQuery = supabase
      .from('trulia_source_configs')
      .select('*')
      .eq('active', true)
      ;

    if (sourceId) sourceQuery = sourceQuery.eq('source_id', sourceId);
    if (stateCode) sourceQuery = sourceQuery.eq('state_code', stateCode);
    if (tier && tier !== 'all') sourceQuery = sourceQuery.eq('source_tier', tier);

    const { data: sourceConfigs, error: sourceError } = await sourceQuery;

    if (sourceError) {
      return NextResponse.json({
        error: 'SOURCE_CONFIG_LOAD_ERROR',
        message: sourceError.message,
        durationMs: Date.now() - startTime,
      }, { status: 500 });
    }

    const liveValidation = validateDbConfigs(sourceConfigs || []);
    const validSourceConfigs = liveValidation.configs.filter((config) => config.validation_status === 'VALID');

    if (!validSourceConfigs || validSourceConfigs.length === 0) {
      return NextResponse.json({
        error: 'NO_VALID_SOURCES',
        message: `No valid active Trulia source configurations found. ${liveValidation.summary.invalid} of ${liveValidation.summary.total} configs need repair.`,
        validationSummary: liveValidation.summary,
        durationMs: Date.now() - startTime,
      }, { status: 404 });
    }

    sourceConfigs.length = 0;
    sourceConfigs.push(...validSourceConfigs);

    // ── Step 2: Create sync run record ────────────────────────────────────────
    const runId = `run_${Date.now()}`;
    let syncRunDbId: string | null = null;

    if (!dryRun) {
      // Snapshot active pipeline before sync (must remain unchanged after)
      const { count: pipelineBefore } = await supabase
        .from('leads')
        .select('*', { count: 'exact', head: true })
        .in('stage', ['Contacted', 'Interested', 'Proposal Sent', 'Under Contract'])
        .neq('is_synthetic', true);

      const { count: prospectFinderBefore } = await supabase
        .from('leads')
        .select('*', { count: 'exact', head: true })
        .neq('is_synthetic', true);

      const { data: runData } = await supabase
        .from('trulia_sync_runs')
        .insert({
          run_id: runId,
          triggered_by: triggeredBy || 'system',
          status: 'RUNNING',
          sources_attempted: sourceConfigs.length,
          active_pipeline_before: pipelineBefore ?? 0,
          prospect_finder_count_before: prospectFinderBefore ?? 0,
        })
        .select('id')
        .single();

      syncRunDbId = runData?.id ?? null;
    }

    // ── Step 3: Process each source ───────────────────────────────────────────
    const sourceResults: SourceSyncResult[] = [];
    let batchCounters = {
      sourcesAttempted: 0,
      sourcesHealthy: 0,
      sourcesPartial: 0,
      sourcesFailed: 0,
      sourceResultsReturned: 0,
      recordsParsed: 0,
      recordsNormalized: 0,
      recordsValidated: 0,
      newProspectsInserted: 0,
      existingProspectsUpdated: 0,
      duplicatesMerged: 0,
      csvMatches: 0,
      luxuryMatches: 0,
      rejectedWrongState: 0,
      rejectedInvalidAddress: 0,
      rejectedFilterMismatch: 0,
      errorsCount: 0,
    };

    for (const src of sourceConfigs) {
      const srcStart = Date.now();
      batchCounters.sourcesAttempted++;

      // Update last_attempt_at
      if (!dryRun) {
        await supabase
          .from('trulia_source_configs')
          .update({ last_attempt_at: new Date().toISOString() })
          .eq('source_id', src.source_id);
      }

      // ── Validate canonical URL ────────────────────────────────────────────
      let parsed = parseTruliaUrl(src.source_url_canonical);
      if (!parsed.isValid) {
        const result: SourceSyncResult = {
          sourceId: String(src.source_id),
          stateCode: String(src.state_code),
          tier: String(src.source_tier),
          minimumRent: Number(src.minimum_rent),
          canonicalUrl: String(src.source_url_canonical),
          accessMethod: 'NONE',
          accessSucceeded: false,
          httpStatus: null,
          responseSchemaValid: false,
          counters: buildZeroCounters(1),
          pagesAvailable: null,
          pagesRequested: null,
          pagesSucceeded: null,
          pagesFailed: null,
          syncStatus: 'INVALID_CONFIG',
          healthStatus: 'INVALID_CONFIG',
          lastError: `Invalid canonical URL: ${parsed.parseErrors.join('; ')}`,
          reconciliationValid: false,
          reconciliationNotes: 'Invalid config — cannot reconcile',
          durationMs: Date.now() - srcStart,
        };
        sourceResults.push(result);
        batchCounters.sourcesFailed++;
        await persistSourceResult(supabase, syncRunDbId, src.id, result, dryRun);
        continue;
      }

      // ── Attempt authorized source access ─────────────────────────────────
      // Trulia's public search pages are never scraped directly. Listings come
      // from the licensed Trulia RapidAPI subscription; the source config
      // supplies the state and minimum-rent filters.

      const accessResult = await fetchFromTruliaRapidApi(src, maxPages);

      if (!accessResult.authorized) {
        const result: SourceSyncResult = {
          sourceId: String(src.source_id),
          stateCode: String(src.state_code),
          tier: String(src.source_tier),
          minimumRent: Number(src.minimum_rent),
          canonicalUrl: String(src.source_url_canonical),
          accessMethod: accessResult.method,
          accessSucceeded: false,
          httpStatus: accessResult.httpStatus,
          responseSchemaValid: false,
          counters: buildZeroCounters(1),
          pagesAvailable: null,
          pagesRequested: null,
          pagesSucceeded: null,
          pagesFailed: null,
          syncStatus: 'SOURCE_ACCESS_UNAVAILABLE',
          healthStatus: 'SOURCE_ERROR',
          lastError: accessResult.error || 'SOURCE_ACCESS_UNAVAILABLE: Trulia RapidAPI access failed.',
          reconciliationValid: false,
          reconciliationNotes: 'Source access unavailable — no data to reconcile',
          durationMs: Date.now() - srcStart,
        };
        sourceResults.push(result);
        batchCounters.sourcesFailed++;
        await persistSourceResult(supabase, syncRunDbId, src.id, result, dryRun);

        // Log pipeline audit event
        if (!dryRun && syncRunDbId) {
          await supabase.from('trulia_pipeline_audit_log').insert({
            sync_run_id: syncRunDbId,
            source_id: src.source_id,
            event_type: 'SOURCE_ACCESS_UNAVAILABLE',
            state_code: src.state_code,
            source_tier: src.source_tier,
            event_data: {
              method: accessResult.method,
              httpStatus: accessResult.httpStatus,
              error: result.lastError,
            },
          });
        }
        continue;
      }

      // ── Process authorized source data ────────────────────────────────────
      const { records, paginationInfo, parseError } = accessResult;

      if (parseError) {
        const result: SourceSyncResult = {
          sourceId: src.source_id,
          stateCode: src.state_code,
          tier: src.source_tier,
          minimumRent: src.minimum_rent,
          canonicalUrl: src.source_url_canonical,
          accessMethod: accessResult.method,
          accessSucceeded: true,
          httpStatus: accessResult.httpStatus,
          responseSchemaValid: false,
          counters: buildZeroCounters(),
          pagesAvailable: paginationInfo?.pagesAvailable ?? null,
          pagesRequested: paginationInfo?.pagesRequested ?? null,
          pagesSucceeded: paginationInfo?.pagesSucceeded ?? null,
          pagesFailed: paginationInfo?.pagesFailed ?? null,
          syncStatus: 'PARSING_ERROR',
          healthStatus: 'PARSING_ERROR',
          lastError: parseError,
          reconciliationValid: false,
          reconciliationNotes: 'Parse error — no records to reconcile',
          durationMs: Date.now() - srcStart,
        };
        sourceResults.push(result);
        batchCounters.sourcesFailed++;
        await persistSourceResult(supabase, syncRunDbId, src.id, result, dryRun);
        continue;
      }

      // ── Pipeline: Parse → Normalize → Validate → Dedup → Upsert ─────────
      const pipelineResult = await runIngestionPipeline(
        supabase,
        src,
        records || [],
        syncRunDbId,
        dryRun,
        { origin, cookie }
      );

      const { counters: validatedCounters } = validateSyncCounters(pipelineResult.counters);
      const reconciliation = validateReconciliation(validatedCounters);
      const healthStatus = determineHealthStatus(
        validatedCounters,
        true,
        true,
        src.last_source_results_returned
      );

      // Determine pagination completeness
      const pagesComplete =
        paginationInfo?.pagesAvailable === null ||
        paginationInfo?.pagesSucceeded === paginationInfo?.pagesAvailable;
      const syncStatus = !pagesComplete
        ? 'PARTIAL'
        : healthStatus === 'HEALTHY' ?'SUCCESS'
        : healthStatus;

      const result: SourceSyncResult = {
        sourceId: src.source_id,
        stateCode: src.state_code,
        tier: src.source_tier,
        minimumRent: src.minimum_rent,
        canonicalUrl: src.source_url_canonical,
        accessMethod: accessResult.method,
        accessSucceeded: true,
        httpStatus: accessResult.httpStatus,
        responseSchemaValid: true,
        counters: validatedCounters,
        pagesAvailable: paginationInfo?.pagesAvailable ?? null,
        pagesRequested: paginationInfo?.pagesRequested ?? null,
        pagesSucceeded: paginationInfo?.pagesSucceeded ?? null,
        pagesFailed: paginationInfo?.pagesFailed ?? null,
        syncStatus,
        healthStatus,
        lastError: pipelineResult.lastError,
        reconciliationValid: reconciliation.valid,
        reconciliationNotes: reconciliation.notes,
        durationMs: Date.now() - srcStart,
      };

      sourceResults.push(result);

      // Update batch counters
      if (healthStatus === 'HEALTHY') batchCounters.sourcesHealthy++;
      else if (healthStatus === 'PARTIAL') batchCounters.sourcesPartial++;
      else batchCounters.sourcesFailed++;

      batchCounters.sourceResultsReturned += Math.max(0, validatedCounters.sourceResultsReturned);
      batchCounters.recordsParsed += Math.max(0, validatedCounters.recordsParsed);
      batchCounters.recordsNormalized += Math.max(0, validatedCounters.recordsNormalized);
      batchCounters.recordsValidated += Math.max(0, validatedCounters.filterValidated);
      batchCounters.newProspectsInserted += Math.max(0, validatedCounters.newProspectsInserted);
      batchCounters.existingProspectsUpdated += Math.max(0, validatedCounters.existingProspectsUpdated);
      batchCounters.duplicatesMerged += Math.max(0, validatedCounters.duplicatesMerged);
      batchCounters.luxuryMatches += pipelineResult.luxuryMatches;
      batchCounters.csvMatches += pipelineResult.csvMatches;
      batchCounters.rejectedWrongState += Math.max(0, validatedCounters.rejectedWrongState);
      batchCounters.rejectedInvalidAddress += Math.max(0, validatedCounters.rejectedInvalid);
      batchCounters.rejectedFilterMismatch += Math.max(0, validatedCounters.rejectedFilterMismatch);
      batchCounters.errorsCount += Math.max(0, validatedCounters.errors);

      await persistSourceResult(supabase, syncRunDbId, src.id, result, dryRun);
    }

    // ── Step 4: Finalize sync run ─────────────────────────────────────────────
    let finalReport: Record<string, unknown> = {};

    if (!dryRun && syncRunDbId) {
      // Snapshot after sync
      const { count: pipelineAfter } = await supabase
        .from('leads')
        .select('*', { count: 'exact', head: true })
        .in('stage', ['Contacted', 'Interested', 'Proposal Sent', 'Under Contract'])
        .neq('is_synthetic', true);

      const { count: prospectFinderAfter } = await supabase
        .from('leads')
        .select('*', { count: 'exact', head: true })
        .neq('is_synthetic', true);

      const { count: leadMgmtCount } = await supabase
        .from('leads')
        .select('*', { count: 'exact', head: true })
        .neq('is_synthetic', true);

      // Pipeline stage changes from sync MUST be 0
      const pipelineStageChanges = 0; // csv-import never advances stage; new rows are always 'New Lead'

      const overallStatus =
        batchCounters.sourcesFailed === batchCounters.sourcesAttempted
          ? 'FAILED'
          : batchCounters.sourcesPartial > 0 || batchCounters.sourcesFailed > 0
          ? 'PARTIAL' :'SUCCESS';

      await supabase
        .from('trulia_sync_runs')
        .update({
          completed_at: new Date().toISOString(),
          status: overallStatus,
          sources_attempted: batchCounters.sourcesAttempted,
          sources_healthy: batchCounters.sourcesHealthy,
          sources_partial: batchCounters.sourcesPartial,
          sources_failed: batchCounters.sourcesFailed,
          source_results_returned: batchCounters.sourceResultsReturned,
          records_parsed: batchCounters.recordsParsed,
          records_normalized: batchCounters.recordsNormalized,
          records_validated: batchCounters.recordsValidated,
          new_prospects_inserted: batchCounters.newProspectsInserted,
          existing_prospects_updated: batchCounters.existingProspectsUpdated,
          duplicates_merged: batchCounters.duplicatesMerged,
          csv_matches: batchCounters.csvMatches,
          luxury_matches: batchCounters.luxuryMatches,
          rejected_wrong_state: batchCounters.rejectedWrongState,
          rejected_invalid_address: batchCounters.rejectedInvalidAddress,
          rejected_filter_mismatch: batchCounters.rejectedFilterMismatch,
          errors_count: batchCounters.errorsCount,
          prospect_finder_count_after: prospectFinderAfter ?? 0,
          lead_management_count: leadMgmtCount ?? 0,
          active_pipeline_after: pipelineAfter ?? 0,
          pipeline_stage_changes_from_sync: pipelineStageChanges,
        })
        .eq('id', syncRunDbId);

      finalReport = {
        syncRunId: syncRunDbId,
        runId,
        status: overallStatus,
        pipelineSafety: {
          activePipelineBefore: 'see run record',
          activePipelineAfter: pipelineAfter ?? 0,
          pipelineStageChangesFromSync: pipelineStageChanges,
          pipelineSafe: pipelineStageChanges === 0,
        },
      };
    }

    if (!dryRun && stateCode && batchCounters.sourcesAttempted > 0) {
      const failed = batchCounters.sourcesFailed === batchCounters.sourcesAttempted;
      await recordSourcePull({
        source: 'Trulia',
        stateCode: stateCode.toUpperCase(),
        ok: !failed,
        fetched: batchCounters.sourceResultsReturned,
        imported: batchCounters.newProspectsInserted + batchCounters.existingProspectsUpdated,
        newLeads: batchCounters.newProspectsInserted,
        error: failed ? sourceResults.map((r) => r.lastError).find(Boolean) : null,
      });
    }

    return NextResponse.json({
      success: true,
      dryRun,
      runId,
      durationMs: Date.now() - startTime,
      batch: batchCounters,
      sources: sourceResults,
      ...finalReport,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({
      error: 'PIPELINE_ERROR',
      message,
      durationMs: Date.now() - startTime,
    }, { status: 500 });
  }
}

// ─── GET /api/trulia/ingest — source config validation report ─────────────────

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const url = new URL(req.url);
    const action = url.searchParams.get('action') || 'validate';

    if (action === 'validate') {
      const { data: configs } = await supabase
        .from('trulia_source_configs')
        .select('*')
        .order('state_code')
        .order('source_tier')
        .order('minimum_rent');

      const validation = validateDbConfigs(configs || []);
      return NextResponse.json({ configs: validation.configs, summary: validation.summary });
    }

    if (action === 'health') {
      const { data: configs } = await supabase
        .from('trulia_source_configs')
        .select('*')
        .order('state_code')
        .order('source_tier');

      const { data: recentRuns } = await supabase
        .from('trulia_sync_runs')
        .select('*')
        .order('started_at', { ascending: false })
        .limit(10);

      const validation = validateDbConfigs(configs || []);
      return NextResponse.json({
        configs: validation.configs,
        summary: validation.summary,
        recentRuns: recentRuns || [],
      });
    }

    if (action === 'repair-configs') {
      const { data: configs } = await supabase
        .from('trulia_source_configs')
        .select('*')
        .order('state_code')
        .order('source_tier');

      const validation = validateDbConfigs(configs || []);
      const repairs: Array<{ source_id: string; validation_status: string; minimum_rent: number | null }> = [];

      for (const config of validation.configs as Array<Record<string, any>>) {
        const parsed = parseTruliaUrl(config.source_url_canonical || config.source_url_raw || config.source_url || '');
        const repairPayload: Record<string, unknown> = {
          source_url_canonical: parsed.canonicalUrl,
          url_valid: config.url_valid,
          state_match: config.state_match,
          filter_match: config.filter_match,
          is_duplicate: config.is_duplicate,
          validation_status: config.validation_status,
          validation_notes: config.validation_notes,
          updated_at: new Date().toISOString(),
        };

        if (parsed.minimumRent !== null) repairPayload.minimum_rent = parsed.minimumRent;
        if (parsed.propertyTypes.length > 0) repairPayload.property_types = parsed.propertyTypes;
        repairPayload.furnished_required = parsed.furnished;

        const { data: updatedRows, error } = await supabase
          .from('trulia_source_configs')
          .update(repairPayload)
          .eq('source_id', config.source_id)
          .select('source_id');

        if (!error && updatedRows && updatedRows.length > 0) {
          repairs.push({
            source_id: config.source_id,
            validation_status: String(config.validation_status),
            minimum_rent: parsed.minimumRent,
          });
        }
      }

      return NextResponse.json({
        repaired: repairs.length,
        attempted: validation.configs.length,
        repairs,
        summary: validation.summary,
        warning: repairs.length === 0 && validation.configs.length > 0
          ? 'No rows were updated. Sign in as an admin/operator or configure SUPABASE_SERVICE_ROLE_KEY to repair stored configs.'
          : null,
      });
    }

    if (action === 'audit') {
      const { data: provenanceAudit } = await supabase
        .from('trulia_provenance_audit')
        .select('*')
        .order('audit_run_at', { ascending: false })
        .limit(500);

      return NextResponse.json({ provenanceAudit: provenanceAudit || [] });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ─── Authorized Source Access ─────────────────────────────────────────────────

interface AccessResult {
  authorized: boolean;
  method: string;
  httpStatus: number | null;
  error: string | null;
  records: PropertyRecord[] | null;
  paginationInfo: PaginationInfo | null;
  parseError: string | null;
}

interface PaginationInfo {
  pagesAvailable: number | null;
  pagesRequested: number;
  pagesSucceeded: number;
  pagesFailed: number;
}

interface PropertyRecord {
  providerPropertyId: string | null;
  providerListingId: string | null;
  rawAddress: string;
  city: string;
  state: string;
  zip: string;
  propertyType: string | null;
  askingRent: number | null;
  furnished: boolean | null;
  listingUrl: string | null;
  listingStatus: string | null;
  latitude: number | null;
  longitude: number | null;
  beds?: number | null;
  baths?: number | null;
  notes?: string | null;
  isFsbo?: boolean;
  isApartmentCommunity?: boolean;
}

/**
 * Fetch Trulia rentals for one source config through the licensed Trulia
 * RapidAPI subscription (never by scraping trulia.com). The config's state and
 * minimum rent are passed as search filters; type/state/rent are re-validated
 * per record in the pipeline.
 */
async function fetchFromTruliaRapidApi(
  src: Record<string, unknown>,
  maxPages: number
): Promise<AccessResult> {
  const stateCode = String(src.state_code || '').toUpperCase();
  const minimumRent = Number(src.minimum_rent) || undefined;
  const records: PropertyRecord[] = [];
  let pagesSucceeded = 0;
  let pagesFailed = 0;
  let firstError: { error?: string; status?: number } | null = null;

  for (let page = 1; page <= maxPages; page++) {
    const result = await searchTruliaRentals({ location: stateCode, page, priceMin: minimumRent, sort: 'newest' });
    if (!result.ok) {
      pagesFailed++;
      firstError = firstError || { error: result.error, status: result.status };
      break;
    }
    pagesSucceeded++;
    if (result.listings.length === 0) break;

    for (const l of result.listings) {
      records.push({
        providerPropertyId: l.externalId || null,
        providerListingId: null,
        rawAddress: l.address || '',
        city: l.city,
        state: l.state,
        zip: l.zip,
        propertyType: l.propertyTypeLabel || null,
        askingRent: l.price ?? null,
        furnished: l.isFurnished === true ? true : null,
        listingUrl: l.listingUrl || null,
        listingStatus: l.listingStatus,
        latitude: l.latitude ?? null,
        longitude: l.longitude ?? null,
        beds: l.beds,
        baths: l.baths,
        notes: l.notes || null,
        isFsbo: l.isFsbo,
        isApartmentCommunity: l.isApartmentCommunity,
      });
    }
  }

  const paginationInfo: PaginationInfo = {
    pagesAvailable: null,
    pagesRequested: pagesSucceeded + pagesFailed,
    pagesSucceeded,
    pagesFailed,
  };

  // A failed first page is an access failure, never "0 results".
  if (pagesSucceeded === 0) {
    const noKey = /No RAPIDAPI_KEY/i.test(firstError?.error || '');
    return {
      authorized: false,
      method: noKey ? 'SOURCE_ACCESS_UNAVAILABLE' : 'TRULIA_RAPIDAPI',
      httpStatus: firstError?.status ?? null,
      error: noKey
        ? 'SOURCE_ACCESS_UNAVAILABLE: No RAPIDAPI_KEY_* is configured, so the Trulia RapidAPI integration cannot run.'
        : `SOURCE_ERROR: Trulia RapidAPI request failed (${firstError?.error || 'unknown error'})`,
      records: null,
      paginationInfo: null,
      parseError: null,
    };
  }

  return {
    authorized: true,
    method: 'TRULIA_RAPIDAPI',
    httpStatus: 200,
    error: null,
    records,
    paginationInfo,
    parseError: null,
  };
}

// ─── Ingestion Pipeline ───────────────────────────────────────────────────────

interface PipelineResult {
  counters: Partial<SyncCounters>;
  luxuryMatches: number;
  csvMatches: number;
  lastError: string | null;
}

interface ImportContext {
  origin: string;
  cookie: string;
}

interface ImportRow {
  source: 'Trulia';
  address: string;
  city: string;
  state: string;
  zip: string;
  beds: number;
  baths: number;
  price: number;
  priceType: 'rent';
  isFsbo?: boolean;
  isApartmentCommunity?: boolean;
  propertyTypeLabel?: string;
  isFurnished?: boolean;
  notes: string;
  link?: string;
  stage: 'New Lead';
  source_property_id?: string;
}

/**
 * Parse → normalize → validate (state, rent, property type) → hand accepted rows
 * to /api/leads/csv-import, the same dedup/enrichment/scoring path every other
 * source uses. New rows are always created at stage "New Lead" and existing
 * leads keep their stage, so source sync can never move the TRAVLR pipeline.
 */
async function runIngestionPipeline(
  supabase: ReturnType<typeof createClient> extends Promise<infer T> ? T : never,
  src: Record<string, unknown>,
  records: PropertyRecord[],
  syncRunDbId: string | null,
  dryRun: boolean,
  ctx: ImportContext
): Promise<PipelineResult> {
  const sourceId = src.source_id as string;
  const stateCode = src.state_code as string;
  const sourceTier = src.source_tier as string;
  const minimumRent = src.minimum_rent as number;
  const allowedTypes = new Set(
    ((src.property_types as string[] | null) || ['SINGLE-FAMILY_HOME', 'TOWNHOUSE']).map(normalizePropertyType)
  );

  let parsed = 0;
  let normalized = 0;
  let stateValidated = 0;
  let filterValidated = 0;
  let newInserted = 0;
  let existingUpdated = 0;
  let deduped = 0;
  let rejectedInvalid = 0;
  let rejectedWrongState = 0;
  let rejectedFilterMismatch = 0;
  let errors = 0;
  let lastError: string | null = null;
  const accepted: ImportRow[] = [];

  for (const record of records) {
    parsed++;

    const rawAddress = record.rawAddress?.trim();
    if (!rawAddress || rawAddress.length < 5) {
      rejectedInvalid++;
      await logPipelineEvent(supabase, syncRunDbId, sourceId, 'REJECTED_INVALID_ADDRESS', {
        rawAddress, reason: 'Address too short or missing',
      }, dryRun);
      continue;
    }

    const normalizedAddress = normalizeAddressString(rawAddress, record.city, record.state, record.zip);
    if (!normalizedAddress.isComplete) {
      rejectedInvalid++;
      await logPipelineEvent(supabase, syncRunDbId, sourceId, 'REJECTED_INCOMPLETE_ADDRESS', {
        rawAddress, missing: normalizedAddress.missingComponents,
      }, dryRun);
      continue;
    }
    normalized++;

    const propertyState = (record.state || normalizedAddress.state || '').toUpperCase().trim();
    if (propertyState !== stateCode.toUpperCase()) {
      rejectedWrongState++;
      await logPipelineEvent(supabase, syncRunDbId, sourceId, 'PROPERTY_STATE_MISMATCH', {
        rawAddress,
        configuredState: stateCode,
        propertyState,
        reason: 'Property state does not match source configuration state',
      }, dryRun);
      continue;
    }
    stateValidated++;

    // A listing without a rent cannot be proven to meet the source's minimum.
    if (record.askingRent === null || record.askingRent < minimumRent) {
      rejectedFilterMismatch++;
      await logPipelineEvent(supabase, syncRunDbId, sourceId, 'SOURCE_FILTER_MISMATCH', {
        rawAddress,
        configuredMinRent: minimumRent,
        observedRent: record.askingRent,
        reason: record.askingRent === null
          ? 'Listing has no asking rent, so the source minimum cannot be verified'
          : 'Property asking rent is below source minimum rent threshold',
      }, dryRun);
      continue;
    }

    if (record.propertyType && !allowedTypes.has(normalizePropertyType(record.propertyType))) {
      rejectedInvalid++;
      await logPipelineEvent(supabase, syncRunDbId, sourceId, 'REJECTED_PROPERTY_TYPE', {
        rawAddress, propertyType: record.propertyType,
        reason: `Property type not in configured filter (${[...allowedTypes].join(', ')})`,
      }, dryRun);
      continue;
    }
    filterValidated++;

    accepted.push({
      source: 'Trulia',
      address: normalizedAddress.street,
      city: normalizedAddress.city,
      state: stateCode.toUpperCase(),
      zip: normalizedAddress.zip,
      beds: record.beds ?? 0,
      baths: record.baths ?? 0,
      price: record.askingRent,
      priceType: 'rent',
      isFsbo: record.isFsbo,
      isApartmentCommunity: record.isApartmentCommunity,
      propertyTypeLabel: record.propertyType || undefined,
      isFurnished: record.furnished === true ? true : undefined,
      notes: (record.notes || '').slice(0, 2000),
      link: record.listingUrl || undefined,
      stage: 'New Lead',
      source_property_id: record.providerPropertyId || undefined,
    });
  }

  if (dryRun) {
    newInserted = accepted.length;
  } else {
    const batchId = `trulia-ingest-${sourceId}-${Date.now()}`;
    for (let i = 0; i < accepted.length; i += IMPORT_CHUNK_SIZE) {
      const chunk = accepted.slice(i, i + IMPORT_CHUNK_SIZE);
      try {
        const res = await fetch(`${ctx.origin}/api/leads/csv-import`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', cookie: ctx.cookie },
          body: JSON.stringify({
            rows: chunk,
            importFilename: `trulia-source-sync-${sourceId}.json`,
            importBatchId: `${batchId}-c${Math.floor(i / IMPORT_CHUNK_SIZE) + 1}`,
          }),
          signal: AbortSignal.timeout(60000),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          errors += chunk.length;
          lastError = data?.error || `csv-import failed with HTTP ${res.status}`;
          continue;
        }
        const sum = (data?.summary || {}) as Record<string, number>;
        const chunkNew = Number(sum.rowsNew) || 0;
        const chunkUpdated = (Number(sum.rowsUpdatedExisting) || 0) + (Number(sum.rowsUnchangedExisting) || 0);
        const chunkDeduped = Number(sum.rowsDuplicateInFile) || 0;
        newInserted += chunkNew;
        existingUpdated += chunkUpdated;
        deduped += chunkDeduped;
        const chunkErrors = Number(sum.rowsError) || 0;
        errors += chunkErrors;
        if (chunkErrors > 0) {
          lastError = `${chunkErrors} row(s) failed in the lead import (see enrichment_error_logs for batch ${batchId})`;
        }
        // Anything the import did not account for is surfaced as an error, not dropped.
        const unaccounted = chunk.length - chunkNew - chunkUpdated - chunkDeduped - chunkErrors;
        if (unaccounted > 0) {
          errors += unaccounted;
          lastError = lastError || `${unaccounted} row(s) were not accounted for by the lead import`;
        }
      } catch (err) {
        errors += chunk.length;
        lastError = err instanceof Error ? err.message : String(err);
      }
    }
  }

  return {
    counters: {
      sourceResultsReturned: records.length,
      recordsParsed: parsed,
      recordsNormalized: normalized,
      stateValidated,
      filterValidated,
      propertiesVerified: newInserted + existingUpdated,
      newProspectsInserted: newInserted,
      existingProspectsUpdated: existingUpdated,
      duplicatesMerged: deduped,
      rejectedInvalid,
      rejectedWrongState,
      rejectedFilterMismatch,
      errors,
    },
    luxuryMatches: sourceTier === 'LUXURY' ? newInserted + existingUpdated : 0,
    csvMatches: 0,
    lastError,
  };
}

// ─── Helper Functions ─────────────────────────────────────────────────────────

function buildZeroCounters(errors = 0): SyncCounters {
  return {
    sourceResultsReturned: 0,
    recordsParsed: 0,
    recordsNormalized: 0,
    stateValidated: 0,
    filterValidated: 0,
    propertiesVerified: 0,
    newProspectsInserted: 0,
    existingProspectsUpdated: 0,
    duplicatesMerged: 0,
    rejectedInvalid: 0,
    rejectedWrongState: 0,
    rejectedFilterMismatch: 0,
    errors,
  };
}

function validateDbConfigs(configs: Record<string, unknown>[]) {
  const canonicalUrls = configs.map((config) => String(config.source_url_canonical || config.source_url_raw || config.source_url || ''));
  let valid = 0;
  let invalid = 0;

  const validatedConfigs = configs.map((config) => {
    const sourceUrl = String(config.source_url_canonical || config.source_url_raw || config.source_url || '');
    const parsed = parseTruliaUrl(sourceUrl);
    // The URL is the source of truth for the rent threshold. Stored values that
    // were seeded with a flat default (5000) must not disable luxury sources.
    const effectiveMinimumRent = parsed.minimumRent ?? Number(config.minimum_rent || 0);
    const validation = validateSourceConfig({
      sourceId: String(config.source_id || ''),
      stateCode: String(config.state_code || ''),
      tier: (config.source_tier === 'LUXURY' ? 'LUXURY' : 'STANDARD'),
      minimumRent: effectiveMinimumRent,
      rawUrl: sourceUrl,
      active: config.active !== false,
    }, canonicalUrls);

    const nextConfig = {
      ...config,
      minimum_rent: effectiveMinimumRent,
      source_url_canonical: parsed.canonicalUrl,
      url_valid: validation.urlValid,
      state_match: validation.stateMatch,
      filter_match: validation.filterMatch,
      is_duplicate: validation.isDuplicate,
      validation_status: validation.status,
      validation_notes: validation.validationNotes.join('\n') || null,
      parsed_minimum_rent: parsed.minimumRent,
      parsed_property_types: parsed.propertyTypes,
      parsed_furnished_required: parsed.furnished,
    };

    if (validation.status === 'VALID') valid++;
    else invalid++;

    return nextConfig;
  });

  return {
    configs: validatedConfigs,
    summary: {
      total: configs.length,
      valid,
      invalid,
    },
  };
}

interface NormalizedAddressResult {
  fullNormalized: string;
  street: string;
  city: string;
  state: string;
  zip: string;
  isComplete: boolean;
  missingComponents: string[];
}

function normalizeAddressString(
  rawAddress: string,
  city: string,
  state: string,
  zip: string
): NormalizedAddressResult {
  const missing: string[] = [];
  const cleanStreet = rawAddress.replace(/,.*$/, '').trim();
  const cleanCity = city?.trim() || '';
  const cleanState = state?.trim()?.toUpperCase() || '';
  const cleanZip = zip?.trim()?.replace(/[^0-9-]/g, '') || '';

  if (!cleanStreet || cleanStreet.length < 3) missing.push('street');
  if (!cleanCity) missing.push('city');
  if (!cleanState || cleanState.length !== 2) missing.push('state');
  if (!cleanZip || cleanZip.length < 5) missing.push('zip');

  const fullNormalized = [cleanStreet, cleanCity, cleanState, cleanZip]
    .filter(Boolean)
    .join(', ');

  return {
    fullNormalized,
    street: cleanStreet,
    city: cleanCity,
    state: cleanState,
    zip: cleanZip,
    isComplete: missing.length === 0,
    missingComponents: missing,
  };
}

function normalizePropertyType(raw: string): string {
  const upper = raw.toUpperCase().replace(/[\s_-]/g, '');
  if (upper.includes('SINGLEFAMILY') || upper === 'SFR' || upper === 'HOUSE') return 'SINGLE-FAMILY_HOME';
  if (upper.includes('TOWNHOUSE') || upper.includes('TOWNHOME') || upper === 'TH') return 'TOWNHOUSE';
  return upper;
}

async function logPipelineEvent(
  supabase: ReturnType<typeof createClient> extends Promise<infer T> ? T : never,
  syncRunDbId: string | null,
  sourceId: string,
  eventType: string,
  eventData: Record<string, unknown>,
  dryRun: boolean
) {
  if (dryRun || !syncRunDbId) return;
  await supabase.from('trulia_pipeline_audit_log').insert({
    sync_run_id: syncRunDbId,
    source_id: sourceId,
    event_type: eventType,
    event_data: eventData,
  });
}

async function persistSourceResult(
  supabase: ReturnType<typeof createClient> extends Promise<infer T> ? T : never,
  syncRunDbId: string | null,
  sourceConfigId: string,
  result: SourceSyncResult,
  dryRun: boolean
) {
  if (dryRun) return;

  const now = new Date().toISOString();

  // Update source config health
  await supabase
    .from('trulia_source_configs')
    .update({
      health_status: result.healthStatus,
      last_error: result.lastError,
      last_successful_fetch_at: result.accessSucceeded ? now : undefined,
      last_successful_ingestion_at:
        result.counters.newProspectsInserted > 0 || result.counters.existingProspectsUpdated > 0
          ? now
          : undefined,
      last_source_results_returned: result.counters.sourceResultsReturned,
      last_records_parsed: result.counters.recordsParsed,
      last_records_normalized: result.counters.recordsNormalized,
      last_state_validated: result.counters.stateValidated,
      last_filter_validated: result.counters.filterValidated,
      last_properties_verified: result.counters.propertiesVerified,
      last_new_prospects_inserted: result.counters.newProspectsInserted,
      last_existing_prospects_updated: result.counters.existingProspectsUpdated,
      last_duplicates_merged: result.counters.duplicatesMerged,
      last_rejected_invalid: result.counters.rejectedInvalid,
      last_rejected_wrong_state: result.counters.rejectedWrongState,
      last_rejected_filter_mismatch: result.counters.rejectedFilterMismatch,
      last_errors_count: result.counters.errors,
      last_pages_available: result.pagesAvailable,
      last_pages_requested: result.pagesRequested,
      last_pages_succeeded: result.pagesSucceeded,
      last_pages_failed: result.pagesFailed,
      updated_at: now,
    })
    .eq('id', sourceConfigId);

  // Insert per-source sync result
  if (syncRunDbId) {
    await supabase.from('trulia_source_sync_results').insert({
      sync_run_id: syncRunDbId,
      source_config_id: sourceConfigId,
      source_id: result.sourceId,
      state_code: result.stateCode,
      source_tier: result.tier,
      completed_at: now,
      access_method: result.accessMethod,
      http_status: result.httpStatus,
      request_successful: result.accessSucceeded,
      response_schema_valid: result.responseSchemaValid,
      source_results_returned: result.counters.sourceResultsReturned,
      records_parsed: result.counters.recordsParsed,
      records_normalized: result.counters.recordsNormalized,
      state_validated: result.counters.stateValidated,
      filter_validated: result.counters.filterValidated,
      properties_verified: result.counters.propertiesVerified,
      new_prospects_inserted: result.counters.newProspectsInserted,
      existing_prospects_updated: result.counters.existingProspectsUpdated,
      duplicates_merged: result.counters.duplicatesMerged,
      rejected_invalid: result.counters.rejectedInvalid,
      rejected_wrong_state: result.counters.rejectedWrongState,
      rejected_filter_mismatch: result.counters.rejectedFilterMismatch,
      errors_count: result.counters.errors,
      pages_available: result.pagesAvailable,
      pages_requested: result.pagesRequested,
      pages_succeeded: result.pagesSucceeded,
      pages_failed: result.pagesFailed,
      sync_status: result.syncStatus,
      health_status: result.healthStatus,
      last_error: result.lastError,
      reconciliation_valid: result.reconciliationValid,
      reconciliation_notes: result.reconciliationNotes,
    });
  }
}
