import 'server-only';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

type CronStatus = 'running' | 'success' | 'partial' | 'failed';
type JsonObject = Record<string, unknown>;

export interface CronRunHandle {
  id?: string;
  jobName: string;
  runId: string;
  startedAt: string;
}

export interface CompleteCronRunOptions {
  status: Exclude<CronStatus, 'running'>;
  completedAt?: string;
  leadsScanned?: number;
  scoresRecalculated?: number;
  reenrichmentTriggered?: number;
  propertyDataRefreshed?: number;
  errorCount?: number;
  errors?: Array<string | null | undefined>;
  metadata?: JsonObject;
}

function uniqueErrors(errors: Array<string | null | undefined> | undefined) {
  return [...new Set((errors || []).map((error) => String(error || '').trim()).filter(Boolean))].slice(0, 50);
}

export async function startCronRun(jobName: string, metadata: JsonObject = {}): Promise<CronRunHandle> {
  const runId = `run_${Date.now()}`;
  const startedAt = new Date().toISOString();

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('cron_job_runs')
      .insert({
        job_name: jobName,
        run_id: runId,
        started_at: startedAt,
        status: 'running',
        metadata,
      })
      .select('id')
      .single();

    if (error) {
      console.warn(`[recordCronRun] start insert failed for ${jobName}:`, error.message);
      return { jobName, runId, startedAt };
    }

    return {
      id: String(data.id),
      jobName,
      runId,
      startedAt,
    };
  } catch (error) {
    console.warn(`[recordCronRun] start failed for ${jobName}:`, error instanceof Error ? error.message : error);
    return { jobName, runId, startedAt };
  }
}

export async function finishCronRun(run: CronRunHandle, options: CompleteCronRunOptions): Promise<void> {
  try {
    const supabase = getSupabaseAdmin();
    const errors = uniqueErrors(options.errors);
    let query = supabase.from('cron_job_runs').update({
      completed_at: options.completedAt || new Date().toISOString(),
      status: options.status,
      leads_scanned: Math.max(0, Number(options.leadsScanned || 0)),
      scores_recalculated: Math.max(0, Number(options.scoresRecalculated || 0)),
      reenrichment_triggered: Math.max(0, Number(options.reenrichmentTriggered || 0)),
      property_data_refreshed: Math.max(0, Number(options.propertyDataRefreshed || 0)),
      error_count: Math.max(0, Number(options.errorCount ?? errors.length ?? 0)),
      errors,
      metadata: options.metadata || {},
    });

    query = run.id ? query.eq('id', run.id) : query.eq('job_name', run.jobName).eq('run_id', run.runId);

    const { error } = await query;
    if (error) {
      console.warn(`[recordCronRun] finish update failed for ${run.jobName}:`, error.message);
    }
  } catch (error) {
    console.warn(`[recordCronRun] finish failed for ${run.jobName}:`, error instanceof Error ? error.message : error);
  }
}
