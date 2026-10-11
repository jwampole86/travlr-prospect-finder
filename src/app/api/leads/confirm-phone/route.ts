import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { requireLeadAccess } from '@/lib/auth/apiAuthorization';
import { rescoreLeadsByIds } from '@/lib/services/leadScoringService';

/**
 * POST /api/leads/confirm-phone  { leadId }
 * An agent or admin confirms the lead's contact_phone reaches the homeowner (e.g. after a call), which sets
 * verified_number. Skip-traced numbers stay unverified until this runs. One-way: protect_csv_contact_data
 * blocks downgrading verified_number on imported leads.
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const leadId = typeof body?.leadId === 'string' ? body.leadId : '';
  if (!leadId) return NextResponse.json({ error: 'leadId is required' }, { status: 400 });

  const access = await requireLeadAccess(request, leadId);
  if (!access.actor) return NextResponse.json({ error: access.error }, { status: access.status });
  const { user } = access.actor;

  const db = getSupabaseAdmin();
  const { data: lead } = await db.from('leads').select('id,contact_phone,verified_number').eq('id', leadId).maybeSingle();
  if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
  if (!lead.contact_phone) return NextResponse.json({ error: 'No phone number on file to confirm' }, { status: 400 });
  if (lead.verified_number) return NextResponse.json({ ok: true, alreadyConfirmed: true });

  const now = new Date().toISOString();
  const { error } = await db.from('leads').update({
    verified_number: true,
    has_phone: true,
    verified_number_source: 'AGENT_CONFIRMED',
    phone_verification_source: 'AGENT_CONFIRMED',
    phone_verified_at: now,
  }).eq('id', leadId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { error: logError } = await db.from('lead_activity_log').insert({
    lead_id: leadId,
    activity_type: 'ENRICHMENT',
    activity_data: { description: 'Phone number confirmed by agent.', provider: 'AGENT_CONFIRMED' },
    performed_by_name: user.email || 'Agent',
    created_at: now,
  });
  if (logError) console.warn('[confirm-phone] activity log insert failed:', logError.message);

  await rescoreLeadsByIds(db, [leadId]);
  return NextResponse.json({ ok: true, verifiedAt: now });
}
