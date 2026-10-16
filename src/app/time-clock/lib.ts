import { computeWorkedSeconds, type TimeClockShift, type TimeClockBreak } from '@/lib/services/timeClockService';

export const GOAL_KEY = 'travlr_time_clock_goal_hours';
export const DEFAULT_GOAL_HOURS = 8;
export const WEEK_GOAL_DAYS = 5;

export const fmtTime = (iso: string | Date | null) => (iso ? new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : '—');
export const fmtClock = (d: Date) => d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit' });
export const fmtDay = (iso: string | Date) => new Date(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

/** "7h 32m", "45m", "0m". */
export function fmtHM(totalSeconds: number): string {
  const m = Math.round(totalSeconds / 60);
  const h = Math.floor(m / 60);
  return h > 0 ? `${h}h ${String(m % 60).padStart(2, '0')}m` : `${m}m`;
}

export const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const isSameDay = (a: Date, b: Date) => dayKey(a) === dayKey(b);

export function dayLabel(key: string, now = new Date()): string {
  const d = new Date(`${key}T12:00:00`);
  const y = new Date(now); y.setDate(y.getDate() - 1);
  if (isSameDay(d, now)) return 'Today';
  if (isSameDay(d, y)) return 'Yesterday';
  return fmtDay(d);
}

/** Monday 00:00 of the week containing `d`. */
export function weekStart(d: Date): Date {
  const s = new Date(d); s.setHours(0, 0, 0, 0);
  s.setDate(s.getDate() - ((s.getDay() + 6) % 7));
  return s;
}

export interface DayTotal { key: string; date: Date; worked: number; breaks: number; shifts: number; pauses: number }

/** One entry per calendar day for the last `days` days (oldest first), zero-filled. */
export function dailyTotals(shifts: TimeClockShift[], days: number, now: Date): DayTotal[] {
  const map = new Map<string, DayTotal>();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - i);
    map.set(dayKey(d), { key: dayKey(d), date: d, worked: 0, breaks: 0, shifts: 0, pauses: 0 });
  }
  for (const s of shifts) {
    const t = map.get(dayKey(new Date(s.clock_in_at)));
    if (!t) continue;
    t.worked += computeWorkedSeconds(s, now); t.breaks += s.total_break_seconds; t.shifts += 1; t.pauses += s.idle_events_count;
  }
  return [...map.values()];
}

export function groupByDay(shifts: TimeClockShift[]): Array<{ key: string; shifts: TimeClockShift[] }> {
  const m = new Map<string, TimeClockShift[]>();
  for (const s of shifts) { const k = dayKey(new Date(s.clock_in_at)); m.set(k, [...(m.get(k) ?? []), s]); }
  return [...m.entries()].map(([key, list]) => ({ key, shifts: list }));
}

export function breaksCsv(shifts: TimeClockShift[], now: Date): string {
  const rows = [['Date', 'Clock in', 'Clock out', 'Worked (h)', 'Break (min)', 'Auto-pauses', 'Auto clock-out', 'Note']];
  for (const s of [...shifts].reverse()) {
    rows.push([
      dayKey(new Date(s.clock_in_at)), fmtTime(s.clock_in_at), s.clock_out_at ? fmtTime(s.clock_out_at) : 'in progress',
      (computeWorkedSeconds(s, now) / 3600).toFixed(2), String(Math.round(s.total_break_seconds / 60)), String(s.idle_events_count), s.auto_clocked_out ? 'yes' : 'no', (s.notes ?? '').replace(/\s+/g, ' '),
    ]);
  }
  return rows.map(r => r.map(c => `"${c.replace(/"/g, '""')}"`).join(',')).join('\n');
}

export type { TimeClockBreak };
