import { NextRequest, NextResponse } from 'next/server';
import { naveoSellerAccess } from '@/lib/seller/naveoAccess';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { recordConsent } from '@/lib/seller/consentLedger';
import { naveoIntent, parseNaveoLead } from '@/lib/seller/naveoLead';
import { recordSellerSignal } from '@/lib/seller/sellerPipeline';

export const dynamic = 'force-dynamic';

const streetKey = (address: string) => address.split(',')[0].toLowerCase().replace(/[%_\\]/g, ' ').trim();

/**
 * POST: NAVEO Homes sends a seller submission. The property becomes (or updates) one AVYRO lead and one open seller opportunity, and the
 * lead's id is the Lead ID used on both sides. Nothing is sent to the owner. Called with the shared key in `x-naveo-key`.
 */
export async function POST(req: NextRequest) {
  const access = naveoSellerAccess(req.method, req.nextUrl.pathname, req.headers.get('x-naveo-key'));
  if (!access) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const parsed = parseNaveoLead(await req.json().catch(() => null));
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const lead = parsed.value;
  const db = getSupabaseAdmin();
  const now = new Date().toISOString();
  const key = streetKey(lead.address);

  const { data: candidates } = await db.from('leads').select('id,address,city,state,beds,baths,property_type').eq('organization_id', access.organizationId).ilike('address', `%${key}%`).limit(5);
  const existing = (candidates ?? []).find((l) => streetKey(String(l.address ?? '')) === key);

  let leadId: string;
  if (existing) {
    leadId = existing.id as string;
    // Contact details come from the owner; property facts only fill gaps so a verified record is never overwritten.
    const patch: Record<string, unknown> = {
      contact_name: lead.name, ...(lead.phone ? { contact_phone: lead.phone } : {}), contact_info_source: 'self_submitted', updated_at: now,
    };
    if (!existing.city && lead.city) patch.city = lead.city;
    if (!existing.state && lead.state) patch.state = lead.state;
    if (existing.beds == null && lead.beds !== null) patch.beds = lead.beds;
    if (existing.baths == null && lead.baths !== null) patch.baths = lead.baths;
    if (!existing.property_type && lead.propertyType) patch.property_type = lead.propertyType;
    const { error } = await db.from('leads').update(patch).eq('id', leadId);
    if (error) return NextResponse.json({ error: 'could_not_update_lead' }, { status: 500 });
  } else {
    const newId = `lead-naveo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const { data, error } = await db.from('leads').insert({
      id: newId, organization_id: access.organizationId, price_type: 'sale',
      address: lead.address, city: lead.city, state: lead.state, property_type: lead.propertyType, beds: lead.beds, baths: lead.baths,
      contact_name: lead.name, contact_phone: lead.phone,
      source: 'Direct', lead_source_type: 'self_submitted', lead_status_tag: 'Warm — Contact Confirmed', stage: 'nurturing', cadence_step: 0,
      email_opt_in: true, email_opt_in_at: now, sms_opt_in: false, opt_in_source: 'naveo_sell_form', contact_info_source: 'self_submitted',
      notes: `Submitted the NAVEO sell form${lead.submissionId ? ` (submission ${lead.submissionId})` : ''}. Email: ${lead.email}`, created_at: now, updated_at: now,
    }).select('id').single();
    if (error || !data) return NextResponse.json({ error: 'could_not_create_lead' }, { status: 500 });
    leadId = data.id as string;
  }

  if (lead.followUpConsent) {
    await recordConsent(db, {
      leadId, purpose: 'estimate_followup', granted: true, source: 'naveo_sell_form',
      evidence: `Ticked the follow-up box on the NAVEO sell form${lead.submissionId ? ` (submission ${lead.submissionId})` : ''}`,
      email: lead.email, recordedBy: access.userId, organizationId: access.organizationId,
    }).catch(() => undefined);
  }

  const signalText = `Submitted the NAVEO sell form. ${lead.notes ?? ''}`.trim();
  const result = await recordSellerSignal(db, { leadId, source: 'naveo_sell_form', text: signalText, intent: naveoIntent(lead), organizationId: access.organizationId })
    .catch(() => null);
  if (!result) return NextResponse.json({ error: 'could_not_record_opportunity', lead_id: leadId }, { status: 502 });

  const conditionNotes = [lead.condition ? `Condition: ${lead.condition}` : '', lead.strInterest ? 'Asked for a rental-income evaluation' : ''].filter(Boolean).join('. ');
  if (conditionNotes && result.created) await db.from('seller_opportunities').update({ condition_notes: conditionNotes }).eq('id', result.opportunity.id);

  return NextResponse.json({ lead_id: leadId, opportunity_id: result.opportunity.id, created: result.created }, { status: result.created ? 201 : 200 });
}
