import { createClient } from '@/lib/supabase/client';

export type ShiftStatus = 'clocked_in' | 'on_break' | 'clocked_out';

// ─── Idle detection thresholds ─────────────────────────────────────────────────
export const IDLE_WARNING_MS = 8 * 60 * 1000; // show "are you still working?" prompt
export const IDLE_AUTOBREAK_MS = 10 * 60 * 1000; // no response → auto-start a break
export const IDLE_AUTO_CLOCKOUT_MS = 45 * 60 * 1000; // idle continues through the auto-break → clock out
export const HEARTBEAT_INTERVAL_MS = 60 * 1000;

export interface TimeClockShift {
  id: string;
  user_id: string;
  clock_in_at: string;
  clock_out_at: string | null;
  status: ShiftStatus;
  total_break_seconds: number;
  notes: string | null;
  last_activity_at: string;
  idle_events_count: number;
  auto_clocked_out: boolean;
  created_at: string;
  updated_at: string;
}

export interface TimeClockBreak {
  id: string;
  shift_id: string;
  user_id: string;
  break_start_at: string;
  break_end_at: string | null;
  is_auto: boolean;
  created_at: string;
}

export interface TeamShiftStatus extends TimeClockShift {
  full_name: string;
  email: string;
}

/** Worked seconds so far for a shift, excluding break time. Uses `now` for open shifts. */
export function computeWorkedSeconds(shift: TimeClockShift, now: Date = new Date()): number {
  const start = new Date(shift.clock_in_at).getTime();
  const end = shift.clock_out_at ? new Date(shift.clock_out_at).getTime() : now.getTime();
  const grossSeconds = Math.max(0, Math.floor((end - start) / 1000));
  return Math.max(0, grossSeconds - shift.total_break_seconds);
}

/** Seconds since the shift last saw real user activity (mouse/keyboard/touch/heartbeat). */
export function computeIdleSeconds(shift: TimeClockShift, now: Date = new Date()): number {
  return Math.max(0, Math.floor((now.getTime() - new Date(shift.last_activity_at).getTime()) / 1000));
}

export function formatDuration(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.floor(totalSeconds % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/** Returns the caller's currently open shift (clocked_in or on_break), or null. */
export async function getActiveShift(userId: string): Promise<{ shift: TimeClockShift | null; activeBreak: TimeClockBreak | null }> {
  const supabase = createClient();
  const { data: shift } = await supabase
    .from('time_clock_shifts')
    .select('*')
    .eq('user_id', userId)
    .neq('status', 'clocked_out')
    .order('clock_in_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!shift) return { shift: null, activeBreak: null };

  let activeBreak: TimeClockBreak | null = null;
  if (shift.status === 'on_break') {
    const { data: brk } = await supabase
      .from('time_clock_breaks')
      .select('*')
      .eq('shift_id', shift.id)
      .is('break_end_at', null)
      .order('break_start_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    activeBreak = brk || null;
  }

  return { shift: shift as TimeClockShift, activeBreak };
}

export async function clockIn(userId: string): Promise<TimeClockShift> {
  const supabase = createClient();
  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from('time_clock_shifts')
    .insert({ user_id: userId, clock_in_at: nowIso, status: 'clocked_in', last_activity_at: nowIso })
    .select('*')
    .single();
  if (error) throw error;
  return data as TimeClockShift;
}

/** Updates last_activity_at so idle detection knows the agent is genuinely present. */
export async function sendActivityHeartbeat(shiftId: string): Promise<void> {
  const supabase = createClient();
  await supabase
    .from('time_clock_shifts')
    .update({ last_activity_at: new Date().toISOString() })
    .eq('id', shiftId)
    .neq('status', 'clocked_out')
    .catch(() => {});
}

/** System-initiated break after the agent didn't respond to the idle prompt. */
export async function recordIdleAutoBreak(shiftId: string, userId: string, idleSinceIso: string): Promise<TimeClockBreak> {
  const supabase = createClient();
  const nowIso = new Date().toISOString();

  // Read-modify-write to increment idle_events_count (no RPC available).
  const { data: shiftRow } = await supabase.from('time_clock_shifts').select('idle_events_count').eq('id', shiftId).single();
  const { error: updateError } = await supabase
    .from('time_clock_shifts')
    .update({ status: 'on_break', idle_events_count: (shiftRow?.idle_events_count ?? 0) + 1 })
    .eq('id', shiftId);
  if (updateError) throw updateError;

  const { data, error } = await supabase
    .from('time_clock_breaks')
    .insert({ shift_id: shiftId, user_id: userId, break_start_at: idleSinceIso, is_auto: true })
    .select('*')
    .single();
  if (error) throw error;

  await supabase.from('time_clock_idle_events').insert({
    shift_id: shiftId, user_id: userId, action: 'auto_break', idle_since: idleSinceIso, detected_at: nowIso,
  }).catch(() => {});

  return data as TimeClockBreak;
}

/** System-initiated clock-out after prolonged inactivity through an auto-break. */
export async function recordIdleAutoClockOut(shiftId: string, userId: string, activeBreak: TimeClockBreak | null, currentTotalBreakSeconds: number, idleSinceIso: string): Promise<void> {
  await clockOut(shiftId, activeBreak, currentTotalBreakSeconds);
  const supabase = createClient();
  await supabase.from('time_clock_shifts').update({ auto_clocked_out: true }).eq('id', shiftId);
  await supabase.from('time_clock_idle_events').insert({
    shift_id: shiftId, user_id: userId, action: 'auto_clock_out', idle_since: idleSinceIso, detected_at: new Date().toISOString(),
  }).catch(() => {});
}

/** Resumes a shift that was auto-paused for idleness once real activity is detected. */
export async function endAutoBreak(shiftId: string, breakId: string, currentTotalBreakSeconds: number, breakStartAt: string): Promise<void> {
  await endBreak(shiftId, breakId, currentTotalBreakSeconds, breakStartAt);
  const supabase = createClient();
  await supabase.from('time_clock_shifts').update({ last_activity_at: new Date().toISOString() }).eq('id', shiftId);
}

export async function startBreak(shiftId: string, userId: string): Promise<TimeClockBreak> {
  const supabase = createClient();
  const nowIso = new Date().toISOString();
  const { error: updateError } = await supabase
    .from('time_clock_shifts')
    .update({ status: 'on_break', last_activity_at: nowIso })
    .eq('id', shiftId);
  if (updateError) throw updateError;

  const { data, error } = await supabase
    .from('time_clock_breaks')
    .insert({ shift_id: shiftId, user_id: userId, break_start_at: nowIso })
    .select('*')
    .single();
  if (error) throw error;
  return data as TimeClockBreak;
}

export async function endBreak(shiftId: string, breakId: string, currentTotalBreakSeconds: number, breakStartAt: string): Promise<void> {
  const supabase = createClient();
  const breakSeconds = Math.max(0, Math.floor((Date.now() - new Date(breakStartAt).getTime()) / 1000));

  const { error: breakError } = await supabase
    .from('time_clock_breaks')
    .update({ break_end_at: new Date().toISOString() })
    .eq('id', breakId);
  if (breakError) throw breakError;

  const { error: shiftError } = await supabase
    .from('time_clock_shifts')
    .update({ status: 'clocked_in', total_break_seconds: currentTotalBreakSeconds + breakSeconds, last_activity_at: new Date().toISOString() })
    .eq('id', shiftId);
  if (shiftError) throw shiftError;
}

export async function clockOut(shiftId: string, activeBreak: TimeClockBreak | null, currentTotalBreakSeconds: number): Promise<void> {
  const supabase = createClient();
  let totalBreakSeconds = currentTotalBreakSeconds;

  // Auto-close any in-progress break so it counts toward total break time.
  if (activeBreak) {
    const breakSeconds = Math.max(0, Math.floor((Date.now() - new Date(activeBreak.break_start_at).getTime()) / 1000));
    totalBreakSeconds += breakSeconds;
    await supabase
      .from('time_clock_breaks')
      .update({ break_end_at: new Date().toISOString() })
      .eq('id', activeBreak.id);
  }

  const { error } = await supabase
    .from('time_clock_shifts')
    .update({ status: 'clocked_out', clock_out_at: new Date().toISOString(), total_break_seconds: totalBreakSeconds })
    .eq('id', shiftId);
  if (error) throw error;
}

export async function getRecentShifts(userId: string, days = 14): Promise<TimeClockShift[]> {
  const supabase = createClient();
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const { data } = await supabase
    .from('time_clock_shifts')
    .select('*')
    .eq('user_id', userId)
    .gte('clock_in_at', since)
    .order('clock_in_at', { ascending: false });
  return (data || []) as TimeClockShift[];
}

/** Admin/owner only — relies on RLS to restrict visibility. */
export async function getTeamActiveShifts(): Promise<TeamShiftStatus[]> {
  const supabase = createClient();
  const { data: shifts } = await supabase
    .from('time_clock_shifts')
    .select('*')
    .neq('status', 'clocked_out')
    .order('clock_in_at', { ascending: false });

  if (!shifts || shifts.length === 0) return [];

  const userIds = Array.from(new Set(shifts.map((s: TimeClockShift) => s.user_id)));
  const { data: profiles } = await supabase
    .from('user_profiles')
    .select('id, full_name, email')
    .in('id', userIds);

  const profileMap = new Map((profiles || []).map((p: { id: string; full_name: string; email: string }) => [p.id, p]));

  return shifts.map((s: TimeClockShift) => ({
    ...s,
    full_name: profileMap.get(s.user_id)?.full_name || 'Unknown',
    email: profileMap.get(s.user_id)?.email || '',
  }));
}
