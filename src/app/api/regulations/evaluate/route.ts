import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

async function buildEvaluation(
  supabase: Awaited<ReturnType<typeof createClient>>,
  lead: { id: string; city: string | null; state: string | null },
) {
  if (!lead.city || !lead.state) {
    return {
      lead_id: lead.id,
      city_regulation_id: null,
      jurisdiction_name: lead.state ? `${lead.city || 'Unknown city'}, ${lead.state}` : lead.city,
      city_regulation_status: 'UNKNOWN',
      evaluated_at: new Date().toISOString(),
      regulation_version: null,
      source_last_verified_at: null,
      confidence: 'LOW',
      review_required: true,
      evaluation_reason: 'INCOMPLETE_LOCATION',
      data_quality_flags: ['JURISDICTION_UNKNOWN'],
    };
  }

  const { data: regulation } = await supabase
    .from('city_regulations')
    .select('id, status, jurisdiction_name, regulation_version, last_verified_at, confidence, review_status')
    .eq('state', lead.state)
    .ilike('city', lead.city.trim())
    .maybeSingle();

  if (!regulation) {
    return {
      lead_id: lead.id,
      city_regulation_id: null,
      jurisdiction_name: `${lead.city}, ${lead.state}`,
      city_regulation_status: 'UNKNOWN',
      evaluated_at: new Date().toISOString(),
      regulation_version: null,
      source_last_verified_at: null,
      confidence: 'LOW',
      review_required: true,
      evaluation_reason: 'NO_CANONICAL_RECORD',
      data_quality_flags: ['REGULATION_NOT_FOUND'],
    };
  }

  return {
    lead_id: lead.id,
    city_regulation_id: regulation.id,
    jurisdiction_name: regulation.jurisdiction_name,
    city_regulation_status: regulation.status,
    evaluated_at: new Date().toISOString(),
    regulation_version: regulation.regulation_version,
    source_last_verified_at: regulation.last_verified_at,
    confidence: regulation.confidence,
    review_required: regulation.review_status !== 'CURRENT',
    evaluation_reason: 'CANONICAL_MATCH',
    data_quality_flags: null,
  };
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const body = await req.json();
  const { leadId, backfillAll } = body;

  if (backfillAll) {
    const { data: leads, error: leadsError } = await supabase
      .from('leads')
      .select('id, city, state, property_regulation_evaluations!left(lead_id)')
      .eq('is_synthetic', false)
      .is('property_regulation_evaluations.lead_id', null)
      .limit(500);

    if (leadsError) {
      return NextResponse.json({ error: leadsError.message }, { status: 500 });
    }

    const pendingLeads = (leads ?? []).map((lead) => ({ id: lead.id as string, city: lead.city as string | null, state: lead.state as string | null }));
    if (pendingLeads.length === 0) {
      return NextResponse.json({ message: 'All leads already evaluated', count: 0 });
    }

    const rows = await Promise.all(pendingLeads.map((lead) => buildEvaluation(supabase, lead)));
    const { error: upsertError } = await supabase
      .from('property_regulation_evaluations')
      .upsert(rows, { onConflict: 'lead_id' });

    if (upsertError) {
      return NextResponse.json({ error: upsertError.message }, { status: 500 });
    }

    return NextResponse.json({ message: 'Backfill complete', count: rows.length });
  }

  if (!leadId) {
    return NextResponse.json({ error: 'leadId required' }, { status: 400 });
  }

  const { data: lead, error: leadError } = await supabase
    .from('leads')
    .select('id, city, state')
    .eq('id', leadId)
    .single();

  if (leadError || !lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 });

  const evalData = await buildEvaluation(supabase, lead as { id: string; city: string | null; state: string | null });

  const { data, error } = await supabase
    .from('property_regulation_evaluations')
    .upsert(evalData, { onConflict: 'lead_id' })
    .select('*, city_regulations(*)')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ evaluation: data });
}
