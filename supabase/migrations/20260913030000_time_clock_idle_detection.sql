-- ─── Time Clock Idle Detection ─────────────────────────────────────────────────
-- Prevents agents from leaving the clock running while not actually working:
-- tracks last real activity (mouse/keyboard/touch) per shift, and records when
-- the system automatically pauses or ends a shift due to inactivity.

ALTER TABLE public.time_clock_shifts
  ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS idle_events_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS auto_clocked_out BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.time_clock_breaks
  ADD COLUMN IF NOT EXISTS is_auto BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.time_clock_idle_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shift_id UUID NOT NULL REFERENCES public.time_clock_shifts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK (action IN ('auto_break', 'auto_clock_out')),
  idle_since TIMESTAMPTZ NOT NULL,
  detected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_time_clock_idle_events_shift ON public.time_clock_idle_events(shift_id);
CREATE INDEX IF NOT EXISTS idx_time_clock_idle_events_user ON public.time_clock_idle_events(user_id, detected_at DESC);

ALTER TABLE public.time_clock_idle_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_manage_own_time_clock_idle_events" ON public.time_clock_idle_events;
CREATE POLICY "users_manage_own_time_clock_idle_events"
ON public.time_clock_idle_events FOR ALL TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "admins_read_all_time_clock_idle_events" ON public.time_clock_idle_events;
CREATE POLICY "admins_read_all_time_clock_idle_events"
ON public.time_clock_idle_events FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_profiles up
    WHERE up.id = auth.uid() AND up.app_role IN ('admin', 'owner')
  )
);
