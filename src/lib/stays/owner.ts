import type { NextRequest } from 'next/server';
import type { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { listingIdFilter } from './listings';

type Db = ReturnType<typeof getSupabaseAdmin>;

// Strict on purpose: the address is placed in a database filter, so it must not contain commas, quotes, braces or parentheses.
const EMAIL = /^[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)+$/;

/** The match used everywhere an owner acts on a home: the primary owner, or someone the owner has authorized (a co-owner or manager). */
export const ownerFilter = (email: string) => `owner_email.eq.${email},authorized_emails.cs.{${email}}`;

/** Parses a list of extra authorized emails typed by staff. Returns null when any entry is not a plain email. Lowercased, de-duplicated, at most 10. */
export function parseEmailList(input: unknown): string[] | null {
  const raw = Array.isArray(input) ? input : typeof input === 'string' ? input.split(/[\s,;]+/) : [];
  const out = [...new Set(raw.map((e) => String(e).trim().toLowerCase()).filter(Boolean))];
  return out.length <= 10 && out.every((e) => e.length <= 200 && EMAIL.test(e)) ? out : null;
}

export const isPlainEmail = (v: unknown): v is string => typeof v === 'string' && v.length <= 200 && EMAIL.test(v);

/** The signed-in owner's email, passed by NAVEO Stays after it has authenticated them. Missing or malformed means no owner. */
export function ownerEmailFrom(req: NextRequest): string | null {
  const v = req.headers.get('x-owner-email')?.trim().toLowerCase() ?? '';
  return v.length <= 200 && EMAIL.test(v) ? v : null;
}

/** A listing in the key's organization that belongs to this owner (any status). Returns null for anyone else's, so callers answer 404 either way. */
export async function findOwnedListing(db: Db, organizationId: string, id: string, ownerEmail: string, columns = 'id') {
  const f = listingIdFilter(id);
  const { data } = await db.from('stays_listings').select(columns).eq('organization_id', organizationId).eq(f.column, f.value).or(ownerFilter(ownerEmail)).maybeSingle();
  return (data as Record<string, any> | null) ?? null; // eslint-disable-line @typescript-eslint/no-explicit-any
}
