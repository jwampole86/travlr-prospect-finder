import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

/**
 * POST /api/cadence/log-touchpoint
 * Called when an agent places a call or sends manual outreach from lead detail.
 * - Updates lead's last_contacted_at
 * - Advances cadence_step if lead is still in nurturing
 * - Records the action in cadence_send_log for audit trail
 */
export async function POST(req: NextRequest) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  let body: {
    lead_id: string;
    channel: 'call' | 'sms' | 'email';
    agent_id?: string;
    agent_name?: string;
    notes?: string;
    outcome?: string;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { lead_id, channel, agent_id, agent_name, notes, outcome } = body;

  if (!lead_id || !channel) {
    return NextResponse.json({ error: 'lead_id and channel are required' }, { status: 400 });
  }

  try {
    // Load lead current state
    const { data: lead, error: leadErr } = await supabase
      .from('leads')
      .select('id, stage, cadence_step, first_name, last_name, address')
      .eq('id', lead_id)
      .single();

    if (leadErr || !lead) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
    }

    const now = new Date().toISOString();
    const isNurturing = lead.stage === 'nurturing';
    const currentStep = lead.cadence_step ?? 0;
    const nextStep = isNurturing ? currentStep + 1 : currentStep;

    // Update lead: last_contacted_at + advance cadence_step if nurturing
    const leadUpdate: Record<string, unknown> = {
      last_contacted_at: now,
      updated_at: now,
    };
    if (isNurturing) {
      leadUpdate.cadence_step = nextStep;
    }

    await supabase.from('leads').update(leadUpdate).eq('id', lead_id);

    // Find active cadence enrollment to link the log entry
    const { data: enrollment } = await supabase
      .from('cadence_enrollments')
      .select('id, sequence_id, current_step')
      .eq('lead_id', lead_id)
      .eq('status', 'active')
      .order('enrolled_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    // Advance enrollment step if nurturing
    if (enrollment && isNurturing) {
      await supabase
        .from('cadence_enrollments')
        .update({
          current_step: enrollment.current_step + 1,
          last_sent_at: now,
        })
        .eq('id', enrollment.id);
    }

    // Record in cadence_send_log
    const logEntry = {
      enrollment_id: enrollment?.id || null,
      lead_id,
      sequence_id: enrollment?.sequence_id || null,
      step_number: enrollment?.current_step ?? currentStep,
      channel,
      status: 'sent',
      sent_at: now,
      created_at: now,
      metadata: {
        source: 'manual_agent_outreach',
        agent_id: agent_id || null,
        agent_name: agent_name || null,
        notes: notes || null,
        outcome: outcome || null,
        stage_at_time: lead.stage,
        cadence_step_before: currentStep,
        cadence_step_after: nextStep,
      },
    };

    await supabase.from('cadence_send_log').insert(logEntry);

    // Log admin event for audit trail
    await supabase.from('admin_event_log').insert({
      event_type: `manual_${channel}_outreach`,
      event_category: 'user_action',
      lead_id,
      title: `Agent placed ${channel} outreach`,
      description: `${agent_name || 'Agent'} manually contacted lead ${lead.first_name || ''} ${lead.last_name || ''} via ${channel}${notes ? `: ${notes.slice(0, 100)}` : ''}`,
      severity: 'info',
      new_value: {
        channel,
        outcome: outcome || null,
        cadence_step_advanced: isNurturing,
        new_cadence_step: nextStep,
      },
      event_timestamp: now,
    });

    return NextResponse.json({
      success: true,
      lead_id,
      channel,
      cadence_step_advanced: isNurturing,
      new_cadence_step: nextStep,
      last_contacted_at: now,
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
    description: 'Log a manual agent touchpoint as a cadence event',
    usage: 'POST /api/cadence/log-touchpoint',
    body: {
      lead_id: 'string (required)',
      channel: 'call | sms | email (required)',
      agent_id: 'string (optional)',
      agent_name: 'string (optional)',
      notes: 'string (optional)',
      outcome: 'string (optional)',
    },
  });
}
