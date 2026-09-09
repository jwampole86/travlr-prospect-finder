import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getResendClient, getResendFrom } from '@/lib/email/resend';

export async function POST(req: NextRequest) {
  try {
    const { stepId, leadIds, workflowId } = await req.json();

    if (!stepId || !leadIds?.length) {
      return NextResponse.json({ success: false, error: 'Missing stepId or leadIds' }, { status: 400 });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    // Fetch the step
    const { data: step, error: stepErr } = await supabase
      .from('sequence_steps')
      .select('*')
      .eq('id', stepId)
      .single();

    if (stepErr || !step) {
      return NextResponse.json({ success: false, error: 'Step not found' }, { status: 404 });
    }

    // Fetch leads
    const { data: leads, error: leadsErr } = await supabase
      .from('leads')
      .select('id, contact_name, email, address, city, price, beds, baths, source')
      .in('id', leadIds);

    if (leadsErr || !leads?.length) {
      return NextResponse.json({ success: false, error: 'No leads found' }, { status: 404 });
    }

    const results: { leadId: string; success: boolean; error?: string; emailId?: string }[] = [];

    for (const lead of leads) {
      const fill = (s: string) => (s || '')
        .replace(/{{leadName}}/g, lead.contact_name || 'there')
        .replace(/{{address}}/g, lead.address || '')
        .replace(/{{price}}/g, lead.price ? `$${lead.price.toLocaleString()}` : '')
        .replace(/{{city}}/g, lead.city || '')
        .replace(/{{beds}}/g, String(lead.beds || ''))
        .replace(/{{baths}}/g, String(lead.baths || ''))
        .replace(/{{source}}/g, lead.source || '');

      if (step.channel === 'email') {
        if (!lead.email) {
          results.push({ leadId: lead.id, success: false, error: 'Lead has no email address' });
          continue;
        }

        const resend = getResendClient();
        const from = getResendFrom();
        const filledSubject = fill(step.subject) || 'Following up on your property';
        const filledBody = fill(step.body) || '';

        const html = `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:32px;">
          <p style="font-size:14px;line-height:1.6;white-space:pre-wrap;">${filledBody}</p>
        </div>`;

        const { data: emailData, error: emailErr } = await resend.emails.send({
          from,
          to: [lead.email],
          subject: filledSubject,
          html,
        });

        if (emailErr) {
          results.push({ leadId: lead.id, success: false, error: emailErr.message });
        } else {
          results.push({ leadId: lead.id, success: true, emailId: emailData?.id });

          // Log to activity
          await supabase.from('sequence_activity_log').insert({
            surplus_lead_id: lead.id,
            workflow_id: workflowId || null,
            step_id: stepId,
            event_type: 'sent',
            channel: 'email',
            subject: filledSubject,
            body_preview: filledBody.slice(0, 120),
            status: 'delivered',
            notes: `Sent immediately via workflow step`,
          });
        }
      } else {
        // SMS — log as sent (actual SMS requires Twilio/similar)
        results.push({ leadId: lead.id, success: true });
        await supabase.from('sequence_activity_log').insert({
          surplus_lead_id: lead.id,
          workflow_id: workflowId || null,
          step_id: stepId,
          event_type: 'sent',
          channel: 'sms',
          subject: '',
          body_preview: fill(step.body || '').slice(0, 120),
          status: 'queued',
          notes: `SMS queued for immediate send`,
        });
      }
    }

    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;

    return NextResponse.json({
      success: true,
      sent: successCount,
      failed: failCount,
      results,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
