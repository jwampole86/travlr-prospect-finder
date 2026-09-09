import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status');
    const search = searchParams.get('search');

    let query = supabase
      .from('candidates')
      .select('*')
      .order('candidate_rank', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: true });

    if (status && status !== 'ALL') {
      query = query.eq('candidate_status', status);
    }
    if (search) {
      query = query.ilike('full_name', `%${search}%`);
    }

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json({ candidates: data || [] });
  } catch (err) {
    console.error('[candidates GET]', err);
    return NextResponse.json({ error: 'Failed to fetch candidates' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const body = await req.json();

    const { data, error } = await supabase
      .from('candidates')
      .insert(body)
      .select()
      .single();

    if (error) throw error;

    // Audit event
    await supabase.from('candidate_audit_events').insert({
      candidate_id: data.id,
      event_type: 'CANDIDATE_CREATED',
      event_data: { full_name: data.full_name },
    });

    return NextResponse.json({ candidate: data });
  } catch (err) {
    console.error('[candidates POST]', err);
    return NextResponse.json({ error: 'Failed to create candidate' }, { status: 500 });
  }
}
