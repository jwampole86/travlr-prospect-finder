// Synced from ava-assistant. Do not edit here: change it there and run tools/sync-to-travlr.mjs.
import { describe, expect, it, vi } from 'vitest';
import { createPerfGuard, perfSnapshot } from './perfGuard';

/** Runs `seconds` of frames at a steady rate. */
const run = (g: ReturnType<typeof createPerfGuard>, fps: number, seconds: number) => { for (let i = 0; i < fps * seconds; i++) g.tick(1000 / fps); };

describe('3D performance guard', () => {
  it('leaves a device that keeps up alone, and reports its frame rate', () => {
    const onLevel = vi.fn();
    const g = createPerfGuard({ onLevel });
    run(g, 60, 20);
    expect(onLevel).not.toHaveBeenCalled();
    expect(perfSnapshot()).toEqual({ fps: 60, level: 0 });
  });

  it('lowers the pixel density after two slow windows in a row, then caps the frame rate if it is still slow', () => {
    const levels: number[] = [];
    const g = createPerfGuard({ onLevel: (l) => levels.push(l) });
    run(g, 15, 3);
    expect(levels).toEqual([]); // one slow window is not enough
    run(g, 15, 2);
    expect(levels).toEqual([1]);
    run(g, 12, 5);
    expect(levels).toEqual([1]); // still giving it a chance
    run(g, 12, 2);
    expect(levels).toEqual([1, 2]);
    run(g, 5, 20);
    expect(levels).toEqual([1, 2]); // the lowest level; nothing more to give up
    expect(g.level()).toBe(2);
  });

  it('forgives one bad patch: a good window resets the count', () => {
    const onLevel = vi.fn();
    const g = createPerfGuard({ onLevel });
    for (let i = 0; i < 5; i++) { run(g, 15, 2); run(g, 60, 2); }
    expect(onLevel).not.toHaveBeenCalled();
  });

  it('still counts a very slow device, whose frames take a few hundred milliseconds', () => {
    const levels: number[] = [];
    const g = createPerfGuard({ onLevel: (l) => levels.push(l) });
    run(g, 3, 5); // about 330 ms per frame
    expect(levels).toEqual([1]);
    run(g, 3, 8);
    expect(levels).toEqual([1, 2]);
  });

  it('does not take a stall (a hidden tab, a locked screen) for a slow device', () => {
    const onLevel = vi.fn();
    const g = createPerfGuard({ onLevel });
    for (let i = 0; i < 20; i++) { run(g, 60, 1); g.tick(5000); }
    expect(onLevel).not.toHaveBeenCalled();
    g.tick(0); g.tick(-4); g.tick(NaN);
    expect(onLevel).not.toHaveBeenCalled();
  });
});
