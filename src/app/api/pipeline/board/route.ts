import { NextRequest, NextResponse } from 'next/server';
import { requireApiActor } from '@/lib/auth/apiAuthorization';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { BOARD_STAGES, boardColumns, boardMore, type BoardFilters, type StageKey } from '@/lib/services/pipelineBoard';

export const maxDuration = 60;

/** GET /api/pipeline/board  ->  every column with its count and top cards. Add &stage=KEY&offset=N to load more of one column. */
export async function GET(req: NextRequest) {
  const auth = await requireApiActor(req);
  if (!auth.actor) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const q = req.nextUrl.searchParams;
  const sort = q.get('sort');
  const filters: BoardFilters = {
    q: q.get('q') ?? undefined, state: /^[A-Za-z]{2}$/.test(q.get('state') ?? '') ? q.get('state')! : undefined, program: ['str_conversion', 'co_host'].includes(q.get('program') ?? '') ? q.get('program')! : undefined,
    minScore: Math.min(100, Math.max(0, Number(q.get('minScore')) || 0)), sort: sort === 'activity' || sort === 'net' ? sort : 'score',
    luxury: q.get('luxury') === '1', hasPhone: q.get('hasPhone') === '1', mine: auth.actor.isAdmin ? null : auth.actor.user.id,
  };
  const db = getSupabaseAdmin();
  try {
    const stage = q.get('stage') as StageKey | null;
    if (stage) {
      if (!BOARD_STAGES.some(s => s.key === stage)) return NextResponse.json({ error: 'Unknown column.' }, { status: 400 });
      const cards = await boardMore(db, stage, filters, Math.max(0, Number(q.get('offset')) || 0), 25);
      return NextResponse.json({ stage, cards });
    }
    const columns = await boardColumns(db, filters, 25);
    return NextResponse.json({ columns, admin: auth.actor.isAdmin, generatedAt: new Date().toISOString() }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    console.error('pipeline board failed', e);
    return NextResponse.json({ error: 'The pipeline could not be loaded.' }, { status: 500 });
  }
}
