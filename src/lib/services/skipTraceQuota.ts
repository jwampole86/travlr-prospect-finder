import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

/** Calls below this many remaining are left for owner-listed leads and manual lookups. */
export const SKIPTRACE_RESERVE = Number(process.env.SKIPTRACE_QUOTA_RESERVE ?? 150);

const serviceId = (key: string) => `skiptrace:${key.slice(-6)}`;

/** The last allowance reported for this key, or null when nothing is known or the monthly allowance has since reset. */
export async function readSkipTraceRemaining(key: string): Promise<number | null> {
  try {
    const { data } = await getSupabaseAdmin().from('api_quota_state').select('remaining,resets_at').eq('service', serviceId(key)).maybeSingle();
    if (!data) return null;
    if (data.resets_at && Date.parse(data.resets_at) < Date.now()) return null;
    return Number(data.remaining);
  } catch { return null; }
}

export async function recordSkipTraceRemaining(key: string, remaining: number, resetSeconds: number | null): Promise<void> {
  try {
    await getSupabaseAdmin().from('api_quota_state').upsert({ service: serviceId(key), remaining, resets_at: resetSeconds ? new Date(Date.now() + resetSeconds * 1000).toISOString() : null, observed_at: new Date().toISOString() }, { onConflict: 'service' });
  } catch { /* the guard is best effort */ }
}
