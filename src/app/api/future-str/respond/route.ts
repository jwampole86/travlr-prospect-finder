import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { allowRequest, clientIp } from '@/lib/publicRateLimit';
import { publicPageEnabled, submitResponse, type SubmitInput } from '@/lib/services/futureStr';

/** POST /api/future-str/respond (public while FUTURE_STR_ENABLED is on). Saves a survey answer; never sends email. */
export async function POST(req: NextRequest) {
  if (!publicPageEnabled()) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const ip = clientIp(req.headers);
  if (!allowRequest(`future-str:${ip}`, 8, 10 * 60_000)) return NextResponse.json({ error: 'Too many submissions. Please try again later.' }, { status: 429 });
  if (Number(req.headers.get('content-length') ?? 0) > 20_000) return NextResponse.json({ error: 'That is too large.' }, { status: 413 });
  const body = await req.json().catch(() => null) as SubmitInput | null;
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  const r = await submitResponse(getSupabaseAdmin(), body, ip === 'unknown' ? null : ip);
  return r.ok ? NextResponse.json({ ok: true, subscribed: r.subscribed }) : NextResponse.json({ error: r.error }, { status: 400 });
}
