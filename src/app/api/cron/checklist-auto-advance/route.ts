import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyJobRequest } from '@/lib/jobAuth';

/**
 * POST /api/cron/checklist-auto-advance
 * Automatically transitions checklist steps from 'pending' → 'in_progress'
 * after a configurable delay (default: 7 days). Logs auto-advance events to
 * the Activity Timeline and inserts agent reminder notifications.
 *
 * Protected by SEQUENCE_JOB_SECRET header (cron) or an authenticated admin session (UI).
 * Designed to run daily via an external cron scheduler.
 */

const STEP_LABELS: Record<number, string> = {
  1: 'Assessment & Prep',
  2: 'Legal & Compliance',
  3: 'Photography & Content',
  4: 'Operations Setup',
  5: 'Listing Creation',
  6: 'Pre-Launch QA',
};

export async function POST(req: NextRequest) {
  const auth = await verifyJobRequest(req);
  if (!auth.authorized) {
    return NextResponse.json({ error: auth.reason || 'Unauthorized' }, { status: 401 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const runId = `auto_advance_${Date.now()}`;
  const startedAt = new Date().toISOString();

  const results = {
    runId,
    startedAt,
    completedAt: '',
    stepsScanned: 0,
    stepsAdvanced: 0,
    notificationsSent: 0,
    errors: [] as string[],
  };

  try {
    // Load auto-advance config (delay in days, default 7)
    const { data: configRow } = await supabase
      .from('checklist_auto_advance_config')
      .select('delay_days, enabled')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    const delayDays: number = configRow?.delay_days ?? 7;
    const enabled: boolean = configRow?.enabled ?? true;

    if (!enabled) {
      results.completedAt = new Date().toISOString();
      return NextResponse.json({ ...results, message: 'Auto-advance is disabled' });
    }

    const cutoffDate = new Date(Date.now() - delayDays * 24 * 60 * 60 * 1000).toISOString();

    // Find all pending steps that have been pending longer than the delay
    // We check updated_at (or created_at fallback) to determine how long they've been in current step
    const { data: staleSteps, error: stepsErr } = await supabase
      .from('str_checklist_steps')
      .select('id, lead_id, homeowner_user_id, step_number, step_key, status, updated_at, created_at')
      .eq('status', 'pending')
      .lt('updated_at', cutoffDate);

    if (stepsErr) {
      results.errors.push(`Failed to load steps: ${stepsErr.message}`);
      results.completedAt = new Date().toISOString();
      return NextResponse.json(results, { status: 500 });
    }

    const steps = staleSteps ?? [];
    results.stepsScanned = steps.length;

    for (const step of steps) {
      try {
        const stepLabel = STEP_LABELS[step.step_number] ?? `Step ${step.step_number}`;

        // Advance step to in_progress
        const { error: updateErr } = await supabase
          .from('str_checklist_steps')
          .update({
            status: 'in_progress',
            source_event: 'auto_advance',
            auto_updated: true,
            updated_at: new Date().toISOString(),
          })
          .eq('id', step.id);

        if (updateErr) {
          results.errors.push(`Step ${step.id}: ${updateErr.message}`);
          continue;
        }

        results.stepsAdvanced++;

        // Get lead info for context
        const { data: leadData } = await supabase
          .from('leads')
          .select('address, city, state')
          .eq('id', step.lead_id)
          .single();

        const address = leadData?.address ?? 'Unknown property';
        const state = leadData?.state ?? null;

        // Log to activity_events
        await supabase.from('activity_events').insert({
          user_id: step.homeowner_user_id,
          lead_id: step.lead_id,
          lead_address: address,
          lead_state: state,
          event_type: 'stage_changed',
          description: `Auto-advanced: "${stepLabel}" moved to In Progress`,
          detail: `Step was pending for ${delayDays}+ days — automatically transitioned`,
          previous_value: 'pending',
          new_value: 'in_progress',
          source: 'cron_auto_advance',
          metadata: {
            step_number: step.step_number,
            step_key: step.step_key,
            delay_days: delayDays,
            auto_advance: true,
          },
          event_timestamp: new Date().toISOString(),
        });

        // Insert agent reminder notification
        // Find an agent assigned to this lead
        const { data: assignedAgent } = await supabase
          .from('leads')
          .select('assigned_agent_id')
          .eq('id', step.lead_id)
          .single();

        const agentId = assignedAgent?.assigned_agent_id;

        if (agentId) {
          await supabase.from('app_notifications').insert({
            user_id: agentId,
            type: 'checklist_auto_advance',
            title: `Checklist step auto-advanced: ${stepLabel}`,
            body: `"${stepLabel}" for ${address} has been automatically moved to In Progress after ${delayDays} days. Follow up with the homeowner to keep onboarding on track.`,
            read: false,
            metadata: {
              lead_id: step.lead_id,
              step_number: step.step_number,
              step_key: step.step_key,
              homeowner_user_id: step.homeowner_user_id,
              auto_advance: true,
            },
            created_at: new Date().toISOString(),
          });
          results.notificationsSent++;
        }
      } catch (err) {
        results.errors.push(err instanceof Error ? err.message : `Step ${step.id} error`);
      }
    }

    results.completedAt = new Date().toISOString();

    // Log cron run
    await supabase.from('cron_job_runs').insert({
      job_name: 'checklist-auto-advance',
      run_id: runId,
      started_at: startedAt,
      completed_at: results.completedAt,
      leads_scanned: results.stepsScanned,
      scores_recalculated: 0,
      reenrichment_triggered: 0,
      property_data_refreshed: results.stepsAdvanced,
      error_count: results.errors.length,
      errors: results.errors,
      status: results.errors.length === 0 ? 'success' : 'partial',
    });

    return NextResponse.json(results);
  } catch (err) {
    results.errors.push(err instanceof Error ? err.message : 'Unknown error');
    results.completedAt = new Date().toISOString();
    return NextResponse.json(results, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    description: 'Checklist auto-advance cron — moves pending steps to In Progress after configurable delay',
    schedule: 'Daily',
    usage: 'POST /api/cron/checklist-auto-advance with x-job-secret header',
    config: 'Delay controlled via checklist_auto_advance_config table (default: 7 days)',
  });
}
