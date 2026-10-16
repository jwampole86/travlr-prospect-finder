import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getResendClient, getResendFrom } from '@/lib/email/resend';
import { requireAdminActor } from '@/lib/auth/apiAuthorization';

type LeadRow = {
  id: string;
  address: string | null;
  city: string | null;
  state: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  priority_tier: number | null;
  is_high_priority: boolean | null;
  estimated_net_monthly: number | null;
  verified_owner: boolean | null;
  verified_number: boolean | null;
  verified_address: string | null;
  prospect_score: number | null;
  stage: string | null;
};

type AgentProfile = {
  id: string;
  owner_user_id: string | null;
  full_name: string | null;
  email: string | null;
};

const PRIORITY_LABELS: Record<number, string> = {
  1: 'Low',
  2: 'Medium',
  3: 'High',
  4: 'Very High',
  5: 'Critical',
};

function getPriorityLabel(tier?: number | null, isHighPriority?: boolean): string {
  if (isHighPriority) return 'High Priority';
  if (tier && PRIORITY_LABELS[tier]) return PRIORITY_LABELS[tier];
  return 'Standard';
}

function formatCurrency(n?: number | null): string {
  if (!n) return 'N/A';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(n);
}

async function resolveTargetAgent(
  supabase: any,
  agentId?: string | null,
  agentEmail?: string | null,
  agentName?: string | null,
): Promise<AgentProfile | null> {
  if (agentId) {
    const { data } = await supabase
      .from('agent_profiles')
      .select('id, owner_user_id, full_name, email')
      .eq('id', agentId)
      .maybeSingle();
    if (data) return data as AgentProfile;
  }

  if (agentEmail) {
    const { data } = await supabase
      .from('agent_profiles')
      .select('id, owner_user_id, full_name, email')
      .eq('email', agentEmail)
      .maybeSingle();
    if (data) return data as AgentProfile;
  }

  if (agentName) {
    const { data } = await supabase
      .from('agent_profiles')
      .select('id, owner_user_id, full_name, email')
      .eq('full_name', agentName)
      .maybeSingle();
    if (data) return data as AgentProfile;
  }

  return null;
}

export async function POST(req: NextRequest) {
  try {
    const authorization = await requireAdminActor(req);
    if (!authorization.actor) {
      return NextResponse.json({ success: false, error: authorization.error }, { status: authorization.status });
    }

    const body = await req.json();
    const { leadIds, agentId, agentName, agentEmail, assignedByName } = body as {
      leadIds?: string[];
      agentId?: string;
      agentName?: string;
      agentEmail?: string;
      assignedByName?: string;
    };

    if (!leadIds || !Array.isArray(leadIds) || leadIds.length === 0) {
      return NextResponse.json({ success: false, error: 'leadIds array required' }, { status: 400 });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );

    const targetProfile = await resolveTargetAgent(supabase, agentId, agentEmail, agentName);
    const targetUserId = targetProfile?.owner_user_id || targetProfile?.id || agentId || null;
    const resolvedAgentName = targetProfile?.full_name || agentName || 'Assigned Agent';
    const resolvedAgentEmail = targetProfile?.email || agentEmail || null;

    if (!targetUserId) {
      return NextResponse.json({ success: false, error: 'Assigned agent not found' }, { status: 422 });
    }

    const now = new Date().toISOString();
    const actorName = assignedByName || authorization.actor.user.email || 'Admin';

    const { data: leads, error: leadsErr } = await supabase
      .from('leads')
      .select('id, address, city, state, contact_name, contact_phone, priority_tier, is_high_priority, estimated_net_monthly, verified_owner, verified_number, verified_address, prospect_score, stage')
      .in('id', leadIds);

    if (leadsErr) {
      return NextResponse.json({ success: false, error: leadsErr.message }, { status: 500 });
    }

    const leadsData = (leads || []) as LeadRow[];
    if (leadsData.length === 0) {
      return NextResponse.json({ success: false, error: 'No matching leads found' }, { status: 404 });
    }

    const { error: updateErr } = await supabase
      .from('leads')
      .update({
        primary_agent_id: targetUserId,
        primary_agent_name: resolvedAgentName,
        assigned_agent_id: targetUserId,
        assigned_agent_name: resolvedAgentName,
        assigned_at: now,
        assigned_by: authorization.actor.user.id,
        updated_at: now,
      })
      .in('id', leadIds);

    if (updateErr) {
      return NextResponse.json({ success: false, error: updateErr.message }, { status: 500 });
    }

    const { data: existingTargetAssignments, error: existingAssignmentsError } = await supabase
      .from('lead_agent_assignments')
      .select('id, lead_id')
      .in('lead_id', leadIds)
      .eq('agent_id', targetUserId)
      .is('unassigned_at', null);

    if (existingAssignmentsError) {
      return NextResponse.json({ success: false, error: existingAssignmentsError.message }, { status: 500 });
    }

    const existingTargetLeadIds = new Set((existingTargetAssignments || []).map((row) => row.lead_id as string));

    const { error: closeAssignmentsError } = await supabase
      .from('lead_agent_assignments')
      .update({
        is_primary: false,
        unassigned_at: now,
      })
      .in('lead_id', leadIds)
      .is('unassigned_at', null)
      .neq('agent_id', targetUserId);

    if (closeAssignmentsError) {
      return NextResponse.json({ success: false, error: closeAssignmentsError.message }, { status: 500 });
    }

    const rowsToInsert = leadIds
      .filter((leadId) => !existingTargetLeadIds.has(leadId))
      .map((leadId) => ({
        lead_id: leadId,
        agent_id: targetUserId,
        agent_name: resolvedAgentName,
        is_primary: true,
        assigned_at: now,
        assigned_by: authorization.actor.user.id,
        assigned_by_name: actorName,
        note: 'Assigned via lead queue',
      }));

    if (rowsToInsert.length > 0) {
      const { error } = await supabase.from('lead_agent_assignments').insert(rowsToInsert);
      if (error) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
      }
    }

    if (existingTargetAssignments && existingTargetAssignments.length > 0) {
      const { error } = await supabase
        .from('lead_agent_assignments')
        .update({
          is_primary: true,
          assigned_at: now,
          assigned_by: authorization.actor.user.id,
          assigned_by_name: actorName,
          unassigned_at: null,
          note: 'Assigned via lead queue',
        })
        .in('id', existingTargetAssignments.map((row) => row.id as string));

      if (error) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
      }
    }

    const assignmentLogs = leadsData.map((lead) => ({
      lead_id: lead.id,
      lead_address: lead.address,
      assigned_to_agent_id: targetUserId,
      assigned_to_agent_name: resolvedAgentName,
      region: lead.state,
      stage: lead.stage,
      score: lead.prospect_score,
      reason: 'Manual assignment via lead queue',
      assigned_at: now,
      is_override: false,
      portfolio: lead.state,
    }));

    const { error: assignmentLogError } = await supabase.from('lead_assignment_log').insert(assignmentLogs);
    if (assignmentLogError) {
      return NextResponse.json({ success: false, error: assignmentLogError.message }, { status: 500 });
    }

    const leadActivityRows = leadsData.map((lead) => ({
      lead_id: lead.id,
      activity_type: 'ASSIGNMENT',
      activity_data: {
        agentId: targetUserId,
        agentName: resolvedAgentName,
        assignedBy: authorization.actor.user.id,
        assignedByName: actorName,
        source: 'lead_queue',
      },
      performed_by: authorization.actor.user.id,
      performed_by_name: actorName,
      created_at: now,
    }));

    const { error: leadActivityError } = await supabase.from('lead_activity_log').insert(leadActivityRows);
    if (leadActivityError) {
      return NextResponse.json({ success: false, error: leadActivityError.message }, { status: 500 });
    }

    const activityEvents = leadsData.map((lead) => ({
      user_id: authorization.actor.user.id,
      lead_id: lead.id,
      lead_address: lead.address,
      lead_state: lead.state,
      event_type: 'lead_assigned',
      description: `Lead assigned to ${resolvedAgentName}`,
      detail: `${actorName} assigned ${lead.contact_name || lead.address || 'lead'} to ${resolvedAgentName}`,
      previous_value: null,
      new_value: resolvedAgentName,
      actor_user_id: authorization.actor.user.id,
      actor_email: authorization.actor.user.email ?? null,
      source: 'lead_queue',
      metadata: {
        agentId: targetUserId,
        agentName: resolvedAgentName,
      },
      event_timestamp: now,
      created_at: now,
    }));

    const { error: activityEventsError } = await supabase.from('activity_events').insert(activityEvents);
    if (activityEventsError) {
      return NextResponse.json({ success: false, error: activityEventsError.message }, { status: 500 });
    }

    const notificationTargets = [targetUserId];
    if (authorization.actor.user.id !== targetUserId) {
      notificationTargets.push(authorization.actor.user.id);
    }

    const leadCount = leadIds.length;
    const firstLead = leadsData[0];
    const priorityLabel = getPriorityLabel(firstLead?.priority_tier, firstLead?.is_high_priority ?? false);
    const revenueOpp = firstLead?.estimated_net_monthly;

    const notifTitle = leadCount === 1 && firstLead
      ? `Lead Assigned: ${firstLead.contact_name || firstLead.address || 'Property'}`
      : `${leadCount} Leads Assigned to ${resolvedAgentName}`;
    const notifMessage = leadCount === 1 && firstLead
      ? `${firstLead.contact_name || firstLead.address || 'Lead'} — ${priorityLabel} — ${formatCurrency(revenueOpp)}/mo assigned to ${resolvedAgentName}`
      : `${leadCount} leads have been assigned to ${resolvedAgentName} for follow-up.`;

    if (notificationTargets.length > 0) {
      const { error: appNotificationError } = await supabase.from('app_notifications').insert(
        notificationTargets.map((userId) => ({
          user_id: userId,
          type: 'new_lead',
          title: notifTitle,
          message: notifMessage,
          metadata: {
            leadIds,
            agentId: targetUserId,
            agentName: resolvedAgentName,
            assignedByName: actorName,
            leadCount,
            priorityLabel,
            revenueOpp,
          },
          read: false,
        })),
      );

      if (appNotificationError) {
        return NextResponse.json({ success: false, error: appNotificationError.message }, { status: 500 });
      }
    }

    let emailSent = false;
    let emailError: string | null = null;

    if (resolvedAgentEmail) {
      try {
        const leadsTableRows = leadsData.slice(0, 10).map((lead) => {
          const name = lead.contact_name || lead.address || 'Unknown';
          const phone = lead.contact_phone || '—';
          const priority = getPriorityLabel(lead.priority_tier, lead.is_high_priority ?? false);
          const revenue = formatCurrency(lead.estimated_net_monthly);
          const location = [lead.city, lead.state].filter(Boolean).join(', ') || lead.address;
          return `
            <tr style="border-bottom: 1px solid #e5e7eb;">
              <td style="padding: 10px 12px; font-size: 13px; color: #111827; font-weight: 500;">${name}</td>
              <td style="padding: 10px 12px; font-size: 13px; color: #374151;">${phone}</td>
              <td style="padding: 10px 12px; font-size: 13px; color: #374151;">${location}</td>
              <td style="padding: 10px 12px; font-size: 13px;">
                <span style="background: ${priority.includes('High') || priority.includes('Critical') ? '#fef2f2' : '#f0fdf4'}; color: ${priority.includes('High') || priority.includes('Critical') ? '#dc2626' : '#16a34a'}; padding: 2px 8px; border-radius: 9999px; font-size: 11px; font-weight: 600;">${priority}</span>
              </td>
              <td style="padding: 10px 12px; font-size: 13px; color: #059669; font-weight: 600;">${revenue}/mo</td>
            </tr>
          `;
        }).join('');

        const moreLeadsNote = leadCount > 10
          ? `<p style="color: #6b7280; font-size: 12px; margin: 8px 0 0; text-align: center;">+ ${leadCount - 10} more leads in your queue</p>`
          : '';

        await getResendClient().emails.send({
          from: getResendFrom(),
          to: [resolvedAgentEmail],
          subject: leadCount === 1
            ? `🎯 New Lead Assigned: ${firstLead?.contact_name || firstLead?.address || 'Property'}`
            : `🎯 ${leadCount} New Leads Assigned to You`,
          html: `
            <div style="font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif; max-width: 640px; margin: 0 auto; padding: 24px; background: #ffffff;">
              <div style="background: linear-gradient(135deg, #1e40af 0%, #3b82f6 100%); border-radius: 16px; padding: 28px 32px; margin-bottom: 28px;">
                <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 8px;">
                  <span style="font-size: 28px;">🎯</span>
                  <h1 style="color: white; margin: 0; font-size: 22px; font-weight: 700;">
                    ${leadCount === 1 ? 'New Lead Assigned to You' : `${leadCount} Leads Assigned to You`}
                  </h1>
                </div>
                <p style="color: rgba(255,255,255,0.85); margin: 0; font-size: 14px;">
                  Assigned by ${actorName} · ${new Date(now).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}
                </p>
              </div>
              <div style="background: #f9fafb; border-radius: 12px; overflow: hidden; margin-bottom: 24px; border: 1px solid #e5e7eb;">
                <table style="width: 100%; border-collapse: collapse;">
                  <thead>
                    <tr style="background: #f3f4f6;">
                      <th style="padding: 10px 12px; text-align: left; font-size: 11px; font-weight: 600; color: #6b7280; text-transform: uppercase; letter-spacing: 0.05em;">Prospect</th>
                      <th style="padding: 10px 12px; text-align: left; font-size: 11px; font-weight: 600; color: #6b7280; text-transform: uppercase; letter-spacing: 0.05em;">Phone</th>
                      <th style="padding: 10px 12px; text-align: left; font-size: 11px; font-weight: 600; color: #6b7280; text-transform: uppercase; letter-spacing: 0.05em;">Location</th>
                      <th style="padding: 10px 12px; text-align: left; font-size: 11px; font-weight: 600; color: #6b7280; text-transform: uppercase; letter-spacing: 0.05em;">Priority</th>
                      <th style="padding: 10px 12px; text-align: left; font-size: 11px; font-weight: 600; color: #6b7280; text-transform: uppercase; letter-spacing: 0.05em;">Revenue Opp.</th>
                    </tr>
                  </thead>
                  <tbody>${leadsTableRows}</tbody>
                </table>
                ${moreLeadsNote}
              </div>
              <div style="text-align: center; margin-bottom: 24px;">
                <a href="${process.env.NEXT_PUBLIC_SITE_URL || 'https://travlrpro3047.builtwithrocket.new'}/lead-management?assignmentStatus=assigned&ownerAgentId=${targetUserId}"
                   style="display: inline-block; background: #1e40af; color: white; text-decoration: none; padding: 14px 32px; border-radius: 10px; font-size: 14px; font-weight: 600; letter-spacing: 0.01em;">
                  View My Leads in TRAVLR →
                </a>
              </div>
              <p style="color: #9ca3af; font-size: 11px; text-align: center; margin: 0;">
                TRAVLR Pro · Lead Management Platform · You are receiving this because a lead was assigned to you.
              </p>
            </div>
          `,
        });
        emailSent = true;
      } catch (emailErr) {
        emailError = emailErr instanceof Error ? emailErr.message : 'Email send failed';
        console.error('[assign-agent] Resend error:', emailError);
      }
    }

    const notifLogs = leadsData.map((lead) => ({
      lead_id: lead.id,
      agent_id: targetUserId,
      agent_name: resolvedAgentName,
      agent_email: resolvedAgentEmail,
      assigned_by: authorization.actor.user.id,
      assigned_by_name: actorName,
      prospect_name: lead.contact_name || lead.address,
      prospect_phone: lead.contact_phone,
      prospect_address: lead.address,
      priority_tier: lead.priority_tier,
      priority_label: getPriorityLabel(lead.priority_tier, lead.is_high_priority ?? false),
      revenue_opportunity: lead.estimated_net_monthly,
      email_sent: emailSent,
      in_app_sent: notificationTargets.length > 0,
      email_error: emailError,
    }));

    const { error: notificationLogError } = await supabase.from('lead_assignment_notifications').insert(notifLogs);
    if (notificationLogError) {
      return NextResponse.json({ success: false, error: notificationLogError.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      assigned: leadIds.length,
      emailSent,
      inAppSent: notificationTargets.length > 0,
      emailError,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[assign-agent] Error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
