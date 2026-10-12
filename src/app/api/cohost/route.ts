import { NextRequest, NextResponse } from 'next/server';
import { requireAdminActor } from '@/lib/auth/apiAuthorization';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

export const maxDuration = 60;

const STAGES = ['identified', 'reviewed', 'contacted', 'replied', 'audit_sent', 'meeting', 'agreed', 'onboarded', 'declined', 'not_a_fit'] as const;
const SERVICE_MODELS = ['undecided', 'co_host_only', 'co_host_and_manager'] as const;

/** GET /api/cohost  (admin). Co-host pipeline: existing short-term-rental owners we found on Airbnb, Vrbo and similar listings, plus CRM leads moved to the co-host program. */
export async function GET(req: NextRequest) {
  const auth = await requireAdminActor(req);
  if (!auth.actor) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const db = getSupabaseAdmin();

  const listings: Array<Record<string, any>> = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from('str_listings').select('property_id,market,title,airbnb_url,vrbo_url,booking_url,channels,bedrooms,bathrooms,adr,occupancy_pct,revenue_ltm,revenue_potential_ltm,rating,reviews,host_listing_count,is_luxury,under_score,under_reasons,segment,photo_score,photo_notes,address_match_confidence,match_status,matched_address,matched_owner,pipeline_stage,service_model,reviewer_notes,stage_updated_at').in('segment', ['candidate', 'new_or_dormant']).range(from, from + 999);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    listings.push(...(data ?? [])); if ((data ?? []).length < 1000) break;
  }
  const clean = listings.map(l => {
    const o = l.matched_owner ?? {};
    const found = (o.skipTrace?.results ?? []).filter((r: any) => r.found).map((r: any) => r.found);
    return { ...l, matched_owner: l.matched_owner ? { names: o.names ?? [], type: o.type ?? null, mailing: o.mailing ?? null, permitHolder: o.permitHolder ?? null, contactFound: found.length > 0, phones: found.flatMap((p: any) => p.phones.map((x: any) => x.e164)).slice(0, 3), emails: found.flatMap((p: any) => p.emails).slice(0, 3) } : null };
  });

  const { data: crm } = await db.from('leads').select('id,address,city,state,owner_name,contact_phone,program,cohost_service,existing_platforms,program_reason,program_set_at,stage').eq('program', 'co_host').order('program_set_at', { ascending: false }).limit(500);
  return NextResponse.json({ listings: clean, crm: crm ?? [], stages: STAGES, serviceModels: SERVICE_MODELS });
}

/** PATCH /api/cohost { propertyId, stage?, serviceModel?, notes? }  (admin). Moves a listing through the co-host pipeline. */
export async function PATCH(req: NextRequest) {
  const auth = await requireAdminActor(req);
  if (!auth.actor) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const body = await req.json().catch(() => ({})) as { propertyId?: string; stage?: string; serviceModel?: string; notes?: string };
  if (!body.propertyId || typeof body.propertyId !== 'string') return NextResponse.json({ error: 'propertyId is required' }, { status: 400 });
  const patch: Record<string, unknown> = {};
  if (body.stage !== undefined) { if (!(STAGES as readonly string[]).includes(body.stage)) return NextResponse.json({ error: 'Invalid stage' }, { status: 400 }); patch.pipeline_stage = body.stage; patch.stage_updated_at = new Date().toISOString(); }
  if (body.serviceModel !== undefined) { if (!(SERVICE_MODELS as readonly string[]).includes(body.serviceModel)) return NextResponse.json({ error: 'Invalid service model' }, { status: 400 }); patch.service_model = body.serviceModel; }
  if (body.notes !== undefined) patch.reviewer_notes = String(body.notes).slice(0, 2000);
  if (!Object.keys(patch).length) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
  const { error } = await getSupabaseAdmin().from('str_listings').update(patch).eq('property_id', body.propertyId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
