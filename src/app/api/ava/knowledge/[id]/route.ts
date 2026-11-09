import { NextRequest, NextResponse } from 'next/server';
import { requireAdminActor } from '@/lib/auth/apiAuthorization';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { avaEnabled } from '@/lib/ava/defaults';
import { cleanTeamEntry } from '@/lib/ava/teamKnowledge';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'cache-control': 'no-store' } });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** PATCH { title?, answer?, keywords?, status? }: edits, unpublishes (draft) or retires one of this organization's answers. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!avaEnabled()) return json({ error: 'not_found' }, 404);
  const auth = await requireAdminActor(req);
  if (!auth.actor) return json({ error: auth.error }, auth.status);
  const org = auth.actor.organizationId;
  const { id } = await params;
  if (!org || !UUID.test(id)) return json({ error: 'Not found.' }, 404);
  const parsed = cleanTeamEntry(await req.json().catch(() => ({})), { partial: true });
  if (!parsed.ok) return json({ error: parsed.error }, 400);
  const { data, error } = await getSupabaseAdmin().from('ava_kb_entries')
    .update({ ...parsed.value, updated_at: new Date().toISOString() }).eq('id', id).eq('organization_id', org)
    .select('id,title,answer,keywords,status,updated_at').maybeSingle();
  if (error) return json({ error: 'Could not save that change.' }, 500);
  if (!data) return json({ error: 'Not found.' }, 404);
  return json({ entry: data });
}
