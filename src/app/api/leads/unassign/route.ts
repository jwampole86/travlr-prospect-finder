import { NextRequest, NextResponse } from 'next/server';
import { requireAdminActor } from '@/lib/auth/apiAuthorization';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

const MAX_LEADS = 500;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * POST /api/leads/unassign  { leadIds: string[], reason: string }
 * Admin only. Puts leads back in the unassigned list and leaves a record of who did it and why, in the same three logs a manual assignment writes to.
 * Stage, pipeline status, score and history are not touched.
 */
export async function POST(req: NextRequest) {
  const authorization = await requireAdminActor(req);
  if (!authorization.actor) return NextResponse.json({ success: false, error: authorization.error }, { status: authorization.status });
  const { actor } = authorization;

  const body = (await req.json().catch(() => ({}))) as { leadIds?: unknown; reason?: unknown };
  const leadIds = Array.isArray(body.leadIds) ? [...new Set(body.leadIds.filter((v): v is string => typeof v === 'string'))] : [];
  const reason = typeof body.reason === 'string' ? body.reason.trim().slice(0, 500) : '';
  if (leadIds.length === 0) return NextResponse.json({ success: false, error: 'leadIds array required' }, { status: 400 });
  if (leadIds.length > MAX_LEADS) return NextResponse.json({ success: false, error: `At most ${MAX_LEADS} leads at a time` }, { status: 400 });
  if (!reason) return NextResponse.json({ success: false, error: 'A reason is required' }, { status: 400 });

  const db = getSupabaseAdmin();
  let find = db.from('leads').select('id, address, state, stage, primary_agent_id, primary_agent_name, assigned_agent_name').in('id', leadIds).not('primary_agent_id', 'is', null);
  if (actor.organizationId) find = find.eq('organization_id', actor.organizationId);
  const { data: leads, error: findError } = await find;
  if (findError) return NextResponse.json({ success: false, error: findError.message }, { status: 500 });
  if (!leads?.length) return NextResponse.json({ success: true, unassigned: 0 });

  const ids = leads.map((l) => l.id as string);
  const now = new Date().toISOString();
  const actorName = actor.user.email ?? 'Admin';

  const { error: updateError } = await db.from('leads').update({
    primary_agent_id: null, primary_agent_name: null, assigned_agent_id: null, assigned_agent_name: null, assigned_at: null, assigned_by: null, updated_at: now,
  }).in('id', ids);
  if (updateError) return NextResponse.json({ success: false, error: updateError.message }, { status: 500 });

  await db.from('lead_agent_assignments').update({ is_primary: false, unassigned_at: now }).in('lead_id', ids).is('unassigned_at', null);

  const prevName = (l: (typeof leads)[number]) => (l.primary_agent_name as string | null) || (l.assigned_agent_name as string | null) || null;
  // lead_assignment_log keys on a uuid; a few imported leads have text ids and are covered by the two logs below.
  await db.from('lead_assignment_log').insert(leads.filter((l) => UUID.test(String(l.id))).map((l) => ({
    lead_id: l.id, lead_address: l.address, assigned_to_agent_id: null, assigned_to_agent_name: null, region: l.state, stage: l.stage,
    reason: `Unassigned: ${reason}`, assigned_at: now, is_override: true, override_by: actor.user.id, override_reason: reason,
  })));
  await db.from('lead_activity_log').insert(leads.map((l) => ({
    lead_id: l.id, activity_type: 'UNASSIGNMENT',
    activity_data: { previousAgentId: l.primary_agent_id, previousAgentName: prevName(l), reason, source: 'unassign_api' },
    performed_by: actor.user.id, performed_by_name: actorName, created_at: now,
  })));
  await db.from('activity_events').insert(leads.map((l) => ({
    user_id: actor.user.id, lead_id: l.id, lead_address: l.address, lead_state: l.state, event_type: 'lead_unassigned',
    description: `Lead unassigned from ${prevName(l) ?? 'agent'}`, detail: `${actorName} unassigned this lead: ${reason}`,
    previous_value: prevName(l), new_value: null, actor_user_id: actor.user.id, actor_email: actor.user.email ?? null, source: 'unassign_api',
    metadata: { previousAgentId: l.primary_agent_id, reason }, event_timestamp: now, created_at: now,
  })));

  return NextResponse.json({ success: true, unassigned: ids.length });
}
