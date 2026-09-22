import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { requireAdminActor } from '@/lib/auth/apiAuthorization';

// Supplies everything the Live Call Teleprompter needs to help an agent conduct
// a human follow-up call with a candidate: contact info, the AI interview summary,
// and the overall scorecard assessment from their most recent interview.
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const authorization = await requireAdminActor(request);
  if (!authorization.actor) return NextResponse.json({ error: authorization.error }, { status: authorization.status });

  const db = getSupabaseAdmin();

  const { data: candidate, error: candidateError } = await db
    .from('candidates')
    .select('id, full_name, phone, email, candidate_status')
    .eq('id', id)
    .single();
  if (candidateError || !candidate) {
    return NextResponse.json({ error: 'Candidate not found' }, { status: 404 });
  }

  const { data: latestInterview } = await db
    .from('interview_sessions')
    .select('id, role_title, summary, ended_at')
    .eq('candidate_id', id)
    .not('summary', 'is', null)
    .order('ended_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: latestScorecard } = await db
    .from('candidate_scorecards')
    .select('overall_fit, hire_recommendation, interviewer_notes, ai_summary')
    .eq('candidate_id', id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return NextResponse.json({
    candidate: {
      id: candidate.id,
      fullName: candidate.full_name,
      phone: candidate.phone,
      email: candidate.email,
      status: candidate.candidate_status,
    },
    roleTitle: latestInterview?.role_title || 'TRAVLR Outreach & Business Development Agent',
    interviewSummary: latestInterview?.summary || null,
    overallFit: latestScorecard?.overall_fit ?? null,
    hireRecommendation: latestScorecard?.hire_recommendation ?? null,
    interviewerNotes: latestScorecard?.interviewer_notes ?? null,
  });
}
