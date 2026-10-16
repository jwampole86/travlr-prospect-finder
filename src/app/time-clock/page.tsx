'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import AppLayout from '@/components/AppLayout';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { Activity, CalendarCheck, Clock, Coffee, History, Timer, TrendingUp, Users, BarChart3, AlertTriangle } from 'lucide-react';
import { PageHeader, StatGrid, SegmentedTabs, Panel, LoadingState } from '@/components/ops';
import {
  getActiveShift, clockIn, startBreak, endBreak, clockOut, getRecentShifts, getTeamActiveShifts, getTeamRecentShifts, getBreaksForShifts,
  computeWorkedSeconds, formatDuration,
  type TimeClockShift, type TimeClockBreak, type TeamShiftStatus,
} from '@/lib/services/timeClockService';
import ClockHero from './components/ClockHero';
import DayTimeline from './components/DayTimeline';
import WeekChart from './components/WeekChart';
import ShiftHistory from './components/ShiftHistory';
import TeamBoard from './components/TeamBoard';
import { DEFAULT_GOAL_HOURS, GOAL_KEY, WEEK_GOAL_DAYS, dailyTotals, fmtHM, isSameDay, weekStart } from './lib';

export default function TimeClockPage() {
  const { user, isAdmin } = useAuth();
  const [shift, setShift] = useState<TimeClockShift | null>(null);
  const [activeBreak, setActiveBreak] = useState<TimeClockBreak | null>(null);
  const [shifts, setShifts] = useState<TimeClockShift[]>([]);
  const [todayBreaks, setTodayBreaks] = useState<TimeClockBreak[]>([]);
  const [teamLive, setTeamLive] = useState<TeamShiftStatus[]>([]);
  const [teamWeek, setTeamWeek] = useState<TeamShiftStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<'my' | 'team'>('my');
  const [range, setRange] = useState<7 | 14 | 30>(14);
  const [now, setNow] = useState(new Date());
  const [goalHours, setGoalHours] = useState(DEFAULT_GOAL_HOURS);
  const admin = isAdmin();

  useEffect(() => { const g = Number(localStorage.getItem(GOAL_KEY)); if (g >= 4 && g <= 10) setGoalHours(g); }, []);
  const changeGoal = (h: number) => { setGoalHours(h); try { localStorage.setItem(GOAL_KEY, String(h)); } catch { /* the goal is a convenience */ } };

  const load = useCallback(async (silent = false) => {
    if (!user?.id) return;
    if (!silent) setLoading(true);
    try {
      const [{ shift: s, activeBreak: b }, history] = await Promise.all([getActiveShift(user.id), getRecentShifts(user.id, 30)]);
      setShift(s); setActiveBreak(b); setShifts(history);
      const todayIds = history.filter(x => isSameDay(new Date(x.clock_in_at), new Date())).map(x => x.id);
      setTodayBreaks(await getBreaksForShifts(todayIds));
      if (admin) { const [live, week] = await Promise.all([getTeamActiveShifts(), getTeamRecentShifts(7)]); setTeamLive(live); setTeamWeek(week); }
    } finally { if (!silent) setLoading(false); }
  }, [user?.id, admin]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(t); }, []);
  useEffect(() => { if (!admin || tab !== 'team') return; const t = setInterval(() => load(true), 30_000); return () => clearInterval(t); }, [admin, tab, load]);

  const onBreak = shift?.status === 'on_break';
  const worked = shift ? computeWorkedSeconds(shift, now) : 0;
  const todayShifts = shifts.filter(s => isSameDay(new Date(s.clock_in_at), now));
  const todayWorked = todayShifts.reduce((a, s) => a + computeWorkedSeconds(s, now), 0);
  const todayBreak = todayShifts.reduce((a, s) => a + s.total_break_seconds, 0);

  // The tab shows the running timer so you can see it from another tab.
  useEffect(() => {
    document.title = shift ? `${onBreak ? '☕' : '●'} ${formatDuration(worked)} · Time Clock` : 'Time Clock';
    return () => { document.title = 'Time Clock'; };
  }, [shift, onBreak, worked]);

  const stats = useMemo(() => {
    const ws = weekStart(now);
    const weekShifts = shifts.filter(s => new Date(s.clock_in_at) >= ws);
    const weekWorked = weekShifts.reduce((a, s) => a + computeWorkedSeconds(s, now), 0);
    const weekGoal = goalHours * 3600 * WEEK_GOAL_DAYS;
    const daysWorked = new Set(weekShifts.map(s => new Date(s.clock_in_at).toDateString())).size;
    const finished = shifts.filter(s => s.clock_out_at && (now.getTime() - new Date(s.clock_in_at).getTime()) / 86400000 <= 14);
    const avg = finished.length ? finished.reduce((a, s) => a + computeWorkedSeconds(s, now), 0) / finished.length : 0;
    const pauses = shifts.filter(s => (now.getTime() - new Date(s.clock_in_at).getTime()) / 86400000 <= 14).reduce((a, s) => a + s.idle_events_count, 0);
    return { weekWorked, weekGoal, daysWorked, avg, pauses };
  }, [shifts, now, goalHours]);

  const inRange = useMemo(() => shifts.filter(s => (now.getTime() - new Date(s.clock_in_at).getTime()) / 86400000 <= range), [shifts, now, range]);
  const chartDays = useMemo(() => dailyTotals(shifts, range, now), [shifts, range, now]);
  const rangeTotal = chartDays.reduce((a, d) => a + d.worked, 0);

  if (!user?.id) return null;

  const run = async (fn: () => Promise<unknown>, ok: string, fail: string) => {
    setBusy(true);
    try { await fn(); toast.success(ok); await load(true); } catch { toast.error(fail); } finally { setBusy(false); }
  };

  return (
    <AppLayout>
      <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
        <PageHeader icon={Clock} title="Time Clock" description="Clock in and out, track breaks, and see where your time goes." />

        <ClockHero
          shift={shift} activeBreak={activeBreak} now={now} worked={worked} todayWorked={todayWorked} goalHours={goalHours} onGoal={changeGoal} busy={busy} breaksToday={todayBreaks.length}
          onClockIn={() => run(() => clockIn(user.id), 'Clocked in', 'Failed to clock in')}
          onBreak={() => run(async () => { if (!shift) return; if (onBreak && activeBreak) await endBreak(shift.id, activeBreak.id, shift.total_break_seconds, activeBreak.break_start_at); else await startBreak(shift.id, user.id); }, onBreak ? 'Break ended' : 'Break started', 'Failed to update break')}
          onClockOut={() => run(async () => { if (shift) await clockOut(shift.id, activeBreak, shift.total_break_seconds); }, 'Clocked out', 'Failed to clock out')}
        />

        <StatGrid columns={5} stats={[
          { label: 'Today', value: fmtHM(todayWorked), hint: `${Math.round(Math.min(1, todayWorked / (goalHours * 3600)) * 100)}% of ${goalHours}h goal`, icon: TrendingUp, tone: 'primary' },
          { label: 'This week', value: fmtHM(stats.weekWorked), hint: `${Math.round(Math.min(1, stats.weekWorked / stats.weekGoal) * 100)}% of ${fmtHM(stats.weekGoal)}`, icon: CalendarCheck, tone: 'success' },
          { label: 'Days worked', value: `${stats.daysWorked}/${WEEK_GOAL_DAYS}`, hint: 'this week', icon: Activity },
          { label: 'Avg shift', value: stats.avg ? fmtHM(stats.avg) : '—', hint: 'last 14 days', icon: Timer },
          { label: 'Break today', value: fmtHM(todayBreak), hint: stats.pauses ? `${stats.pauses} auto-pause${stats.pauses === 1 ? '' : 's'} in 14 days` : 'no auto-pauses in 14 days', icon: stats.pauses ? AlertTriangle : Coffee, tone: stats.pauses ? 'warning' : 'default' },
        ]} />

        {admin && <SegmentedTabs value={tab} onChange={setTab} tabs={[{ key: 'my', label: 'My time', icon: History }, { key: 'team', label: 'Team', icon: Users, badge: undefined }]} />}

        {loading ? <LoadingState /> : tab === 'my' ? (
          <div className="space-y-6">
            <Panel title="Today" icon={Clock}><DayTimeline shifts={todayShifts.slice().reverse()} breaks={todayBreaks} now={now} /></Panel>
            <Panel title={`Hours per day · last ${range} days`} icon={BarChart3} actions={<span className="text-xs text-muted-foreground tabular-nums">{fmtHM(rangeTotal)} total</span>}>
              <WeekChart days={chartDays} goalHours={goalHours} />
            </Panel>
            <div>
              <h2 className="mb-3 text-sm font-semibold text-foreground">Shift history</h2>
              <ShiftHistory shifts={inRange} now={now} range={range} onRange={setRange} onNotes={(id, notes) => setShifts(prev => prev.map(s => (s.id === id ? { ...s, notes } : s)))} />
            </div>
          </div>
        ) : (
          <TeamBoard live={teamLive} week={teamWeek} now={now} />
        )}
      </div>
    </AppLayout>
  );
}
