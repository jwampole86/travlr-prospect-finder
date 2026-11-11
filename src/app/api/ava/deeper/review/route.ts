import { NextRequest, NextResponse } from 'next/server';
import { requireAdminActor } from '@/lib/auth/apiAuthorization';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { avaEnabled } from '@/lib/ava/defaults';
import { cleanTeamEntry } from '@/lib/ava/teamKnowledge';
import { keywordsFor } from '@/lib/ava/deeper';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'cache-control': 'no-store' } });

/** GET: recent deeper answers waiting for a person, with who rated them and which touch legal, fee or compliance topics. Admin and owner only, own organization only. */
export async function GET(req: NextRequest) {
  if (!avaEnabled()) return json({ error: 'not_found' }, 404);
  const auth = await requireAdminActor(req);
  if (!auth.actor) return json({ error: auth.error }, auth.status);
  const org = auth.actor.organizationId;
  if (!org) return json({ items: [] });
  const { data, error } = await getSupabaseAdmin().from('ava_deeper_answers')
    .select('id,question,answer,model,topic_tags,needs_review,feedback,created_at,input_tokens,output_tokens')
    .eq('organization_id', org).eq('status', 'answered').eq('review_status', 'new').order('created_at', { ascending: false }).limit(50);
  if (error) return json({ error: 'Could not load these.' }, 500);
  return json({ items: data ?? [] });
}

/**
 * POST { id, action: 'draft' | 'dismiss' }: a person decides. 'draft' saves the exchange as a DRAFT team answer, which AVA does not use until it is
 * published on this page; the person is expected to edit it first. 'dismiss' keeps the log but takes it off the list.
 */
export async function POST(req: NextRequest) {
  if (!avaEnabled()) return json({ error: 'not_found' }, 404);
  const auth = await requireAdminActor(req);
  if (!auth.actor) return json({ error: auth.error }, auth.status);
  const org = auth.actor.organizationId;
  if (!org) return json({ error: 'Your account is not part of an organization yet.' }, 422);
  const body = (await req.json().catch(() => ({}))) as { id?: unknown; action?: unknown };
  if (typeof body.id !== 'string' || !/^[0-9a-f-]{36}$/i.test(body.id) || (body.action !== 'draft' && body.action !== 'dismiss')) return json({ error: 'Bad request.' }, 400);
  const db = getSupabaseAdmin();
  const { data: row } = await db.from('ava_deeper_answers').select('id,question,answer,topic_tags,review_status').eq('id', body.id).eq('organization_id', org).eq('status', 'answered').maybeSingle();
  if (!row) return json({ error: 'Not found.' }, 404);
  if (row.review_status !== 'new') return json({ error: 'Already handled.' }, 409);

  if (body.action === 'dismiss') {
    await db.from('ava_deeper_answers').update({ review_status: 'dismissed' }).eq('id', row.id);
    return json({ ok: true });
  }
  const parsed = cleanTeamEntry({ title: row.question, answer: row.answer, keywords: keywordsFor(String(row.question), (row.topic_tags as string[]) ?? []), status: 'draft' });
  if (!parsed.ok) return json({ error: parsed.error }, 400);
  const { data: entry, error } = await db.from('ava_kb_entries').insert({ ...parsed.value, organization_id: org, created_by: auth.actor.user.id }).select('id').single();
  if (error || !entry) return json({ error: 'Could not save the draft.' }, 500);
  await db.from('ava_deeper_answers').update({ review_status: 'drafted', kb_entry_id: entry.id }).eq('id', row.id);
  return json({ ok: true, entryId: entry.id }, 201);
}
