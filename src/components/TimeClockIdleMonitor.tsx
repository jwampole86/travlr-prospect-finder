'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { AlertTriangle, Clock } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import {
  getActiveShift, sendActivityHeartbeat, recordIdleAutoBreak, recordIdleAutoClockOut, endAutoBreak,
  computeIdleSeconds, formatDuration,
  IDLE_WARNING_MS, IDLE_AUTOBREAK_MS, IDLE_AUTO_CLOCKOUT_MS, HEARTBEAT_INTERVAL_MS,
  type TimeClockShift, type TimeClockBreak,
} from '@/lib/services/timeClockService';

const ACTIVITY_EVENTS = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart', 'wheel'] as const;

/**
 * Global watchdog: prevents the Time Clock from running unattended.
 * Only watches an actively "clocked_in" shift — an explicit manual break is
 * intentional idle time and already excluded from worked hours.
 */
export default function TimeClockIdleMonitor() {
  const { user } = useAuth();
  const [shift, setShift] = useState<TimeClockShift | null>(null);
  const [activeBreak, setActiveBreak] = useState<TimeClockBreak | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [secondsUntilAutoBreak, setSecondsUntilAutoBreak] = useState(0);

  const lastActivityRef = useRef<number>(Date.now());
  const lastHeartbeatRef = useRef<number>(0);
  const shiftRef = useRef<TimeClockShift | null>(null);
  const activeBreakRef = useRef<TimeClockBreak | null>(null);
  const resumingRef = useRef(false);

  shiftRef.current = shift;
  activeBreakRef.current = activeBreak;

  const load = useCallback(async () => {
    if (!user?.id) return;
    const { shift: activeShift, activeBreak: brk } = await getActiveShift(user.id);
    setShift(activeShift);
    setActiveBreak(brk);
  }, [user?.id]);

  useEffect(() => { load(); }, [load]);

  // Track real user activity globally.
  useEffect(() => {
    const markActive = () => { lastActivityRef.current = Date.now(); };
    ACTIVITY_EVENTS.forEach((evt) => window.addEventListener(evt, markActive, { passive: true }));
    const onVisibility = () => { if (!document.hidden) markActive(); };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      ACTIVITY_EVENTS.forEach((evt) => window.removeEventListener(evt, markActive));
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  // Auto-resume an auto-break as soon as real activity returns.
  useEffect(() => {
    if (!activeBreak?.is_auto || resumingRef.current) return;
    const markActive = async () => {
      const s = shiftRef.current;
      const b = activeBreakRef.current;
      if (!s || !b || resumingRef.current) return;
      resumingRef.current = true;
      try {
        await endAutoBreak(s.id, b.id, s.total_break_seconds, b.break_start_at);
        toast.success('Welcome back — your auto-break ended and the timer resumed.');
        await load();
      } finally {
        resumingRef.current = false;
      }
    };
    ACTIVITY_EVENTS.forEach((evt) => window.addEventListener(evt, markActive, { passive: true, once: true } as AddEventListenerOptions));
    return () => { ACTIVITY_EVENTS.forEach((evt) => window.removeEventListener(evt, markActive)); };
  }, [activeBreak?.is_auto, activeBreak?.id, load]);

  // Main idle-detection tick.
  useEffect(() => {
    if (!shift) return;

    const tick = async () => {
      const now = Date.now();

      // Heartbeat while genuinely active and clocked in (not during a break).
      if (shift.status === 'clocked_in' && now - lastActivityRef.current < IDLE_WARNING_MS) {
        if (now - lastHeartbeatRef.current >= HEARTBEAT_INTERVAL_MS) {
          lastHeartbeatRef.current = now;
          await sendActivityHeartbeat(shift.id);
        }
        setShowPrompt(false);
        return;
      }

      if (shift.status === 'clocked_in') {
        const idleMs = now - lastActivityRef.current;
        if (idleMs >= IDLE_AUTOBREAK_MS) {
          setShowPrompt(false);
          const idleSinceIso = new Date(now - idleMs).toISOString();
          const brk = await recordIdleAutoBreak(shift.id, shift.user_id, idleSinceIso);
          toast.warning("You were auto-paused after 10 minutes of inactivity — time won't count until you're back.");
          setActiveBreak(brk);
          await load();
        } else if (idleMs >= IDLE_WARNING_MS) {
          setShowPrompt(true);
          setSecondsUntilAutoBreak(Math.max(0, Math.round((IDLE_AUTOBREAK_MS - idleMs) / 1000)));
        }
        return;
      }

      // On an (auto) break: if idle continues far too long, end the shift entirely.
      if (shift.status === 'on_break' && activeBreak?.is_auto) {
        const idleSinceBreakMs = now - new Date(activeBreak.break_start_at).getTime();
        if (idleSinceBreakMs >= IDLE_AUTO_CLOCKOUT_MS) {
          await recordIdleAutoClockOut(shift.id, shift.user_id, activeBreak, shift.total_break_seconds, activeBreak.break_start_at);
          toast.error('Automatically clocked out after prolonged inactivity.');
          setShift(null);
          setActiveBreak(null);
          setShowPrompt(false);
        }
      }
    };

    const interval = setInterval(tick, 10000);
    return () => clearInterval(interval);
  }, [shift, activeBreak, load]);

  const handleImStillHere = useCallback(async () => {
    lastActivityRef.current = Date.now();
    setShowPrompt(false);
    if (shiftRef.current) await sendActivityHeartbeat(shiftRef.current.id);
  }, []);

  if (!showPrompt) return null;

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-card border border-amber-500/30 rounded-2xl w-full max-w-sm shadow-2xl p-6 text-center">
        <div className="w-12 h-12 rounded-full bg-amber-500/10 flex items-center justify-center mx-auto mb-4">
          <AlertTriangle size={22} className="text-amber-500" />
        </div>
        <h2 className="text-base font-bold text-foreground mb-1.5">Are you still working?</h2>
        <p className="text-sm text-muted-foreground mb-4">
          No activity detected. You'll be automatically put on break in{' '}
          <span className="font-mono font-semibold text-foreground">{formatDuration(secondsUntilAutoBreak)}</span> to keep time tracking accurate.
        </p>
        <button
          onClick={handleImStillHere}
          className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-all"
        >
          <Clock size={15} />
          I'm still working
        </button>
      </div>
    </div>
  );
}
