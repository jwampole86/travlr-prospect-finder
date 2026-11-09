import { NextRequest, NextResponse } from 'next/server';
import { requireAdminActor } from '@/lib/auth/apiAuthorization';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { avaEnabled } from '@/lib/ava/defaults';
import { cleanTeamEntry } from '@/lib/ava/teamKnowledge';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'cache-control': 'no-store' } });

/**
 * GET: what AVA's admins need to grow her knowledge: the answers their team wrote, the help topics she could not answer (counts only, reduced to
 * product words), and the topics people rated "not helpful". Admin and owner only, and only for their own organization.
 */
export async function GET(req: NextRequest) {
  if (!avaEnabled()) return json({ error: 'not_found' }, 404);
  const auth = await requireAdminActor(req);
  if (!auth.actor) return json({ error: auth.error }, auth.status);
  const org = auth.actor.organizationId;
  if (!org) return json({ entries: [], unanswered: [], notHelpful: [] });
  const db = getSupabaseAdmin();
  const [entries, unanswered, feedback] = await Promise.all([
    db.from('ava_kb_entries').select('id,title,answer,keywords,status,updated_at').eq('organization_id', org).neq('status', 'retired').order('updated_at', { ascending: false }).limit(200),
    db.from('ava_unanswered_topics').select('topic_key,n,last_seen').eq('organization_id', org).order('n', { ascending: false }).limit(30),
    db.from('ava_usage_signals').select('key,reason').eq('organization_id', org).eq('kind', 'feedback').eq('rating', -1).order('created_at', { ascending: false }).limit(500),
  ]);
  const bad = new Map<string, number>();
  for (const r of feedback.data ?? []) if (r.key) bad.set(r.key, (bad.get(r.key) ?? 0) + 1);
  return json({
    entries: entries.data ?? [],
    unanswered: (unanswered.data ?? []).map((r) => ({ topic: r.topic_key, count: r.n, lastSeen: r.last_seen })),
    notHelpful: [...bad.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15).map(([topic, count]) => ({ topic, count })),
  });
}

/** POST { title, answer, keywords?, status? }: adds an answer AVA will use (published by default) for this organization. */
export async function POST(req: NextRequest) {
  if (!avaEnabled()) return json({ error: 'not_found' }, 404);
  const auth = await requireAdminActor(req);
  if (!auth.actor) return json({ error: auth.error }, auth.status);
  const org = auth.actor.organizationId;
  if (!org) return json({ error: 'Your account is not part of an organization yet.' }, 422);
  const parsed = cleanTeamEntry(await req.json().catch(() => ({})));
  if (!parsed.ok) return json({ error: parsed.error }, 400);
  const { data, error } = await getSupabaseAdmin().from('ava_kb_entries').insert({ ...parsed.value, organization_id: org, created_by: auth.actor.user.id }).select('id,title,answer,keywords,status,updated_at').single();
  if (error) return json({ error: 'Could not save that answer.' }, 500);
  return json({ entry: data }, 201);
}
