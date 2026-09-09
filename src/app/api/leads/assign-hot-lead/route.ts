'use server';

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/client';
import { getResendClient, getResendFrom } from '@/lib/email/resend';

export async function POST(req: NextRequest) {
  try {
    const { leadId, agentName, agentEmail, leadAddress, leadScore, leadBand, assignedBy } = await req.json();

    if (!leadId || !agentName) {
      return NextResponse.json({ success: false, error: 'Missing required fields' }, { status: 400 });
    }

    const supabase = createClient();
    const assignedAt = new Date().toISOString();

    // Persist assignment to leads table
    const { error: updateError } = await supabase
      .from('leads')
      .update({
        assigned_agent: agentName,
        pipeline_status: 'contacted',
        updated_at: assignedAt,
      })
      .eq('id', leadId);

    if (updateError) {
      console.error('Lead update error:', updateError);
    }

    // Insert into lead_assignments for attribution tracking
    const { error: assignError } = await supabase
      .from('lead_assignments')
      .insert({
        lead_id: leadId,
        agent_user_id: agentName,
        assigned_at: assignedAt,
        assigned_by: assignedBy || 'system',
        notes: `Hot lead assigned via one-click routing. Band: ${leadBand}, Score: ${leadScore}`,
      });

    if (assignError) {
      console.error('Assignment insert error:', assignError);
    }

    // Send Resend notification if agent email provided
    if (agentEmail) {
      await getResendClient().emails.send({
        from: getResendFrom(),
        to: [agentEmail],
        subject: `🔥 Hot Lead Assigned: ${leadAddress}`,
        html: `
          <div style="font-family: DM Sans, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; background: #fff;">
            <div style="background: linear-gradient(135deg, #dc2626 0%, #f97316 100%); border-radius: 12px; padding: 24px; margin-bottom: 24px;">
              <h1 style="color: white; margin: 0; font-size: 22px;">🔥 Hot Lead Assigned to You</h1>
              <p style="color: rgba(255,255,255,0.85); margin: 8px 0 0; font-size: 14px;">Assigned at ${new Date(assignedAt).toLocaleString()}</p>
            </div>
            <div style="background: #f9fafb; border-radius: 8px; padding: 20px; margin-bottom: 20px;">
              <h2 style="margin: 0 0 12px; font-size: 16px; color: #111827;">Lead Details</h2>
              <table style="width: 100%; border-collapse: collapse;">
                <tr><td style="padding: 6px 0; color: #6b7280; font-size: 13px;">Address</td><td style="padding: 6px 0; font-weight: 600; color: #111827; font-size: 13px;">${leadAddress}</td></tr>
                <tr><td style="padding: 6px 0; color: #6b7280; font-size: 13px;">Score</td><td style="padding: 6px 0; font-weight: 600; color: #dc2626; font-size: 13px;">${leadScore}/100</td></tr>
                <tr><td style="padding: 6px 0; color: #6b7280; font-size: 13px;">Band</td><td style="padding: 6px 0; font-weight: 600; color: #dc2626; font-size: 13px; text-transform: uppercase;">${leadBand}</td></tr>
                <tr><td style="padding: 6px 0; color: #6b7280; font-size: 13px;">Assigned By</td><td style="padding: 6px 0; font-weight: 600; color: #111827; font-size: 13px;">${assignedBy || 'System'}</td></tr>
              </table>
            </div>
            <p style="color: #6b7280; font-size: 12px; margin: 0;">This lead has been marked as <strong>Contacted</strong> in the pipeline. Log in to TRAVLR to follow up.</p>
          </div>
        `,
      });
    }

    return NextResponse.json({ success: true, assignedAt });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
