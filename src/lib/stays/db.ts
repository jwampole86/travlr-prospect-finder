import type { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { listingIdFilter } from './listings';

type Db = ReturnType<typeof getSupabaseAdmin>;

/** Finds a listing in the key's organization. `liveOnly` adds the guest-facing gate: active, quality-approved and short-term-rental eligible. */
export async function findListing(db: Db, organizationId: string, id: string, opts: { liveOnly: boolean; columns?: string }) {
  const f = listingIdFilter(id);
  let q = db.from('stays_listings').select(opts.columns ?? '*').eq('organization_id', organizationId).eq(f.column, f.value);
  if (opts.liveOnly) q = q.eq('status', 'active').eq('quality_approved', true).eq('str_eligible', true);
  const { data, error } = await q.maybeSingle();
  return { listing: (data as Record<string, any> | null) ?? null, error }; // eslint-disable-line @typescript-eslint/no-explicit-any
}
