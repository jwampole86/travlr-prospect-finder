import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

/**
 * POST /api/cadence/notify-escalation
 * Fires in-app notification + optional email to assigned agent
 * when a lead hits human_outreach stage.
 */

const resend = new Resend(process.env.RESEND_API_KEY);
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://travlrpro3047.builtwithrocket.new';

export async function POST(req: NextRequest) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  let body: {
    lead_id: string;
    escalation_reason?: string;
    send_email?: boolean;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { lead_id, escalation_reason, send_email = true } = body;

  if (!lead_id) {
    return NextResponse.json({ error: 'lead_id is required' }, { status: 400 });
  }

  try {
    // Load lead details
    const { data: lead, error: leadErr } = await supabase
      .from('leads')
      .select('id, first_name, last_name, address, city, state, phone, email, stage, assigned_agent_id, cadence_step, last_contacted_at, escalation_reason')
      .eq('id', lead_id)
      .single();

    if (leadErr || !lead) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
    }

    const leadName = [lead.first_name, lead.last_name].filter(Boolean).join(' ') || 'Unknown Lead';
    const propertyAddress = [lead.address, lead.city, lead.state].filter(Boolean).join(', ');
    const reason = escalation_reason || lead.escalation_reason || 'Engagement signal detected';
    const now = new Date().toISOString();

    // Load recent activity for the lead
    const { data: recentActivity } = await supabase
      .from('cadence_send_log')
      .select('channel, status, sent_at, metadata')
      .eq('lead_id', lead_id)
      .order('sent_at', { ascending: false })
      .limit(5);

    // Load assigned agent info
    let agentEmail: string | null = null;
    let agentName = 'Assigned Agent';
    if (lead.assigned_agent_id) {
      const { data: agentProfile } = await supabase
        .from('user_profiles')
        .select('full_name, email')
        .eq('id', lead.assigned_agent_id)
        .single();
      if (agentProfile) {
        agentName = agentProfile.full_name || agentName;
        agentEmail = agentProfile.email || null;
      }
    }

    // Fire in-app notification to assigned agent (or broadcast to all agents if unassigned)
    const notificationPayload = {
      type: 'stage_change',
      title: `🔥 Warm Lead Ready: ${leadName}`,
      message: `${leadName} at ${propertyAddress} escalated to Human Outreach. Reason: ${reason}`,
      read: false,
      metadata: {
        lead_id,
        lead_name: leadName,
        property_address: propertyAddress,
        escalation_reason: reason,
        cadence_step: lead.cadence_step,
        last_contacted_at: lead.last_contacted_at,
        action_url: `${SITE_URL}/lead-record?id=${lead_id}`,
        recent_activity: recentActivity?.slice(0, 3) || [],
      },
    };

    if (lead.assigned_agent_id) {
      await supabase.from('app_notifications').insert({
        ...notificationPayload,
        user_id: lead.assigned_agent_id,
      });
    } else {
      // Notify all agents/admins
      const { data: agents } = await supabase
        .from('user_profiles')
        .select('id')
        .in('role', ['agent', 'admin', 'manager']);
      if (agents && agents.length > 0) {
        await supabase.from('app_notifications').insert(
          agents.map((a: { id: string }) => ({ ...notificationPayload, user_id: a.id }))
        );
      }
    }

    // Send email notification if requested and agent email available
    let emailSent = false;
    if (send_email && agentEmail) {
      const activityHtml = (recentActivity || [])
        .map(a => `<li style="margin-bottom:6px"><strong>${a.channel?.toUpperCase()}</strong> — ${a.status} <span style="color:#888">${new Date(a.sent_at).toLocaleDateString()}</span></li>`)
        .join('');

      const emailHtml = `
        <!DOCTYPE html>
        <html>
        <body style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#1a1a1a">
          <div style="background:#fef3c7;border:1px solid #f59e0b;border-radius:8px;padding:16px;margin-bottom:24px">
            <p style="margin:0;font-size:14px;font-weight:600;color:#92400e">🔥 Warm Lead Alert — Action Required</p>
          </div>
          <h2 style="margin:0 0 8px;font-size:20px">Lead Ready for Human Outreach</h2>
          <p style="color:#555;margin:0 0 24px">Hi ${agentName}, a lead you're tracking just escalated and is ready for your personal outreach.</p>
          
          <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:20px;margin-bottom:24px">
            <p style="margin:0 0 4px;font-size:12px;color:#888;text-transform:uppercase;letter-spacing:0.05em">Lead</p>
            <p style="margin:0 0 16px;font-size:18px;font-weight:700">${leadName}</p>
            <p style="margin:0 0 4px;font-size:12px;color:#888;text-transform:uppercase;letter-spacing:0.05em">Property</p>
            <p style="margin:0 0 16px;font-size:14px">${propertyAddress}</p>
            <p style="margin:0 0 4px;font-size:12px;color:#888;text-transform:uppercase;letter-spacing:0.05em">Engagement Signal</p>
            <p style="margin:0;font-size:14px;color:#059669;font-weight:600">${reason}</p>
          </div>

          ${activityHtml ? `
          <h3 style="font-size:14px;margin:0 0 12px">Recent Activity</h3>
          <ul style="padding-left:20px;margin:0 0 24px;font-size:13px;color:#555">${activityHtml}</ul>
          ` : ''}

          <div style="display:flex;gap:12px;margin-bottom:32px">
            <a href="${SITE_URL}/escalated-leads" style="display:inline-block;background:#1a1a1a;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-size:13px;font-weight:600">View Escalated Leads</a>
            <a href="${SITE_URL}/lead-record?id=${lead_id}" style="display:inline-block;background:#f3f4f6;color:#1a1a1a;padding:10px 20px;border-radius:6px;text-decoration:none;font-size:13px;font-weight:600">Open Lead Record</a>
          </div>

          <hr style="border:none;border-top:1px solid #e5e7eb;margin-bottom:16px">
          <p style="font-size:11px;color:#9ca3af">This notification was sent by TRAVLR because a lead in your pipeline escalated to Human Outreach stage.</p>
        </body>
        </html>
      `;

      const { error: emailErr } = await resend.emails.send({
        from: 'TRAVLR <onboarding@resend.dev>',
        to: [agentEmail],
        subject: `🔥 Warm Lead Ready: ${leadName} — ${propertyAddress}`,
        html: emailHtml,
      });

      emailSent = !emailErr;
    }

    return NextResponse.json({
      success: true,
      lead_id,
      lead_name: leadName,
      in_app_notification_sent: true,
      email_sent: emailSent,
      agent_name: agentName,
      escalation_reason: reason,
      timestamp: now,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    description: 'Fire in-app + email notification when lead hits human_outreach stage',
    usage: 'POST /api/cadence/notify-escalation',
    body: {
      lead_id: 'string (required)',
      escalation_reason: 'string (optional)',
      send_email: 'boolean (optional, default true)',
    },
  });
}
