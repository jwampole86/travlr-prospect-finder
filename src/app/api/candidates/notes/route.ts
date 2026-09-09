import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { searchParams } = new URL(req.url);
    const candidateId = searchParams.get('candidateId');

    if (!candidateId) return NextResponse.json({ error: 'candidateId required' }, { status: 400 });

    const { data, error } = await supabase
      .from('candidate_interview_notes')
      .select('*')
      .eq('candidate_id', candidateId)
      .order('created_at', { ascending: true });

    if (error) throw error;
    return NextResponse.json({ notes: data || [] });
  } catch (err) {
    console.error('[notes GET]', err);
    return NextResponse.json({ error: 'Failed to fetch notes' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { candidateId, questionId, questionText, noteText } = await req.json();

    if (!candidateId || !noteText) {
      return NextResponse.json({ error: 'candidateId and noteText required' }, { status: 400 });
    }

    // Upsert by candidateId + questionId
    if (questionId) {
      const { data: existing } = await supabase
        .from('candidate_interview_notes')
        .select('id')
        .eq('candidate_id', candidateId)
        .eq('question_id', questionId)
        .single();

      if (existing) {
        const { data, error } = await supabase
          .from('candidate_interview_notes')
          .update({ note_text: noteText, updated_at: new Date().toISOString() })
          .eq('id', existing.id)
          .select()
          .single();
        if (error) throw error;
        return NextResponse.json({ note: data });
      }
    }

    const { data, error } = await supabase
      .from('candidate_interview_notes')
      .insert({ candidate_id: candidateId, question_id: questionId, question_text: questionText, note_text: noteText })
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ note: data });
  } catch (err) {
    console.error('[notes POST]', err);
    return NextResponse.json({ error: 'Failed to save note' }, { status: 500 });
  }
}
