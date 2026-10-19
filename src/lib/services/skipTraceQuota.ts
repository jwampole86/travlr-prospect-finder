import { createClient } from '@supabase/supabase-js';

/** Calls below this many remaining are left for owner-listed leads and manual lookups. */
export const SKIPTRACE_RESERVE = Number(process.env.SKIPTRACE_QUOTA_RESERVE ?? 150);

const serviceId = (key: string) => `skiptrace:${key.slice(-6)}`;

/**
 * Once the allowance is used up, one small run is allowed now and then to notice a plan upgrade. Each run costs real calls (the
 * provider keeps counting past zero), so it is not done every 15 minutes any more.
 */
export const PROBE_MINUTES = Number(process.env.SKIPTRACE_PROBE_MINUTES ?? 180);
/** The allowance is meant to be used over this many days, not stretched across the whole month, so queued leads are traced promptly. */
export const SPREAD_DAYS = Number(process.env.SKIPTRACE_SPREAD_DAYS ?? 7);

// Not supabaseAdmin: a client page reaches this module through the provider, and that file is server-only.
function db() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }) : null;
}

/** The last allowance reported for this key, or null when nothing is known or the monthly allowance has since reset. */
export async function readSkipTraceRemaining(key: string): Promise<number | null> {
  try {
    const client = db(); if (!client) return null;
    const { data } = await client.from('api_quota_state').select('remaining,resets_at,observed_at').eq('service', serviceId(key)).maybeSingle();
    if (!data) return null;
    if (data.resets_at && Date.parse(data.resets_at) < Date.now()) return null;
    // A low reading is re-checked now and then, so a plan upgrade is noticed without waiting for the monthly reset.
    if (Number(data.remaining) < SKIPTRACE_RESERVE && Date.now() - Date.parse(data.observed_at) > PROBE_MINUTES * 60_000) return null;
    return Number(data.remaining);
  } catch { return null; }
}

export async function recordSkipTraceRemaining(key: string, remaining: number, resetSeconds: number | null): Promise<void> {
  try {
    const client = db(); if (!client) return;
    await client.from('api_quota_state').upsert({ service: serviceId(key), remaining, resets_at: resetSeconds ? new Date(Date.now() + resetSeconds * 1000).toISOString() : null, observed_at: new Date().toISOString() }, { onConflict: 'service' });
  } catch { /* the guard is best effort */ }
}

const PER_LEAD_CALLS = 4;

/**
 * How many leads a 10-minute job may trace now so the monthly allowance lasts until it resets. `held` calls are kept back for other jobs
 * (for example the co-host queue). Returns `fallback` when no reading is stored yet; 0 means pause this run.
 */
export async function skipTracePace(key: string | undefined, max: number, opts: { held?: number; fallback?: number; runMinutes?: number } = {}): Promise<number> {
  const fallback = opts.fallback ?? Math.min(max, 3);
  if (!key) return 0;
  try {
    const client = db(); if (!client) return fallback;
    const { data } = await client.from('api_quota_state').select('remaining,resets_at,observed_at').eq('service', serviceId(key)).maybeSingle();
    if (!data) return fallback;
    const remaining = Number(data.remaining) - SKIPTRACE_RESERVE - (opts.held ?? 0);
    // A low reading that has not been refreshed for a while may be from before an upgrade, so let one small run re-check it.
    if (remaining <= 0) return Date.now() - Date.parse(data.observed_at) > PROBE_MINUTES * 60_000 ? 1 : 0;
    const minutesLeft = data.resets_at ? Math.min(Date.parse(data.resets_at) - Date.now(), SPREAD_DAYS * 86_400_000) / 60_000 : SPREAD_DAYS * 1440;
    const runsLeft = Math.max(1, minutesLeft / (opts.runMinutes ?? 10));
    return Math.min(max, Math.max(1, Math.ceil(remaining / PER_LEAD_CALLS / runsLeft)));
  } catch { return fallback; }
}
