import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { searchParams } = new URL(req.url);
  const state = searchParams.get('state') || 'all';

  let query = supabase
    .from('city_regulations')
    .select('*')
    .order('state', { ascending: true })
    .order('city', { ascending: true });

  if (state && state !== 'all') {
    query = query.eq('state', state);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ regulations: data || [] });
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const body = await req.json();

  const { data, error } = await supabase
    .from('city_regulations')
    .insert({
      jurisdiction_name: body.jurisdictionName,
      city: body.city || null,
      county: body.county || null,
      state: body.state,
      jurisdiction_type: body.jurisdictionType || 'CITY',
      status: body.status || 'UNKNOWN',
      str_allowed: body.strAllowed ?? null,
      permit_required: body.permitRequired ?? null,
      license_required: body.licenseRequired ?? null,
      registration_required: body.registrationRequired ?? null,
      primary_residence_required: body.primaryResidenceRequired ?? null,
      night_cap: body.nightCap ?? null,
      minimum_stay: body.minimumStay ?? null,
      occupancy_limit: body.occupancyLimit ?? null,
      summary: body.summary || null,
      agent_summary: body.agentSummary || null,
      source_name: body.sourceName || null,
      source_url: body.sourceUrl || null,
      source_type: body.sourceType || 'OFFICIAL_MUNICIPAL',
      last_verified_at: body.lastVerifiedAt || null,
      review_status: body.reviewStatus || 'CURRENT',
      confidence: body.confidence || 'MEDIUM',
      regulation_version: 1,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ regulation: data });
}

export async function PUT(req: NextRequest) {
  const supabase = await createClient();
  const body = await req.json();
  const { id, ...updates } = body;

  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const { data: current } = await supabase
    .from('city_regulations')
    .select('regulation_version, status, jurisdiction_name')
    .eq('id', id)
    .single();

  const newVersion = ((current?.regulation_version as number) || 1) + 1;
  const oldStatus = current?.status;

  const dbUpdates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
    regulation_version: newVersion,
  };

  const fieldMap: Record<string, string> = {
    jurisdictionName: 'jurisdiction_name',
    city: 'city',
    county: 'county',
    state: 'state',
    jurisdictionType: 'jurisdiction_type',
    status: 'status',
    strAllowed: 'str_allowed',
    permitRequired: 'permit_required',
    licenseRequired: 'license_required',
    registrationRequired: 'registration_required',
    primaryResidenceRequired: 'primary_residence_required',
    nightCap: 'night_cap',
    minimumStay: 'minimum_stay',
    occupancyLimit: 'occupancy_limit',
    summary: 'summary',
    agentSummary: 'agent_summary',
    sourceName: 'source_name',
    sourceUrl: 'source_url',
    sourceType: 'source_type',
    lastVerifiedAt: 'last_verified_at',
    reviewStatus: 'review_status',
    confidence: 'confidence',
    zoningRestrictions: 'zoning_restrictions',
    taxRequirements: 'tax_requirements',
    additionalRestrictions: 'additional_restrictions',
    localContactRequired: 'local_contact_required',
    hostPresenceRequired: 'host_presence_required',
    inspectionRequired: 'inspection_required',
  };

  for (const [camel, snake] of Object.entries(fieldMap)) {
    if (camel in updates) dbUpdates[snake] = updates[camel];
  }

  const { data, error } = await supabase
    .from('city_regulations')
    .update(dbUpdates)
    .eq('id', id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Propagate to evaluations if status changed
  if (updates.status && updates.status !== oldStatus) {
    await supabase
      .from('property_regulation_evaluations')
      .update({
        city_regulation_status: updates.status,
        regulation_version: newVersion,
        updated_at: new Date().toISOString(),
      })
      .eq('city_regulation_id', id);
  }

  return NextResponse.json({ regulation: data, propagated: updates.status !== oldStatus });
}
