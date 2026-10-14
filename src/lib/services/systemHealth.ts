import 'server-only';
import type { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { getResendConfigStatus } from '@/lib/email/resend';
import { getTwilioConfigStatus } from '@/lib/services/twilioService';
import { SKIPTRACE_RESERVE } from '@/lib/services/skipTraceQuota';

type Db = ReturnType<typeof getSupabaseAdmin>;
type Row = Record<string, any>;

export type HealthStatus = 'operational' | 'degraded' | 'outage' | 'maintenance';
export interface ServiceDef { id: string; name: string; description: string; group: 'core' | 'messaging' | 'data' | 'jobs'; slaTarget: number; checks: string; impact: string; fix: string }

export const SERVICES: ServiceDef[] = [
  { id: 'api', name: 'Application', description: 'The TRAVLR web app and its API', group: 'core', slaTarget: 99.9,
    checks: 'Recorded by the health job itself every 5 minutes. A gap in checks means the app or its scheduler stopped.', impact: 'If this is down nobody can sign in and no texts or reports can be processed.', fix: 'Check the latest Vercel deployment and function logs for errors, then redeploy or roll back.' },
  { id: 'database', name: 'Database', description: 'Supabase Postgres reads', group: 'core', slaTarget: 99.9,
    checks: 'Reads one lead row. Degraded above 1.5 seconds, outage if the query fails.', impact: 'Every page, campaign and report depends on the database.', fix: 'Open the Supabase dashboard: check project status, connection count and slow queries. Heavy scripts running at the same time can cause slowness.' },
  { id: 'sms_provider', name: 'Text messaging provider', description: 'Twilio account and API', group: 'messaging', slaTarget: 99.5,
    checks: 'Lists one message through the Twilio API with our credentials. Degraded above 3 seconds, outage if Twilio is unreachable or rejects the credentials.', impact: 'Texts cannot be scheduled or sent.', fix: 'Verify TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and the Twilio account balance and status in the Twilio console.' },
  { id: 'sms_delivery', name: 'Text delivery', description: 'Scheduled texts reach homeowners and are confirmed', group: 'messaging', slaTarget: 99.0,
    checks: 'Looks at campaign texts due in the last 24 hours (needs at least 5). Degraded if over 5% are still unsent, outage if over 25%.', impact: 'Homeowners are not being reached on schedule.', fix: 'Open Campaigns, find the batch with stuck texts, and check the Twilio messaging service and sender registration.' },
  { id: 'webhooks', name: 'Webhook endpoints', description: 'Delivery receipts and inbound replies', group: 'messaging', slaTarget: 99.5,
    checks: 'Calls the delivery-receipt and inbound-reply endpoints. They must be reachable and reject unsigned requests. Also warns when too few recent texts have delivery receipts.', impact: 'Replies, opt-outs and delivery results would not be recorded.', fix: 'Confirm the Twilio webhook URLs point at this site and that the signature check is enabled.' },
  { id: 'email', name: 'Email provider', description: 'Resend email delivery', group: 'messaging', slaTarget: 99.5,
    checks: 'Reaches Resend with our key and confirms the sending domain is verified. Degraded above 3 seconds or on the sandbox sender.', impact: 'Co-Host and follow-up emails would not send.', fix: 'Check the RESEND_API_KEY and the sending domain DNS records in Resend.' },
  { id: 'ai', name: 'AI assistant', description: 'Anthropic API used for drafting and research', group: 'data', slaTarget: 99.0,
    checks: 'Reaches the Anthropic API with our key. Degraded when slow, outage when the key is rejected or the service is down.', impact: 'AI drafting, replies and research would stop. Texts already scheduled are not affected.', fix: 'Check ANTHROPIC_API_KEY, the Anthropic usage limits and their status page.' },
  { id: 'enrichment', name: 'Skip tracing', description: 'Owner and phone lookups', group: 'data', slaTarget: 99.0,
    checks: 'Reads the remaining RapidAPI skip-trace quota. Degraded when it nears the reserve, outage when exhausted.', impact: 'New owner and phone lookups stop, so fewer leads become textable.', fix: 'Upgrade or wait for the RapidAPI quota to renew, then confirm the key.' },
  { id: 'scoring', name: 'Lead scoring', description: 'Prospect scores refresh every 15 minutes', group: 'jobs', slaTarget: 99.0,
    checks: 'Age of the newest score written. Degraded after 45 minutes without a new score.', impact: 'Lead rankings and campaign selection use stale scores.', fix: 'Check the lead-rescore cron run in Vercel and its function logs.' },
  { id: 'campaign_sync', name: 'Campaign reporting', description: 'Replies, opens and delivery are pulled into Campaigns', group: 'jobs', slaTarget: 99.0,
    checks: 'Age of the newest report update while texts are going out. Degraded when updates fall behind.', impact: 'Campaign numbers on the Results tab lag behind reality.', fix: 'Check the campaign report cron in Vercel and the Twilio status callbacks.' },
  { id: 'cohost_refresh', name: 'Co-Host listing refresh', description: 'Airbnb and Vrbo listings refresh every 12 hours', group: 'jobs', slaTarget: 99.0,
    checks: 'Age and result of the last Co-Host listing refresh. Degraded when it is overdue or failed.', impact: 'Co-Host listings and estimates may be out of date.', fix: 'Check the Co-Host refresh cron in Vercel and its last error.' },
];

export interface CheckResult { status: HealthStatus; responseMs: number | null; detail: string }
type Check = () => Promise<CheckResult>;

const SITE = (process.env.NEXT_PUBLIC_SITE_URL || 'https://prospect.staytrvlr.com').replace(/\/$/, '');
const real = (v: string | undefined) => !!v && !/your-|placeholder|changeme|example|here/i.test(v);
const minutesAgo = (t: unknown) => { const ms = Date.parse(String(t ?? '')); return Number.isNaN(ms) ? Infinity : (Date.now() - ms) / 60_000; };

async function timed(url: string, init: RequestInit = {}, ms = 8000) {
  const t = Date.now();
  try {
    const res = await fetch(url, { ...init, cache: 'no-store', signal: AbortSignal.timeout(ms) });
    return { res, ms: Date.now() - t, error: null as string | null };
  } catch (e) { return { res: null, ms: Date.now() - t, error: e instanceof Error ? e.message : 'Request failed' }; }
}

/** Recent campaign texts, loaded once per run and shared by the delivery checks. */
async function recentTexts(db: Db): Promise<Row[]> {
  const since = new Date(Date.now() - 24 * 3_600_000).toISOString();
  const out: Row[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from('outreach_history').select('metadata').eq('channel', 'sms').eq('metadata->>kind', 'estimate_outreach').gte('sent_at', since).range(from, from + 999);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []).map(r => r.metadata as Row));
    if ((data ?? []).length < 1000) break;
  }
  return out;
}

export async function runChecks(db: Db): Promise<Record<string, CheckResult>> {
  let texts: Row[] | null = null; const getTexts = async () => (texts ??= await recentTexts(db));

  const checks: Record<string, Check> = {
    api: async () => ({ status: 'operational', responseMs: null, detail: 'The health check itself is running, so the app is serving requests.' }),

    database: async () => {
      const t = Date.now(); const { error } = await db.from('leads').select('id').limit(1); const ms = Date.now() - t;
      if (error) return { status: 'outage', responseMs: ms, detail: `Query failed: ${error.message}` };
      return { status: ms > 1500 ? 'degraded' : 'operational', responseMs: ms, detail: `A simple query took ${ms} ms.` };
    },

    sms_provider: async () => {
      const cfg = getTwilioConfigStatus();
      if (!cfg.smsConfigured) return { status: 'maintenance', responseMs: null, detail: `Twilio is not fully configured (${cfg.missing.join(', ')}).` };
      const key = process.env.TWILIO_ACCOUNT_SID!; const sid = key.startsWith('SK') ? process.env.TWILIO_ACCOUNT_SID_MAIN : key;
      const { res, ms, error } = await timed(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json?PageSize=1`, { headers: { Authorization: `Basic ${Buffer.from(`${key}:${process.env.TWILIO_AUTH_TOKEN}`).toString('base64')}` } });
      if (!res) return { status: 'outage', responseMs: ms, detail: `Twilio could not be reached: ${error}` };
      if (res.status === 401 || res.status === 403) return { status: 'outage', responseMs: ms, detail: `Twilio rejected our credentials (HTTP ${res.status}).` };
      if (!res.ok) return { status: 'degraded', responseMs: ms, detail: `Twilio answered HTTP ${res.status}.` };
      return { status: ms > 3000 ? 'degraded' : 'operational', responseMs: ms, detail: `Twilio accepted our credentials and listed messages (${ms} ms).` };
    },

    sms_delivery: async () => {
      const rows = (await getTexts()).filter(m => Date.parse(m.scheduled_for) < Date.now() - 20 * 60_000 && m.twilio_status !== 'canceled');
      if (rows.length < 5) return { status: 'operational', responseMs: null, detail: `${rows.length} texts were due in the last 24 hours, too few to judge. Nothing is stuck.` };
      const stuck = rows.filter(m => ['scheduled', 'queued', 'accepted'].includes(String(m.twilio_status ?? 'scheduled')) || (m.twilio_status === 'sending' && minutesAgo(m.scheduled_for) > 60)).length;
      const share = stuck / rows.length;
      return { status: share > 0.25 ? 'outage' : share > 0.05 ? 'degraded' : 'operational', responseMs: null, detail: `${stuck} of ${rows.length} texts due in the last 24 hours have not left the queue (${Math.round(share * 1000) / 10}%).` };
    },

    webhooks: async () => {
      const [cb, inbound] = await Promise.all([timed(`${SITE}/api/sms/delivery`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'MessageSid=healthcheck&MessageStatus=delivered' }), timed(`${SITE}/api/sms/inbound`, { method: 'GET' })]);
      const ms = Math.max(cb.ms, inbound.ms);
      if (!cb.res || !inbound.res) return { status: 'outage', responseMs: ms, detail: `An endpoint could not be reached: ${cb.error ?? inbound.error}` };
      if (cb.res.status >= 500 || inbound.res.status >= 500 || inbound.res.status === 404) return { status: 'outage', responseMs: ms, detail: `Delivery receipts answered HTTP ${cb.res.status}, inbound replies HTTP ${inbound.res.status}.` };
      if (cb.res.status < 300) return { status: 'degraded', responseMs: ms, detail: 'The delivery receipt endpoint accepted an unsigned request. Signature checking may be off.' };
      const recent = (await getTexts()).filter(m => minutesAgo(m.scheduled_for) > 30 && minutesAgo(m.scheduled_for) < 360 && m.twilio_status !== 'canceled');
      if (recent.length >= 10) {
        const confirmed = recent.filter(m => ['delivered', 'undelivered', 'failed', 'read'].includes(String(m.twilio_status))).length;
        if (confirmed / recent.length < 0.1) return { status: 'outage', responseMs: ms, detail: `Only ${confirmed} of ${recent.length} texts sent in the last 6 hours have a delivery receipt.` };
        if (confirmed / recent.length < 0.5) return { status: 'degraded', responseMs: ms, detail: `Only ${confirmed} of ${recent.length} texts sent in the last 6 hours have a delivery receipt.` };
      }
      return { status: ms > 3000 ? 'degraded' : 'operational', responseMs: ms, detail: `Both endpoints are up and reject unsigned requests (${ms} ms).` };
    },

    email: async () => {
      const cfg = getResendConfigStatus();
      if (!cfg.apiKeyConfigured || !cfg.senderConfigured) return { status: 'maintenance', responseMs: null, detail: 'Resend is not fully configured.' };
      if (cfg.senderIsSandbox) return { status: 'degraded', responseMs: null, detail: 'The sender is the Resend sandbox, which only delivers to the account owner.' };
      const { res, ms, error } = await timed('https://api.resend.com/domains', { headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}` } });
      if (!res) return { status: 'outage', responseMs: ms, detail: `Resend could not be reached: ${error}` };
      const j = await res.json().catch(() => ({})) as Row;
      if (res.status === 401 && j.name === 'restricted_api_key') return { status: 'operational', responseMs: ms, detail: `Resend is reachable with a send-only key (${ms} ms).` };
      if (res.status === 401 || res.status === 403) return { status: 'outage', responseMs: ms, detail: `Resend rejected our key (HTTP ${res.status}).` };
      if (!res.ok) return { status: 'degraded', responseMs: ms, detail: `Resend answered HTTP ${res.status}.` };
      const domain = (j.data as Row[] | undefined)?.find(d => d.name === cfg.senderDomain);
      if (domain && domain.status !== 'verified') return { status: 'degraded', responseMs: ms, detail: `The sending domain ${cfg.senderDomain} is ${domain.status}.` };
      return { status: ms > 3000 ? 'degraded' : 'operational', responseMs: ms, detail: `Resend is reachable and the sending domain is verified (${ms} ms).` };
    },

    ai: async () => {
      if (!real(process.env.ANTHROPIC_API_KEY)) return { status: 'maintenance', responseMs: null, detail: 'No Anthropic key is configured.' };
      const { res, ms, error } = await timed('https://api.anthropic.com/v1/models?limit=1', { headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY!, 'anthropic-version': '2023-06-01' } });
      if (!res) return { status: 'outage', responseMs: ms, detail: `Anthropic could not be reached: ${error}` };
      if (res.status === 401 || res.status === 403) return { status: 'outage', responseMs: ms, detail: `Anthropic rejected our key (HTTP ${res.status}).` };
      if (!res.ok) return { status: 'degraded', responseMs: ms, detail: `Anthropic answered HTTP ${res.status}.` };
      return { status: ms > 4000 ? 'degraded' : 'operational', responseMs: ms, detail: `Anthropic is reachable (${ms} ms).` };
    },

    enrichment: async () => {
      const { data } = await db.from('api_quota_state').select('remaining,resets_at,observed_at').like('service', 'skiptrace:%').order('observed_at', { ascending: false }).limit(1);
      const q = data?.[0]; if (!q) return { status: 'maintenance', responseMs: null, detail: 'No skip-trace allowance reading has been recorded yet.' };
      const left = Number(q.remaining);
      if (left < SKIPTRACE_RESERVE) return { status: 'degraded', responseMs: null, detail: `${left} skip-trace calls remain, below the reserve of ${SKIPTRACE_RESERVE}. Background tracing is paused${q.resets_at ? ` until ${new Date(q.resets_at).toLocaleDateString('en-US')}` : ''}.` };
      return { status: 'operational', responseMs: null, detail: `${left.toLocaleString()} skip-trace calls remain${q.resets_at ? `, renewing ${new Date(q.resets_at).toLocaleDateString('en-US')}` : ''}.` };
    },

    scoring: async () => {
      const { data, error } = await db.from('leads').select('score_refreshed_at').not('score_refreshed_at', 'is', null).order('score_refreshed_at', { ascending: false }).limit(1);
      if (error) return { status: 'degraded', responseMs: null, detail: `Could not read scoring freshness: ${error.message}` };
      const age = minutesAgo(data?.[0]?.score_refreshed_at);
      return { status: age > 360 ? 'outage' : age > 120 ? 'degraded' : 'operational', responseMs: null, detail: Number.isFinite(age) ? `The newest score was written ${Math.round(age)} minutes ago.` : 'No lead has been scored yet.' };
    },

    campaign_sync: async () => {
      const recent = (await getTexts()).filter(m => minutesAgo(m.scheduled_for) < 180 && minutesAgo(m.scheduled_for) > 10 && m.twilio_status !== 'canceled');
      const { data } = await db.from('sms_lead_engagement').select('updated_at').order('updated_at', { ascending: false }).limit(1);
      const age = minutesAgo(data?.[0]?.updated_at);
      if (recent.length === 0) return { status: 'operational', responseMs: null, detail: `No texts went out in the last 3 hours. The newest report update was ${Number.isFinite(age) ? `${Math.round(age)} minutes` : 'never'} ago.` };
      return { status: age > 120 ? 'outage' : age > 45 ? 'degraded' : 'operational', responseMs: null, detail: `Texts went out in the last 3 hours. The newest report update was ${Math.round(age)} minutes ago (it refreshes every 15 minutes).` };
    },

    cohost_refresh: async () => {
      const { data } = await db.from('str_refresh_runs').select('started_at,status,note').order('started_at', { ascending: false }).limit(1);
      const r = data?.[0]; if (!r) return { status: 'maintenance', responseMs: null, detail: 'The listing refresh has not run yet.' };
      const age = minutesAgo(r.started_at);
      if (!['ok', 'skipped'].includes(String(r.status))) return { status: 'degraded', responseMs: null, detail: `The last refresh ${Math.round(age / 60)} hours ago ended as "${r.status}"${r.note ? `: ${r.note}` : ''}.` };
      return { status: age > 36 * 60 ? 'outage' : age > 26 * 60 ? 'degraded' : 'operational', responseMs: null, detail: `The last refresh ran ${Math.round(age / 60)} hours ago (${r.status}).` };
    },
  };

  const entries = await Promise.all(Object.entries(checks).map(async ([id, fn]) => {
    try { return [id, await fn()] as const; }
    catch (e) { return [id, { status: 'degraded', responseMs: null, detail: `The check itself failed: ${e instanceof Error ? e.message : 'unknown error'}` } as CheckResult] as const; }
  }));
  return Object.fromEntries(entries);
}

let lastRun = 0;
/** Runs every check, stores the results and trims history older than 120 days. */
export async function runAndRecord(db: Db) {
  lastRun = Date.now();
  const results = await runChecks(db);
  const at = new Date().toISOString();
  await db.from('system_health_checks').insert(Object.entries(results).map(([service, r]) => ({ checked_at: at, service, status: r.status, response_ms: r.responseMs, detail: r.detail.slice(0, 400) })));
  if (Math.random() < 0.02) await db.from('system_health_checks').delete().lt('checked_at', new Date(Date.now() - 120 * 86_400_000).toISOString());
  return { at, results };
}

/** If the cron has not written a check lately, run one now (at most once a minute). */
export async function ensureFresh(db: Db) {
  const { data } = await db.from('system_health_checks').select('checked_at').order('checked_at', { ascending: false }).limit(1);
  if (minutesAgo(data?.[0]?.checked_at) > 10 && Date.now() - lastRun > 60_000) await runAndRecord(db);
}

// ─── Reading history ─────────────────────────────────────────────────────────

const dayFmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Denver', year: 'numeric', month: '2-digit', day: '2-digit' });

export interface ServiceReport {
  id: string; name: string; description: string; group: ServiceDef['group']; slaTarget: number;
  status: HealthStatus; responseMs: number | null; lastChecked: string | null; stale: boolean; detail?: string; fix?: string; lastFailureAt: string | null;
  hours: Array<{ t: string; status: HealthStatus | 'none'; avgMs: number | null; checks: number }>;
  uptime30d: number | null; uptime90d: number | null; healthy30d: number | null; avgMs30d: number | null;
  days: Array<{ date: string; status: HealthStatus | 'none'; uptime: number | null; checks: number }>;
}
export interface Incident {
  id: string; service: string; serviceName: string; severity: 'major' | 'minor'; status: 'ongoing' | 'resolved';
  startedAt: string; resolvedAt: string | null; durationMin: number; worst: HealthStatus; samples: number; detail?: string;
}

export async function healthReport(db: Db, opts: { detail: boolean }) {
  const [{ data: latest }, { data: daily }, { data: bad }, { data: hourly }] = await Promise.all([
    db.from('system_health_checks').select('service,status,response_ms,detail,checked_at').gte('checked_at', new Date(Date.now() - 36 * 3_600_000).toISOString()).order('checked_at', { ascending: false }).limit(2000),
    db.rpc('system_health_daily', { p_days: 90 }),
    db.from('system_health_checks').select('service,status,detail,checked_at').in('status', ['degraded', 'outage']).gte('checked_at', new Date(Date.now() - 30 * 86_400_000).toISOString()).order('checked_at', { ascending: true }).limit(5000),
    db.rpc('system_health_hourly', { p_hours: 24 }),
  ]);
  const newest = new Map<string, Row>(); for (const r of latest ?? []) if (!newest.has(r.service)) newest.set(r.service, r);
  const byService = new Map<string, Row[]>(); for (const d of (daily ?? []) as Row[]) { const a = byService.get(d.service) ?? []; a.push(d); byService.set(d.service, a); }
  const hourRows = new Map<string, Row>(); for (const h of (hourly ?? []) as Row[]) hourRows.set(`${h.service}|${new Date(h.hour).getTime()}`, h);
  const thisHour = Math.floor(Date.now() / 3_600_000) * 3_600_000;
  const hourList = Array.from({ length: 24 }, (_, i) => thisHour - (23 - i) * 3_600_000);
  const lastBad = new Map<string, string>(); for (const r of bad ?? []) lastBad.set(r.service, r.checked_at);
  const dayList = Array.from({ length: 90 }, (_, i) => dayFmt.format(Date.now() - (89 - i) * 86_400_000));

  const sum = (rows: Row[], days: number) => {
    const from = dayFmt.format(Date.now() - (days - 1) * 86_400_000); const sel = rows.filter(r => String(r.day) >= from);
    const total = sel.reduce((s, r) => s + Number(r.checks), 0); if (!total) return { uptime: null as number | null, healthy: null as number | null, ms: null as number | null };
    const out = sel.reduce((s, r) => s + Number(r.outage), 0); const ok = sel.reduce((s, r) => s + Number(r.ok), 0);
    const msRows = sel.filter(r => r.avg_ms != null);
    return { uptime: Math.round(((total - out) / total) * 10000) / 100, healthy: Math.round((ok / total) * 10000) / 100, ms: msRows.length ? Math.round(msRows.reduce((s, r) => s + Number(r.avg_ms) * Number(r.checks), 0) / msRows.reduce((s, r) => s + Number(r.checks), 0)) : null };
  };

  const services: ServiceReport[] = SERVICES.map(def => {
    const n = newest.get(def.id); const rows = byService.get(def.id) ?? []; const byDay = new Map(rows.map(r => [String(r.day), r]));
    const s30 = sum(rows, 30), s90 = sum(rows, 90);
    const { fix: _fix, ...pub } = def; void _fix;
    return {
      ...pub, status: (n?.status as HealthStatus) ?? 'maintenance', responseMs: n?.response_ms ?? null, lastChecked: n?.checked_at ?? null, stale: n ? minutesAgo(n.checked_at) > 15 : true,
      ...(opts.detail ? { detail: n?.detail ?? 'No check has been recorded yet.', fix: def.fix } : {}), lastFailureAt: lastBad.get(def.id) ?? null,
      hours: hourList.map(t => { const h = hourRows.get(`${def.id}|${t}`); if (!h) return { t: new Date(t).toISOString(), status: 'none' as const, avgMs: null, checks: 0 };
        return { t: new Date(t).toISOString(), status: (Number(h.outage) > 0 ? 'outage' : Number(h.degraded) > 0 ? 'degraded' : 'operational') as HealthStatus, avgMs: h.avg_ms != null ? Number(h.avg_ms) : null, checks: Number(h.checks) }; }),
      uptime30d: s30.uptime, uptime90d: s90.uptime, healthy30d: s30.healthy, avgMs30d: s30.ms,
      days: dayList.map(date => { const d = byDay.get(date); if (!d) return { date, status: 'none' as const, uptime: null, checks: 0 };
        const checks = Number(d.checks); const status: HealthStatus = Number(d.outage) > 0 ? 'outage' : Number(d.degraded) > 0 ? 'degraded' : 'operational';
        return { date, status, uptime: Math.round(((checks - Number(d.outage)) / checks) * 10000) / 100, checks }; }),
    };
  });

  // An incident is a run of non-healthy checks with no more than 20 minutes between them.
  const names = new Map(SERVICES.map(s => [s.id, s.name])); const incidents: Incident[] = [];
  const open = new Map<string, { start: Row; last: Row; worst: HealthStatus; samples: number }>();
  const close = (svc: string, ongoing: boolean) => {
    const o = open.get(svc); if (!o) return; open.delete(svc);
    const started = Date.parse(o.start.checked_at); const ended = ongoing ? Date.now() : Date.parse(o.last.checked_at) + 5 * 60_000;
    incidents.push({ id: `${svc}-${started}`, service: svc, serviceName: names.get(svc) ?? svc, severity: o.worst === 'outage' ? 'major' : 'minor', status: ongoing ? 'ongoing' : 'resolved', startedAt: o.start.checked_at, resolvedAt: ongoing ? null : new Date(ended).toISOString(), durationMin: Math.max(5, Math.round((ended - started) / 60_000)), worst: o.worst, samples: o.samples, ...(opts.detail ? { detail: String(o.last.detail ?? '') } : {}) });
  };
  for (const r of bad ?? []) {
    const o = open.get(r.service);
    if (o && Date.parse(r.checked_at) - Date.parse(o.last.checked_at) > 20 * 60_000) close(r.service, false);
    const cur = open.get(r.service);
    if (!cur) open.set(r.service, { start: r, last: r, worst: r.status, samples: 1 });
    else { cur.last = r; cur.samples++; if (r.status === 'outage') cur.worst = 'outage'; }
  }
  for (const [svc, o] of [...open.entries()]) { const live = newest.get(svc); close(svc, !!live && ['degraded', 'outage'].includes(live.status) && minutesAgo(o.last.checked_at) < 20); }
  incidents.sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt));

  const lastChecked = services.map(s => s.lastChecked).filter(Boolean).sort().pop() ?? null;
  const overall: HealthStatus = services.some(s => s.status === 'outage') ? 'outage' : services.some(s => s.status === 'degraded') ? 'degraded' : services.every(s => s.status === 'maintenance') ? 'maintenance' : 'operational';
  const dayRows = (daily ?? []) as Row[]; const total30 = services.map(x => x.uptime30d).filter((v): v is number => v != null);
  const summary = {
    uptime30d: total30.length ? Math.round((total30.reduce((a, b) => a + b, 0) / total30.length) * 100) / 100 : null,
    avgMs24h: (() => { const v = (hourly ?? []).filter((h: Row) => h.avg_ms != null); const c = v.reduce((a: number, h: Row) => a + Number(h.checks), 0); return c ? Math.round(v.reduce((a: number, h: Row) => a + Number(h.avg_ms) * Number(h.checks), 0) / c) : null; })(),
    checksRecorded: dayRows.reduce((a, d) => a + Number(d.checks), 0),
    since: dayRows.length ? dayRows.map(d => String(d.day)).sort()[0] : null,
    incidents30d: incidents.length, ongoing: incidents.filter(i => i.status === 'ongoing').length,
  };
  return { checkedAt: lastChecked, overall, services, incidents, summary };
}

/** Checks for one service: the last `hours` hours, or one Mountain-time `date` (YYYY-MM-DD) when given. */
export async function serviceHistory(db: Db, service: string, hours: number, opts: { detail: boolean; date?: string | null } = { detail: false }) {
  let from = new Date(Date.now() - hours * 3_600_000).toISOString(); let to: string | null = null;
  if (opts.date) {
    const base = Date.parse(`${opts.date}T00:00:00Z`);
    const start = [6, 7].map(h => base + h * 3_600_000).find(t => dayFmt.format(t) === opts.date && dayFmt.format(t - 1) !== opts.date);
    if (start != null) { from = new Date(start).toISOString(); to = new Date(start + 25 * 3_600_000).toISOString(); }
    const end = start != null ? [23, 24, 25].map(h => start + h * 3_600_000).find(t => dayFmt.format(t) !== opts.date) : null;
    if (end != null) to = new Date(end).toISOString();
  }
  let q = db.from('system_health_checks').select('checked_at,status,response_ms,detail').eq('service', service).gte('checked_at', from).order('checked_at', { ascending: true }).limit(1000);
  if (to) q = q.lt('checked_at', to);
  const { data } = await q;
  return (data ?? []).map(r => ({ t: r.checked_at as string, status: r.status as HealthStatus, ms: r.response_ms as number | null, ...(opts.detail ? { detail: r.detail as string | null } : {}) }));
}
