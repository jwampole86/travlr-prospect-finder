import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireLeadAccess } from '@/lib/auth/apiAuthorization';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

/**
 * GET /api/agent/lead/[leadId]
 * Returns agent-scoped lead fields only (no admin-only fields).
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ leadId: string }> }
) {
  const { leadId } = await params;
  const auth = await requireLeadAccess(req, leadId);

  if (!auth.actor) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  // Return agent-visible fields only (field-level authorization)
  const { data: lead, error } = await supabaseAdmin
    .from('leads')
    .select(`
      id, address, city, state, zip, lat, lng, beds, baths, price, price_type,
      source, stage, regulation_status, prospect_score, days_on_market, last_checked,
      listing_url, notes, contact_name, contact_phone, tags, estimated_adr,
      estimated_occupancy, estimated_gross_monthly, estimated_net_monthly, photos,
      created_at, updated_at, verified_owner, verified_address, verified_number,
      lead_status, next_followup_due, last_contacted_at, primary_agent_id, is_synthetic
    `)
    .eq('id', leadId)
    .single();

  if (error || !lead) {
    return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
  }

  // Strip admin-only fields for agents
  if (!auth.actor.isAdmin) {
    const { is_synthetic, ...agentLead } = lead as any;
    return NextResponse.json({ lead: agentLead });
  }

  return NextResponse.json({ lead });
}

/**
 * PATCH /api/agent/lead/[leadId]
 * Agents may only update permitted fields (outcome, notes, follow_up).
 * Rejects attempts to modify system/admin fields.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ leadId: string }> }
) {
  const { leadId } = await params;
  const auth = await requireLeadAccess(req, leadId);

  if (!auth.actor) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const body = await req.json();

  // Field-level authorization: agents may only update these fields
  const AGENT_PERMITTED_FIELDS = ['notes', 'next_followup_due', 'lead_status'];
  const ADMIN_ONLY_FIELDS = [
    'primary_agent_id', 'luxury', 'priority', 'priority_tier',
    'verified_owner', 'verified_address', 'verified_number',
    'source', 'portfolio_id', 'prospect_score', 'do_not_contact',
    'is_synthetic', 'estimated_net_monthly', 'estimated_gross_monthly', 'next_follow_up_at'
  ];

  if (!auth.actor.isAdmin) {
    const attemptedAdminFields = Object.keys(body).filter(k => ADMIN_ONLY_FIELDS.includes(k));
    if (attemptedAdminFields.length > 0) {
      return NextResponse.json({
        error: `Forbidden: Agents cannot modify fields: ${attemptedAdminFields.join(', ')}`
      }, { status: 403 });
    }

    const allowedUpdate: Record<string, unknown> = {};
    for (const field of AGENT_PERMITTED_FIELDS) {
      if (body[field] !== undefined) {
        allowedUpdate[field] = body[field];
      }
    }

    if (Object.keys(allowedUpdate).length === 0) {
      return NextResponse.json({ error: 'No permitted fields to update' }, { status: 400 });
    }

    const { error: updateErr } = await supabaseAdmin
      .from('leads')
      .update(allowedUpdate)
      .eq('id', leadId);

    if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });
    return NextResponse.json({ success: true });
  }

  // Admin can update any field
  const { error: updateErr } = await supabaseAdmin
    .from('leads')
    .update(body)
    .eq('id', leadId);

  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
