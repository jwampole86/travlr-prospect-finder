import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const body = await req.json();
  const { leadId, backfillAll } = body;

  if (backfillAll) {
    // Backfill all leads without evaluations
    const { data: leads } = await supabase
      .from('leads')
      .select('id, city, state')
      .eq('is_synthetic', false)
      .not('id', 'in',
        `(SELECT lead_id FROM property_regulation_evaluations)`
      )
      .limit(500);

    if (!leads || leads.length === 0) {
      return NextResponse.json({ message: 'All leads already evaluated', count: 0 });
    }

    let evaluated = 0;
    for (const lead of leads) {
      if (!lead.city || !lead.state) continue;

      const { data: cr } = await supabase
        .from('city_regulations')
        .select('id, status, jurisdiction_name, regulation_version, last_verified_at, confidence, review_status')
        .eq('state', lead.state)
        .ilike('city', lead.city.trim())
        .single();

      const evalData = cr
        ? {
            lead_id: lead.id,
            city_regulation_id: cr.id,
            jurisdiction_name: cr.jurisdiction_name,
            city_regulation_status: cr.status,
            evaluated_at: new Date().toISOString(),
            regulation_version: cr.regulation_version,
            source_last_verified_at: cr.last_verified_at,
            confidence: cr.confidence,
            review_required: cr.review_status !== 'CURRENT',
            evaluation_reason: 'CANONICAL_MATCH',
            data_quality_flags: null,
          }
        : {
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

      await supabase
        .from('property_regulation_evaluations')
        .upsert(evalData, { onConflict: 'lead_id' });

      evaluated++;
    }

    return NextResponse.json({ message: 'Backfill complete', count: evaluated });
  }

  if (!leadId) {
    return NextResponse.json({ error: 'leadId required' }, { status: 400 });
  }

  // Single lead evaluation
  const { data: lead } = await supabase
    .from('leads')
    .select('id, city, state')
    .eq('id', leadId)
    .single();

  if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 });

  const { data: cr } = await supabase
    .from('city_regulations')
    .select('id, status, jurisdiction_name, regulation_version, last_verified_at, confidence, review_status')
    .eq('state', lead.state)
    .ilike('city', (lead.city || '').trim())
    .single();

  const evalData = cr
    ? {
        lead_id: lead.id,
        city_regulation_id: cr.id,
        jurisdiction_name: cr.jurisdiction_name,
        city_regulation_status: cr.status,
        evaluated_at: new Date().toISOString(),
        regulation_version: cr.regulation_version,
        source_last_verified_at: cr.last_verified_at,
        confidence: cr.confidence,
        review_required: cr.review_status !== 'CURRENT',
        evaluation_reason: 'CANONICAL_MATCH',
        data_quality_flags: null,
      }
    : {
        lead_id: lead.id,
        city_regulation_id: null,
        jurisdiction_name: lead.city && lead.state ? `${lead.city}, ${lead.state}` : null,
        city_regulation_status: 'UNKNOWN',
        evaluated_at: new Date().toISOString(),
        regulation_version: null,
        source_last_verified_at: null,
        confidence: 'LOW',
        review_required: true,
        evaluation_reason: 'NO_CANONICAL_RECORD',
        data_quality_flags: ['REGULATION_NOT_FOUND'],
      };

  const { data, error } = await supabase
    .from('property_regulation_evaluations')
    .upsert(evalData, { onConflict: 'lead_id' })
    .select('*, city_regulations(*)')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ evaluation: data });
}
