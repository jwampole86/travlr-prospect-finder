'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Clock, Coffee, LogOut, Loader2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import {
  getActiveShift, clockIn, startBreak, endBreak, clockOut,
  computeWorkedSeconds, formatDuration,
  type TimeClockShift, type TimeClockBreak,
} from '@/lib/services/timeClockService';

export default function TimeClockWidget() {
  const { user } = useAuth();
  const [shift, setShift] = useState<TimeClockShift | null>(null);
  const [activeBreak, setActiveBreak] = useState<TimeClockBreak | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(new Date());
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    if (!user?.id) return;
    try {
      const { shift: activeShift, activeBreak: brk } = await getActiveShift(user.id);
      setShift(activeShift);
      setActiveBreak(brk);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    tickRef.current = setInterval(() => setNow(new Date()), 1000);
    return () => { if (tickRef.current) clearInterval(tickRef.current); };
  }, []);

  if (!user?.id || loading) return null;

  const handleClockIn = async () => {
    setBusy(true);
    try {
      const newShift = await clockIn(user.id);
      setShift(newShift);
      toast.success('Clocked in');
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
        const brk = await startBreak(shift.id, user.id);
        setActiveBreak(brk);
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
      setShift(null);
      setActiveBreak(null);
      toast.success('Clocked out');
    } catch {
      toast.error('Failed to clock out');
    } finally {
      setBusy(false);
    }
  };

  if (!shift) {
    return (
      <button
        onClick={handleClockIn}
        disabled={busy}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-success/10 text-success border border-success/30 hover:bg-success/20 transition-colors disabled:opacity-50"
        title="Clock in"
      >
        {busy ? <Loader2 size={13} className="animate-spin" /> : <Clock size={13} />}
        Clock In
      </button>
    );
  }

  const onBreak = shift.status === 'on_break';
  const worked = computeWorkedSeconds(shift, now);

  return (
    <div className="flex items-center gap-1.5">
      <span
        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-mono font-semibold border ${
          onBreak ? 'bg-amber-500/10 text-amber-600 border-amber-500/30' : 'bg-primary/10 text-primary border-primary/30'
        }`}
        title={onBreak ? 'On break — timer paused' : 'Clocked in'}
      >
        <Clock size={13} className={onBreak ? '' : 'animate-pulse'} />
        {formatDuration(worked)}
        {onBreak && <span className="font-sans font-medium">On Break</span>}
      </span>
      <button
        onClick={handleBreakToggle}
        disabled={busy}
        className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium text-muted-foreground hover:bg-muted transition-colors disabled:opacity-50"
        title={onBreak ? 'End break' : 'Start break'}
      >
        <Coffee size={13} />
      </button>
      <button
        onClick={handleClockOut}
        disabled={busy}
        className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium text-muted-foreground hover:bg-red-500/10 hover:text-red-500 transition-colors disabled:opacity-50"
        title="Clock out"
      >
        <LogOut size={13} />
      </button>
    </div>
  );
}
