import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { sendInterviewNotification } from '@/lib/email/interviewNotification';

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const result = await sendInterviewNotification({
      id: body.sessionId,
      candidateName: body.candidateName,
      roleTitle: body.roleTitle,
      scheduledAt: body.scheduledAt,
      durationMinutes: Number(body.durationMinutes || 30),
      meetingUrl: body.zoomLink,
      candidateEmail: body.candidateEmail,
      interviewerEmail: body.interviewerEmail || user.email,
      interviewerName: body.interviewerName,
      timeZone: body.timeZone,
      eventType: body.sessionType === 'candidate_follow_up' ? 'candidate_follow_up' : 'initial_interview',
      purpose: body.purpose === 'invite' ? 'invite' : 'reminder',
    });
    return NextResponse.json({ success: true, sessionId: body.sessionId, ...result });
  } catch (error: any) {
    console.error('[interview/send-reminder] error:', error);
    return NextResponse.json({ error: error.message || 'Internal error' }, { status: 500 });
  }
}
