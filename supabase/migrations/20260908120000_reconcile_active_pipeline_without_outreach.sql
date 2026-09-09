-- Reconcile pipeline stages that were advanced without a real outreach event.
-- This is intentionally rerunnable because imports and legacy jobs may have
-- written active stages after the original one-time correction migration.

DO $$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN
    SELECT l.id, l.address, l.created_at, l.stage
    FROM public.leads l
    WHERE l.is_synthetic IS NOT TRUE
      AND l.stage IN ('Contacted', 'Interested', 'Proposal Sent', 'Under Contract')
      AND NOT EXISTS (
        SELECT 1
        FROM public.outreach_history oh
        WHERE oh.lead_id = l.id
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.activity_events ae
        WHERE ae.lead_id = l.id
          AND ae.event_type IN (
            'CALL_CONNECTED', 'CALL_OUTCOME', 'SMS_SENT', 'EMAIL_SENT',
            'OUTREACH_RECORDED', 'STAGE_ADVANCED_BY_AGENT',
            'APPOINTMENT_SCHEDULED', 'PROPOSAL_SENT', 'CONTRACT_SIGNED',
            'INTERESTED_MARKED', 'CONNECTED', 'VOICEMAIL_LEFT',
            'CALL_COMPLETED'
          )
      )
  LOOP
    INSERT INTO public.pipeline_stage_audit_log (
      lead_id,
      event_type,
      old_stage,
      new_stage,
      reason,
      actor,
      actor_type,
      lead_address,
      lead_created_at,
      migration_name,
      notes
    ) VALUES (
      rec.id,
      'PIPELINE_STAGE_CORRECTED',
      rec.stage,
      'New Lead',
      'Active pipeline stage found without a legitimate outreach event.',
      'SYSTEM_RECONCILIATION',
      'SYSTEM',
      rec.address,
      rec.created_at,
      '20260908120000_reconcile_active_pipeline_without_outreach',
      'Stage reset only; lead data and created_at preserved.'
    );

    UPDATE public.leads
    SET stage = 'New Lead', updated_at = now()
    WHERE id = rec.id;
  END LOOP;
END $$;