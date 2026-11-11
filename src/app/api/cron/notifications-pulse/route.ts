import { NextRequest, NextResponse } from 'next/server';
import { verifyJobRequest } from '@/lib/jobAuth';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { finishCronRun, startCronRun } from '@/lib/recordCronRun';
import { mergePrefs } from '@/lib/agentPrefs';
import { circuitFor } from '@/lib/services/sourceCircuit';

export const maxDuration = 60;

const HOUR = 3_600_000;
const HIGH_PRIORITY = 75;

type Db = ReturnType<typeof getSupabaseAdmin>;
type Note = { key: string; type: 'new_lead' | 'sync_health' | 'error' | 'info' | 'warning'; severity: 'info' | 'warning' | 'critical'; title: string; message: string; metadata?: Record<string, unknown> };

const nf = (n: number) => n.toLocaleString('en-US');
const mountainHour = (d = new Date()) => Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Denver', hour: 'numeric', hour12: false }).format(d)) % 24;
const mountainDay = (d = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Denver' }).format(d);

/** Writes a note for every admin and owner who has in-app alerts on, unless the same key was already sent inside `windowMs`. */
async function send(db: Db, admins: Array<{ id: string }>, n: Note, windowMs: number, problems: string[]): Promise<boolean> {
  const since = new Date(Date.now() - windowMs).toISOString();
  const { count } = await db.from('app_notifications').select('id', { count: 'exact', head: true }).eq('metadata->>pulse_key', n.key).gte('created_at', since);
  if ((count ?? 0) > 0 || admins.length === 0) return false;
  const rows = admins.map((a) => ({ user_id: a.id, type: n.type, severity: n.severity, category: 'system', title: n.title, message: n.message, metadata: { ...n.metadata, pulse_key: n.key } }));
  const { error } = await db.from('app_notifications').insert(rows);
  if (error) problems.push(`${n.key}: ${error.message}`);
  return !error;
}

/**
 * GET /api/cron/notifications-pulse  (CRON_SECRET, every 15 minutes)
 * The bell used to fill only when a person replied or a browser happened to be open during a sync, so it could go weeks without an update
 * while the system was busy. This writes the events that matter from the server itself: hourly lead intake with the high-priority ones
 * called out, sources whose pulls are failing (and when they recover), failed scheduled jobs, a low skip-trace allowance, and a morning summary.
 * In-app only, so nobody's texts or email are used for it, and each alert is sent once per window.
 */
export async function GET(req: NextRequest) {
  const authorization = await verifyJobRequest(req);
  if (!authorization.authorized) return NextResponse.json({ error: authorization.reason || 'Unauthorized' }, { status: 401 });
  const db = getSupabaseAdmin();
  const run = await startCronRun('notifications-pulse', {});
  const sent: string[] = [];
  const problems: string[] = [];

  try {
    const { data: profiles } = await db.from('user_profiles').select('id,agent_preferences').in('app_role', ['admin', 'owner']).neq('is_active', false).limit(20);
    const admins = (profiles ?? []).filter((p) => mergePrefs(p.agent_preferences).notif.inApp).map((p) => ({ id: String(p.id) }));
    const emit = async (n: Note, windowMs: number) => { if (await send(db, admins, n, windowMs, problems)) sent.push(n.key); };
    const now = Date.now();
    const sinceHour = new Date(now - HOUR).toISOString();

    // Lead intake in the last hour (one note per clock hour, only when something arrived).
    const { data: fresh } = await db.from('leads').select('source,prospect_score,address,city,state').gte('created_at', sinceHour).or('is_synthetic.is.null,is_synthetic.eq.false').order('prospect_score', { ascending: false, nullsFirst: false }).limit(2000);
    if ((fresh ?? []).length > 0) {
      const bySource = new Map<string, number>();
      for (const l of fresh!) bySource.set(String(l.source ?? 'Other'), (bySource.get(String(l.source ?? 'Other')) ?? 0) + 1);
      const sources = [...bySource.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([s, c]) => `${s} ${nf(c)}`).join(', ');
      const hot = fresh!.filter((l) => Number(l.prospect_score) >= HIGH_PRIORITY);
      const best = hot[0];
      await emit({
        key: `intake:${new Date(now).toISOString().slice(0, 13)}`, type: 'new_lead', severity: hot.length ? 'warning' : 'info',
        title: `${nf(fresh!.length)} new lead${fresh!.length === 1 ? '' : 's'} in the last hour`,
        message: `${sources}.${hot.length ? ` ${nf(hot.length)} high priority (75+), best: ${best.address}, ${best.city} ${best.state} at ${best.prospect_score}.` : ''}`,
        metadata: { count: fresh!.length, high_priority: hot.length },
      }, 50 * 60_000);
    }

    // Sources whose latest pulls are failing, and the ones that came back.
    const { data: events } = await db.from('sync_events').select('operation_id,status,last_error,created_at').eq('operation_type', 'source_sync').order('created_at', { ascending: false }).limit(1500);
    const bySource = new Map<string, Array<{ ok: boolean; at: string; error: string | null }>>();
    for (const e of events ?? []) {
      const source = String(e.operation_id ?? '').replace(/\s+[A-Z]{2}$/, '');
      if (!source) continue;
      bySource.set(source, [...(bySource.get(source) ?? []), { ok: e.status === 'success', at: String(e.created_at), error: (e.last_error as string | null) ?? null }]);
    }
    for (const [source, list] of bySource) {
      const circuit = circuitFor(list.map((x) => ({ source, ok: x.ok, at: x.at })), source, now);
      const lastError = list.find((x) => !x.ok)?.error ?? '';
      if (circuit.open) {
        const outage = /data provider is (down|too slow)/i.test(lastError);
        await emit({
          key: `source-down:${source}`, type: 'sync_health', severity: 'critical',
          title: outage ? `${source}: provider is down` : `${source}: pulls are failing`,
          message: `${nf(circuit.failures)} pulls in a row have failed. ${lastError ? lastError.slice(0, 220) : ''}`.trim(),
          metadata: { source, failures: circuit.failures },
        }, 12 * HOUR);
      } else if (list[0]?.ok && list.slice(1, 6).some((x) => !x.ok) && now - Date.parse(list[0].at) < 2 * HOUR) {
        await emit({ key: `source-up:${source}:${list[0].at.slice(0, 13)}`, type: 'sync_health', severity: 'info', title: `${source} is pulling again`, message: 'Recent pulls succeeded after earlier failures.', metadata: { source } }, 6 * HOUR);
      }
    }

    // Scheduled jobs that failed in the last half hour.
    const { data: failed } = await db.from('cron_job_runs').select('job_name,errors,started_at').eq('status', 'failed').gte('started_at', new Date(now - 30 * 60_000).toISOString()).limit(20);
    for (const f of failed ?? []) {
      await emit({ key: `job-failed:${f.job_name}`, type: 'error', severity: 'critical', title: `Scheduled job failed: ${f.job_name}`, message: String((f.errors as string[] | null)?.[0] ?? 'No error was recorded.').slice(0, 240), metadata: { job: f.job_name } }, 3 * HOUR);
    }

    // Skip-trace allowance running low.
    const { data: quotas } = await db.from('api_quota_state').select('service,remaining,resets_at').like('service', 'skiptrace:%').limit(5);
    for (const q of quotas ?? []) {
      if (Number(q.remaining) < 2000 && (!q.resets_at || Date.parse(String(q.resets_at)) > now)) {
        await emit({ key: `quota-low:${q.service}:${mountainDay()}`, type: 'warning', severity: 'warning', title: 'Skip-trace allowance is running low', message: `${nf(Number(q.remaining))} calls left this month.`, metadata: { remaining: q.remaining } }, 20 * HOUR);
      }
    }

    // Morning summary, once a day at 8am Mountain.
    if (mountainHour() === 8) {
      const day = new Date(now - 24 * HOUR).toISOString();
      const head = (table: string, filter: (q: any) => any) => filter(db.from(table).select('id', { count: 'exact', head: true }));
      const [newLeads, hot, traced, replies] = await Promise.all([
        head('leads', (q) => q.gte('created_at', day).or('is_synthetic.is.null,is_synthetic.eq.false')),
        head('leads', (q) => q.gte('created_at', day).gte('prospect_score', HIGH_PRIORITY).or('is_synthetic.is.null,is_synthetic.eq.false')),
        head('leads', (q) => q.gte('skip_traced_at', day).eq('skip_trace_status', 'FOUND')),
        head('outreach_history', (q) => q.gte('replied_at', day)),
      ]);
      await emit({
        key: `daily:${mountainDay()}`, type: 'info', severity: 'info', title: 'Yesterday on AVYRO',
        message: `${nf(newLeads.count ?? 0)} new leads (${nf(hot.count ?? 0)} high priority), ${nf(traced.count ?? 0)} owners found by skip trace, ${nf(replies.count ?? 0)} replies.`,
        metadata: { new_leads: newLeads.count, high_priority: hot.count, traced: traced.count, replies: replies.count },
      }, 20 * HOUR);
    }

    await finishCronRun(run, { status: problems.length ? 'partial' : 'success', errorCount: problems.length, errors: problems, metadata: { sent, admins: admins.length } });
    return NextResponse.json({ ok: problems.length === 0, sent, problems, admins: admins.length });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Notification pulse failed';
    await finishCronRun(run, { status: 'failed', errorCount: 1, errors: [message] });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
