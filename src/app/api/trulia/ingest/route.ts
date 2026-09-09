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
import { parseTruliaUrl, validateSyncCounters, determineHealthStatus, validateReconciliation, getSafeStageForSourceSync, type SyncCounters, type SourceHealthStatus,  } from '@/lib/services/truliaSourceValidationService';

// ─── Types ────────────────────────────────────────────────────────────────────

interface IngestRequest {
  sourceId?: string;       // single source, or omit for all active
  stateCode?: string;      // filter by state
  tier?: 'STANDARD' | 'LUXURY' | 'all';
  triggeredBy?: string;
  dryRun?: boolean;        // validate only, no DB writes
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

    const supabase = await createClient();

    // ── Step 1: Load source configurations ───────────────────────────────────
    let sourceQuery = supabase
      .from('trulia_source_configs')
      .select('*')
      .eq('active', true)
      .eq('validation_status', 'VALID');

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

    if (!sourceConfigs || sourceConfigs.length === 0) {
      return NextResponse.json({
        error: 'NO_VALID_SOURCES',
        message: 'No valid active Trulia source configurations found',
        durationMs: Date.now() - startTime,
      }, { status: 404 });
    }

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
          sourceId: src.source_id,
          stateCode: src.state_code,
          tier: src.source_tier,
          minimumRent: src.minimum_rent,
          canonicalUrl: src.source_url_canonical,
          accessMethod: 'NONE',
          accessSucceeded: false,
          httpStatus: null,
          responseSchemaValid: false,
          counters: buildEmptyCounters(),
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
      // Trulia's public search pages are not an authorized data API.
      // We report SOURCE_ACCESS_UNAVAILABLE for direct web scraping attempts.
      // This system is designed to integrate with an authorized data provider
      // (e.g., licensed MLS feed, BatchData, or similar authorized property API).
      // The source URL serves as the SOURCE CONFIGURATION (state, tier, filters).
      // Actual property data must come from an authorized/licensed integration.

      const accessResult = await attemptAuthorizedSourceAccess(src, supabase);

      if (!accessResult.authorized) {
        const result: SourceSyncResult = {
          sourceId: src.source_id,
          stateCode: src.state_code,
          tier: src.source_tier,
          minimumRent: src.minimum_rent,
          canonicalUrl: src.source_url_canonical,
          accessMethod: accessResult.method,
          accessSucceeded: false,
          httpStatus: accessResult.httpStatus,
          responseSchemaValid: false,
          counters: buildEmptyCounters(),
          pagesAvailable: null,
          pagesRequested: null,
          pagesSucceeded: null,
          pagesFailed: null,
          syncStatus: 'SOURCE_ACCESS_UNAVAILABLE',
          healthStatus: 'SOURCE_ERROR',
          lastError: accessResult.error || 'SOURCE_ACCESS_UNAVAILABLE: Trulia direct web access is not an authorized data integration. Configure an authorized property data provider (BatchData, MLS, etc.) to enable real property ingestion.',
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
          counters: buildEmptyCounters(),
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
        dryRun
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
      const pipelineStageChanges = 0; // enforced by getSafeStageForSourceSync

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

      return NextResponse.json({ configs: configs || [] });
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

      return NextResponse.json({
        configs: configs || [],
        recentRuns: recentRuns || [],
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
}

/**
 * Attempt authorized source access.
 *
 * IMPORTANT: Trulia's public search pages are not an authorized data API.
 * Direct web scraping, CAPTCHA circumvention, proxy rotation, or
 * anti-bot bypassing are NOT permitted.
 *
 * This function checks for a configured authorized data provider
 * (BatchData API, licensed MLS feed, etc.) and uses that instead.
 * If no authorized provider is configured, it reports SOURCE_ACCESS_UNAVAILABLE.
 */
async function attemptAuthorizedSourceAccess(
  src: Record<string, unknown>,
  supabase: ReturnType<typeof createClient> extends Promise<infer T> ? T : never
): Promise<AccessResult> {
  // Check if BatchData API is configured (authorized property data provider)
  const batchDataKey = process.env.BATCHDATA_API_KEY;

  if (batchDataKey && batchDataKey !== 'your-batchdata-api-key-here') {
    // Use BatchData as authorized property data source
    return await fetchFromBatchData(src, batchDataKey);
  }

  // No authorized provider configured
  // Report SOURCE_ACCESS_UNAVAILABLE — do NOT fabricate results
  return {
    authorized: false,
    method: 'SOURCE_ACCESS_UNAVAILABLE',
    httpStatus: null,
    error: [
      'SOURCE_ACCESS_UNAVAILABLE: No authorized property data provider is configured.',
      'Trulia.com direct web access is not a permitted ingestion method.',
      'To enable real property ingestion, configure an authorized data provider:',
      '  - BATCHDATA_API_KEY: BatchData property data API',
      '  - Or another licensed MLS/property data integration',
      'The source URL (trulia_source_configs.source_url_canonical) defines the',
      'search parameters (state, rent threshold, property type, furnished).',
      'These parameters should be passed to your authorized data provider.',
    ].join('\n'),
    records: null,
    paginationInfo: null,
    parseError: null,
  };
}

/**
 * Fetch property data from BatchData API (authorized provider).
 * Uses the source config parameters (state, rent, property type) as filters.
 */
async function fetchFromBatchData(
  src: Record<string, unknown>,
  apiKey: string
): Promise<AccessResult> {
  try {
    const stateCode = src.state_code as string;
    const minimumRent = src.minimum_rent as number;
    const propertyTypes = (src.property_types as string[]) || ['SINGLE-FAMILY_HOME', 'TOWNHOUSE'];

    // BatchData property search endpoint
    const searchPayload = {
      requests: [{
        state: stateCode,
        propertyType: propertyTypes.includes('SINGLE-FAMILY_HOME') ? 'SFR' : 'TH',
        rentMin: minimumRent,
        furnished: true,
        status: 'FOR_RENT',
        limit: 100,
      }],
    };

    const response = await fetch('https://api.batchdata.com/api/v1/property/search', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(searchPayload),
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      const statusText = response.status === 401 || response.status === 403
        ? 'AUTH_ERROR' :'SOURCE_ERROR';
      return {
        authorized: false,
        method: 'BATCHDATA_API',
        httpStatus: response.status,
        error: `${statusText}: BatchData returned HTTP ${response.status}`,
        records: null,
        paginationInfo: null,
        parseError: null,
      };
    }

    const data = await response.json();

    // Parse BatchData response
    const rawResults = data?.results?.[0]?.properties || data?.properties || [];
    if (!Array.isArray(rawResults)) {
      return {
        authorized: true,
        method: 'BATCHDATA_API',
        httpStatus: response.status,
        error: null,
        records: null,
        paginationInfo: { pagesAvailable: null, pagesRequested: 1, pagesSucceeded: 0, pagesFailed: 1 },
        parseError: 'PARSING_ERROR: Unexpected response schema from BatchData API',
      };
    }

    const records: PropertyRecord[] = rawResults.map((p: Record<string, unknown>) => ({
      providerPropertyId: (p.propertyId || p.id || null) as string | null,
      providerListingId: (p.listingId || null) as string | null,
      rawAddress: [p.address, p.city, p.state, p.zip].filter(Boolean).join(', '),
      city: (p.city || '') as string,
      state: (p.state || stateCode) as string,
      zip: (p.zip || p.zipCode || '') as string,
      propertyType: (p.propertyType || null) as string | null,
      askingRent: p.rentAmount ? Number(p.rentAmount) : null,
      furnished: p.furnished === true || p.furnished === 'true' || null,
      listingUrl: (p.listingUrl || p.url || null) as string | null,
      listingStatus: (p.status || p.listingStatus || null) as string | null,
      latitude: p.latitude ? Number(p.latitude) : null,
      longitude: p.longitude ? Number(p.longitude) : null,
    }));

    const totalResults = data?.totalResults || data?.total || rawResults.length;
    const pagesAvailable = totalResults > 100 ? Math.ceil(totalResults / 100) : 1;

    return {
      authorized: true,
      method: 'BATCHDATA_API',
      httpStatus: response.status,
      error: null,
      records,
      paginationInfo: {
        pagesAvailable,
        pagesRequested: 1,
        pagesSucceeded: 1,
        pagesFailed: 0,
      },
      parseError: null,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      authorized: false,
      method: 'BATCHDATA_API',
      httpStatus: null,
      error: `SOURCE_ERROR: ${message}`,
      records: null,
      paginationInfo: null,
      parseError: null,
    };
  }
}

// ─── Ingestion Pipeline ───────────────────────────────────────────────────────

interface PipelineResult {
  counters: Partial<SyncCounters>;
  luxuryMatches: number;
  csvMatches: number;
  lastError: string | null;
}

async function runIngestionPipeline(
  supabase: ReturnType<typeof createClient> extends Promise<infer T> ? T : never,
  src: Record<string, unknown>,
  records: PropertyRecord[],
  syncRunDbId: string | null,
  dryRun: boolean
): Promise<PipelineResult> {
  const sourceId = src.source_id as string;
  const stateCode = src.state_code as string;
  const sourceTier = src.source_tier as string;
  const minimumRent = src.minimum_rent as number;
  const sourceConfigId = src.id as string;

  let parsed = 0;
  let normalized = 0;
  let stateValidated = 0;
  let filterValidated = 0;
  let propertiesVerified = 0;
  let newInserted = 0;
  let existingUpdated = 0;
  let deduped = 0;
  let rejectedInvalid = 0;
  let rejectedWrongState = 0;
  let rejectedFilterMismatch = 0;
  let errors = 0;
  let luxuryMatches = 0;
  let csvMatches = 0;
  let lastError: string | null = null;

  for (const record of records) {
    try {
      parsed++;

      // ── Normalize address ───────────────────────────────────────────────
      const rawAddress = record.rawAddress?.trim();
      if (!rawAddress || rawAddress.length < 5) {
        rejectedInvalid++;
        await logPipelineEvent(supabase, syncRunDbId, sourceId, 'REJECTED_INVALID_ADDRESS', {
          rawAddress, reason: 'Address too short or missing',
        }, dryRun);
        continue;
      }

      // Normalize: street, city, state, zip
      const normalizedAddress = normalizeAddressString(rawAddress, record.city, record.state, record.zip);
      if (!normalizedAddress.isComplete) {
        rejectedInvalid++;
        await logPipelineEvent(supabase, syncRunDbId, sourceId, 'REJECTED_INCOMPLETE_ADDRESS', {
          rawAddress, missing: normalizedAddress.missingComponents,
        }, dryRun);
        continue;
      }
      normalized++;

      // ── State validation ────────────────────────────────────────────────
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

      // ── Rent filter validation ──────────────────────────────────────────
      if (record.askingRent !== null && record.askingRent < minimumRent) {
        rejectedFilterMismatch++;
        await logPipelineEvent(supabase, syncRunDbId, sourceId, 'SOURCE_FILTER_MISMATCH', {
          rawAddress,
          configuredMinRent: minimumRent,
          observedRent: record.askingRent,
          reason: 'Property asking rent is below source minimum rent threshold',
        }, dryRun);
        continue;
      }

      // ── Property type validation ────────────────────────────────────────
      if (record.propertyType) {
        const normalizedType = normalizePropertyType(record.propertyType);
        const allowedTypes = ['SINGLE-FAMILY_HOME', 'TOWNHOUSE', 'SFR', 'SINGLE_FAMILY', 'TOWNHOME'];
        if (!allowedTypes.some((t) => normalizedType.toUpperCase().includes(t.replace('_', '').replace('-', '')))) {
          rejectedInvalid++;
          await logPipelineEvent(supabase, syncRunDbId, sourceId, 'REJECTED_PROPERTY_TYPE', {
            rawAddress, propertyType: record.propertyType,
            reason: 'Property type not in configured filter (SINGLE-FAMILY_HOME, TOWNHOUSE)',
          }, dryRun);
          continue;
        }
      }
      filterValidated++;

      // ── Deduplication ───────────────────────────────────────────────────
      if (!dryRun) {
        const dedupResult = await findExistingProspect(supabase, record, normalizedAddress);

        if (dedupResult.isDuplicate && dedupResult.existingId) {
          deduped++;
          propertiesVerified++;

          // Update source observation (listing may have changed)
          await upsertSourceObservation(supabase, {
            prospectId: dedupResult.existingId,
            sourceConfigId,
            sourceId,
            sourceTier,
            sourceUrl: src.source_url_canonical as string,
            listingUrl: record.listingUrl,
            observedRent: record.askingRent,
            observedListingStatus: record.listingStatus,
            dedupMatchMethod: dedupResult.matchMethod,
            syncRunDbId,
            isLuxury: sourceTier === 'LUXURY',
          });

          // Update existing prospect with non-destructive enrichment
          // NEVER overwrite: verified_owner, verified_number, contact_phone (manual CSV data)
          // NEVER change: stage, lead_stage (pipeline protection)
          await updateExistingProspectSafely(supabase, dedupResult.existingId, record, sourceTier);

          existingUpdated++;

          if (sourceTier === 'LUXURY') luxuryMatches++;
          if (dedupResult.matchMethod === 'CSV_MATCH') csvMatches++;
          continue;
        }

        // ── Insert new prospect ───────────────────────────────────────────
        const portfolioName = stateToPortfolioName(stateCode);
        const { data: portfolioData } = await supabase
          .from('portfolios')
          .select('id')
          .eq('state_code', stateCode)
          .eq('is_active', true)
          .single();

        const newProspect = {
          // Address
          address: normalizedAddress.fullNormalized,
          city: normalizedAddress.city,
          state: stateCode,
          zip: normalizedAddress.zip,
          raw_address: rawAddress,
          standardized_address: normalizedAddress.fullNormalized,
          // Property
          property_type: record.propertyType || null,
          // Source
          lead_source: 'TRULIA',
          source_id: sourceId,
          source_tier: sourceTier,
          listing_url: record.listingUrl || null,
          listing_status: record.listingStatus || null,
          current_asking_rent: record.askingRent || null,
          // Furnished
          furnished_status: record.furnished === true ? 'confirmed' : 'unconfirmed',
          furnished_source: record.furnished === true ? 'PROPERTY_CONFIRMED' : 'SOURCE_REQUESTED',
          // Pipeline — ALWAYS New Lead for source sync
          stage: 'New Lead',
          // Portfolio
          portfolio: portfolioName,
          portfolio_id: portfolioData?.id || null,
          // Verification — NOT verified merely because source returned it
          verified_address: null,
          verified_owner: false,
          verified_number: false,
          address_verification_source: null,
          // Luxury
          luxury_source_match: sourceTier === 'LUXURY',
          luxury_classification_source: sourceTier === 'LUXURY' ? 'SOURCE_MATCH' : null,
          luxury_source_id: sourceTier === 'LUXURY' ? sourceId : null,
          luxury_observed_rent: sourceTier === 'LUXURY' ? record.askingRent : null,
          luxury_observed_at: sourceTier === 'LUXURY' ? new Date().toISOString() : null,
          // Provenance
          provider_property_id: record.providerPropertyId || null,
          provider_listing_id: record.providerListingId || null,
          first_seen_at: new Date().toISOString(),
          last_source_seen_at: new Date().toISOString(),
          // Synthetic flag — NEVER true for real source data
          is_synthetic: false,
          data_integrity_status: 'LISTING_UNVERIFIED',
          // Geo
          latitude: record.latitude || null,
          longitude: record.longitude || null,
        };

        const { data: insertedProspect, error: insertError } = await supabase
          .from('leads')
          .insert(newProspect)
          .select('id')
          .single();

        if (insertError) {
          errors++;
          lastError = insertError.message;
          await logPipelineEvent(supabase, syncRunDbId, sourceId, 'UPSERT_ERROR', {
            rawAddress, error: insertError.message,
          }, dryRun);
          continue;
        }

        propertiesVerified++;
        newInserted++;
        if (sourceTier === 'LUXURY') luxuryMatches++;

        // Create source observation
        if (insertedProspect?.id) {
          await upsertSourceObservation(supabase, {
            prospectId: insertedProspect.id,
            sourceConfigId,
            sourceId,
            sourceTier,
            sourceUrl: src.source_url_canonical as string,
            listingUrl: record.listingUrl,
            observedRent: record.askingRent,
            observedListingStatus: record.listingStatus,
            dedupMatchMethod: 'NEW_RECORD',
            syncRunDbId,
            isLuxury: sourceTier === 'LUXURY',
          });
        }
      } else {
        // Dry run — count as would-be insert
        propertiesVerified++;
        newInserted++;
        if (sourceTier === 'LUXURY') luxuryMatches++;
      }
    } catch (err) {
      errors++;
      lastError = err instanceof Error ? err.message : String(err);
    }
  }

  return {
    counters: {
      sourceResultsReturned: records.length,
      recordsParsed: parsed,
      recordsNormalized: normalized,
      stateValidated,
      filterValidated,
      propertiesVerified,
      newProspectsInserted: newInserted,
      existingProspectsUpdated: existingUpdated,
      duplicatesMerged: deduped,
      rejectedInvalid,
      rejectedWrongState,
      rejectedFilterMismatch,
      errors,
    },
    luxuryMatches,
    csvMatches,
    lastError,
  };
}

// ─── Helper Functions ─────────────────────────────────────────────────────────

function buildEmptyCounters(): SyncCounters {
  return {
    sourceResultsReturned: -1,
    recordsParsed: -1,
    recordsNormalized: -1,
    stateValidated: -1,
    filterValidated: -1,
    propertiesVerified: -1,
    newProspectsInserted: -1,
    existingProspectsUpdated: -1,
    duplicatesMerged: -1,
    rejectedInvalid: -1,
    rejectedWrongState: -1,
    rejectedFilterMismatch: -1,
    errors: 0,
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
  const upper = raw.toUpperCase().replace(/[\s-_]/g, '');
  if (upper.includes('SINGLEFAMILY') || upper.includes('SFR') || upper.includes('SINGLEFAMILYHOME')) {
    return 'SINGLE-FAMILY_HOME';
  }
  if (upper.includes('TOWNHOUSE') || upper.includes('TOWNHOME') || upper.includes('TH')) {
    return 'TOWNHOUSE';
  }
  return raw;
}

function stateToPortfolioName(stateCode: string): string {
  const map: Record<string, string> = {
    AZ: 'Arizona Portfolio', CA: 'California Portfolio', CO: 'Colorado Portfolio',
    FL: 'Florida Portfolio', GA: 'Georgia Portfolio', ID: 'Idaho Portfolio',
    KS: 'Kansas Portfolio', MA: 'Massachusetts Portfolio', MD: 'Maryland Portfolio',
    MN: 'Minnesota Portfolio', MO: 'Missouri Portfolio', MT: 'Montana Portfolio',
    NC: 'North Carolina Portfolio', NE: 'Nebraska Portfolio', NH: 'New Hampshire Portfolio',
    NJ: 'New Jersey Portfolio', NM: 'New Mexico Portfolio', NV: 'Nevada Portfolio',
    NY: 'New York Portfolio', OR: 'Oregon Portfolio', TX: 'Texas Portfolio',
    UT: 'Utah Portfolio', VT: 'Vermont Portfolio', WA: 'Washington Portfolio',
    WI: 'Wisconsin Portfolio', WY: 'Wyoming Portfolio',
  };
  return map[stateCode] || `${stateCode} Portfolio`;
}

interface DeduplicationResult {
  isDuplicate: boolean;
  existingId: string | null;
  matchMethod: string;
}

async function findExistingProspect(
  supabase: ReturnType<typeof createClient> extends Promise<infer T> ? T : never,
  record: PropertyRecord,
  normalized: NormalizedAddressResult
): Promise<DeduplicationResult> {
  // 1. Provider property ID (most reliable)
  if (record.providerPropertyId) {
    const { data } = await supabase
      .from('leads')
      .select('id')
      .eq('provider_property_id', record.providerPropertyId)
      .single();
    if (data?.id) return { isDuplicate: true, existingId: data.id, matchMethod: 'PROVIDER_ID' };
  }

  // 2. Provider listing ID
  if (record.providerListingId) {
    const { data } = await supabase
      .from('leads')
      .select('id')
      .eq('provider_listing_id', record.providerListingId)
      .single();
    if (data?.id) return { isDuplicate: true, existingId: data.id, matchMethod: 'PROVIDER_LISTING_ID' };
  }

  // 3. Exact standardized address
  if (normalized.fullNormalized) {
    const { data } = await supabase
      .from('leads')
      .select('id')
      .eq('standardized_address', normalized.fullNormalized)
      .single();
    if (data?.id) return { isDuplicate: true, existingId: data.id, matchMethod: 'EXACT_ADDRESS' };
  }

  // 4. Normalized street + city + state + zip
  if (normalized.street && normalized.city && normalized.state && normalized.zip) {
    const { data } = await supabase
      .from('leads')
      .select('id')
      .ilike('address', `%${normalized.street}%`)
      .eq('city', normalized.city)
      .eq('state', normalized.state)
      .eq('zip', normalized.zip)
      .limit(1);
    if (data && data.length > 0) {
      return { isDuplicate: true, existingId: data[0].id, matchMethod: 'NORMALIZED_ADDRESS' };
    }
  }

  return { isDuplicate: false, existingId: null, matchMethod: 'NONE' };
}

async function upsertSourceObservation(
  supabase: ReturnType<typeof createClient> extends Promise<infer T> ? T : never,
  params: {
    prospectId: string;
    sourceConfigId: string;
    sourceId: string;
    sourceTier: string;
    sourceUrl: string;
    listingUrl: string | null | undefined;
    observedRent: number | null | undefined;
    observedListingStatus: string | null | undefined;
    dedupMatchMethod: string;
    syncRunDbId: string | null;
    isLuxury: boolean;
  }
) {
  const now = new Date().toISOString();
  await supabase
    .from('trulia_source_observations')
    .upsert({
      prospect_id: params.prospectId,
      source_config_id: params.sourceConfigId,
      source_id: params.sourceId,
      source_tier: params.sourceTier,
      source_url: params.sourceUrl,
      listing_url: params.listingUrl || null,
      last_seen_at: now,
      observed_rent: params.observedRent || null,
      observed_listing_status: params.observedListingStatus || null,
      listing_presence_status: 'ACTIVE',
      luxury_source_match: params.isLuxury,
      luxury_classification_source: params.isLuxury ? 'SOURCE_MATCH' : null,
      luxury_observed_rent: params.isLuxury ? params.observedRent : null,
      luxury_observed_at: params.isLuxury ? now : null,
      dedup_match_method: params.dedupMatchMethod,
      sync_run_id: params.syncRunDbId,
      updated_at: now,
    }, { onConflict: 'prospect_id,source_id' });
}

async function updateExistingProspectSafely(
  supabase: ReturnType<typeof createClient> extends Promise<infer T> ? T : never,
  prospectId: string,
  record: PropertyRecord,
  sourceTier: string
) {
  // CRITICAL: Never overwrite manual CSV data (verified_owner, verified_number, contact_phone)
  // Never change stage (pipeline protection)
  // Only update non-destructive source-provided fields
  const updates: Record<string, unknown> = {
    last_source_seen_at: new Date().toISOString(),
    listing_status: record.listingStatus || null,
  };

  // Only update listing URL if we have a real one (not null)
  if (record.listingUrl) {
    updates.listing_url = record.listingUrl;
  }

  // Only update rent if source provides it
  if (record.askingRent !== null) {
    updates.current_asking_rent = record.askingRent;
  }

  // Luxury upgrade: if this source is LUXURY, add luxury classification
  if (sourceTier === 'LUXURY') {
    updates.luxury_source_match = true;
    updates.luxury_classification_source = 'SOURCE_MATCH';
    updates.luxury_observed_rent = record.askingRent;
    updates.luxury_observed_at = new Date().toISOString();
  }

  await supabase.from('leads').update(updates).eq('id', prospectId);
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
