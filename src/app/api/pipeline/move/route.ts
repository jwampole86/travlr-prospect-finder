import { NextRequest, NextResponse } from 'next/server';
import { requireLeadAccess } from '@/lib/auth/apiAuthorization';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { moveLead } from '@/lib/services/pipelineBoard';

/** POST /api/pipeline/move {id, to}  ->  sets a manual stage (human, contract, live, closed) or returns the lead to automatic tracking (auto). */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({})) as { id?: string; to?: string };
  if (!body.id || !body.to) return NextResponse.json({ error: 'Missing lead or column.' }, { status: 400 });
  const auth = await requireLeadAccess(req, body.id);
  if (!auth.actor) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const r = await moveLead(getSupabaseAdmin(), body.id, body.to);
  return r.ok ? NextResponse.json(r) : NextResponse.json({ error: r.error }, { status: r.status });
}
