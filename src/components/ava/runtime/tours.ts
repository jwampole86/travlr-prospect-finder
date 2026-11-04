// Synced from ava-assistant. Do not edit here: change it there and run tools/sync-to-travlr.mjs.
import type { AvaBus } from './useAva';
import type { TourDefinition, TourStep } from '../host/types';

export interface TourEnv {
  currentRoute: () => string;
  navigate: (route: string) => void;
  hasAnchor: (id: string) => boolean;
  /** Opens whatever hides an element (a collapsed menu category) before AVA points at it. */
  reveal?: (id: string) => void;
  sleep: (ms: number) => Promise<void>;
  now: () => number;
}

export const ROUTE_WAIT_MS = 6000;
export const ANCHOR_WAIT_MS = 4000;
const POLL_MS = 100;

async function waitUntil(env: TourEnv, ok: () => boolean, timeoutMs: number, cancelled: () => boolean): Promise<boolean> {
  const end = env.now() + timeoutMs;
  while (!ok()) {
    if (cancelled() || env.now() >= end) return ok();
    await env.sleep(POLL_MS);
  }
  return true;
}

export interface TourRun {
  bus: AvaBus;
  env: TourEnv;
  requestId: string;
  /** Shows and speaks one line of AVA text, resolving when it has been presented. */
  say: (text: string) => Promise<void>;
  /** Plain note for the user (not spoken by AVA), e.g. that an element could not be found. */
  notify: (text: string) => void;
  cancelled: () => boolean;
}

export type TourResult = { status: 'completed' | 'cancelled'; resolved: string[]; unresolved: string[] };

/**
 * Walks a tour step by step. A step only points at its element once that element is actually visible
 * (after navigating if needed); otherwise the explanation is still shown but AVA does not point at anything.
 */
export async function runTour(def: TourDefinition, run: TourRun): Promise<TourResult> {
  const tourId = `${def.id}_${run.requestId}`;
  const resolved: string[] = [];
  const unresolved: string[] = [];

  for (const [i, step] of def.steps.entries()) {
    if (run.cancelled()) return { status: 'cancelled', resolved, unresolved };
    const ok = await arrive(step, run);
    if (run.cancelled()) return { status: 'cancelled', resolved, unresolved };

    run.bus.emit('ava.tour.step', undefined, {
      tourId,
      stepId: step.id || `step_${i + 1}`,
      anchorId: step.anchor,
      anchorResolved: ok,
      side: step.side ?? 'auto'
    });
    (ok ? resolved : unresolved).push(step.id);
    if (!ok) run.notify(`I couldn't find "${step.anchor}" on this screen, so I won't point at it. ${step.say}`);
    else await run.say(step.say);
  }
  if (!run.cancelled()) run.bus.emit('ava.tour.ended', undefined, { tourId });
  return { status: run.cancelled() ? 'cancelled' : 'completed', resolved, unresolved };
}

async function arrive(step: TourStep, run: TourRun): Promise<boolean> {
  const { env } = run;
  if (step.route && env.currentRoute() !== step.route) {
    env.navigate(step.route);
    const there = await waitUntil(env, () => env.currentRoute() === step.route, ROUTE_WAIT_MS, run.cancelled);
    if (!there) return false;
  }
  if (!env.hasAnchor(step.anchor) && env.reveal) {
    env.reveal(step.anchor);
    await env.sleep(250); // let the menu finish opening before looking for the item
  }
  return waitUntil(env, () => env.hasAnchor(step.anchor), ANCHOR_WAIT_MS, run.cancelled);
}
