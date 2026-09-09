import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status');
    const search = searchParams.get('search');
    const sortBy = searchParams.get('sortBy') || 'candidate_rank';
    const sortDir = searchParams.get('sortDir') || 'asc';

    let query = supabase
      .from('candidates')
      .select(`
        id, full_name, first_name, last_name,
        candidate_rank, interview_priority, candidate_status, pipeline_status,
        current_title, current_company, city, state,
        resume_file_name, resume_parsed_at,
        first_interview_at, latest_interview_at, next_interview_at, next_interview_type,
        interview_count, latest_scorecard_average, average_score_across_interviews,
        top_strength, main_area_to_validate, consistency_report_status,
        next_action, seed_fit_notes, seed_concerns,
        vacation_rental_experience, outbound_calling_experience,
        created_at, updated_at
      `);

    if (status && status !== 'ALL') {
      query = query.eq('pipeline_status', status);
    }
    if (search) {
      query = query.ilike('full_name', `%${search}%`);
    }

    const ascending = sortDir === 'asc';
    query = query.order(sortBy as string, { ascending, nullsFirst: false });

    const { data: candidates, error } = await query;
    if (error) throw error;

    // Pipeline counts
    const { data: allCandidates } = await supabase
      .from('candidates')
      .select('pipeline_status');

    const counts = {
      total: allCandidates?.length || 0,
      READY_TO_INTERVIEW: 0,
      INTERVIEWED: 0,
      FOLLOW_UP: 0,
      HOLD: 0,
      MOVE_FORWARD: 0,
      NOT_MOVING_FORWARD: 0,
      HIRED: 0,
    };

    for (const c of allCandidates || []) {
      const s = c.pipeline_status as keyof typeof counts;
      if (s in counts) counts[s]++;
    }

    return NextResponse.json({ candidates: candidates || [], counts });
  } catch (err) {
    console.error('[pipeline GET]', err);
    return NextResponse.json({ error: 'Failed to fetch pipeline' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { candidateId, newStatus, reason, nextAction, nextInterviewAt, nextInterviewType } = await req.json();

    if (!candidateId || !newStatus) {
      return NextResponse.json({ error: 'candidateId and newStatus required' }, { status: 400 });
    }

    // Get current status for audit
    const { data: current } = await supabase
      .from('candidates')
      .select('pipeline_status, full_name')
      .eq('id', candidateId)
      .single();

    const updateData: Record<string, unknown> = {
      pipeline_status: newStatus,
      updated_at: new Date().toISOString(),
    };

    if (newStatus === 'HIRED') {
      updateData.candidate_status = 'HIRED';
    }

    if (nextAction) updateData.next_action = nextAction;
    if (nextInterviewAt) updateData.next_interview_at = nextInterviewAt;
    if (nextInterviewType) updateData.next_interview_type = nextInterviewType;

    const { data, error } = await supabase
      .from('candidates')
      .update(updateData)
      .eq('id', candidateId)
      .select()
      .single();

    if (error) throw error;

    // Audit trail
    await supabase.from('candidate_pipeline_audit').insert({
      candidate_id: candidateId,
      previous_status: current?.pipeline_status || null,
      new_status: newStatus,
      changed_at: new Date().toISOString(),
      reason: reason || null,
    });

    await supabase.from('candidate_audit_events').insert({
      candidate_id: candidateId,
      event_type: 'CANDIDATE_STATUS_CHANGED',
      event_data: {
        previous_status: current?.pipeline_status,
        new_status: newStatus,
        reason,
      },
    });

    const offerDraftUrl = newStatus === 'HIRED'
      ? `/offer-letters?candidateId=${encodeURIComponent(candidateId)}&source=hired`
      : null;

    return NextResponse.json({ candidate: data, offerDraftUrl });
  } catch (err) {
    console.error('[pipeline PATCH]', err);
    return NextResponse.json({ error: 'Failed to update pipeline status' }, { status: 500 });
  }
}
