-- ─── Agent Time Clock (clock in/out + breaks) ─────────────────────────────────
-- One row per shift. Breaks are tracked as separate segments so total worked
-- time = (clock_out_at - clock_in_at) - total_break_seconds.

CREATE TABLE IF NOT EXISTS public.time_clock_shifts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  clock_in_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  clock_out_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'clocked_in' CHECK (status IN ('clocked_in', 'on_break', 'clocked_out')),
  total_break_seconds INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.time_clock_breaks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shift_id UUID NOT NULL REFERENCES public.time_clock_shifts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  break_start_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  break_end_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_time_clock_shifts_user ON public.time_clock_shifts(user_id, clock_in_at DESC);
CREATE INDEX IF NOT EXISTS idx_time_clock_shifts_status ON public.time_clock_shifts(status);
CREATE INDEX IF NOT EXISTS idx_time_clock_breaks_shift ON public.time_clock_breaks(shift_id);

-- Only one open (non-clocked-out) shift per user at a time.
CREATE UNIQUE INDEX IF NOT EXISTS idx_time_clock_shifts_one_open_per_user
  ON public.time_clock_shifts(user_id)
  WHERE status <> 'clocked_out';

CREATE OR REPLACE FUNCTION public.set_time_clock_shift_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_time_clock_shifts_updated_at ON public.time_clock_shifts;
CREATE TRIGGER trg_time_clock_shifts_updated_at
  BEFORE UPDATE ON public.time_clock_shifts
  FOR EACH ROW EXECUTE FUNCTION public.set_time_clock_shift_updated_at();

ALTER TABLE public.time_clock_shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.time_clock_breaks ENABLE ROW LEVEL SECURITY;

-- Shifts: users manage their own; admins/owners can read everyone's (Team Time Clock view).
DROP POLICY IF EXISTS "users_manage_own_time_clock_shifts" ON public.time_clock_shifts;
CREATE POLICY "users_manage_own_time_clock_shifts"
ON public.time_clock_shifts FOR ALL TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "admins_read_all_time_clock_shifts" ON public.time_clock_shifts;
CREATE POLICY "admins_read_all_time_clock_shifts"
ON public.time_clock_shifts FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_profiles up
    WHERE up.id = auth.uid() AND up.app_role IN ('admin', 'owner')
  )
);

-- Breaks: same pattern.
DROP POLICY IF EXISTS "users_manage_own_time_clock_breaks" ON public.time_clock_breaks;
CREATE POLICY "users_manage_own_time_clock_breaks"
ON public.time_clock_breaks FOR ALL TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "admins_read_all_time_clock_breaks" ON public.time_clock_breaks;
CREATE POLICY "admins_read_all_time_clock_breaks"
ON public.time_clock_breaks FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_profiles up
    WHERE up.id = auth.uid() AND up.app_role IN ('admin', 'owner')
  )
);
