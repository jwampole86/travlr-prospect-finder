import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getResendClient, getResendFrom } from '@/lib/email/resend';

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
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      leadIds,
      agentId,
      agentName,
      agentEmail,
      assignedBy,
      assignedByName,
    } = body;

    if (!leadIds || !Array.isArray(leadIds) || leadIds.length === 0) {
      return NextResponse.json({ success: false, error: 'leadIds array required' }, { status: 400 });
    }
    if (!agentId && !agentName) {
      return NextResponse.json({ success: false, error: 'agentId or agentName required' }, { status: 400 });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    const now = new Date().toISOString();

    // ── 1. Fetch lead details ─────────────────────────────────
    const { data: leads, error: leadsErr } = await supabase
      .from('leads')
      .select('id, address, city, state, contact_name, contact_phone, priority_tier, is_high_priority, estimated_net_monthly, verified_owner, verified_number, verified_address, prospect_score')
      .in('id', leadIds);

    if (leadsErr) {
      return NextResponse.json({ success: false, error: leadsErr.message }, { status: 500 });
    }

    // ── 2. Update leads with agent assignment ─────────────────
    const { error: updateErr } = await supabase
      .from('leads')
      .update({
        primary_agent_id: agentId || null,
        primary_agent_name: agentName,
        assigned_at: now,
        assigned_by: assignedBy || null,
        updated_at: now,
      })
      .in('id', leadIds);

    if (updateErr) {
      return NextResponse.json({ success: false, error: updateErr.message }, { status: 500 });
    }

    // ── 3. Log to lead_assignment_log ─────────────────────────
    const assignmentLogs = leadIds.map((leadId: string) => ({
      lead_id: leadId,
      agent_id: agentId || null,
      agent_name: agentName,
      assigned_by: assignedBy || null,
      assigned_at: now,
      notes: `Assigned via Lead Management bulk assignment`,
    }));

    await supabase.from('lead_assignment_log').insert(assignmentLogs).catch(() => {});

    // ── 4. Log activity events ────────────────────────────────
    const activityEvents = leadIds.map((leadId: string) => ({
      lead_id: leadId,
      activity_type: 'ASSIGNMENT',
      description: `Lead assigned to ${agentName}`,
      metadata: { agentId, agentName, assignedBy, assignedByName },
      created_at: now,
    }));

    await supabase.from('lead_activity_log').insert(activityEvents).catch(() => {});

    // ── 5. Send in-app notifications ──────────────────────────
    // Find the agent's user_id to send them a notification
    let agentUserId: string | null = null;
    if (agentId) {
      const { data: agentProfile } = await supabase
        .from('agent_profiles')
        .select('owner_user_id')
        .eq('id', agentId)
        .single();
      agentUserId = agentProfile?.owner_user_id || null;
    }

    // Also notify the assigner (admin)
    const notificationTargets: string[] = [];
    if (agentUserId) notificationTargets.push(agentUserId);
    if (assignedBy && assignedBy !== agentUserId) notificationTargets.push(assignedBy);

    const leadsData = (leads || []) as Array<{
      id: string;
      address: string;
      city: string;
      state: string;
      contact_name: string | null;
      contact_phone: string | null;
      priority_tier: number | null;
      is_high_priority: boolean | null;
      estimated_net_monthly: number | null;
      verified_owner: boolean | null;
      verified_number: boolean | null;
      verified_address: string | null;
      prospect_score: number | null;
    }>;

    const leadCount = leadIds.length;
    const firstLead = leadsData[0];
    const priorityLabel = getPriorityLabel(firstLead?.priority_tier, firstLead?.is_high_priority ?? false);
    const revenueOpp = firstLead?.estimated_net_monthly;

    // Build notification message
    let notifTitle: string;
    let notifMessage: string;

    if (leadCount === 1 && firstLead) {
      const prospectName = firstLead.contact_name || firstLead.address || 'Unknown Prospect';
      const phone = firstLead.contact_phone || 'No phone';
      notifTitle = `Lead Assigned: ${prospectName}`;
      notifMessage = `${prospectName} (${phone}) — ${priorityLabel} — ${formatCurrency(revenueOpp)}/mo opportunity assigned to ${agentName}`;
    } else {
      notifTitle = `${leadCount} Leads Assigned to ${agentName}`;
      notifMessage = `${leadCount} leads have been assigned to ${agentName} for follow-up.`;
    }

    // Insert in-app notifications for all targets
    for (const userId of notificationTargets) {
      await supabase.from('app_notifications').insert({
        user_id: userId,
        type: 'new_lead',
        title: notifTitle,
        message: notifMessage,
        metadata: {
          leadIds,
          agentId,
          agentName,
          assignedBy,
          leadCount,
          priorityLabel,
          revenueOpp,
        },
        read: false,
      }).catch(() => {});
    }

    // ── 6. Send Resend email to agent ─────────────────────────
    let emailSent = false;
    let emailError: string | null = null;

    if (agentEmail) {
      try {
        const leadsTableRows = leadsData.slice(0, 10).map((l) => {
          const name = l.contact_name || l.address || 'Unknown';
          const phone = l.contact_phone || '—';
          const priority = getPriorityLabel(l.priority_tier, l.is_high_priority ?? false);
          const revenue = formatCurrency(l.estimated_net_monthly);
          const location = [l.city, l.state].filter(Boolean).join(', ') || l.address;
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
          to: [agentEmail],
          subject: leadCount === 1
            ? `🎯 New Lead Assigned: ${firstLead?.contact_name || firstLead?.address || 'Property'}`
            : `🎯 ${leadCount} New Leads Assigned to You`,
          html: `
            <div style="font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif; max-width: 640px; margin: 0 auto; padding: 24px; background: #ffffff;">
              <!-- Header -->
              <div style="background: linear-gradient(135deg, #1e40af 0%, #3b82f6 100%); border-radius: 16px; padding: 28px 32px; margin-bottom: 28px;">
                <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 8px;">
                  <span style="font-size: 28px;">🎯</span>
                  <h1 style="color: white; margin: 0; font-size: 22px; font-weight: 700;">
                    ${leadCount === 1 ? 'New Lead Assigned to You' : `${leadCount} Leads Assigned to You`}
                  </h1>
                </div>
                <p style="color: rgba(255,255,255,0.85); margin: 0; font-size: 14px;">
                  Assigned by ${assignedByName || 'Admin'} · ${new Date(now).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}
                </p>
              </div>

              <!-- Lead Table -->
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
                  <tbody>
                    ${leadsTableRows}
                  </tbody>
                </table>
                ${moreLeadsNote}
              </div>

              <!-- CTA -->
              <div style="text-align: center; margin-bottom: 24px;">
                <a href="${process.env.NEXT_PUBLIC_SITE_URL || 'https://travlrpro3047.builtwithrocket.new'}/lead-management?assignmentStatus=assigned&ownerAgentId=${agentId || ''}"
                   style="display: inline-block; background: #1e40af; color: white; text-decoration: none; padding: 14px 32px; border-radius: 10px; font-size: 14px; font-weight: 600; letter-spacing: 0.01em;">
                  View My Leads in TRAVLR →
                </a>
              </div>

              <!-- Footer -->
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

    // ── 7. Log notification record ────────────────────────────
    const notifLogs = leadsData.map((l) => ({
      lead_id: l.id,
      agent_id: agentId || null,
      agent_name: agentName,
      agent_email: agentEmail || null,
      assigned_by: assignedBy || null,
      assigned_by_name: assignedByName || null,
      prospect_name: l.contact_name || l.address,
      prospect_phone: l.contact_phone,
      prospect_address: l.address,
      priority_tier: l.priority_tier,
      priority_label: getPriorityLabel(l.priority_tier, l.is_high_priority ?? false),
      revenue_opportunity: l.estimated_net_monthly,
      email_sent: emailSent,
      in_app_sent: notificationTargets.length > 0,
      email_error: emailError,
    }));

    await supabase.from('lead_assignment_notifications').insert(notifLogs).catch(() => {});

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
