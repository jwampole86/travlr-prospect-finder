import { NextRequest, NextResponse } from 'next/server';
import { requireAdminActor } from '@/lib/auth/apiAuthorization';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { verifyOwner } from '@/lib/services/ownerVerification';
import { assessData } from '@/lib/services/cohostNumbers';

export const maxDuration = 60;

const STAGES = ['identified', 'reviewed', 'contacted', 'replied', 'audit_sent', 'meeting', 'agreed', 'onboarded', 'declined', 'not_a_fit'] as const;
const SERVICE_MODELS = ['undecided', 'co_host_only', 'co_host_and_manager'] as const;

/** GET /api/cohost  (admin). Co-host pipeline: existing short-term-rental owners we found on Airbnb, Vrbo and similar listings, plus CRM leads moved to the co-host program. */
export async function GET(req: NextRequest) {
  const auth = await requireAdminActor(req);
  if (!auth.actor) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const db = getSupabaseAdmin();

  // Nationwide there are thousands of candidates, far more than fits in one response. Every matched listing and every listing someone has
  // moved through the pipeline is always included; unmatched ones are limited to the strongest by each ranking the page can sort by.
  const COLS = 'property_id,market,title,airbnb_url,vrbo_url,booking_url,channels,bedrooms,bathrooms,adr,occupancy_pct,days_available_ltm,revenue_ltm,revenue_potential_ltm,rating,reviews,host_listing_count,is_luxury,is_elite,first_seen_at,niches,primary_niche,under_score,under_reasons,segment,photo_score,photo_notes,address_match_confidence,match_status,match_candidates,matched_address,matched_owner,pipeline_stage,service_model,reviewer_notes,stage_updated_at';
  const listings: Array<Record<string, any>> = []; const seenIds = new Set<string>();
  const add = (rows: Array<Record<string, any>> | null) => { for (const r of rows ?? []) if (!seenIds.has(r.property_id)) { seenIds.add(r.property_id); listings.push(r); } };
  const SEG = ['candidate', 'new_or_dormant'];
  // With niches selected, the unmatched sets below hold the strongest listings in those niches instead of the strongest overall.
  const nicheIds = (new URL(req.url).searchParams.get('niche') ?? '').split(',').map(Number).filter(n => Number.isInteger(n) && n >= 1 && n <= 120).slice(0, 120);
  const inNiches = <T extends { overlaps: (c: string, v: number[]) => T }>(q: T) => (nicheIds.length ? q.overlaps('niches', nicheIds) : q);
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from('str_listings').select(COLS).in('segment', SEG).or('match_status.in.(unique,ambiguous),pipeline_stage.neq.identified').order('property_id').range(from, from + 999);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    add(data); if ((data ?? []).length < 1000) break;
  }
  const sets = await Promise.all([
    inNiches(db.from('str_listings').select(COLS).in('segment', SEG)).order('under_score', { ascending: false, nullsFirst: false }).limit(400),
    inNiches(db.from('str_listings').select(COLS).in('segment', SEG).eq('is_luxury', true)).order('under_score', { ascending: false, nullsFirst: false }).limit(300),
    inNiches(db.from('str_listings').select(COLS).in('segment', SEG).eq('is_elite', true)).order('under_score', { ascending: false, nullsFirst: false }).limit(300),
    inNiches(db.from('str_listings').select(COLS).in('segment', SEG)).order('revenue_potential_ltm', { ascending: false, nullsFirst: false }).limit(400),
    inNiches(db.from('str_listings').select(COLS).in('segment', SEG)).order('first_seen_at', { ascending: false }).limit(200),
  ]);
  const failed = sets.find(s => s.error); if (failed?.error) return NextResponse.json({ error: failed.error.message }, { status: 500 });
  sets.forEach(s => add(s.data));
  const countOf = async (f: (q: any) => any) => (await f(db.from('str_listings').select('property_id', { count: 'exact', head: true }).in('segment', SEG))).count ?? 0;
  const [totalAll, totalLux, totalElite] = await Promise.all([countOf(q => q), countOf(q => q.eq('is_luxury', true)), countOf(q => q.eq('is_elite', true))]);
  const { data: sharedRows } = await db.from('str_listings').select('matched_address').eq('match_status', 'unique').not('matched_address', 'is', null).limit(5000);
  const shared = new Map<string, number>(); for (const r of sharedRows ?? []) shared.set(r.matched_address, (shared.get(r.matched_address) ?? 0) + 1);
  const { data: lastRun } = await db.from('str_refresh_runs').select('started_at,finished_at,status,trigger,api_calls,new_listings,new_matches,quota_remaining,note,markets').order('started_at', { ascending: false }).limit(1);
  const { count: marketCount } = await db.from('str_market_refresh').select('market', { count: 'exact', head: true }).eq('enabled', true);
  const { data: oldest } = await db.from('str_market_refresh').select('last_refreshed_at').eq('enabled', true).order('last_refreshed_at', { ascending: true, nullsFirst: true }).limit(1);
  const { data: firstRun } = await db.from('str_refresh_runs').select('started_at').order('started_at', { ascending: true }).limit(1);
  const { data: linkRows } = await db.from('cohost_offer_links').select('code,property_id,view_count,last_viewed_at,requested_at,opted_out_at').limit(5000);
  const { data: reqRows } = await db.from('cohost_offer_events').select('code,data,created_at').eq('event', 'request').order('created_at', { ascending: false }).limit(500);
  const latestRequest = new Map<string, Record<string, any>>(); for (const r of reqRows ?? []) if (!latestRequest.has(r.code)) latestRequest.set(r.code, { ...(r.data as object), at: r.created_at });
  const offers = new Map((linkRows ?? []).map(l => [l.property_id as string, { code: l.code as string, views: l.view_count as number, lastViewedAt: l.last_viewed_at as string | null, requestedAt: l.requested_at as string | null, optedOutAt: l.opted_out_at as string | null, request: latestRequest.get(l.code as string) ?? null }]));
  const { data: msgRows } = await db.from('cohost_messages').select('property_id,direction,intent,created_at').order('created_at', { ascending: false }).limit(3000);
  const texts = new Map<string, { sent: number; replied: boolean; lastIntent: string | null; lastAt: string }>();
  for (const m of msgRows ?? []) { const t = texts.get(m.property_id) ?? { sent: 0, replied: false, lastIntent: null, lastAt: m.created_at }; if (m.direction === 'outbound') t.sent++; else { if (!t.replied) t.lastIntent = m.intent; t.replied = true; } texts.set(m.property_id, t); }
  const clean = listings.map(l => {
    const o = l.matched_owner ?? {};
    const found = (o.skipTrace?.results ?? []).filter((r: any) => r.found).map((r: any) => r.found);
    const cands = (l.match_candidates as any[] | null) ?? [];
    const verification = verifyOwner({ ...(l as any), candidate: cands[0] ?? null, candidateCount: cands.length, sharedAddressCount: l.matched_address ? shared.get(l.matched_address) ?? 1 : 1 });
    const { match_candidates: _drop, ...rest } = l;
    return { ...rest, verification, dataQuality: assessData(l), offer: offers.get(l.property_id) ?? null, texts: texts.get(l.property_id) ?? null, matched_owner: l.matched_owner ? { names: o.names ?? [], type: o.type ?? null, mailing: o.mailing ?? null, permitHolder: o.permitHolder ?? null, contactFound: found.length > 0, skipTraced: !!o.skipTrace, entity: o.entity ?? null, phones: found.flatMap((p: any) => p.phones.map((x: any) => x.e164)).slice(0, 3), emails: found.flatMap((p: any) => p.emails).slice(0, 3), published: o.contact ? { email: o.contact.email ?? null, phone: o.contact.phone ?? null, managerEmail: o.contact.managerEmail ?? null, managerPhone: o.contact.managerPhone ?? null } : null } : null };
  });

  const { data: crm } = await db.from('leads').select('id,address,city,state,owner_name,contact_phone,program,cohost_service,existing_platforms,program_reason,program_set_at,stage').eq('program', 'co_host').order('program_set_at', { ascending: false }).limit(500);
  const refresh = { lastRun: lastRun?.[0] ? { ...lastRun[0], markets: (lastRun[0].markets ?? []).length } : null, markets: marketCount ?? 0, oldestRefresh: oldest?.[0]?.last_refreshed_at ?? null, firstRunAt: firstRun?.[0]?.started_at ?? null, intervalHours: 12 };
  return NextResponse.json({ listings: clean, crm: crm ?? [], stages: STAGES, serviceModels: SERVICE_MODELS, totals: { all: totalAll, luxury: totalLux, elite: totalElite }, refresh });
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
