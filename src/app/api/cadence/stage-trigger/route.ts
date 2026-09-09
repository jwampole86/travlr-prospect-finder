import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

/**
 * POST /api/cadence/stage-trigger
 * Auto-triggers SMS/email cadence enrollments when leads hit stage thresholds:
 *   - interested / follow_up_scheduled / questionnaire_sent → enroll in follow-up sequence
 *   - no_answer / voicemail / busy                          → enroll in retry sequence
 *   - callback / proposal_conversation                      → enroll in schedule/proposal sequence
 *   - not_interested                                        → mark closed_dead, pause all enrollments
 */

const resend = new Resend(process.env.RESEND_API_KEY);
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://travlrpro3047.builtwithrocket.new';

// Outcome → sequence tag mapping
const OUTCOME_SEQUENCE_MAP: Record<string, { tag: string; stageUpdate: string; label: string }> = {
  interested:            { tag: 'follow_up',   stageUpdate: 'interested',    label: 'Follow-Up Sequence' },
  follow_up_scheduled:   { tag: 'follow_up',   stageUpdate: 'interested',    label: 'Follow-Up Sequence' },
  questionnaire_sent:    { tag: 'follow_up',   stageUpdate: 'interested',    label: 'Follow-Up Sequence' },
  no_answer:             { tag: 'retry',        stageUpdate: 'nurturing',     label: 'Retry Sequence' },
  voicemail:             { tag: 'retry',        stageUpdate: 'nurturing',     label: 'Retry Sequence' },
  busy:                  { tag: 'retry',        stageUpdate: 'nurturing',     label: 'Retry Sequence' },
  callback:              { tag: 'schedule',     stageUpdate: 'interested',    label: 'Callback Schedule Sequence' },
  proposal_conversation: { tag: 'schedule',     stageUpdate: 'proposal_sent', label: 'Proposal Sequence' },
  not_interested:        { tag: 'closed_dead',  stageUpdate: 'closed_dead',   label: 'Closed Dead' },
};

export async function POST(req: NextRequest) {
  let body: { leadId?: string; callOutcome?: string; agentName?: string; notes?: string } = {};

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { leadId, callOutcome, agentName, notes } = body;

  if (!leadId || !callOutcome) {
    return NextResponse.json({ error: 'leadId and callOutcome are required' }, { status: 400 });
  }

  const mapping = OUTCOME_SEQUENCE_MAP[callOutcome];
  if (!mapping) {
    return NextResponse.json({ skipped: true, reason: 'No cadence mapping for this outcome' });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const result = {
    leadId,
    callOutcome,
    sequenceTag: mapping.tag,
    stageUpdated: false,
    enrolled: false,
    notificationSent: false,
    sequenceName: mapping.label,
    errors: [] as string[],
  };

  try {
    // 1. Load lead
    const { data: lead, error: leadErr } = await supabase
      .from('leads')
      .select('id, first_name, last_name, email, phone, sms_opt_in, email_opt_in, do_not_contact, stage, address')
      .eq('id', leadId)
      .single();

    if (leadErr || !lead) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
    }

    if (lead.do_not_contact) {
      return NextResponse.json({ skipped: true, reason: 'Lead is do_not_contact' });
    }

    // 2. Update lead stage
    if (mapping.stageUpdate && lead.stage !== mapping.stageUpdate) {
      const { error: stageErr } = await supabase
        .from('leads')
        .update({
          stage: mapping.stageUpdate,
          last_contacted_at: new Date().toISOString(),
        })
        .eq('id', leadId);

      if (stageErr) {
        result.errors.push(`Stage update failed: ${stageErr.message}`);
      } else {
        result.stageUpdated = true;
      }
    }

    // 3. Handle closed_dead — pause all active enrollments
    if (mapping.tag === 'closed_dead') {
      await supabase
        .from('cadence_enrollments')
        .update({ status: 'paused' })
        .eq('lead_id', leadId)
        .eq('status', 'active');

      return NextResponse.json({ ...result, enrolled: false, reason: 'Lead marked closed_dead, enrollments paused' });
    }

    // 4. Find matching sequence by tag/name
    const { data: sequences } = await supabase
      .from('cadence_sequences')
      .select('id, name, steps, is_active')
      .eq('is_active', true)
      .ilike('name', `%${mapping.tag}%`)
      .limit(1);

    // Fallback: find default sequence if no tag match
    let targetSeq = sequences?.[0];
    if (!targetSeq) {
      const { data: defaultSeq } = await supabase
        .from('cadence_sequences')
        .select('id, name, steps, is_active')
        .eq('is_active', true)
        .eq('is_default', true)
        .single();
      targetSeq = defaultSeq ?? undefined;
    }

    if (!targetSeq) {
      result.errors.push('No matching active sequence found');
      return NextResponse.json(result);
    }

    // 5. Enroll lead (upsert — won't duplicate)
    const steps: Array<{ delay_days: number; delay_hours: number }> = Array.isArray(targetSeq.steps) ? targetSeq.steps : [];
    const firstStep = steps[0];
    const nextSendAt = firstStep
      ? new Date(Date.now() + (firstStep.delay_days * 86400000) + (firstStep.delay_hours * 3600000)).toISOString()
      : new Date(Date.now() + 3600000).toISOString(); // 1 hour default

    const { error: enrollErr } = await supabase
      .from('cadence_enrollments')
      .upsert({
        lead_id: leadId,
        sequence_id: targetSeq.id,
        current_step: 0,
        status: 'active',
        next_send_at: nextSendAt,
        enrolled_at: new Date().toISOString(),
      }, { onConflict: 'lead_id,sequence_id', ignoreDuplicates: false });

    if (enrollErr) {
      result.errors.push(`Enrollment failed: ${enrollErr.message}`);
    } else {
      result.enrolled = true;
      // Update lead's next scheduled touch
      await supabase
        .from('leads')
        .update({ next_scheduled_touch_at: nextSendAt })
        .eq('id', leadId);
    }

    // 6. Send immediate notification email for high-priority outcomes
    const highPriorityOutcomes = ['interested', 'callback', 'proposal_conversation', 'follow_up_scheduled'];
    if (highPriorityOutcomes.includes(callOutcome) && lead.email && lead.email_opt_in) {
      const leadName = [lead.first_name, lead.last_name].filter(Boolean).join(' ') || 'there';
      const outcomeLabels: Record<string, string> = {
        interested: 'expressed interest',
        callback: 'requested a callback',
        proposal_conversation: 'had a proposal conversation',
        follow_up_scheduled: 'scheduled a follow-up',
      };
      const outcomeLabel = outcomeLabels[callOutcome] || callOutcome;

      try {
        await resend.emails.send({
          from: 'TRAVLR <onboarding@resend.dev>',
          to: [lead.email],
          subject: `Great news — next steps for your property`,
          html: buildFollowUpEmail(leadName, outcomeLabel, lead.address || '', agentName || 'TRAVLR Team', notes || ''),
        });
        result.notificationSent = true;
      } catch (emailErr) {
        result.errors.push(`Email notification failed: ${emailErr instanceof Error ? emailErr.message : 'Unknown'}`);
      }
    }

    // 7. Log the stage trigger event
    try {
      await supabase.from('admin_event_log').insert({
        event_type: 'cadence_stage_triggered',
        event_category: 'lead_change',
        lead_id: leadId,
        title: `Cadence auto-triggered: ${mapping.label}`,
        description: `Call outcome "${callOutcome}" triggered enrollment in ${targetSeq.name}`,
        new_value: {
          call_outcome: callOutcome,
          sequence_id: targetSeq.id,
          sequence_name: targetSeq.name,
          stage_update: mapping.stageUpdate,
          next_send_at: nextSendAt,
          agent_name: agentName,
        },
        severity: 'info',
        event_timestamp: new Date().toISOString(),
      });
    } catch { /* non-blocking */ }

    return NextResponse.json(result);
  } catch (err) {
    result.errors.push(err instanceof Error ? err.message : 'Unknown error');
    return NextResponse.json(result, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    description: 'Auto-trigger cadence enrollment based on call outcome stage thresholds',
    outcomes: Object.keys(OUTCOME_SEQUENCE_MAP),
    usage: 'POST /api/cadence/stage-trigger with { leadId, callOutcome, agentName?, notes? }',
  });
}

// ─── Email template ───────────────────────────────────────────────────────────

function buildFollowUpEmail(
  leadName: string,
  outcomeLabel: string,
  address: string,
  agentName: string,
  notes: string
): string {
  return `<!DOCTYPE html>
<html>
<body style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#333">
  <p>Hi ${leadName},</p>
  <p>Thank you for speaking with ${agentName} today — we're glad you ${outcomeLabel}!</p>
  ${address ? `<p>We're excited about the potential for your property at <strong>${address}</strong>.</p>` : ''}
  ${notes ? `<p><em>${notes}</em></p>` : ''}
  <p>Our team will be in touch shortly with your personalized rental estimate and next steps.</p>
  <p style="margin-top:24px">Best,<br><strong>TRAVLR Team</strong></p>
  <hr style="margin-top:32px;border:none;border-top:1px solid #eee">
  <p style="font-size:11px;color:#999;margin-top:12px">
    You're receiving this because you spoke with a TRAVLR agent.
    <a href="${SITE_URL}/api/cadence/unsubscribe" style="color:#999">Unsubscribe</a>
  </p>
</body>
</html>`;
}
