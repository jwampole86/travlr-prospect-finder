ALTER TABLE public.outreach_call_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "outreach_call_log_agent_policy" ON public.outreach_call_log;
CREATE POLICY "outreach_call_log_authorized_access"
  ON public.outreach_call_log
  FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.user_profiles WHERE id = auth.uid() AND app_role IN ('admin', 'owner', 'operator', 'super_admin'))
    OR agent_id = auth.uid()
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.user_profiles WHERE id = auth.uid() AND app_role IN ('admin', 'owner', 'operator', 'super_admin'))
    OR (
      agent_id = auth.uid()
      AND (lead_id IS NULL OR EXISTS (SELECT 1 FROM public.leads WHERE id = lead_id AND primary_agent_id = auth.uid()))
    )
  );

DROP POLICY IF EXISTS "Authenticated users can insert suggestion feedback" ON public.teleprompter_suggestion_feedback;
DROP POLICY IF EXISTS "Authenticated users can read suggestion feedback" ON public.teleprompter_suggestion_feedback;
CREATE POLICY "teleprompter_feedback_own_session"
  ON public.teleprompter_suggestion_feedback
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.call_sessions WHERE id::text = session_id AND user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.call_sessions WHERE id::text = session_id AND user_id = auth.uid()));

DROP POLICY IF EXISTS "Authenticated users can insert call summaries" ON public.teleprompter_call_summaries;
DROP POLICY IF EXISTS "Authenticated users can read call summaries" ON public.teleprompter_call_summaries;
CREATE POLICY "teleprompter_summaries_own_session"
  ON public.teleprompter_call_summaries
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.call_sessions WHERE id::text = session_id AND user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.call_sessions WHERE id::text = session_id AND user_id = auth.uid()));