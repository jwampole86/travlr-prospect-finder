import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getResendClient, getResendFrom } from '@/lib/email/resend';
import { dispatchSMS } from '@/lib/services/twilioService';
import { verifyJobRequest } from '@/lib/jobAuth';

/**
 * POST /api/cadence/run
 * Cadence engine cron job:
 * 1. Finds all active enrollments where next_send_at <= now
 * 2. Checks opt-in flags before sending
 * 3. Dispatches email (Resend) or SMS (Twilio) per step config
 * 4. Advances enrollment step or marks completed/closed_dead
 * 5. Auto-escalates on engagement signals
 */

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://travlrpro3047.builtwithrocket.new';

export async function POST(req: NextRequest) {
  const auth = await verifyJobRequest(req);
  if (!auth.authorized) {
    return NextResponse.json({ error: auth.reason || 'Unauthorized' }, { status: 401 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const results = {
    enrollmentsChecked: 0,
    sendsDispatched: 0,
    skippedOptOut: 0,
    escalations: 0,
    closedDead: 0,
    errors: [] as string[],
    timestamp: new Date().toISOString(),
  };

  try {
    const resend = getResendClient();
    const emailFrom = getResendFrom();

    // Load due enrollments
    const { data: enrollments, error: enrollErr } = await supabase
      .from('cadence_enrollments')
      .select(`
        id, lead_id, sequence_id, current_step, status, next_send_at,
        cadence_sequences (id, name, steps, is_active)
      `)
      .eq('status', 'active')
      .lte('next_send_at', new Date().toISOString())
      .not('next_send_at', 'is', null)
      .limit(100);

    if (enrollErr) {
      results.errors.push(`Failed to load enrollments: ${enrollErr.message}`);
      return NextResponse.json(results, { status: 500 });
    }

    results.enrollmentsChecked = (enrollments || []).length;

    for (const enrollment of enrollments || []) {
      try {
        const seq = enrollment.cadence_sequences as { id: string; name: string; steps: CadenceStep[]; is_active: boolean } | null;
        if (!seq?.is_active) continue;

        const steps: CadenceStep[] = Array.isArray(seq.steps) ? seq.steps : [];
        const currentStep = steps[enrollment.current_step];

        // No more steps → mark completed, check if closed_dead
        if (!currentStep) {
          await supabase
            .from('cadence_enrollments')
            .update({ status: 'completed', completed_at: new Date().toISOString() })
            .eq('id', enrollment.id);

          // Auto-set lead to closed_dead if no engagement
          const { data: lead } = await supabase
            .from('leads')
            .select('id, stage, cadence_step')
            .eq('id', enrollment.lead_id)
            .single();

          if (lead && !['engaged', 'human_outreach', 'closed_won'].includes(lead.stage || '')) {
            await supabase
              .from('leads')
              .update({ stage: 'closed_dead' })
              .eq('id', enrollment.lead_id);
            results.closedDead++;

            // Log event
            await logEvent(supabase, {
              event_type: 'cadence_completed_no_engagement',
              event_category: 'lead_change',
              lead_id: enrollment.lead_id,
              title: 'Lead auto-set to closed_dead',
              description: 'Completed full cadence with no engagement signal',
              new_value: { stage: 'closed_dead' },
            });
          }
          continue;
        }

        // Load lead for opt-in check and personalization
        const { data: lead } = await supabase
          .from('leads')
          .select('id, first_name, last_name, address, email, phone, sms_opt_in, email_opt_in, do_not_contact, stage')
          .eq('id', enrollment.lead_id)
          .single();

        if (!lead || lead.do_not_contact) {
          await supabase.from('cadence_enrollments').update({ status: 'paused' }).eq('id', enrollment.id);
          continue;
        }

        const channel = currentStep.channel;

        // Opt-in compliance check
        if (channel === 'sms' && !lead.sms_opt_in) {
          results.skippedOptOut++;
          await logSend(supabase, { enrollment_id: enrollment.id, lead_id: lead.id, sequence_id: enrollment.sequence_id, step_number: enrollment.current_step, channel: 'sms', status: 'skipped_opt_out' });
          await advanceEnrollment(supabase, enrollment, steps);
          continue;
        }
        if (channel === 'email' && !lead.email_opt_in) {
          results.skippedOptOut++;
          await logSend(supabase, { enrollment_id: enrollment.id, lead_id: lead.id, sequence_id: enrollment.sequence_id, step_number: enrollment.current_step, channel: 'email', status: 'skipped_opt_out' });
          await advanceEnrollment(supabase, enrollment, steps);
          continue;
        }

        // Build personalized message
        const leadName = [lead.first_name, lead.last_name].filter(Boolean).join(' ') || 'there';
        const vars: Record<string, string> = {
          '{{leadName}}': leadName,
          '{{address}}': lead.address || '',
          '{{agentName}}': 'TRAVLR Team',
          '{{unsubscribeUrl}}': await getUnsubscribeUrl(supabase, lead.id, enrollment.id),
        };

        let sent = false;
        let providerId: string | undefined;
        let sendError: string | undefined;

        if (channel === 'email' && lead.email) {
          const subject = resolveVars(currentStep.subject || 'A message from TRAVLR', vars);
          const html = buildEmailHtml(leadName, currentStep.template_key, vars);
          const { data: emailData, error: emailErr } = await resend.emails.send({
            from: emailFrom,
            to: [lead.email],
            subject,
            html,
          });
          sent = !emailErr;
          providerId = emailData?.id;
          sendError = emailErr?.message;
        } else if (channel === 'sms' && lead.phone) {
          // Twilio SMS dispatch (scaffolded — requires configured credentials)
          const smsResult = await dispatchSMSForCadence(lead.phone, resolveVars(getSMSTemplate(currentStep.template_key), vars), lead.id);
          sent = smsResult.success;
          providerId = smsResult.messageSid;
          sendError = smsResult.error;
        }

        // Log the send
        await logSend(supabase, {
          enrollment_id: enrollment.id,
          lead_id: lead.id,
          sequence_id: enrollment.sequence_id,
          step_number: enrollment.current_step,
          channel,
          status: sent ? 'sent' : 'failed',
          provider_message_id: providerId,
          error_message: sendError,
        });

        if (sent) {
          results.sendsDispatched++;
          await supabase.from('leads').update({ last_contacted_at: new Date().toISOString() }).eq('id', lead.id);
        }

        // Advance to next step
        await advanceEnrollment(supabase, enrollment, steps);

      } catch (stepErr) {
        results.errors.push(`Enrollment ${enrollment.id}: ${stepErr instanceof Error ? stepErr.message : 'Unknown error'}`);
      }
    }

    // Auto-enroll new nurturing leads into default sequence
    const { data: defaultSeq } = await supabase
      .from('cadence_sequences')
      .select('id, steps')
      .eq('is_default', true)
      .eq('is_active', true)
      .single();

    if (defaultSeq) {
      const { data: newLeads } = await supabase
        .from('leads')
        .select('id')
        .eq('stage', 'nurturing')
        .is('next_scheduled_touch_at', null)
        .limit(50);

      for (const lead of newLeads || []) {
        const steps: CadenceStep[] = Array.isArray(defaultSeq.steps) ? defaultSeq.steps : [];
        const firstStep = steps[0];
        const nextSendAt = firstStep
          ? new Date(Date.now() + (firstStep.delay_days * 86400000) + (firstStep.delay_hours * 3600000)).toISOString()
          : new Date().toISOString();

        await supabase.from('cadence_enrollments').upsert({
          lead_id: lead.id,
          sequence_id: defaultSeq.id,
          current_step: 0,
          status: 'active',
          next_send_at: nextSendAt,
          enrolled_at: new Date().toISOString(),
        }, { onConflict: 'lead_id,sequence_id', ignoreDuplicates: true });

        await supabase.from('leads').update({ next_scheduled_touch_at: nextSendAt }).eq('id', lead.id);
      }
    }

    return NextResponse.json(results);
  } catch (err) {
    results.errors.push(err instanceof Error ? err.message : 'Unknown error');
    return NextResponse.json(results, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    description: 'Cadence engine run job — POST to trigger',
    usage: 'POST /api/cadence/run with x-job-secret header',
    complianceNote: 'Respects sms_opt_in and email_opt_in flags. Never sends to do_not_contact leads.',
  });
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

interface CadenceStep {
  step: number;
  label: string;
  channel: 'email' | 'sms';
  delay_days: number;
  delay_hours: number;
  template_key: string;
  subject: string | null;
}

function resolveVars(template: string, vars: Record<string, string>): string {
  return Object.entries(vars).reduce((t, [k, v]) => t.replaceAll(k, v), template);
}

async function getUnsubscribeUrl(supabase: ReturnType<typeof createClient>, leadId: string, enrollmentId: string): Promise<string> {
  const { data } = await supabase
    .from('email_unsubscribe_tokens')
    .insert({ lead_id: leadId, enrollment_id: enrollmentId })
    .select('token')
    .single();
  return data?.token ? `${SITE_URL}/api/cadence/unsubscribe?token=${data.token}` : `${SITE_URL}/unsubscribe`;
}

async function advanceEnrollment(
  supabase: ReturnType<typeof createClient>,
  enrollment: { id: string; current_step: number },
  steps: CadenceStep[]
) {
  const nextStep = enrollment.current_step + 1;
  if (nextStep >= steps.length) {
    await supabase.from('cadence_enrollments').update({
      current_step: nextStep,
      status: 'completed',
      completed_at: new Date().toISOString(),
      last_sent_at: new Date().toISOString(),
    }).eq('id', enrollment.id);
    return;
  }
  const next = steps[nextStep];
  const nextSendAt = new Date(Date.now() + (next.delay_days * 86400000) + (next.delay_hours * 3600000)).toISOString();
  await supabase.from('cadence_enrollments').update({
    current_step: nextStep,
    next_send_at: nextSendAt,
    last_sent_at: new Date().toISOString(),
  }).eq('id', enrollment.id);
}

async function logSend(supabase: ReturnType<typeof createClient>, data: {
  enrollment_id: string; lead_id: string; sequence_id: string; step_number: number;
  channel: string; status: string; provider_message_id?: string; error_message?: string;
}) {
  await supabase.from('cadence_send_log').insert({
    ...data,
    sent_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
  });
}

async function logEvent(supabase: ReturnType<typeof createClient>, data: {
  event_type: string; event_category: string; lead_id: string; title: string;
  description?: string; new_value?: Record<string, unknown>;
}) {
  await supabase.from('admin_event_log').insert({
    ...data,
    severity: 'info',
    event_timestamp: new Date().toISOString(),
  });
}

function buildEmailHtml(leadName: string, templateKey: string, vars: Record<string, string>): string {
  const unsubUrl = vars['{{unsubscribeUrl}}'] || '#';
  const templates: Record<string, string> = {
    initial_outreach: `<p>Hi ${leadName},</p><p>I came across your property and wanted to reach out about a potential short-term rental opportunity that could significantly increase your monthly income.</p><p>Would you be open to a quick conversation?</p>`,
    follow_up_1: `<p>Hi ${leadName},</p><p>Just following up on my previous message. I'd love to share some numbers specific to your property at ${vars['{{address}}'] || 'your address'}.</p>`,
    check_in: `<p>Hi ${leadName},</p><p>Checking in one more time — I have a personalized rental estimate ready for your property and would love to walk you through it.</p>`,
    proposal_introduction: `<p>Hi ${leadName},</p><p>Your personalized rental estimate is ready. Based on comparable properties in your area, your property could generate significant monthly income as a short-term rental.</p>`,
    closing: `<p>Hi ${leadName},</p><p>This is my final follow-up. If you're ever curious about what your property could earn, I'm here to help. No pressure — just reach out when the time is right.</p>`,
  };
  const body = templates[templateKey] || `<p>Hi ${leadName},</p><p>Thank you for your interest. We'd love to connect with you.</p>`;
  return `<!DOCTYPE html><html><body style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#333">
    ${body}
    <p style="margin-top:24px">Best,<br><strong>TRAVLR Team</strong></p>
    <hr style="margin-top:32px;border:none;border-top:1px solid #eee">
    <p style="font-size:11px;color:#999;margin-top:12px">
      You're receiving this because you expressed interest in short-term rental management.
      <a href="${unsubUrl}" style="color:#999">Unsubscribe</a> at any time.
    </p>
  </body></html>`;
}

function getSMSTemplate(templateKey: string): string {
  const templates: Record<string, string> = {
    initial_outreach: 'Hi {{leadName}}, this is TRAVLR. We help property owners earn more with short-term rentals. Interested in a free estimate for {{address}}? Reply YES or STOP to opt out.',
    follow_up_1: 'Hi {{leadName}}, following up from TRAVLR. Your property at {{address}} could earn significantly more as a short-term rental. Reply YES to learn more or STOP to opt out.',
    check_in: 'Hi {{leadName}}, TRAVLR here. Still interested in a free rental estimate for {{address}}? Reply YES or STOP to opt out.',
    proposal_introduction: 'Hi {{leadName}}, your rental estimate is ready! Reply YES to see what {{address}} could earn monthly. STOP to opt out.',
    closing: 'Hi {{leadName}}, last message from TRAVLR. Reach out anytime if you want to explore short-term rental income for {{address}}. STOP to opt out.',
  };
  return templates[templateKey] || 'Hi {{leadName}}, this is TRAVLR. Reply STOP to opt out.';
}

async function dispatchSMSForCadence(to: string, body: string, leadId: string): Promise<{ success: boolean; messageSid?: string; error?: string }> {
  const result = await dispatchSMS({ to, body, leadId });
  return { success: result.success, messageSid: result.messageSid, error: result.error };
}
