import 'server-only';
import type { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { finishCronRun, startCronRun } from '@/lib/recordCronRun';
import { runChecks, type CheckResult, type HealthStatus } from '@/lib/services/systemHealth';

type Db = ReturnType<typeof getSupabaseAdmin>;

export const REPAIR_JOB_PREFIX = 'auto-repair:';

interface JobRepair {
  /** Scheduled job that fixes this service when it is run again. */
  path: string;
  label: string;
  /** Do not re-run more often than this, so a job that keeps failing cannot loop or burn quota. */
  cooldownMin: number;
  /** Return a reason to skip the repair (e.g. a failed run that re-running will not cure). */
  skip?: (r: CheckResult) => string | null;
}

// Only jobs that are already scheduled, idempotent and quota-capped. Nothing here sends a text or email on its own.
const JOB_REPAIRS: Record<string, JobRepair> = {
  scoring: { path: '/api/cron/lead-rescore', label: 'Re-ran the lead scoring job', cooldownMin: 20 },
  campaign_sync: { path: '/api/cron/sms-campaign-harvest', label: 'Re-ran the campaign report update', cooldownMin: 20 },
  cohost_refresh: {
    path: '/api/cron/cohost-refresh', label: 'Re-ran the Co-Host listing refresh', cooldownMin: 180,
    skip: (r) => {
      if (/quota_reserve/i.test(r.detail)) return 'Paused on purpose: it stops to keep an AirDNA request reserve. It resumes when the monthly allowance renews, or sooner if COHOST_REFRESH_MIN_REMAINING is lowered.';
      if (/ended as/i.test(r.detail)) return 'The last refresh failed, so it is not retried automatically (it would spend AirDNA calls again). Check the error shown above.';
      return null;
    },
  },
};

// Provider checks that fail on a network blip or a slow response. They are re-checked once before being reported.
const TRANSIENT_SERVICES = ['database', 'sms_provider', 'email', 'ai', 'webhooks'];

// Problems no job can cure: they need a human, so the repair log says exactly what to do.
const NEEDS_PEOPLE: Record<string, string> = {
  sms_delivery: 'Unsent texts are never re-sent automatically (opt-out and protected-contact rules). Open Campaigns and check the stuck batch.',
  enrichment: 'The skip-trace allowance is used up. It resumes by itself when the RapidAPI quota renews.',
  api: 'A gap in checks means the app or its scheduler stopped. Check the latest deployment and logs.',
  sms_provider: 'Credentials, balance or account status need attention in the Twilio console.',
  email: 'The Resend key or sending domain needs attention.',
  ai: 'The Anthropic key, limit or service status needs attention.',
  database: 'Check the Supabase project status and slow queries.',
  webhooks: 'Check the Twilio webhook URLs and signature setting.',
};

export interface RepairAction {
  service: string;
  outcome: 'fixed' | 'ran' | 'skipped' | 'failed' | 'needs_attention';
  detail: string;
}

const bad = (s: HealthStatus) => s === 'degraded' || s === 'outage';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Second look at provider checks: a one-off slow or failed request should not show as an incident. */
export async function recheckTransient(db: Db, results: Record<string, CheckResult>): Promise<Record<string, CheckResult>> {
  const suspects = TRANSIENT_SERVICES.filter((id) => results[id] && bad(results[id].status));
  if (suspects.length === 0) return results;
  await sleep(3000);
  const second = await runChecks(db);
  const merged = { ...results };
  for (const id of suspects) {
    const again = second[id];
    if (again && !bad(again.status)) merged[id] = { ...again, detail: `Recovered on an automatic re-check. ${again.detail}` };
  }
  return merged;
}

async function lastRepairAt(db: Db, service: string): Promise<number> {
  const { data } = await db.from('cron_job_runs').select('started_at').eq('job_name', REPAIR_JOB_PREFIX + service).order('started_at', { ascending: false }).limit(1);
  const t = Date.parse(String(data?.[0]?.started_at ?? ''));
  return Number.isNaN(t) ? 0 : t;
}

/**
 * Runs the safe repair for every degraded or down service, records what it did, then re-checks. Returns the re-check
 * results for the services that were repaired so the caller can store them.
 */
export async function repairDegraded(
  db: Db,
  results: Record<string, CheckResult>,
  opts: { origin: string; force?: boolean },
): Promise<{ actions: RepairAction[]; rechecked: Record<string, CheckResult> }> {
  const actions: RepairAction[] = [];
  const secret = process.env.CRON_SECRET;
  const ran: string[] = [];

  for (const [service, r] of Object.entries(results)) {
    if (!bad(r.status)) continue;
    const job = JOB_REPAIRS[service];

    if (!job) {
      const note = NEEDS_PEOPLE[service];
      if (note) actions.push({ service, outcome: 'needs_attention', detail: note });
      continue;
    }
    const skipReason = job.skip?.(r);
    if (skipReason) { actions.push({ service, outcome: 'needs_attention', detail: skipReason }); continue; }
    if (!secret || /your-|placeholder|changeme|example/i.test(secret)) {
      actions.push({ service, outcome: 'skipped', detail: 'CRON_SECRET is not configured, so the job cannot be triggered automatically.' });
      continue;
    }
    const sinceMin = (Date.now() - (await lastRepairAt(db, service))) / 60_000;
    if (!opts.force && sinceMin < job.cooldownMin) {
      actions.push({ service, outcome: 'skipped', detail: `Already repaired ${Math.round(sinceMin)} minutes ago; waiting ${job.cooldownMin} minutes before trying again.` });
      continue;
    }

    const run = await startCronRun(REPAIR_JOB_PREFIX + service, { service, path: job.path, trigger: opts.force ? 'manual' : 'auto', before: r.detail });
    try {
      const res = await fetch(`${opts.origin}${job.path}`, { headers: { authorization: `Bearer ${secret}` }, cache: 'no-store', signal: AbortSignal.timeout(240_000) });
      if (!res.ok) throw new Error(`${job.path} answered HTTP ${res.status}`);
      await finishCronRun(run, { status: 'success', metadata: { service, path: job.path, trigger: opts.force ? 'manual' : 'auto' } });
      actions.push({ service, outcome: 'ran', detail: `${job.label}.` });
      ran.push(service);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Repair failed';
      await finishCronRun(run, { status: 'failed', errorCount: 1, errors: [message], metadata: { service, path: job.path, trigger: opts.force ? 'manual' : 'auto' } });
      actions.push({ service, outcome: 'failed', detail: `${job.label} failed: ${message}` });
    }
  }

  // Confirm the repair worked.
  const rechecked: Record<string, CheckResult> = {};
  if (ran.length > 0) {
    const after = await runChecks(db);
    for (const service of ran) {
      rechecked[service] = after[service];
      const a = actions.find((x) => x.service === service && x.outcome === 'ran');
      if (a && after[service] && !bad(after[service].status)) { a.outcome = 'fixed'; a.detail += ' The service is healthy again.'; }
      else if (a) a.detail += ' It still reports a problem; it will be retried after the cool-down.';
    }
  }
  return { actions, rechecked };
}

export interface RepairLogEntry { id: string; service: string; at: string; status: string; trigger: string; detail: string }

/** The most recent automatic and manual repair runs, newest first. */
export async function repairHistory(db: Db, limit = 20): Promise<RepairLogEntry[]> {
  const { data } = await db.from('cron_job_runs').select('id,job_name,started_at,status,errors,metadata').like('job_name', `${REPAIR_JOB_PREFIX}%`).order('started_at', { ascending: false }).limit(limit);
  return (data ?? []).map((r) => {
    const meta = (r.metadata ?? {}) as Record<string, unknown>;
    const errors = Array.isArray(r.errors) ? (r.errors as string[]) : [];
    return {
      id: String(r.id), service: String(r.job_name).slice(REPAIR_JOB_PREFIX.length), at: String(r.started_at), status: String(r.status),
      trigger: String(meta.trigger ?? 'auto'), detail: errors[0] ?? String(meta.path ?? ''),
    };
  });
}
