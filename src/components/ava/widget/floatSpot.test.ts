// Synced from ava-assistant. Do not edit here: change it there and run tools/sync-to-travlr.mjs.
import { describe, expect, it } from 'vitest';
import { floatSpot } from './floatSpot';

const view = { w: 1400, h: 900 };
const size = { w: 190, h: 230 };
const box = (left: number, top: number, w: number, h: number) => ({ left, top, right: left + w, bottom: top + h });
const panel = box(1040, 480, 350, 410);
const overlaps = (c: { x: number; y: number }, b: ReturnType<typeof box>) => c.x < b.right && c.x + size.w > b.left && c.y < b.bottom && c.y + size.h > b.top;

describe('floatSpot', () => {
  it('hovers beside a small target, on the side with room', () => {
    const t = box(600, 300, 200, 60);
    const c = floatSpot(view, t, panel, size);
    expect(c.x + size.w).toBeLessThanOrEqual(t.left);
    expect(overlaps(c, t)).toBe(false);
  });

  it('moves to the right when there is no room on the left', () => {
    const t = box(40, 300, 150, 60);
    const c = floatSpot(view, t, panel, size);
    expect(c.x).toBeGreaterThanOrEqual(t.right);
  });

  it('goes above or below a wide target', () => {
    const t = box(250, 400, 1100, 60);
    const c = floatSpot(view, t, panel, size);
    expect(overlaps(c, t)).toBe(false);
    expect(overlaps(c, panel)).toBe(false);
  });

  it('never covers the chat panel or leaves the screen', () => {
    for (const t of [box(900, 500, 120, 50), box(10, 10, 100, 40), box(1250, 100, 130, 40), box(300, 800, 400, 60)]) {
      const c = floatSpot(view, t, panel, size);
      expect(overlaps(c, panel)).toBe(false);
      expect(c.x).toBeGreaterThanOrEqual(8);
      expect(c.y).toBeGreaterThanOrEqual(8);
      expect(c.x + size.w).toBeLessThanOrEqual(view.w - 8);
      expect(c.y + size.h).toBeLessThanOrEqual(view.h - 8);
    }
  });

  it('points from inside the corner of a target that fills the screen', () => {
    const t = box(0, 0, 1400, 900);
    const c = floatSpot(view, t, null, size);
    expect(c.x + size.w).toBeLessThanOrEqual(view.w - 8);
    expect(c.x).toBeGreaterThan(900);
  });
});
