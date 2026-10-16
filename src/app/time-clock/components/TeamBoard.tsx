'use client';

import React, { useMemo, useState } from 'react';
import { AlertTriangle, Search } from 'lucide-react';
import { computeIdleSeconds, computeWorkedSeconds, formatDuration, IDLE_WARNING_MS, type TeamShiftStatus } from '@/lib/services/timeClockService';
import { fmtHM, fmtTime } from '../lib';

const initials = (name: string) => { const p = name.trim().split(/\s+/).filter(Boolean); return p.length === 0 ? '?' : p.length === 1 ? p[0].slice(0, 2).toUpperCase() : (p[0][0] + p[p.length - 1][0]).toUpperCase(); };

export default function TeamBoard({ live, week, now }: { live: TeamShiftStatus[]; week: TeamShiftStatus[]; now: Date }) {
  const [q, setQ] = useState('');
  const liveRows = live.map(s => {
    const idle = computeIdleSeconds(s, now); const isIdle = s.status === 'clocked_in' && idle * 1000 >= IDLE_WARNING_MS;
    return { s, idle, state: s.status === 'on_break' ? 'break' as const : isIdle ? 'idle' as const : 'working' as const };
  }).filter(r => !q || (r.s.full_name + r.s.email).toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => ['idle', 'break', 'working'].indexOf(a.state) - ['idle', 'break', 'working'].indexOf(b.state));
  const counts = { working: liveRows.filter(r => r.state === 'working').length, break: liveRows.filter(r => r.state === 'break').length, idle: liveRows.filter(r => r.state === 'idle').length };

  const people = useMemo(() => {
    const m = new Map<string, { name: string; worked: number; shifts: number; pauses: number; days: Set<string> }>();
    for (const s of week) {
      const p = m.get(s.user_id) ?? { name: s.full_name || s.email, worked: 0, shifts: 0, pauses: 0, days: new Set<string>() };
      p.worked += computeWorkedSeconds(s, now); p.shifts += 1; p.pauses += s.idle_events_count; p.days.add(new Date(s.clock_in_at).toDateString()); m.set(s.user_id, p);
    }
    return [...m.values()].sort((a, b) => b.worked - a.worked);
  }, [week, now]);
  const top = Math.max(1, ...people.map(p => p.worked));

  return (
    <div className="space-y-6">
      <div>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2 text-xs font-medium">
            <span className="rounded-full border border-success/30 bg-success/10 px-3 py-1 text-success">{counts.working} working</span>
            <span className="rounded-full border border-warning/30 bg-warning/10 px-3 py-1 text-warning">{counts.break} on break</span>
            <span className="rounded-full border border-border bg-muted px-3 py-1 text-muted-foreground">{counts.idle} idle</span>
          </div>
          <div className="relative"><Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Search team" className="w-48 rounded-xl border border-border bg-card py-2 pl-8 pr-3 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30" /></div>
        </div>
        {liveRows.length === 0 ? <div className="rounded-2xl border border-border bg-card px-4 py-10 text-center text-sm text-muted-foreground">{live.length ? 'No one matches your search' : 'No one is clocked in right now'}</div> : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {liveRows.map(({ s, idle, state }) => {
              const name = s.full_name || s.email;
              const ring = state === 'break' ? 'ring-warning' : state === 'idle' ? 'ring-muted-foreground/40' : 'ring-success';
              return (
                <div key={s.id} className="flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3 transition-shadow hover:shadow-md">
                  <div className="relative shrink-0">
                    <div className={`flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary ring-2 ${ring}`}>{initials(name)}</div>
                    {state === 'working' && <span className="absolute -bottom-0.5 -right-0.5 flex h-3 w-3"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75" /><span className="relative inline-flex h-3 w-3 rounded-full border-2 border-card bg-success" /></span>}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-foreground">{name}</p>
                    <p className="text-xs text-muted-foreground">Since {fmtTime(s.clock_in_at)}{state === 'break' ? ' · On break' : ''}</p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    {state === 'idle' && <span className="inline-flex items-center gap-1 rounded-full border border-warning/30 bg-warning/10 px-1.5 py-0.5 text-[10px] font-medium text-warning"><AlertTriangle size={9} />Idle {formatDuration(idle)}</span>}
                    <span className={`font-mono text-sm font-semibold tabular-nums ${state === 'break' ? 'text-warning' : 'text-primary'}`}>{formatDuration(computeWorkedSeconds(s, now))}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div>
        <h3 className="mb-3 text-sm font-semibold text-foreground">Last 7 days</h3>
        {people.length === 0 ? <div className="rounded-2xl border border-border bg-card px-4 py-8 text-center text-sm text-muted-foreground">No shifts in the last 7 days</div> : (
          <div className="overflow-hidden rounded-2xl border border-border bg-card">
            {people.map((p, i) => (
              <div key={p.name + i} className="flex items-center gap-3 border-b border-border px-4 py-3 last:border-0">
                <span className="w-5 text-xs font-semibold tabular-nums text-muted-foreground">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2"><p className="truncate text-sm font-medium text-foreground">{p.name}</p><span className="font-mono text-sm font-semibold tabular-nums text-foreground">{fmtHM(p.worked)}</span></div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary transition-all duration-500" style={{ width: `${(p.worked / top) * 100}%` }} /></div>
                  <p className="mt-1 text-[11px] text-muted-foreground">{p.days.size} day{p.days.size === 1 ? '' : 's'} · {p.shifts} shift{p.shifts === 1 ? '' : 's'}{p.pauses ? ` · ${p.pauses} auto-pause${p.pauses === 1 ? '' : 's'}` : ''}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
