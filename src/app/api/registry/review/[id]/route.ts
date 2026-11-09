import { NextRequest, NextResponse } from 'next/server';
import { requireAdminActor } from '@/lib/auth/apiAuthorization';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { resolveReview } from '@/lib/registry/registryService';

/** POST { decision: 'merge' | 'keep_separate' }: a person settles one possible duplicate. Changes registry rows only, never a lead. Admin only. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminActor(req);
  if (!auth.actor) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: 'Bad id' }, { status: 400 });
  const body = await req.json().catch(() => ({})) as { decision?: string };
  if (body.decision !== 'merge' && body.decision !== 'keep_separate') return NextResponse.json({ error: 'Choose merge or keep_separate.' }, { status: 400 });
  const out = await resolveReview(getSupabaseAdmin(), { caseId: id, decision: body.decision, userId: auth.actor.user.id, organizationId: auth.actor.organizationId });
  return out.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: out.error }, { status: 422 });
}
