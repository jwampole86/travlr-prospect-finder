'use client';

import React from 'react';
import { computeWorkedSeconds, type TimeClockShift, type TimeClockBreak } from '@/lib/services/timeClockService';
import { fmtHM, fmtTime } from '../lib';

/** Today as a horizontal timeline: work in the accent color, breaks in amber, auto-breaks hatched. */
export default function DayTimeline({ shifts, breaks, now }: { shifts: TimeClockShift[]; breaks: TimeClockBreak[]; now: Date }) {
  if (shifts.length === 0) return <p className="py-6 text-center text-sm text-muted-foreground">No time recorded today yet. Your day will appear here once you clock in.</p>;
  const starts = shifts.map(s => new Date(s.clock_in_at).getTime());
  const ends = shifts.map(s => (s.clock_out_at ? new Date(s.clock_out_at).getTime() : now.getTime()));
  const lo = new Date(Math.min(...starts)); lo.setMinutes(0, 0, 0);
  const hi = new Date(Math.max(...ends, now.getTime())); hi.setHours(hi.getHours() + 1, 0, 0, 0);
  const span = Math.max(1, hi.getTime() - lo.getTime());
  const pos = (t: number) => `${((t - lo.getTime()) / span) * 100}%`;
  const wid = (a: number, b: number) => `${(Math.max(0, b - a) / span) * 100}%`;
  const ticks: Date[] = []; for (let t = new Date(lo); t <= hi; t = new Date(t.getTime() + 3_600_000)) ticks.push(new Date(t));
  const step = ticks.length > 14 ? 3 : ticks.length > 8 ? 2 : 1;

  return (
    <div>
      <div className="relative h-14 rounded-xl bg-muted/60">
        {shifts.map((s, i) => (
          <div key={s.id} className="absolute inset-y-2 rounded-lg bg-primary/80 shadow-sm" style={{ left: pos(starts[i]), width: wid(starts[i], ends[i]) }} title={`${fmtTime(s.clock_in_at)} to ${s.clock_out_at ? fmtTime(s.clock_out_at) : 'now'}: ${fmtHM(computeWorkedSeconds(s, now))} worked`} />
        ))}
        {breaks.map(b => {
          const a = new Date(b.break_start_at).getTime(); const e = b.break_end_at ? new Date(b.break_end_at).getTime() : now.getTime();
          return <div key={b.id} className={`absolute inset-y-1 rounded-md border border-warning/60 ${b.is_auto ? 'bg-[repeating-linear-gradient(45deg,color-mix(in_srgb,var(--warning)_35%,transparent),color-mix(in_srgb,var(--warning)_35%,transparent)_4px,transparent_4px,transparent_8px)]' : 'bg-warning/60'}`} style={{ left: pos(a), width: wid(a, e) }} title={`${b.is_auto ? 'Automatic break' : 'Break'}: ${fmtTime(b.break_start_at)} to ${b.break_end_at ? fmtTime(b.break_end_at) : 'now'}`} />;
        })}
        <div className="absolute inset-y-0 w-px bg-foreground/40" style={{ left: pos(now.getTime()) }}><span className="absolute -top-1 -left-[3px] h-1.5 w-1.5 rounded-full bg-foreground" /></div>
      </div>
      <div className="relative mt-1.5 h-4 text-[10px] text-muted-foreground">
        {ticks.filter((_, i) => i % step === 0).map(t => <span key={t.getTime()} className="absolute -translate-x-1/2 tabular-nums" style={{ left: pos(t.getTime()) }}>{t.toLocaleTimeString('en-US', { hour: 'numeric' })}</span>)}
      </div>
      <div className="mt-3 flex flex-wrap gap-4 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded bg-primary/80" />Working</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded bg-warning/60" />Break</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded border border-warning/60 bg-[repeating-linear-gradient(45deg,color-mix(in_srgb,var(--warning)_50%,transparent),color-mix(in_srgb,var(--warning)_50%,transparent)_2px,transparent_2px,transparent_4px)]" />Automatic break</span>
      </div>
    </div>
  );
}
