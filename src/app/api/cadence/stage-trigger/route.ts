import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { dispatchSMS } from '@/lib/services/twilioService';

/**
 * POST /api/cadence/stage-trigger
 * Auto-triggers SMS/email cadence enrollments when leads hit stage thresholds:
 *   - interested / follow_up_scheduled / questionnaire_sent → enroll in follow-up sequence
 *   - no_answer / voicemail / busy                          → enroll in retry sequence
 *   - callback / proposal_conversation                      → enroll in schedule/proposal sequence
 *   - not_interested                                        → mark closed_dead, pause all enrollments
 */

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://travlrpro3047.builtwithrocket.new';

// Outcome → sequence tag mapping (stageUpdate values must match the lead_stage
// enum exactly: 'New Lead' | 'Contacted' | 'Interested' | 'Proposal Sent' | 'Under Contract' | 'Live' | 'Not a Fit')
const OUTCOME_SEQUENCE_MAP: Record<string, { tag: string; stageUpdate: string; label: string }> = {
  interested:            { tag: 'follow_up',   stageUpdate: 'Interested',     label: 'Follow-Up Sequence' },
  follow_up_scheduled:   { tag: 'follow_up',   stageUpdate: 'Interested',     label: 'Follow-Up Sequence' },
  questionnaire_sent:    { tag: 'follow_up',   stageUpdate: 'Interested',     label: 'Follow-Up Sequence' },
  no_answer:             { tag: 'retry',        stageUpdate: 'Contacted',     label: 'Retry Sequence' },
  voicemail:             { tag: 'retry',        stageUpdate: 'Contacted',     label: 'Retry Sequence' },
  busy:                  { tag: 'retry',        stageUpdate: 'Contacted',     label: 'Retry Sequence' },
  callback:              { tag: 'schedule',     stageUpdate: 'Interested',    label: 'Callback Schedule Sequence' },
  proposal_conversation: { tag: 'schedule',     stageUpdate: 'Proposal Sent', label: 'Proposal Sequence' },
  not_interested:        { tag: 'closed_dead',  stageUpdate: 'Not a Fit',     label: 'Closed Dead' },
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

  // Trusted server-to-server route — use the service role key so RLS doesn't block
  // lead updates / cadence enrollment / questionnaire creation. Falls back to anon
  // key only if the service role key hasn't been configured (placeholder value).
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const hasRealServiceRoleKey = Boolean(serviceRoleKey && !serviceRoleKey.includes('your-supabase-service-role-key'));
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    hasRealServiceRoleKey ? serviceRoleKey! : process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
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
    // 1. Load lead — leads has no first_name/last_name/phone/email/do_not_contact columns;
    // use the real contact_name/contact_phone fields and check DNC via lead_enrichments.
    const { data: lead, error: leadErr } = await supabase
      .from('leads')
      .select('id, contact_name, contact_phone, city, state, sms_opt_in, email_opt_in, stage, address')
      .eq('id', leadId)
      .single();

    if (leadErr || !lead) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
    }

    const { data: enrichment } = await supabase
      .from('lead_enrichments')
      .select('do_not_contact')
      .eq('lead_id', leadId)
      .maybeSingle();

    if (enrichment?.do_not_contact) {
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

    // 5. Enroll lead (upsert — won't duplicate). No active sequence configured yet is not
    // fatal — the stage update and any direct notification (e.g. questionnaire SMS) below
    // must still happen regardless of whether cadence enrollment is available.
    if (!targetSeq) {
      result.errors.push('No matching active sequence found');
    } else {
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
    }


    // 6. questionnaire_sent — actually create and text the homeowner their real questionnaire link
    // (previously this outcome only enrolled a generic cadence and never sent anything).
    if (callOutcome === 'questionnaire_sent' && lead.contact_phone && lead.sms_opt_in !== false) {
      try {
        const { data: existingQ } = await supabase
          .from('homeowner_questionnaires')
          .select('unique_token')
          .eq('lead_id', leadId)
          .maybeSingle();

        let token = existingQ?.unique_token;
        if (!token) {
          const { data: newQ, error: qErr } = await supabase
            .from('homeowner_questionnaires')
            .insert({
              lead_id: leadId,
              questionnaire_status: 'not_started',
              prefilled_address: lead.address,
              prefilled_city: lead.city,
              prefilled_state: lead.state,
              homeowner_name: lead.contact_name,
              confirmed_address: lead.address,
            })
            .select('unique_token')
            .single();
          if (qErr) result.errors.push(`Questionnaire creation failed: ${qErr.message}`);
          token = newQ?.unique_token;
        }

        if (token) {
          const questionnaireUrl = `${SITE_URL}/questionnaire?token=${token}`;
          const smsResult = await dispatchSMS({
            to: lead.contact_phone,
            body: `Hi ${lead.contact_name || 'there'} — here's the quick questionnaire we discussed for ${lead.address || 'your property'}: ${questionnaireUrl}`,
            leadId,
          });
          result.notificationSent = smsResult.success;
          if (!smsResult.success) result.errors.push(smsResult.error || 'Questionnaire SMS failed to send');
        }
      } catch (qSendErr) {
        result.errors.push(qSendErr instanceof Error ? qSendErr.message : 'Failed to send questionnaire');
      }
    }

    // 7. Send immediate notification SMS for other high-priority outcomes
    // (leads has no real email column, so this uses the same reliable SMS channel as above).
    const highPriorityOutcomes = ['interested', 'callback', 'proposal_conversation', 'follow_up_scheduled'];
    if (highPriorityOutcomes.includes(callOutcome) && lead.contact_phone && lead.sms_opt_in !== false) {
      const leadName = lead.contact_name || 'there';
      const outcomeLabels: Record<string, string> = {
        interested: 'expressed interest',
        callback: 'requested a callback',
        proposal_conversation: 'had a proposal conversation',
        follow_up_scheduled: 'scheduled a follow-up',
      };
      const outcomeLabel = outcomeLabels[callOutcome] || callOutcome;

      try {
        const smsResult = await dispatchSMS({
          to: lead.contact_phone,
          body: `Hi ${leadName}, thanks for speaking with ${agentName || 'our team'} today — glad you ${outcomeLabel}! We'll follow up shortly with next steps for ${lead.address || 'your property'}.`,
          leadId,
        });
        result.notificationSent = smsResult.success;
        if (!smsResult.success) result.errors.push(smsResult.error || 'Follow-up SMS failed to send');
      } catch (smsErr) {
        result.errors.push(`SMS notification failed: ${smsErr instanceof Error ? smsErr.message : 'Unknown'}`);
      }
    }

    // 8. Log the stage trigger event
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

