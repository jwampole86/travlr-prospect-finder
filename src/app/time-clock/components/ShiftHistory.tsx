'use client';

import React, { useEffect, useState } from 'react';
import { AlertTriangle, ChevronDown, Coffee, Download, Loader2, NotebookPen } from 'lucide-react';
import { toast } from 'sonner';
import { computeWorkedSeconds, getBreaksForShifts, updateShiftNotes, type TimeClockShift, type TimeClockBreak } from '@/lib/services/timeClockService';
import { breaksCsv, dayLabel, fmtHM, fmtTime, groupByDay } from '../lib';

function ShiftRow({ shift, now, breaks, onSaved }: { shift: TimeClockShift; now: Date; breaks: TimeClockBreak[]; onSaved: (id: string, notes: string | null) => void }) {
  const [note, setNote] = useState(shift.notes ?? '');
  const [saving, setSaving] = useState(false);
  const worked = computeWorkedSeconds(shift, now);
  const total = Math.max(1, worked + shift.total_break_seconds);
  const save = async () => {
    if ((note.trim() || null) === (shift.notes ?? null)) return;
    setSaving(true);
    try { await updateShiftNotes(shift.id, note); onSaved(shift.id, note.trim() || null); toast.success('Note saved'); } catch { toast.error('Could not save the note'); } finally { setSaving(false); }
  };
  return (
    <div className="rounded-xl border border-border bg-background/60 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium text-foreground tabular-nums">{fmtTime(shift.clock_in_at)} – {shift.clock_out_at ? fmtTime(shift.clock_out_at) : <span className="text-success">In progress</span>}</p>
        <div className="flex items-center gap-2">
          {shift.idle_events_count > 0 && <span className="inline-flex items-center gap-1 rounded-full border border-warning/30 bg-warning/10 px-2 py-0.5 text-[10px] font-medium text-warning"><AlertTriangle size={9} />{shift.idle_events_count} auto-pause{shift.idle_events_count > 1 ? 's' : ''}</span>}
          {shift.auto_clocked_out && <span className="rounded-full border border-danger/30 bg-danger/10 px-2 py-0.5 text-[10px] font-medium text-danger">Auto clocked out</span>}
          <span className="font-mono text-sm font-semibold tabular-nums text-foreground">{fmtHM(worked)}</span>
        </div>
      </div>
      <div className="mt-2 flex h-1.5 overflow-hidden rounded-full bg-muted"><div className="bg-primary" style={{ width: `${(worked / total) * 100}%` }} /><div className="bg-warning/70" style={{ width: `${(shift.total_break_seconds / total) * 100}%` }} /></div>
      {breaks.length > 0 && (
        <ul className="mt-2 space-y-1">
          {breaks.map(b => (
            <li key={b.id} className="flex items-center gap-2 text-xs text-muted-foreground"><Coffee size={11} className="text-warning" />{fmtTime(b.break_start_at)} – {b.break_end_at ? fmtTime(b.break_end_at) : 'now'}<span className="tabular-nums">({fmtHM(Math.max(0, ((b.break_end_at ? new Date(b.break_end_at).getTime() : now.getTime()) - new Date(b.break_start_at).getTime()) / 1000))})</span>{b.is_auto && <span className="rounded bg-warning/10 px-1.5 text-[10px] text-warning">automatic</span>}</li>
          ))}
        </ul>
      )}
      <div className="mt-2 flex items-center gap-2">
        <NotebookPen size={12} className="shrink-0 text-muted-foreground" />
        <input value={note} onChange={e => setNote(e.target.value)} onBlur={save} onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} maxLength={500} placeholder="Add a note to this shift" className="w-full bg-transparent text-xs text-foreground placeholder:text-muted-foreground focus:outline-none" />
        {saving && <Loader2 size={12} className="animate-spin text-muted-foreground" />}
      </div>
    </div>
  );
}

export default function ShiftHistory({ shifts, now, range, onRange, onNotes }: { shifts: TimeClockShift[]; now: Date; range: 7 | 14 | 30; onRange: (r: 7 | 14 | 30) => void; onNotes: (id: string, notes: string | null) => void }) {
  const groups = groupByDay(shifts);
  const [open, setOpen] = useState<string | null>(null);
  const [breaks, setBreaks] = useState<Record<string, TimeClockBreak[]>>({});

  useEffect(() => {
    const g = groups.find(x => x.key === open); if (!g) return;
    const missing = g.shifts.filter(s => !(s.id in breaks)).map(s => s.id); if (!missing.length) return;
    getBreaksForShifts(missing).then(list => setBreaks(prev => { const next = { ...prev }; for (const id of missing) next[id] = list.filter(b => b.shift_id === id); return next; }));
  }, [open, shifts]); // eslint-disable-line react-hooks/exhaustive-deps

  const download = () => {
    const blob = new Blob([breaksCsv(shifts, now)], { type: 'text/csv' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `time-clock-${new Date().toISOString().slice(0, 10)}.csv`; a.click(); URL.revokeObjectURL(a.href);
  };

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex rounded-xl border border-border bg-card p-1 text-xs">
          {([7, 14, 30] as const).map(r => <button key={r} onClick={() => onRange(r)} className={`rounded-lg px-3 py-1.5 font-medium transition-colors ${range === r ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}>{r} days</button>)}
        </div>
        <button onClick={download} disabled={!shifts.length} className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-2 text-xs font-medium text-foreground hover:bg-muted disabled:opacity-50"><Download size={13} />Export CSV</button>
      </div>
      {groups.length === 0 ? <div className="rounded-2xl border border-border bg-card px-4 py-10 text-center text-sm text-muted-foreground">No shifts in this period</div> : (
        <div className="space-y-2">
          {groups.map(g => {
            const worked = g.shifts.reduce((a, s) => a + computeWorkedSeconds(s, now), 0); const brk = g.shifts.reduce((a, s) => a + s.total_break_seconds, 0); const pauses = g.shifts.reduce((a, s) => a + s.idle_events_count, 0);
            const isOpen = open === g.key;
            return (
              <div key={g.key} className="overflow-hidden rounded-2xl border border-border bg-card">
                <button onClick={() => setOpen(isOpen ? null : g.key)} aria-expanded={isOpen} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/40">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-foreground">{dayLabel(g.key, now)}</p>
                    <p className="text-xs text-muted-foreground">{g.shifts.length} shift{g.shifts.length === 1 ? '' : 's'}{brk > 0 ? ` · ${fmtHM(brk)} break` : ''}{pauses > 0 ? ` · ${pauses} auto-pause${pauses === 1 ? '' : 's'}` : ''}</p>
                  </div>
                  <span className="font-mono text-sm font-semibold tabular-nums text-foreground">{fmtHM(worked)}</span>
                  <ChevronDown size={16} className={`text-muted-foreground transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                </button>
                {isOpen && <div className="space-y-2 border-t border-border bg-muted/20 p-3">{g.shifts.map(s => <ShiftRow key={s.id} shift={s} now={now} breaks={breaks[s.id] ?? []} onSaved={onNotes} />)}</div>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
