import { NextRequest, NextResponse } from 'next/server';
import { naveoSellerAccess } from '@/lib/seller/naveoAccess';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { ownerInquiryIntent, parseOwnerInquiry } from '@/lib/seller/naveoOwnerInquiry';
import { recordSellerSignal } from '@/lib/seller/sellerPipeline';

export const dynamic = 'force-dynamic';

/**
 * POST: NAVEO Stays sends a property owner's request for a rental-management analysis. It becomes one AVYRO lead and one open opportunity routed to
 * short-term-rental management, never a sale. A referred owner (`referred: true`) did not ask for anything, so that lead is not opted in to contact. No consent is recorded and nothing is sent to the owner. A repeated submission id returns the same lead.
 * Called with the shared key in `x-naveo-key`.
 */
export async function POST(req: NextRequest) {
  const access = naveoSellerAccess(req.method, req.nextUrl.pathname, req.headers.get('x-naveo-key'));
  if (!access) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const parsed = parseOwnerInquiry(await req.json().catch(() => null));
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const inq = parsed.value;
  const db = getSupabaseAdmin();
  const now = new Date().toISOString();
  const marker = inq.submissionId ? `[stays:${inq.submissionId}]` : null;

  let leadId: string | null = null;
  if (marker) {
    const { data } = await db.from('leads').select('id').eq('organization_id', access.organizationId).ilike('notes', `%${marker}%`).limit(1);
    leadId = (data?.[0]?.id as string | undefined) ?? null;
  }

  if (!leadId) {
    const newId = `lead-stays-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const notes = [
      inq.referred ? `Referred to NAVEO Stays by an existing owner${inq.source ? ` (${inq.source})` : ''}. The owner has not contacted us. Email: ${inq.email}`
        : `Asked NAVEO Stays for a rental-management analysis${inq.source ? ` (${inq.source})` : ''}. Email: ${inq.email}`,
      inq.portfolioSize ? `Portfolio: ${inq.portfolioSize}` : '', inq.currentSetup ? `Current setup: ${inq.currentSetup}` : '',
      inq.referralCode ? `Referral code: ${inq.referralCode}` : '', inq.message ? `Message: ${inq.message}` : '', marker ?? '',
    ].filter(Boolean).join('\n');
    const { data, error } = await db.from('leads').insert({
      id: newId, organization_id: access.organizationId, price_type: 'rent',
      address: inq.address ?? `Street address not provided${inq.location ? ` — ${inq.location}` : ''}`,
      city: inq.address ? null : inq.location, property_type: inq.propertyType,
      contact_name: inq.name, contact_phone: inq.phone, owner_email: inq.referred ? null : inq.email,
      source: 'Direct', cadence_step: 0, sms_opt_in: false,
      ...(inq.referred
        ? { lead_source_type: 'sync_imported', lead_status_tag: 'Referred — Permission Needed', email_opt_in: false, opt_in_source: 'naveo_stays_owner_referral', contact_info_source: 'referral' }
        : { lead_source_type: 'self_submitted', lead_status_tag: 'Warm — Contact Confirmed', stage: 'nurturing', email_opt_in: true, email_opt_in_at: now, opt_in_source: 'naveo_stays_owner_form', contact_info_source: 'self_submitted' }),
      notes, created_at: now, updated_at: now,
    }).select('id').single();
    if (error || !data) return NextResponse.json({ error: 'could_not_create_lead' }, { status: 500 });
    leadId = data.id as string;
  }

  const result = await recordSellerSignal(db, {
    leadId, source: inq.referred ? 'naveo_stays_owner_referral' : 'naveo_stays_owner_form',
    text: `${inq.referred ? 'Referred to NAVEO Stays by an existing owner.' : 'Asked NAVEO Stays for a rental-management analysis.'} ${inq.message ?? ''}`.trim(),
    intent: ownerInquiryIntent(inq), organizationId: access.organizationId,
  }).catch(() => null);
  if (!result) return NextResponse.json({ error: 'could_not_record_opportunity', lead_id: leadId }, { status: 502 });

  if (result.created) await db.from('seller_opportunities').update({ route: 'str_management' }).eq('id', result.opportunity.id);

  return NextResponse.json({ lead_id: leadId, opportunity_id: result.opportunity.id, created: result.created }, { status: result.created ? 201 : 200 });
}
