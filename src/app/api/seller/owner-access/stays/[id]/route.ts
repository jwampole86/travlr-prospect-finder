import { NextRequest, NextResponse } from 'next/server';
import { fail, sellerContext } from '@/lib/seller/api';
import { isPlainEmail, parseEmailList } from '@/lib/stays/owner';

export const dynamic = 'force-dynamic';

/** PATCH: set a home's owner email and the extra emails (co-owners, managers) who may manage it. Empty clears. Admin only; every email is validated and lowercased. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await sellerContext(req);
  if ('error' in ctx) return ctx.error;
  const body = (await req.json().catch(() => ({}))) as { owner_email?: unknown; authorized_emails?: unknown };
  const patch: Record<string, unknown> = {};
  if ('owner_email' in body) {
    const v = typeof body.owner_email === 'string' ? body.owner_email.trim().toLowerCase() : '';
    if (v && !isPlainEmail(v)) return fail('Enter a plain email address for the owner.');
    patch.owner_email = v || null;
  }
  if ('authorized_emails' in body) {
    const list = parseEmailList(body.authorized_emails);
    if (!list) return fail('Authorized emails must be plain email addresses, up to 10.');
    patch.authorized_emails = list;
  }
  if (!Object.keys(patch).length) return fail('Nothing to change.');
  let q = ctx.db.from('stays_listings').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', (await params).id);
  if (ctx.orgId) q = q.eq('organization_id', ctx.orgId);
  const { data, error } = await q.select('id,owner_email,authorized_emails').maybeSingle();
  if (error) return fail('Could not save.', 500);
  if (!data) return fail('Not found', 404);
  return NextResponse.json({ item: data });
}
