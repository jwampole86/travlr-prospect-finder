// Synced from ava-assistant. Do not edit here: change it there and run tools/sync-to-travlr.mjs.
import { describe, expect, it } from 'vitest';
import { ANCHOR_WAIT_MS, ROUTE_WAIT_MS, runTour } from './tours';
import type { TourEnv } from './tours';
import type { TourDefinition } from '../host/types';
import type { AvaBus } from './useAva';

/** Virtual clock: sleeping just moves time forward, so waits are instant and deterministic. */
function fakeWorld(opts: { route?: string; anchors?: Record<string, number>; routeChangeAt?: Record<string, number> } = {}) {
  let t = 0;
  let route = opts.route ?? '/';
  const navigations: string[] = [];
  const env: TourEnv = {
    now: () => t,
    sleep: async (ms) => { t += ms; },
    currentRoute: () => {
      for (const [r, at] of Object.entries(opts.routeChangeAt ?? {})) if (navigations.includes(r) && t >= at) route = r;
      return route;
    },
    navigate: (r) => {
      navigations.push(r);
      if (!(opts.routeChangeAt && r in opts.routeChangeAt)) route = r;
    },
    // An anchor appears at the given virtual time (0 = already there); missing = never.
    hasAnchor: (id) => id in (opts.anchors ?? {}) && t >= (opts.anchors ?? {})[id]
  };
  return { env, navigations, now: () => t };
}

function fakeBus() {
  const events: Array<{ type: string; payload: Record<string, unknown> }> = [];
  const bus = { emit: (type: string, _req?: string, payload: Record<string, unknown> = {}) => { events.push({ type, payload }); return null; } } as unknown as AvaBus;
  return { bus, events };
}

const tour = (steps: TourDefinition['steps']): TourDefinition => ({ id: 't', title: 'T', summary: '', roles: ['agent'], steps });

async function run(def: TourDefinition, world: ReturnType<typeof fakeWorld>, cancelAfterSteps?: number) {
  const { bus, events } = fakeBus();
  const said: string[] = [];
  const notes: string[] = [];
  const result = await runTour(def, {
    bus, env: world.env, requestId: 'r1',
    say: async (t) => { said.push(t); },
    notify: (t) => { notes.push(t); },
    cancelled: () => cancelAfterSteps !== undefined && said.length + notes.length >= cancelAfterSteps
  });
  return { result, events, said, notes };
}

describe('tour engine', () => {
  it('points at each element in order and ends the tour', async () => {
    const w = fakeWorld({ anchors: { a: 0, b: 0 } });
    const { result, events, said } = await run(tour([{ id: 's1', anchor: 'a', say: 'one' }, { id: 's2', anchor: 'b', say: 'two' }]), w);
    expect(result).toMatchObject({ status: 'completed', resolved: ['s1', 's2'], unresolved: [] });
    expect(said).toEqual(['one', 'two']);
    expect(events.map((e) => e.type)).toEqual(['ava.tour.step', 'ava.tour.step', 'ava.tour.ended']);
    expect(events[0].payload).toMatchObject({ anchorId: 'a', anchorResolved: true });
    expect(w.navigations).toEqual([]);
  });

  it('navigates to the step screen first, then waits for the element to appear', async () => {
    const w = fakeWorld({ route: '/leads', anchors: { board: 1500 }, routeChangeAt: { '/pipeline': 800 } });
    const { result, events } = await run(tour([{ id: 'board', anchor: 'board', route: '/pipeline', say: 'the board' }]), w);
    expect(w.navigations).toEqual(['/pipeline']);
    expect(result.resolved).toEqual(['board']);
    expect(events[0].payload).toMatchObject({ anchorId: 'board', anchorResolved: true });
  });

  it('never points at an element that does not exist; it explains in text instead', async () => {
    const w = fakeWorld({ anchors: { a: 0 } });
    const { result, events, said, notes } = await run(tour([{ id: 's1', anchor: 'ghost', say: 'ghost text' }, { id: 's2', anchor: 'a', say: 'real' }]), w);
    expect(result).toMatchObject({ status: 'completed', resolved: ['s2'], unresolved: ['s1'] });
    expect(events[0].payload).toMatchObject({ anchorId: 'ghost', anchorResolved: false });
    expect(said).toEqual(['real']);
    expect(notes[0]).toContain('ghost text');
    expect(w.now()).toBeGreaterThanOrEqual(ANCHOR_WAIT_MS);
  });

  it('gives up on a screen that never loads instead of hanging', async () => {
    const w = fakeWorld({ route: '/x', anchors: { board: 0 }, routeChangeAt: { '/pipeline': 10 ** 9 } });
    const { result } = await run(tour([{ id: 'b', anchor: 'board', route: '/pipeline', say: 'x' }]), w);
    expect(result.unresolved).toEqual(['b']);
    expect(w.now()).toBeGreaterThanOrEqual(ROUTE_WAIT_MS);
    expect(w.now()).toBeLessThan(ROUTE_WAIT_MS + 1000);
  });

  it('stops without an end event when cancelled', async () => {
    const w = fakeWorld({ anchors: { a: 0, b: 0, c: 0 } });
    const { result, events } = await run(tour([{ id: '1', anchor: 'a', say: 'x' }, { id: '2', anchor: 'b', say: 'y' }, { id: '3', anchor: 'c', say: 'z' }]), w, 1);
    expect(result.status).toBe('cancelled');
    expect(events.some((e) => e.type === 'ava.tour.ended')).toBe(false);
    expect(events.filter((e) => e.type === 'ava.tour.step')).toHaveLength(1);
  });
});
