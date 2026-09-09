import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyJobRequest } from '@/lib/jobAuth';

/**
 * POST /api/sequence-job
 * Background job that:
 * 1. Polls all active sequences with auto-enrollment triggers
 * 2. Finds leads matching each trigger condition (score threshold, stage change, lead age)
 * 3. Auto-enrolls matching leads that aren't already enrolled
 * 4. Schedules pending sends for enrolled leads per sequence timing rules
 *
 * Designed to be called by a cron job or scheduled task (e.g., every 15 minutes).
 * Can also be triggered manually from the Follow-Up Sequences UI by an authenticated admin.
 */
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
    sequencesChecked: 0,
    leadsEvaluated: 0,
    newEnrollments: 0,
    sendsScheduled: 0,
    errors: [] as string[],
    timestamp: new Date().toISOString(),
  };

  try {
    // 1. Load all active sequences with auto-enrollment triggers
    const { data: sequences, error: seqErr } = await supabase
      .from('follow_up_sequences')
      .select('id, name, steps, auto_enroll_trigger')
      .eq('is_active', true);

    if (seqErr) {
      results.errors.push(`Failed to load sequences: ${seqErr.message}`);
      return NextResponse.json(results, { status: 500 });
    }

    const activeSequences = (sequences || []).filter(seq => {
      const trigger = seq.auto_enroll_trigger as AutoEnrollTrigger | null;
      return trigger?.enabled === true;
    });

    results.sequencesChecked = activeSequences.length;

    // 2. Load all leads for evaluation
    const { data: leads, error: leadsErr } = await supabase
      .from('leads')
      .select('id, prospect_score, stage, last_contacted_at, created_at, updated_at')
      .not('stage', 'eq', 'Not a Fit');

    if (leadsErr) {
      results.errors.push(`Failed to load leads: ${leadsErr.message}`);
      return NextResponse.json(results, { status: 500 });
    }

    results.leadsEvaluated = (leads || []).length;

    // 3. Load existing enrollments to avoid duplicates
    const { data: existingEnrollments } = await supabase
      .from('sequence_enrollments')
      .select('lead_id, sequence_id')
      .eq('status', 'active');

    const enrolledSet = new Set(
      (existingEnrollments || []).map(e => `${e.lead_id}:${e.sequence_id}`)
    );

    // 4. Evaluate each sequence's trigger conditions against all leads
    const newEnrollments: SequenceEnrollment[] = [];

    for (const seq of activeSequences) {
      const trigger = seq.auto_enroll_trigger as AutoEnrollTrigger;
      const steps = (seq.steps as SequenceStep[]) || [];

      for (const lead of leads || []) {
        const key = `${lead.id}:${seq.id}`;
        if (enrolledSet.has(key)) continue; // already enrolled

        let shouldEnroll = false;
        let enrollReason = '';

        // Condition A: Score threshold
        if (trigger.scoreThreshold !== null && trigger.scoreThreshold !== undefined) {
          const score = lead.prospect_score ?? 0;
          if (trigger.scoreDirection === 'above' && score >= trigger.scoreThreshold) {
            shouldEnroll = true;
            enrollReason = `Score ${score} ≥ threshold ${trigger.scoreThreshold}`;
          } else if (trigger.scoreDirection === 'below' && score <= trigger.scoreThreshold) {
            shouldEnroll = true;
            enrollReason = `Score ${score} ≤ threshold ${trigger.scoreThreshold}`;
          }
        }

        // Condition B: Stage change
        if (!shouldEnroll && trigger.stageChangeTo) {
          if (lead.stage === trigger.stageChangeTo) {
            shouldEnroll = true;
            enrollReason = `Stage is "${lead.stage}"`;
          }
        }

        // Condition C: Lead age (days without contact)
        if (!shouldEnroll && trigger.leadAgeDays !== null && trigger.leadAgeDays !== undefined) {
          const lastContact = lead.last_contacted_at
            ? new Date(lead.last_contacted_at)
            : new Date(lead.created_at);
          const daysSinceContact = Math.floor(
            (Date.now() - lastContact.getTime()) / (1000 * 60 * 60 * 24)
          );
          if (daysSinceContact >= trigger.leadAgeDays) {
            shouldEnroll = true;
            enrollReason = `${daysSinceContact} days without contact (threshold: ${trigger.leadAgeDays})`;
          }
        }

        if (shouldEnroll) {
          newEnrollments.push({
            lead_id: lead.id,
            sequence_id: seq.id,
            enrolled_at: new Date().toISOString(),
            enrolled_by: null,
            status: 'active',
            current_step: 0,
            enroll_reason: enrollReason,
            next_send_at: computeNextSendAt(steps, 0),
          });
          enrolledSet.add(key); // prevent duplicate within this run
        }
      }
    }

    // 5. Insert new enrollments
    if (newEnrollments.length > 0) {
      const { error: enrollErr } = await supabase
        .from('sequence_enrollments')
        .upsert(newEnrollments, { onConflict: 'lead_id,sequence_id', ignoreDuplicates: true });

      if (enrollErr) {
        results.errors.push(`Enrollment insert error: ${enrollErr.message}`);
      } else {
        results.newEnrollments = newEnrollments.length;
      }
    }

    // 6. Schedule pending sends for active enrollments
    const { data: pendingEnrollments } = await supabase
      .from('sequence_enrollments')
      .select('id, lead_id, sequence_id, current_step, next_send_at')
      .eq('status', 'active')
      .lte('next_send_at', new Date().toISOString())
      .not('next_send_at', 'is', null);

    let sendsScheduled = 0;
    for (const enrollment of pendingEnrollments || []) {
      // Find the sequence to get step details
      const seq = activeSequences.find(s => s.id === enrollment.sequence_id);
      if (!seq) continue;

      const steps = (seq.steps as SequenceStep[]) || [];
      const currentStep = steps[enrollment.current_step];
      if (!currentStep) {
        // Sequence complete — mark enrollment as completed
        await supabase
          .from('sequence_enrollments')
          .update({ status: 'completed', completed_at: new Date().toISOString() })
          .eq('id', enrollment.id);
        continue;
      }

      // Insert a scheduled_sends record for this step
      const { error: sendErr } = await supabase
        .from('scheduled_sends')
        .insert({
          enrollment_id: enrollment.id,
          lead_id: enrollment.lead_id,
          sequence_id: enrollment.sequence_id,
          step_number: enrollment.current_step,
          channel: currentStep.channel,
          template_id: currentStep.template_id ?? null,
          scheduled_at: new Date().toISOString(),
          status: 'pending',
        });

      if (!sendErr) {
        sendsScheduled++;
        // Advance enrollment to next step
        const nextStep = enrollment.current_step + 1;
        const nextSendAt = computeNextSendAt(steps, nextStep);
        await supabase
          .from('sequence_enrollments')
          .update({
            current_step: nextStep,
            next_send_at: nextSendAt,
            last_sent_at: new Date().toISOString(),
            ...(nextStep >= steps.length ? { status: 'completed', completed_at: new Date().toISOString() } : {}),
          })
          .eq('id', enrollment.id);
      }
    }

    results.sendsScheduled = sendsScheduled;

    return NextResponse.json(results);
  } catch (err) {
    results.errors.push(err instanceof Error ? err.message : 'Unknown error');
    return NextResponse.json(results, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    description: 'Sequence background job — POST to trigger a run',
    usage: 'POST /api/sequence-job with optional x-job-secret header',
  });
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface AutoEnrollTrigger {
  enabled: boolean;
  scoreThreshold: number | null;
  scoreDirection: 'above' | 'below';
  stageChangeTo: string | null;
  leadAgeDays: number | null;
}

interface SequenceStep {
  channel: 'email' | 'sms' | 'call';
  template_id: string | null;
  delay_days: number;
  delay_hours: number;
  trigger_type: string;
}

interface SequenceEnrollment {
  lead_id: string;
  sequence_id: string;
  enrolled_at: string;
  enrolled_by: string | null;
  status: string;
  current_step: number;
  enroll_reason: string;
  next_send_at: string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function computeNextSendAt(steps: SequenceStep[], stepIndex: number): string | null {
  if (stepIndex >= steps.length) return null;
  const step = steps[stepIndex];
  const delayMs =
    ((step.delay_days || 0) * 24 * 60 * 60 * 1000) +
    ((step.delay_hours || 0) * 60 * 60 * 1000);
  return new Date(Date.now() + delayMs).toISOString();
}
