import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const MAX_RETRY_ATTEMPTS = 3;

// Transient error codes that are safe to retry automatically
const TRANSIENT_ERROR_CODES = [
  'TRANSIENT_ERROR', 'TRANSIENT_DB_ERROR', 'NETWORK_ERROR',
  'TIMEOUT', 'RATE_LIMIT', 'SERVICE_UNAVAILABLE',
];

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { leadIds, force } = body as { leadIds: string[]; force?: boolean };

    if (!leadIds || !Array.isArray(leadIds) || leadIds.length === 0) {
      return NextResponse.json({ error: 'No lead IDs provided' }, { status: 400 });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    const now = new Date().toISOString();

    // Fetch current enrichment state for all leads
    const { data: leads, error: fetchError } = await supabase
      .from('leads')
      .select('id, enrichment_status, enrichment_retry_count, enrichment_last_error_code, enrichment_is_transient_error, address, standardized_address')
      .in('id', leadIds);

    if (fetchError) {
      return NextResponse.json({ error: fetchError.message }, { status: 500 });
    }

    const results: Array<{
      leadId: string;
      queued: boolean;
      reason: string;
      retryCount: number;
    }> = [];

    const idsToRetry: string[] = [];

    for (const lead of (leads || [])) {
      const retryCount = (lead.enrichment_retry_count as number) || 0;
      const status = lead.enrichment_status as string;
      const isTransient = lead.enrichment_is_transient_error as boolean;
      const errorCode = lead.enrichment_last_error_code as string;

      // Determine if this lead is eligible for retry
      const eligibleStatuses = ['ERROR', 'NO_MATCH', 'PARTIAL'];
      const isEligible = eligibleStatuses.includes(status);

      if (!isEligible && !force) {
        results.push({
          leadId: lead.id as string,
          queued: false,
          reason: `Status "${status}" is not eligible for retry (must be ERROR, NO_MATCH, or PARTIAL)`,
          retryCount,
        });
        continue;
      }

      // Enforce max retry limit for non-transient errors (unless force=true)
      if (!force && !isTransient && retryCount >= MAX_RETRY_ATTEMPTS) {
        results.push({
          leadId: lead.id as string,
          queued: false,
          reason: `Max retry attempts (${MAX_RETRY_ATTEMPTS}) reached for non-transient error. Use force=true to override.`,
          retryCount,
        });
        continue;
      }

      idsToRetry.push(lead.id as string);
      results.push({
        leadId: lead.id as string,
        queued: true,
        reason: `Queued for retry (attempt ${retryCount + 1})`,
        retryCount: retryCount + 1,
      });
    }

    if (idsToRetry.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No leads were eligible for retry',
        queued: 0,
        skipped: results.filter(r => !r.queued).length,
        results,
      });
    }

    // Reset enrichment status to PENDING and increment retry counter
    const { error: updateError } = await supabase
      .from('leads')
      .update({
        enrichment_status: 'PENDING',
        enrichment_attempted_at: now,
        enrichment_retry_count: supabase.rpc ? undefined : undefined, // handled below
        updated_at: now,
      })
      .in('id', idsToRetry);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    // Increment retry count individually (Supabase doesn't support column += 1 in bulk easily)
    for (const leadId of idsToRetry) {
      const lead = leads?.find(l => l.id === leadId);
      const currentCount = (lead?.enrichment_retry_count as number) || 0;
      await supabase
        .from('leads')
        .update({ enrichment_retry_count: currentCount + 1 })
        .eq('id', leadId)
        .catch(() => {});
    }

    // Log retry events in enrichment_error_logs
    const retryLogEntries = idsToRetry.map(leadId => {
      const lead = leads?.find(l => l.id === leadId);
      return {
        lead_id: leadId,
        stage: 'retry_queued',
        error_code: 'RETRY_INITIATED',
        error_message: `Enrichment retry queued. Previous status: ${lead?.enrichment_status || 'unknown'}`,
        retry_count: ((lead?.enrichment_retry_count as number) || 0) + 1,
        last_retry_at: now,
        is_transient: lead?.enrichment_is_transient_error || false,
        resolved: false,
      };
    });

    if (retryLogEntries.length > 0) {
      await supabase.from('enrichment_error_logs').insert(retryLogEntries).catch(() => {});
    }

    return NextResponse.json({
      success: true,
      message: `Enrichment retry queued for ${idsToRetry.length} lead(s)`,
      queued: idsToRetry.length,
      skipped: results.filter(r => !r.queued).length,
      results,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Retry failed' },
      { status: 500 }
    );
  }
}
