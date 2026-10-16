'use client';

import React, { useState } from 'react';
import { Clock, Coffee, LogOut, Loader2, Target, Zap } from 'lucide-react';
import { formatDuration, type TimeClockShift, type TimeClockBreak } from '@/lib/services/timeClockService';
import { fmtClock, fmtHM, fmtTime } from '../lib';

const R = 92;
const C = 2 * Math.PI * R;

export default function ClockHero({ shift, activeBreak, now, worked, todayWorked, goalHours, onGoal, busy, onClockIn, onBreak, onClockOut, breaksToday }: {
  shift: TimeClockShift | null; activeBreak: TimeClockBreak | null; now: Date; worked: number; todayWorked: number; goalHours: number; onGoal: (h: number) => void;
  busy: boolean; onClockIn: () => void; onBreak: () => void; onClockOut: () => void; breaksToday: number;
}) {
  const [confirming, setConfirming] = useState(false);
  const onBreakNow = shift?.status === 'on_break';
  const goal = goalHours * 3600;
  const pct = Math.min(1, todayWorked / goal);
  const tone = !shift ? 'muted' : onBreakNow ? 'warning' : 'success';
  const stroke = tone === 'warning' ? 'var(--warning)' : tone === 'success' ? 'var(--success)' : 'var(--muted-foreground)';
  const remaining = Math.max(0, goal - todayWorked);
  const eta = shift && !onBreakNow && remaining > 0 ? new Date(now.getTime() + remaining * 1000) : null;
  const breakLive = activeBreak ? Math.max(0, Math.floor((now.getTime() - new Date(activeBreak.break_start_at).getTime()) / 1000)) : 0;

  return (
    <div className="relative overflow-hidden rounded-3xl border border-border bg-gradient-to-br from-card via-card to-muted/40 p-6 sm:p-8">
      <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full blur-3xl opacity-20 transition-colors duration-700" style={{ background: stroke }} />
      <div className="relative grid gap-8 md:grid-cols-[auto_1fr] items-center">
        <div className="relative mx-auto h-56 w-56 shrink-0">
          <svg viewBox="0 0 208 208" className="h-full w-full -rotate-90" role="img" aria-label={`${Math.round(pct * 100)} percent of your ${goalHours} hour goal`}>
            <circle cx="104" cy="104" r={R} fill="none" stroke="var(--muted)" strokeWidth="10" />
            {Array.from({ length: 60 }, (_, i) => {
              const a = (i / 60) * 2 * Math.PI; const long = i % 5 === 0;
              return <line key={i} x1={104 + Math.cos(a) * 102} y1={104 + Math.sin(a) * 102} x2={104 + Math.cos(a) * (long ? 98 : 100)} y2={104 + Math.sin(a) * (long ? 98 : 100)} stroke="var(--border)" strokeWidth={long ? 1.5 : 0.75} />;
            })}
            <circle cx="104" cy="104" r={R} fill="none" stroke={stroke} strokeWidth="10" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - (shift ? pct : 0))} className="transition-[stroke-dashoffset,stroke] duration-700 ease-out" />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
            <p className={`font-mono text-[1.65rem] sm:text-3xl font-bold tabular-nums tracking-tight ${!shift ? 'text-muted-foreground' : onBreakNow ? 'text-warning' : 'text-foreground'}`}>{formatDuration(worked)}</p>
            <p className="mt-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
              {shift && !onBreakNow && <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75" /><span className="relative inline-flex h-2 w-2 rounded-full bg-success" /></span>}
              {!shift ? 'Clocked out' : onBreakNow ? 'On break' : 'Working'}
            </p>
            {shift && <p className="mt-2 text-[11px] text-muted-foreground">{Math.round(pct * 100)}% of {goalHours}h goal</p>}
          </div>
        </div>

        <div className="min-w-0 space-y-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">{now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</p>
            <p className="mt-1 font-mono text-2xl font-semibold tabular-nums text-foreground">{fmtClock(now)}</p>
          </div>

          <div className="grid grid-cols-3 gap-3 text-sm">
            <div className="rounded-xl border border-border bg-background/60 px-3 py-2.5"><p className="text-[11px] text-muted-foreground">Started</p><p className="font-semibold text-foreground">{shift ? fmtTime(shift.clock_in_at) : '—'}</p></div>
            <div className="rounded-xl border border-border bg-background/60 px-3 py-2.5"><p className="text-[11px] text-muted-foreground">{onBreakNow ? 'Break running' : 'Breaks today'}</p><p className="font-semibold text-foreground tabular-nums">{onBreakNow ? fmtHM(breakLive) : breaksToday}</p></div>
            <div className="rounded-xl border border-border bg-background/60 px-3 py-2.5"><p className="text-[11px] text-muted-foreground">Goal reached</p><p className="font-semibold text-foreground">{!shift ? '—' : remaining === 0 ? 'Done' : eta ? fmtTime(eta) : 'Paused'}</p></div>
          </div>

          {!confirming ? (
            <div className="flex flex-wrap items-center gap-3">
              {!shift ? (
                <button onClick={onClockIn} disabled={busy} className="inline-flex items-center gap-2 rounded-2xl bg-success px-7 py-3.5 text-sm font-semibold text-success-foreground shadow-lg shadow-success/20 transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50">
                  {busy ? <Loader2 size={16} className="animate-spin" /> : <Zap size={16} />}Clock in
                </button>
              ) : (
                <>
                  <button onClick={onBreak} disabled={busy} className={`inline-flex items-center gap-2 rounded-2xl px-5 py-3 text-sm font-semibold transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 ${onBreakNow ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/20' : 'border border-warning/40 bg-warning/10 text-warning hover:bg-warning/20'}`}>
                    {busy ? <Loader2 size={15} className="animate-spin" /> : <Coffee size={15} />}{onBreakNow ? 'End break' : 'Start break'}
                  </button>
                  <button onClick={() => setConfirming(true)} disabled={busy} className="inline-flex items-center gap-2 rounded-2xl border border-danger/40 bg-danger/10 px-5 py-3 text-sm font-semibold text-danger transition-all hover:bg-danger/20 disabled:opacity-50">
                    <LogOut size={15} />Clock out
                  </button>
                </>
              )}
              <label className="ml-auto inline-flex items-center gap-2 text-xs text-muted-foreground">
                <Target size={13} />Daily goal
                <select value={goalHours} onChange={(e) => onGoal(Number(e.target.value))} className="rounded-lg border border-border bg-background px-2 py-1 text-xs text-foreground">
                  {[4, 5, 6, 7, 8, 9, 10].map(h => <option key={h} value={h}>{h}h</option>)}
                </select>
              </label>
            </div>
          ) : (
            <div className="rounded-2xl border border-danger/30 bg-danger/5 p-4" role="alertdialog" aria-label="Confirm clock out">
              <p className="text-sm font-semibold text-foreground">Clock out now?</p>
              <p className="mt-1 text-xs text-muted-foreground">You worked {fmtHM(todayWorked)} today{shift && shift.total_break_seconds > 0 ? `, with ${fmtHM(shift.total_break_seconds)} of breaks` : ''}.</p>
              <div className="mt-3 flex gap-2">
                <button onClick={() => { setConfirming(false); onClockOut(); }} disabled={busy} className="rounded-xl bg-danger px-4 py-2 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50">Yes, clock out</button>
                <button onClick={() => setConfirming(false)} className="rounded-xl border border-border px-4 py-2 text-xs font-semibold text-foreground hover:bg-muted">Keep working</button>
              </div>
            </div>
          )}
          {!shift && <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Clock size={12} />Idle for 8+ minutes while clocked in triggers a check-in, then an automatic break.</p>}
        </div>
      </div>
    </div>
  );
}
