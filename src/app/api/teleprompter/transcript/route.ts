import { NextRequest, NextResponse } from 'next/server';
import { requireApiActor } from '@/lib/auth/apiAuthorization';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

/** GET /api/teleprompter/transcript?sessionId=&after=  The call's live transcript events newer than `after`, for the agent who owns the session. */
export async function GET(req: NextRequest) {
  const auth = await requireApiActor(req);
  if (!auth.actor) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const sessionId = req.nextUrl.searchParams.get('sessionId');
  const after = Number(req.nextUrl.searchParams.get('after')) || 0;
  if (!sessionId) return NextResponse.json({ error: 'sessionId is required' }, { status: 400 });

  const db = getSupabaseAdmin();
  const { data: session } = await db.from('call_sessions').select('id').eq('id', sessionId).eq('user_id', auth.actor.user.id).maybeSingle();
  if (!session) return NextResponse.json({ error: 'Call session not found' }, { status: 404 });

  const { data, error } = await db.from('call_transcript_events').select('id, event, speaker, text, is_final, sequence, created_at')
    .eq('session_id', sessionId).gt('id', after).order('id', { ascending: true }).limit(100);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ events: data ?? [] });
}
