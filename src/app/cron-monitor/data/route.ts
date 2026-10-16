import { NextRequest, NextResponse } from 'next/server';
import { requireAdminActor } from '@/lib/auth/apiAuthorization';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { getScheduledCronJobs } from '../lib';
import type { CronJobSummary, CronMonitorPayload, CronRunHistoryRow } from '../types';

export const dynamic = 'force-dynamic';

type CronRunRow = {
  job_name: string;
  started_at: string;
  completed_at: string | null;
  status: 'running' | 'success' | 'partial' | 'failed';
  error_count: number | null;
  metadata: Record<string, unknown> | null;
};

type HealthRow = {
  service: string;
  status: string;
  checked_at: string;
  detail: string | null;
};

function summarizeRun(row: CronRunRow) {
  const metadata = row.metadata || {};
  if (typeof metadata.newLeads === 'number') return `${metadata.newLeads.toLocaleString()} new leads`;
  if (typeof metadata.updated === 'number') return `${metadata.updated.toLocaleString()} rows updated`;
  if (typeof metadata.pricesUpdated === 'number') return `${metadata.pricesUpdated.toLocaleString()} prices updated`;
  if (typeof metadata.serviceCount === 'number') return `${metadata.serviceCount.toLocaleString()} service checks recorded`;
  if (row.error_count) return `${row.error_count} error${row.error_count === 1 ? '' : 's'} recorded`;
  return 'Recorded cron run';
}

function getDurationMs(startedAt: string, completedAt: string | null) {
  if (!completedAt) return null;
  const ms = Date.parse(completedAt) - Date.parse(startedAt);
  return Number.isFinite(ms) && ms >= 0 ? ms : null;
}

export async function GET(req: NextRequest) {
  const authorization = await requireAdminActor(req);
  if (!authorization.actor) {
    return NextResponse.json({ error: authorization.error }, { status: authorization.status });
  }

  const jobs = getScheduledCronJobs();
  const aliasToKey = new Map<string, string>();
  for (const job of jobs) {
    for (const alias of job.aliases) aliasToKey.set(alias, job.key);
  }

  const supabase = getSupabaseAdmin();
  const [{ data: cronRuns, error: cronRunsError }, { data: healthRows, error: healthError }] = await Promise.all([
    supabase
      .from('cron_job_runs')
      .select('job_name, started_at, completed_at, status, error_count, metadata')
      .order('started_at', { ascending: false })
      .limit(250),
    supabase
      .from('system_health_checks')
      .select('service, status, checked_at, detail')
      .order('checked_at', { ascending: false })
      .limit(24),
  ]);

  if (cronRunsError) {
    return NextResponse.json({ error: cronRunsError.message }, { status: 500 });
  }
  if (healthError) {
    return NextResponse.json({ error: healthError.message }, { status: 500 });
  }

  const latestRunByKey = new Map<string, CronRunRow>();
  const recordedRuns: CronRunHistoryRow[] = [];

  for (const rawRow of (cronRuns || []) as CronRunRow[]) {
    const key = aliasToKey.get(rawRow.job_name);
    if (!key) continue;

    if (!latestRunByKey.has(key)) {
      latestRunByKey.set(key, rawRow);
    }

    if (recordedRuns.length < 25) {
      const job = jobs.find((entry) => entry.key === key);
      if (job) {
        recordedRuns.push({
          key,
          name: job.name,
          startedAt: rawRow.started_at,
          completedAt: rawRow.completed_at,
          status: rawRow.status,
          errorCount: Number(rawRow.error_count || 0),
          summary: summarizeRun(rawRow),
        });
      }
    }
  }

  const latestHealthAt = (healthRows?.[0] as HealthRow | undefined)?.checked_at || null;
  const latestHealthSnapshot = latestHealthAt
    ? ((healthRows || []) as HealthRow[]).filter((row) => row.checked_at === latestHealthAt)
    : [];
  const degradedServices = latestHealthSnapshot.filter((row) => row.status === 'degraded').length;
  const outageServices = latestHealthSnapshot.filter((row) => row.status === 'outage').length;

  const jobSummaries: CronJobSummary[] = jobs.map((job) => {
    const recorded = latestRunByKey.get(job.key);
    if (recorded) {
      return {
        ...job,
        historySource: 'cron_job_runs',
        lastRun: {
          startedAt: recorded.started_at,
          completedAt: recorded.completed_at,
          durationMs: getDurationMs(recorded.started_at, recorded.completed_at),
          status: recorded.status,
          errorCount: Number(recorded.error_count || 0),
          summary: summarizeRun(recorded),
          metadata: recorded.metadata || null,
        },
      };
    }

    if (job.key === 'system-health' && latestHealthAt) {
      const summary = outageServices > 0
        ? `${outageServices} outage${outageServices === 1 ? '' : 's'} detected across ${latestHealthSnapshot.length} service checks`
        : degradedServices > 0
          ? `${degradedServices} degraded service${degradedServices === 1 ? '' : 's'} across ${latestHealthSnapshot.length} checks`
          : `${latestHealthSnapshot.length} service checks recorded`;
      return {
        ...job,
        historySource: 'system_health_checks',
        lastRun: {
          startedAt: latestHealthAt,
          completedAt: latestHealthAt,
          durationMs: null,
          status: 'success',
          errorCount: 0,
          summary,
          metadata: {
            checkedAt: latestHealthAt,
            serviceCount: latestHealthSnapshot.length,
            degradedServices,
            outageServices,
          },
        },
      };
    }

    return {
      ...job,
      historySource: null,
      lastRun: {
        startedAt: null,
        completedAt: null,
        durationMs: null,
        status: 'unrecorded',
        errorCount: 0,
        summary: 'No run recorded',
        metadata: null,
      },
    };
  });

  const payload: CronMonitorPayload = {
    fetchedAt: new Date().toISOString(),
    summary: {
      totalJobs: jobSummaries.length,
      recordedJobs: jobSummaries.filter((job) => job.lastRun.status !== 'unrecorded').length,
      unrecordedJobs: jobSummaries.filter((job) => job.lastRun.status === 'unrecorded').length,
      failingJobs: jobSummaries.filter((job) => job.lastRun.status === 'failed' || job.lastRun.status === 'partial').length,
      quotaJobs: jobSummaries.filter((job) => job.spendsQuota).length,
    },
    jobs: jobSummaries,
    recordedRuns,
  };

  return NextResponse.json(payload);
}
