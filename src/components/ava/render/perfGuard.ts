// Synced from ava-assistant. Do not edit here: change it there and run tools/sync-to-travlr.mjs.
/**
 * Keeps the 3D character smooth on slower devices. It measures the real frame rate in two-second windows and, if the device cannot keep up,
 * steps the quality down: first a lower pixel density, then a 30 frames-per-second cap. She stays 3D throughout; it only ever goes down
 * (a device that struggled once will struggle again) and a long stall (a hidden tab, a screen lock) is not counted as slowness.
 */
export type PerfLevel = 0 | 1 | 2;
export const PERF_LABEL: Record<PerfLevel, string> = { 0: 'Full quality', 1: 'Reduced sharpness', 2: 'Light (30 frames a second)' };

export interface PerfSnapshot { fps: number; level: PerfLevel }

const listeners = new Set<(s: PerfSnapshot) => void>();
let current: PerfSnapshot = { fps: 0, level: 0 };

export const perfSnapshot = () => current;
export function subscribePerf(fn: (s: PerfSnapshot) => void) {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}
function publish(s: PerfSnapshot) {
  current = s;
  try { (window as unknown as { __avaPerf?: PerfSnapshot }).__avaPerf = s; } catch { /* no window */ }
  listeners.forEach((fn) => fn(s));
}

export interface PerfGuardOptions {
  onLevel: (level: PerfLevel) => void;
  windowMs?: number;
  /** Below this many frames a second at level 0, a window counts as slow. */
  slowFps?: number;
  /** The same, once quality has already been reduced once. */
  slowFpsReduced?: number;
}

export function createPerfGuard({ onLevel, windowMs = 2000, slowFps = 24, slowFpsReduced = 18 }: PerfGuardOptions) {
  let acc = 0, frames = 0, slow = 0;
  let level: PerfLevel = 0;
  return {
    level: () => level,
    /** Feed it the time each frame took, in milliseconds. */
    tick(dtMs: number) {
      if (!(dtMs > 0)) return;
      // A hidden tab or a locked screen leaves a gap of seconds, which says nothing about how hard the scene is to draw. A struggling device
      // gives frames of a few hundred milliseconds, and those are exactly what must be counted.
      if (dtMs > 1000) { acc = 0; frames = 0; return; }
      acc += dtMs; frames++;
      if (acc < windowMs) return;
      const fps = (frames * 1000) / acc;
      acc = 0; frames = 0;
      publish({ fps: Math.round(fps), level });
      if (level >= 2) return;
      slow = fps < (level === 0 ? slowFps : slowFpsReduced) ? slow + 1 : 0;
      if (slow >= (level === 0 ? 2 : 3)) {
        level = (level + 1) as PerfLevel;
        slow = 0;
        publish({ fps: Math.round(fps), level });
        onLevel(level);
      }
    },
  };
}
