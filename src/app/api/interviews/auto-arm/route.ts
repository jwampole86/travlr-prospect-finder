import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const ids = Array.isArray(body.interviewIds) ? body.interviewIds.filter((id: unknown): id is string => typeof id === 'string') : [];
  if (ids.length === 0) return NextResponse.json({ error: 'interviewIds are required' }, { status: 400 });

  const { data: sessions, error } = await supabase.from('interview_sessions').select('id, status, scheduled_at, scheduled_local_date, scheduled_local_time, scheduled_timezone, candidate_id, auto_start_enabled').in('id', ids);
  if (error) return NextResponse.json({ error: 'Unable to load interviews' }, { status: 500 });

  const results = [];
  for (const session of sessions || []) {
    const valid = session.status === 'scheduled' && Boolean(session.candidate_id && session.scheduled_at && session.scheduled_local_date && session.scheduled_local_time && session.scheduled_timezone);
    if (!valid) {
      results.push({ interviewId: session.id, status: 'FAILED', reason: 'Candidate, schedule, timezone, or candidate ID is missing' });
      continue;
    }
    const { error: updateError } = await supabase.from('interview_sessions').update({ auto_start_enabled: true, auto_start_enabled_at: new Date().toISOString(), auto_start_enabled_by: user.id, execution_status: 'QUEUED', execution_error: null, updated_at: new Date().toISOString() }).eq('id', session.id).eq('auto_start_enabled', false);
    results.push({ interviewId: session.id, status: updateError ? 'FAILED' : 'ARMED', reason: updateError?.message });
  }
  return NextResponse.json({ ok: true, requested: ids.length, armed: results.filter(result => result.status === 'ARMED').length, failed: results.filter(result => result.status === 'FAILED').length, results });
}