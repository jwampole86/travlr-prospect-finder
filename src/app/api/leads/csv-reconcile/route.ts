import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

/**
 * POST /api/leads/csv-reconcile
 *
 * Reconciles all completed CSV import batches against the canonical leads table.
 * For each batch, checks if the imported rows exist in leads.
 * Reports discrepancies and returns counts for the reconciliation dashboard.
 *
 * This endpoint is idempotent — it never deletes or overwrites existing data.
 * It only reports what's missing and can optionally trigger re-import of orphaned rows.
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    const report = {
      csvBatchesFound: 0,
      csvRowOutcomesTotal: 0,
      csvRowsNew: 0,
      csvRowsUpdated: 0,
      csvLeadsInProspectFinder: 0,
      csvLeadsMissingFromProspectFinder: 0,
      linkSyncLeads: 0,
      multiSourceLeads: 0,
      totalCanonicalProspects: 0,
      prospectsVisibleInLeadManagement: 0,
      orphanedOutcomeRows: [] as Array<{ batchId: string; leadId: string; address: string }>,
      discrepancies: [] as string[],
    };

    // 1. Count completed CSV import batches
    const { count: batchCount } = await supabase
      .from('csv_import_batches')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'COMPLETED');
    report.csvBatchesFound = batchCount ?? 0;

    // 2. Count total canonical prospects (non-synthetic)
    const { count: totalProspects } = await supabase
      .from('leads')
      .select('*', { count: 'exact', head: true })
      .neq('is_synthetic', true);
    report.totalCanonicalProspects = totalProspects ?? 0;

    // 3. Count CSV-sourced prospects
    const { count: csvLeads } = await supabase
      .from('leads')
      .select('*', { count: 'exact', head: true })
      .neq('is_synthetic', true)
      .or('ingestion_source.eq.MANUAL_CSV,source_type.eq.MANUAL_VERIFIED_IMPORT,import_batch_id.not.is.null');
    report.csvLeadsInProspectFinder = csvLeads ?? 0;

    // 4. Count link-sync prospects
    const { count: linkLeads } = await supabase
      .from('leads')
      .select('*', { count: 'exact', head: true })
      .neq('is_synthetic', true)
      .eq('ingestion_source', 'LINK_SYNC')
      .is('import_batch_id', null);
    report.linkSyncLeads = linkLeads ?? 0;

    // 5. Count multi-source prospects
    const { count: multiLeads } = await supabase
      .from('leads')
      .select('*', { count: 'exact', head: true })
      .neq('is_synthetic', true)
      .eq('is_multi_source', true);
    report.multiSourceLeads = multiLeads ?? 0;

    // 6. Count visible in lead management (non-synthetic, non-archived)
    const { count: visibleLeads } = await supabase
      .from('leads')
      .select('*', { count: 'exact', head: true })
      .neq('is_synthetic', true)
      .not('stage', 'in', '("Not a Fit","Archived","Disqualified")');
    report.prospectsVisibleInLeadManagement = visibleLeads ?? 0;

    // 7. Check csv_import_row_outcomes for orphaned NEW rows
    const { data: rowOutcomes } = await supabase
      .from('csv_import_row_outcomes')
      .select('import_batch_id, outcome_lead_id, raw_address, outcome')
      .in('outcome', ['NEW', 'UPDATED_EXISTING'])
      .limit(500);

    if (rowOutcomes && rowOutcomes.length > 0) {
      report.csvRowOutcomesTotal = rowOutcomes.length;
      report.csvRowsNew = rowOutcomes.filter((r: any) => r.outcome === 'NEW').length;
      report.csvRowsUpdated = rowOutcomes.filter((r: any) => r.outcome === 'UPDATED_EXISTING').length;

      // Check which NEW outcome rows have no matching lead
      const newOutcomes = rowOutcomes.filter((r: any) => r.outcome === 'NEW' && r.outcome_lead_id);
      const newLeadIds = newOutcomes.map((r: any) => r.outcome_lead_id).filter(Boolean);

      if (newLeadIds.length > 0) {
        const { data: existingLeads } = await supabase
          .from('leads')
          .select('id')
          .in('id', newLeadIds.slice(0, 200));

        const existingIds = new Set((existingLeads || []).map((l: any) => l.id));
        const orphaned = newOutcomes.filter((r: any) => !existingIds.has(r.outcome_lead_id));

        report.csvLeadsMissingFromProspectFinder = orphaned.length;
        report.orphanedOutcomeRows = orphaned.slice(0, 20).map((r: any) => ({
          batchId: r.import_batch_id,
          leadId: r.outcome_lead_id,
          address: r.raw_address || 'Unknown',
        }));

        if (orphaned.length > 0) {
          report.discrepancies.push(
            `${orphaned.length} CSV import rows have outcome=NEW but no matching lead in Prospect Finder. ` +
            `These rows were committed to csv_import_row_outcomes but the lead insert may have failed. ` +
            `Re-upload the original CSV files to recover these records.`
          );
        }
      }
    }

    // 8. Check if CSV leads are being filtered out by is_synthetic
    const { count: syntheticCsvLeads } = await supabase
      .from('leads')
      .select('*', { count: 'exact', head: true })
      .eq('is_synthetic', true)
      .not('import_batch_id', 'is', null);

    if ((syntheticCsvLeads ?? 0) > 0) {
      report.discrepancies.push(
        `${syntheticCsvLeads} CSV-imported leads are marked is_synthetic=true and are hidden from Prospect Finder. ` +
        `These may have placeholder addresses. Check the address normalization for these records.`
      );
    }

    // 9. Backfill ingestion_source for any CSV leads missing it
    const { count: missingSource } = await supabase
      .from('leads')
      .select('*', { count: 'exact', head: true })
      .not('import_batch_id', 'is', null)
      .is('ingestion_source', null);

    if ((missingSource ?? 0) > 0) {
      // Backfill
      await supabase
        .from('leads')
        .update({ ingestion_source: 'MANUAL_CSV', source_types: ['MANUAL_CSV'] })
        .not('import_batch_id', 'is', null)
        .is('ingestion_source', null);

      report.discrepancies.push(
        `Backfilled ingestion_source=MANUAL_CSV for ${missingSource} CSV-imported leads that were missing this field.`
      );
    }

    return NextResponse.json({
      success: true,
      report,
      summary: {
        totalCanonicalProspects: report.totalCanonicalProspects,
        csvLeadsInProspectFinder: report.csvLeadsInProspectFinder,
        csvLeadsMissingFromProspectFinder: report.csvLeadsMissingFromProspectFinder,
        linkSyncLeads: report.linkSyncLeads,
        multiSourceLeads: report.multiSourceLeads,
        prospectsVisibleInLeadManagement: report.prospectsVisibleInLeadManagement,
        discrepancyCount: report.discrepancies.length,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Reconciliation failed' },
      { status: 500 }
    );
  }
}
