import { NextRequest, NextResponse } from 'next/server';
import { requireApiActor } from '@/lib/auth/apiAuthorization';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

const KINDS = new Set(['ad_lib', 'replaced', 'skipped']);
const clip = (v: unknown, n: number) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, n) : null);

/** POST /api/teleprompter/deviations { sessionId?, leadId?, scriptId, items: [{ kind, expectedLine?, agentSaid, homeownerSaid?, coverage? }] } */
export async function POST(req: NextRequest) {
  const auth = await requireApiActor(req);
  if (!auth.actor) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const body = await req.json().catch(() => ({})) as { sessionId?: string; leadId?: string; scriptId?: string; items?: Array<Record<string, unknown>> };
  const scriptId = clip(body.scriptId, 60);
  if (!scriptId || !Array.isArray(body.items)) return NextResponse.json({ error: 'scriptId and items are required' }, { status: 400 });

  const rows = body.items.slice(0, 20).flatMap(item => {
    const agentSaid = clip(item.agentSaid, 600);
    const kind = String(item.kind);
    if (!agentSaid || !KINDS.has(kind)) return [];
    const coverage = Number(item.coverage);
    return [{
      organization_id: auth.actor.organizationId,
      session_id: clip(body.sessionId, 64),
      user_id: auth.actor.user.id,
      lead_id: clip(body.leadId, 100),
      script_id: scriptId,
      kind,
      expected_line: clip(item.expectedLine, 600),
      agent_said: agentSaid,
      homeowner_said: clip(item.homeownerSaid, 600),
      coverage: Number.isFinite(coverage) ? Math.max(0, Math.min(1, coverage)) : null,
    }];
  });
  if (rows.length === 0) return NextResponse.json({ saved: 0 });

  const { error } = await getSupabaseAdmin().from('teleprompter_script_deviations').insert(rows);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ saved: rows.length });
}
