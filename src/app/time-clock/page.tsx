'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import AppLayout from '@/components/AppLayout';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { Clock, Coffee, LogOut, Loader2, Users, History, Calendar, AlertTriangle } from 'lucide-react';
import {
  getActiveShift, clockIn, startBreak, endBreak, clockOut,
  getRecentShifts, getTeamActiveShifts, computeWorkedSeconds, computeIdleSeconds, formatDuration,
  IDLE_WARNING_MS,
  type TimeClockShift, type TimeClockBreak, type TeamShiftStatus,
} from '@/lib/services/timeClockService';

function fmtTime(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
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

  const weekTotalSeconds = recentShifts.reduce((sum, s) => {
    const ageDays = (Date.now() - new Date(s.clock_in_at).getTime()) / 86400000;
    if (ageDays > 7) return sum;
    return sum + computeWorkedSeconds(s, now);
  }, 0);

  return (
    <AppLayout>
      <div className="p-6 max-w-4xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Time Clock</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Clock in/out, track breaks, and review your shift history.</p>
          <p className="text-xs text-muted-foreground/70 mt-1">Staying idle for 8+ minutes while clocked in triggers a check-in prompt, then an automatic break so time tracking stays accurate.</p>
        </div>

        {/* Live clock card */}
        <div className="bg-card border border-border rounded-xl p-6 text-center">
          {!shift ? (
            <>
              <p className="text-sm text-muted-foreground mb-4">You are currently clocked out.</p>
              <button
                onClick={handleClockIn}
                disabled={busy}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-success text-success-foreground font-semibold hover:bg-success/90 transition-colors disabled:opacity-50"
              >
                {busy ? <Loader2 size={16} className="animate-spin" /> : <Clock size={16} />}
                Clock In
              </button>
            </>
          ) : (
            <>
              <p className={`text-5xl font-mono font-bold ${onBreak ? 'text-amber-500' : 'text-primary'}`}>
                {formatDuration(worked)}
              </p>
              <p className="text-xs text-muted-foreground mt-2">
                {onBreak ? 'On break — timer paused' : 'Worked today'} · Clocked in at {fmtTime(shift.clock_in_at)}
                {shift.total_break_seconds > 0 && ` · ${formatDuration(shift.total_break_seconds)} on break`}
              </p>
              <div className="flex items-center justify-center gap-3 mt-5">
                <button
                  onClick={handleBreakToggle}
                  disabled={busy}
                  className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl font-medium transition-colors disabled:opacity-50 ${
                    onBreak ? 'bg-primary text-primary-foreground hover:bg-primary/90' : 'bg-amber-500/10 text-amber-600 border border-amber-500/30 hover:bg-amber-500/20'
                  }`}
                >
                  <Coffee size={15} />
                  {onBreak ? 'End Break' : 'Start Break'}
                </button>
                <button
                  onClick={handleClockOut}
                  disabled={busy}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl font-medium bg-red-500/10 text-red-500 border border-red-500/30 hover:bg-red-500/20 transition-colors disabled:opacity-50"
                >
                  <LogOut size={15} />
                  Clock Out
                </button>
              </div>
            </>
          )}
        </div>

        {/* Week summary */}
        <div className="bg-card border border-border rounded-xl p-4 flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <Calendar size={16} className="text-primary" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">This week (last 7 days)</p>
            <p className="text-lg font-bold font-mono text-foreground">{formatDuration(weekTotalSeconds)}</p>
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
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-border">
              <h2 className="text-sm font-semibold text-foreground">Shift History (last 14 days)</h2>
            </div>
            {recentShifts.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-muted-foreground">No shifts recorded yet</div>
            ) : (
              <div className="divide-y divide-border">
                {recentShifts.map(s => (
                  <div key={s.id} className="flex items-center justify-between px-4 py-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-foreground">{fmtDate(s.clock_in_at)}</p>
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
                    <span className="text-sm font-mono font-semibold text-foreground">
                      {formatDuration(computeWorkedSeconds(s, now))}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-border">
              <h2 className="text-sm font-semibold text-foreground">Currently Clocked In</h2>
            </div>
            {teamShifts.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-muted-foreground">No one is clocked in right now</div>
            ) : (
              <div className="divide-y divide-border">
                {teamShifts.map(s => {
                  const idleSeconds = computeIdleSeconds(s, now);
                  const isIdle = s.status === 'clocked_in' && idleSeconds * 1000 >= IDLE_WARNING_MS;
                  return (
                    <div key={s.id} className="flex items-center justify-between px-4 py-3">
                      <div>
                        <p className="text-sm font-medium text-foreground">{s.full_name || s.email}</p>
                        <p className="text-xs text-muted-foreground">
                          Since {fmtTime(s.clock_in_at)} {s.status === 'on_break' && '· On break'}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {isIdle && (
                          <span className="flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-600 border border-amber-500/20">
                            <AlertTriangle size={9} />Idle {formatDuration(idleSeconds)}
                          </span>
                        )}
                        <span className={`text-sm font-mono font-semibold ${s.status === 'on_break' ? 'text-amber-500' : 'text-primary'}`}>
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
