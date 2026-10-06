'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import AppLayout from '@/components/AppLayout';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { Clock, Coffee, LogOut, Loader2, Users, History, Calendar, AlertTriangle, TrendingUp } from 'lucide-react';
import {
  getActiveShift, clockIn, startBreak, endBreak, clockOut,
  getRecentShifts, getTeamActiveShifts, computeWorkedSeconds, computeIdleSeconds, formatDuration,
  IDLE_WARNING_MS,
  type TimeClockShift, type TimeClockBreak, type TeamShiftStatus,
} from '@/lib/services/timeClockService';

/** Typical workday length used to drive the progress ring — purely visual, not a hard cap. */
const TARGET_SHIFT_SECONDS = 8 * 60 * 60;

function fmtTime(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function relativeDayLabel(iso: string): string {
  const date = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (isSameDay(date, today)) return 'Today';
  if (isSameDay(date, yesterday)) return 'Yesterday';
  return fmtDate(iso);
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function TimeClockPage() {
  const { user, isAdmin } = useAuth();
  const [shift, setShift] = useState<TimeClockShift | null>(null);
  const [activeBreak, setActiveBreak] = useState<TimeClockBreak | null>(null);
  const [recentShifts, setRecentShifts] = useState<TimeClockShift[]>([]);
  const [teamShifts, setTeamShifts] = useState<TeamShiftStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<'my' | 'team'>('my');
  const [now, setNow] = useState(new Date());
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const admin = isAdmin();

  const load = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const [{ shift: activeShift, activeBreak: brk }, history] = await Promise.all([
        getActiveShift(user.id),
        getRecentShifts(user.id, 14),
      ]);
      setShift(activeShift);
      setActiveBreak(brk);
      setRecentShifts(history);
      if (admin) {
        setTeamShifts(await getTeamActiveShifts());
      }
    } finally {
      setLoading(false);
    }
  }, [user?.id, admin]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    tickRef.current = setInterval(() => setNow(new Date()), 1000);
    return () => { if (tickRef.current) clearInterval(tickRef.current); };
  }, []);

  if (!user?.id) return null;

  const handleClockIn = async () => {
    setBusy(true);
    try {
      const newShift = await clockIn(user.id);
      setShift(newShift);
      toast.success('Clocked in');
      load();
    } catch {
      toast.error('Failed to clock in');
    } finally {
      setBusy(false);
    }
  };

  const handleBreakToggle = async () => {
    if (!shift) return;
    setBusy(true);
    try {
      if (shift.status === 'on_break' && activeBreak) {
        await endBreak(shift.id, activeBreak.id, shift.total_break_seconds, activeBreak.break_start_at);
        toast.success('Break ended');
      } else {
        await startBreak(shift.id, user.id);
        toast.success('Break started');
      }
      await load();
    } catch {
      toast.error('Failed to update break');
    } finally {
      setBusy(false);
    }
  };

  const handleClockOut = async () => {
    if (!shift) return;
    setBusy(true);
    try {
      await clockOut(shift.id, activeBreak, shift.total_break_seconds);
      toast.success('Clocked out');
      await load();
    } catch {
      toast.error('Failed to clock out');
    } finally {
      setBusy(false);
    }
  };

  const onBreak = shift?.status === 'on_break';
  const worked = shift ? computeWorkedSeconds(shift, now) : 0;

  const todayShifts = recentShifts.filter(s => isSameDay(new Date(s.clock_in_at), now));
  const todayWorkedSeconds = todayShifts.reduce((sum, s) => sum + computeWorkedSeconds(s, now), 0);
  const todayBreakSeconds = todayShifts.reduce((sum, s) => sum + s.total_break_seconds, 0);

  const weekTotalSeconds = recentShifts.reduce((sum, s) => {
    const ageDays = (Date.now() - new Date(s.clock_in_at).getTime()) / 86400000;
    if (ageDays > 7) return sum;
    return sum + computeWorkedSeconds(s, now);
  }, 0);

  const ringPercent = Math.max(0, Math.min(100, Math.round((todayWorkedSeconds / TARGET_SHIFT_SECONDS) * 100)));
  const ringDeg = Math.round((ringPercent / 100) * 360);
  const ringColor = onBreak ? 'var(--warning)' : 'var(--success)';
  const statusLabel = !shift ? 'Clocked Out' : onBreak ? 'On Break' : 'Working';

  return (
    <AppLayout>
      <div className="p-6 max-w-5xl mx-auto space-y-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Time Clock</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Clock in/out, track breaks, and review your shift history.</p>
            <p className="text-xs text-muted-foreground/70 mt-1">Staying idle for 8+ minutes while clocked in triggers a check-in prompt, then an automatic break so time tracking stays accurate.</p>
          </div>
          <div className="text-right shrink-0">
            <p className="text-sm font-mono font-semibold text-foreground">{now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</p>
            <p className="text-xs text-muted-foreground">{now.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}</p>
          </div>
        </div>

        {/* Hero: live clock ring + quick stats */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Clock ring card */}
          <div className="lg:col-span-2 bg-card border border-border rounded-2xl p-6 flex flex-col items-center justify-center text-center overflow-hidden relative">
            <div
              className="absolute inset-0 opacity-[0.06] pointer-events-none transition-colors duration-700"
              style={{ background: `radial-gradient(circle at 50% 0%, ${ringColor}, transparent 60%)` }}
            />
            <div className="relative w-48 h-48">
              <div
                className="absolute inset-0 rounded-full transition-[background] duration-700 ease-out"
                style={{ background: shift ? `conic-gradient(${ringColor} ${ringDeg}deg, var(--muted) ${ringDeg}deg 360deg)` : 'var(--muted)' }}
              />
              <div className="absolute inset-[9px] rounded-full bg-card flex flex-col items-center justify-center shadow-inner">
                <p className={`text-3xl font-mono font-bold tabular-nums ${!shift ? 'text-muted-foreground' : onBreak ? 'text-amber-500' : 'text-primary'}`}>
                  {formatDuration(worked)}
                </p>
                <p className="text-[10px] font-semibold text-muted-foreground mt-1.5 uppercase tracking-wider flex items-center gap-1">
                  {shift && !onBreak && (
                    <span className="relative flex h-1.5 w-1.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75" />
                      <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-success" />
                    </span>
                  )}
                  {statusLabel}
                </p>
              </div>
            </div>

            <p className="text-xs text-muted-foreground mt-4 relative">
              {!shift
                ? 'You are currently clocked out.'
                : <>Clocked in at {fmtTime(shift.clock_in_at)}{shift.total_break_seconds > 0 && ` · ${formatDuration(shift.total_break_seconds)} on break`}</>
              }
            </p>

            <div className="flex items-center justify-center gap-3 mt-5 relative">
              {!shift ? (
                <button
                  onClick={handleClockIn}
                  disabled={busy}
                  className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-success text-success-foreground font-semibold shadow-sm hover:shadow-md hover:scale-[1.03] active:scale-[0.97] transition-all disabled:opacity-50 disabled:hover:scale-100"
                >
                  {busy ? <Loader2 size={16} className="animate-spin" /> : <Clock size={16} />}
                  Clock In
                </button>
              ) : (
                <>
                  <button
                    onClick={handleBreakToggle}
                    disabled={busy}
                    className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl font-medium shadow-sm hover:shadow-md hover:scale-[1.03] active:scale-[0.97] transition-all disabled:opacity-50 disabled:hover:scale-100 ${
                      onBreak ? 'bg-primary text-primary-foreground hover:bg-primary/90' : 'bg-amber-500/10 text-amber-600 border border-amber-500/30 hover:bg-amber-500/20'
                    }`}
                  >
                    <Coffee size={15} />
                    {onBreak ? 'End Break' : 'Start Break'}
                  </button>
                  <button
                    onClick={handleClockOut}
                    disabled={busy}
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl font-medium bg-red-500/10 text-red-500 border border-red-500/30 hover:bg-red-500/20 hover:scale-[1.03] active:scale-[0.97] shadow-sm hover:shadow-md transition-all disabled:opacity-50 disabled:hover:scale-100"
                  >
                    <LogOut size={15} />
                    Clock Out
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Quick stats */}
          <div className="flex flex-col gap-3">
            <div className="bg-card border border-border rounded-2xl p-4 flex items-center gap-3 bg-gradient-to-br from-primary/5 to-transparent hover:shadow-sm transition-shadow">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                <TrendingUp size={17} className="text-primary" />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">Today</p>
                <p className="text-lg font-bold font-mono text-foreground tabular-nums">{formatDuration(todayWorkedSeconds)}</p>
              </div>
            </div>
            <div className="bg-card border border-border rounded-2xl p-4 flex items-center gap-3 bg-gradient-to-br from-blue-500/5 to-transparent hover:shadow-sm transition-shadow">
              <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center shrink-0">
                <Calendar size={17} className="text-blue-500" />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">This week (last 7 days)</p>
                <p className="text-lg font-bold font-mono text-foreground tabular-nums">{formatDuration(weekTotalSeconds)}</p>
              </div>
            </div>
            <div className="bg-card border border-border rounded-2xl p-4 flex items-center gap-3 bg-gradient-to-br from-amber-500/5 to-transparent hover:shadow-sm transition-shadow">
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center shrink-0">
                <Coffee size={17} className="text-amber-500" />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">Break time today</p>
                <p className="text-lg font-bold font-mono text-foreground tabular-nums">{formatDuration(todayBreakSeconds)}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        {admin && (
          <div className="flex items-center gap-1 bg-muted rounded-lg p-1 border border-border w-fit">
            <button
              onClick={() => setTab('my')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${tab === 'my' ? 'bg-card text-foreground shadow-sm border border-border' : 'text-muted-foreground hover:text-foreground'}`}
            >
              <History size={12} />My History
            </button>
            <button
              onClick={() => setTab('team')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${tab === 'team' ? 'bg-card text-foreground shadow-sm border border-border' : 'text-muted-foreground hover:text-foreground'}`}
            >
              <Users size={12} />Team Status
            </button>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 size={20} className="animate-spin text-muted-foreground" />
          </div>
        ) : tab === 'my' ? (
          <div>
            <h2 className="text-sm font-semibold text-foreground mb-3">Shift History (last 14 days)</h2>
            {recentShifts.length === 0 ? (
              <div className="bg-card border border-border rounded-2xl px-4 py-8 text-center text-sm text-muted-foreground">No shifts recorded yet</div>
            ) : (
              <div className="space-y-2">
                {recentShifts.map(s => {
                  const workedS = computeWorkedSeconds(s, now);
                  const totalS = Math.max(1, workedS + s.total_break_seconds);
                  const workedPct = Math.round((workedS / totalS) * 100);
                  return (
                    <div
                      key={s.id}
                      className="bg-card border border-border rounded-xl px-4 py-3 hover:shadow-md hover:-translate-y-0.5 transition-all"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-sm font-medium text-foreground">{relativeDayLabel(s.clock_in_at)}</p>
                            {s.idle_events_count > 0 && (
                              <span className="flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-600 border border-amber-500/20">
                                <AlertTriangle size={9} />{s.idle_events_count} auto-pause{s.idle_events_count > 1 ? 's' : ''}
                              </span>
                            )}
                            {s.auto_clocked_out && (
                              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-red-500/10 text-red-500 border border-red-500/20">
                                Auto clocked out
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {fmtTime(s.clock_in_at)} – {s.clock_out_at ? fmtTime(s.clock_out_at) : 'In progress'}
                            {s.total_break_seconds > 0 && ` · ${formatDuration(s.total_break_seconds)} break`}
                          </p>
                        </div>
                        <span className="text-sm font-mono font-semibold text-foreground shrink-0 tabular-nums">
                          {formatDuration(workedS)}
                        </span>
                      </div>
                      <div className="mt-2.5 h-1.5 rounded-full bg-muted overflow-hidden flex">
                        <div className="h-full bg-primary transition-all duration-500" style={{ width: `${workedPct}%` }} />
                        <div className="h-full bg-amber-400/70 transition-all duration-500" style={{ width: `${100 - workedPct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          <div>
            <h2 className="text-sm font-semibold text-foreground mb-3">Currently Clocked In</h2>
            {teamShifts.length === 0 ? (
              <div className="bg-card border border-border rounded-2xl px-4 py-8 text-center text-sm text-muted-foreground">No one is clocked in right now</div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {teamShifts.map(s => {
                  const idleSeconds = computeIdleSeconds(s, now);
                  const isIdle = s.status === 'clocked_in' && idleSeconds * 1000 >= IDLE_WARNING_MS;
                  const name = s.full_name || s.email;
                  const ringTone = s.status === 'on_break' ? 'ring-amber-400' : isIdle ? 'ring-muted-foreground/40' : 'ring-success';
                  return (
                    <div key={s.id} className="bg-card border border-border rounded-xl px-4 py-3 flex items-center gap-3 hover:shadow-md transition-shadow">
                      <div className="relative shrink-0">
                        <div className={`w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold ring-2 ${ringTone}`}>
                          {initials(name)}
                        </div>
                        {s.status === 'clocked_in' && !isIdle && (
                          <span className="absolute -bottom-0.5 -right-0.5 flex h-3 w-3">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75" />
                            <span className="relative inline-flex rounded-full h-3 w-3 bg-success border-2 border-card" />
                          </span>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-foreground truncate">{name}</p>
                        <p className="text-xs text-muted-foreground">
                          Since {fmtTime(s.clock_in_at)} {s.status === 'on_break' && '· On break'}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        {isIdle && (
                          <span className="flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-600 border border-amber-500/20">
                            <AlertTriangle size={9} />Idle {formatDuration(idleSeconds)}
                          </span>
                        )}
                        <span className={`text-sm font-mono font-semibold tabular-nums ${s.status === 'on_break' ? 'text-amber-500' : 'text-primary'}`}>
                          {formatDuration(computeWorkedSeconds(s, now))}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
