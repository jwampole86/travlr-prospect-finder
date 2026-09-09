import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

async function authorizeAgentLeadAccess(token: string, leadId: string) {
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !user) return { error: 'Unauthorized', status: 401, user: null, isAdmin: false };

  const { data: profile } = await supabaseAdmin
    .from('user_profiles')
    .select('app_role, is_active')
    .eq('id', user.id)
    .single();

  if (!profile) return { error: 'Profile not found', status: 403, user: null, isAdmin: false };

  const isAdmin = profile.app_role === 'admin';
  const isAgent = profile.app_role === 'agent';

  if (!isAdmin && !isAgent) return { error: 'Forbidden', status: 403, user: null, isAdmin: false };
  if (isAgent && profile.is_active === false) return { error: 'Account deactivated', status: 403, user: null, isAdmin: false };

  if (isAgent) {
    // Object-level authorization: verify this lead is assigned to this agent
    const { data: lead } = await supabaseAdmin
      .from('leads')
      .select('id, primary_agent_id')
      .eq('id', leadId)
      .single();

    if (!lead) return { error: 'Lead not found', status: 404, user: null, isAdmin: false };

    const isAssigned = lead.primary_agent_id === user.id;
    if (!isAssigned) {
      // Check lead_agent_assignments as well
      const { data: assignment } = await supabaseAdmin
        .from('lead_agent_assignments')
        .select('id')
        .eq('lead_id', leadId)
        .eq('agent_id', user.id)
        .is('removed_at', null)
        .single();

      if (!assignment) {
        return { error: 'Forbidden: Lead not assigned to this agent', status: 403, user: null, isAdmin: false };
      }
    }
  }

  return { error: null, status: 200, user, isAdmin };
}

/**
 * GET /api/agent/lead/[leadId]
 * Returns agent-scoped lead fields only (no admin-only fields).
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ leadId: string }> }
) {
  const { leadId } = await params;
  const token = req.headers.get('authorization')?.replace('Bearer ', '') || '';
  const auth = await authorizeAgentLeadAccess(token, leadId);

  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  // Return agent-visible fields only (field-level authorization)
  const { data: lead, error } = await supabaseAdmin
    .from('leads')
    .select(`
      id, owner_name, property_address, city, state, phone,
      priority, luxury, verified_owner, verified_address, verified_number,
      lead_status, stage, prospect_score, next_follow_up_at,
      last_contacted_at, created_at, do_not_contact, estimated_net_monthly,
      notes, primary_agent_id, estimated_gross_monthly,
      priority_tier, is_synthetic
    `)
    .eq('id', leadId)
    .single();

  if (error || !lead) {
    return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
  }

  // Strip admin-only fields for agents
  if (!auth.isAdmin) {
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
  const token = req.headers.get('authorization')?.replace('Bearer ', '') || '';
  const auth = await authorizeAgentLeadAccess(token, leadId);

  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const body = await req.json();

  // Field-level authorization: agents may only update these fields
  const AGENT_PERMITTED_FIELDS = ['notes', 'next_follow_up_at', 'lead_status'];
  const ADMIN_ONLY_FIELDS = [
    'primary_agent_id', 'luxury', 'priority', 'priority_tier',
    'verified_owner', 'verified_address', 'verified_number',
    'source', 'portfolio_id', 'prospect_score', 'do_not_contact',
    'is_synthetic', 'estimated_net_monthly', 'estimated_gross_monthly'
  ];

  if (!auth.isAdmin) {
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
