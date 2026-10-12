import { createClient } from '@supabase/supabase-js';

/** Calls below this many remaining are left for owner-listed leads and manual lookups. */
export const SKIPTRACE_RESERVE = Number(process.env.SKIPTRACE_QUOTA_RESERVE ?? 150);

const serviceId = (key: string) => `skiptrace:${key.slice(-6)}`;

// Not supabaseAdmin: a client page reaches this module through the provider, and that file is server-only.
function db() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }) : null;
}

/** The last allowance reported for this key, or null when nothing is known or the monthly allowance has since reset. */
export async function readSkipTraceRemaining(key: string): Promise<number | null> {
  try {
    const client = db(); if (!client) return null;
    const { data } = await client.from('api_quota_state').select('remaining,resets_at').eq('service', serviceId(key)).maybeSingle();
    if (!data) return null;
    if (data.resets_at && Date.parse(data.resets_at) < Date.now()) return null;
    return Number(data.remaining);
  } catch { return null; }
}

export async function recordSkipTraceRemaining(key: string, remaining: number, resetSeconds: number | null): Promise<void> {
  try {
    const client = db(); if (!client) return;
    await client.from('api_quota_state').upsert({ service: serviceId(key), remaining, resets_at: resetSeconds ? new Date(Date.now() + resetSeconds * 1000).toISOString() : null, observed_at: new Date().toISOString() }, { onConflict: 'service' });
  } catch { /* the guard is best effort */ }
}
