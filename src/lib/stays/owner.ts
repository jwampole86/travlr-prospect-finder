import type { NextRequest } from 'next/server';
import type { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { listingIdFilter } from './listings';

type Db = ReturnType<typeof getSupabaseAdmin>;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** The signed-in owner's email, passed by NAVEO Stays after it has authenticated them. Missing or malformed means no owner. */
export function ownerEmailFrom(req: NextRequest): string | null {
  const v = req.headers.get('x-owner-email')?.trim().toLowerCase() ?? '';
  return v.length <= 200 && EMAIL.test(v) ? v : null;
}

/** A listing in the key's organization that belongs to this owner (any status). Returns null for anyone else's, so callers answer 404 either way. */
export async function findOwnedListing(db: Db, organizationId: string, id: string, ownerEmail: string, columns = 'id') {
  const f = listingIdFilter(id);
  const { data } = await db.from('stays_listings').select(columns).eq('organization_id', organizationId).eq(f.column, f.value).eq('owner_email', ownerEmail).maybeSingle();
  return (data as Record<string, any> | null) ?? null; // eslint-disable-line @typescript-eslint/no-explicit-any
}
