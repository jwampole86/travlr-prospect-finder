import { NextRequest, NextResponse } from 'next/server';
import { requireLeadAccess } from '@/lib/auth/apiAuthorization';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { leadDetail } from '@/lib/services/pipelineBoard';

/** GET /api/pipeline/lead?id=...  ->  one lead with its timeline for the detail drawer. */
export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id') ?? '';
  if (!id) return NextResponse.json({ error: 'Missing lead id.' }, { status: 400 });
  const auth = await requireLeadAccess(req, id);
  if (!auth.actor) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const detail = await leadDetail(getSupabaseAdmin(), id);
  return detail ? NextResponse.json(detail, { headers: { 'Cache-Control': 'no-store' } }) : NextResponse.json({ error: 'Lead not found.' }, { status: 404 });
}
