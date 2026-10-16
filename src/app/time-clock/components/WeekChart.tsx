'use client';

import React, { useState } from 'react';
import { fmtHM, type DayTotal } from '../lib';

/** Hours worked per day as bars with a goal line. Today is highlighted; weekends are muted. */
export default function WeekChart({ days, goalHours }: { days: DayTotal[]; goalHours: number }) {
  const [hover, setHover] = useState<string | null>(null);
  const max = Math.max(goalHours * 3600 * 1.15, ...days.map(d => d.worked), 3600);
  const todayKey = days[days.length - 1]?.key;
  const dense = days.length > 14;
  const active = days.find(d => d.key === hover);
  return (
    <div>
      <div className="relative h-44" onMouseLeave={() => setHover(null)}>
        <div className="absolute inset-x-0 border-t border-dashed border-primary/40" style={{ bottom: `${((goalHours * 3600) / max) * 100}%` }}>
          <span className="absolute -top-4 right-0 text-[10px] font-medium text-primary">{goalHours}h goal</span>
        </div>
        <div className="absolute inset-0 flex items-end gap-1 sm:gap-1.5">
          {days.map(d => {
            const h = (d.worked / max) * 100; const wk = [0, 6].includes(d.date.getDay()); const reached = d.worked >= goalHours * 3600;
            return (
              <button key={d.key} type="button" onMouseEnter={() => setHover(d.key)} onFocus={() => setHover(d.key)} aria-label={`${d.date.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}: ${fmtHM(d.worked)} worked`}
                className="group relative flex h-full flex-1 items-end rounded-md outline-none focus-visible:ring-2 focus-visible:ring-primary">
                <div className={`w-full rounded-t-md transition-all duration-500 ${d.key === todayKey ? 'bg-primary' : reached ? 'bg-success/80' : wk ? 'bg-muted-foreground/30' : 'bg-primary/45'} group-hover:opacity-100 ${hover && hover !== d.key ? 'opacity-60' : ''}`} style={{ height: `${Math.max(d.worked > 0 ? 3 : 0, h)}%` }} />
              </button>
            );
          })}
        </div>
        {active && (
          <div className="pointer-events-none absolute -top-2 left-1/2 z-10 -translate-x-1/2 -translate-y-full rounded-xl border border-border bg-card px-3 py-2 text-xs shadow-lg">
            <p className="font-semibold text-foreground">{active.date.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}</p>
            <p className="text-muted-foreground">{fmtHM(active.worked)} worked · {fmtHM(active.breaks)} break · {active.shifts} shift{active.shifts === 1 ? '' : 's'}{active.pauses ? ` · ${active.pauses} auto-pause${active.pauses === 1 ? '' : 's'}` : ''}</p>
          </div>
        )}
      </div>
      <div className="mt-2 flex gap-1 sm:gap-1.5 text-[10px] text-muted-foreground">
        {days.map(d => <span key={d.key} className={`flex-1 text-center ${d.key === todayKey ? 'font-bold text-foreground' : ''}`}>{dense ? (d.date.getDate() % 5 === 0 || d.key === todayKey ? d.date.getDate() : '') : d.date.toLocaleDateString('en-US', { weekday: 'narrow' })}</span>)}
      </div>
    </div>
  );
}
