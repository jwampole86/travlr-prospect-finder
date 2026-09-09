'use client';

/**
 * syncToastService — emits app_notifications for:
 *  1. Sync completion per portfolio (leads imported, dedup rate, errors)
 *  2. Enrichment stage 2/3 completion for high-priority leads (score >= 70)
 *
 * Call these helpers from the sync execute route or enrichment service
 * after each operation completes.
 */

export interface SyncCompletionPayload {
  portfolio: string;
  leadsImported: number;
  duplicatesRemoved: number;
  errors: number;
  sourcesRun: number;
}

export interface EnrichmentStagePayload {
  stage: 2 | 3;
  leadId: string;
  leadAddress: string;
  prospectScore: number;
  portfolio?: string;
}

/**
 * Build a sync-complete notification object (ready to pass to addNotification).
 */
export function buildSyncCompleteNotification(payload: SyncCompletionPayload) {
  const dedupRate = payload.leadsImported + payload.duplicatesRemoved > 0
    ? Math.round((payload.duplicatesRemoved / (payload.leadsImported + payload.duplicatesRemoved)) * 100)
    : 0;

  const hasErrors = payload.errors > 0;

  return {
    type: 'sync_complete_portfolio' as const,
    title: `Sync complete — ${payload.portfolio}`,
    message: [
      `${payload.leadsImported} leads imported`,
      `${dedupRate}% dedup rate`,
      hasErrors ? `${payload.errors} error${payload.errors > 1 ? 's' : ''}` : 'no errors',
    ].join(' · '),
    metadata: {
      portfolio: payload.portfolio,
      leads_imported: payload.leadsImported,
      duplicates_removed: payload.duplicatesRemoved,
      dedup_rate: dedupRate,
      errors: payload.errors,
      sources_run: payload.sourcesRun,
    },
  };
}

/**
 * Build an enrichment stage completion notification (stage 2 or 3, high-priority leads only).
 * Returns null if the lead is not high-priority (score < 70).
 */
export function buildEnrichmentStageNotification(payload: EnrichmentStagePayload) {
  if (payload.prospectScore < 70) return null;

  const stageLabel = payload.stage === 2 ? 'Stage 2 (Owner Lookup)' : 'Stage 3 (Contact Verified)';
  const stageType = payload.stage === 2 ? 'enrichment_stage2_complete' as const : 'enrichment_stage3_complete' as const;

  return {
    type: stageType,
    title: `Enrichment ${stageLabel} — high-priority lead`,
    message: `${payload.leadAddress}${payload.portfolio ? ` · ${payload.portfolio}` : ''} · Score ${payload.prospectScore} — ready for outreach`,
    metadata: {
      lead_id: payload.leadId,
      lead_address: payload.leadAddress,
      prospect_score: payload.prospectScore,
      stage: payload.stage,
      portfolio: payload.portfolio,
    },
  };
}
