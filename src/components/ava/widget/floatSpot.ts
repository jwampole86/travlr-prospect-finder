// Synced from ava-assistant. Do not edit here: change it there and run tools/sync-to-travlr.mjs.
/** Width AVA is drawn at while floating beside something. */
export const FLOAT_W = 270;
/** The part of her layer the character actually fills (fractions of the layer), so she is placed by her body, not her margins. */
export const VISIBLE = { x: 0.2, y: 0.1, w: 0.6, h: 0.5 };
const GAP = 14;
const MARGIN = 8;

export interface Box { left: number; top: number; right: number; bottom: number; width?: number; height?: number }

const overlaps = (a: { x: number; y: number; w: number; h: number }, b: Box | null) =>
  !!b && a.x < b.right && a.x + a.w > b.left && a.y < b.bottom && a.y + a.h > b.top;

/**
 * Where AVA hovers (top-left corner, viewport pixels) while pointing at `target`: beside it if there is room, then above or
 * below, never over the chat panel, and never off screen. A target too large to sit beside is pointed at from inside its corner.
 */
export function floatSpot(view: { w: number; h: number }, target: Box, avoid: Box | null, size: { w: number; h: number }) {
  const cx = (target.left + target.right) / 2;
  const cy = (target.top + target.bottom) / 2;
  const clampX = (x: number) => Math.max(MARGIN, Math.min(view.w - size.w - MARGIN, x));
  const clampY = (y: number) => Math.max(MARGIN, Math.min(view.h - size.h - MARGIN, y));
  const inView = (c: { x: number; y: number }) => c.x >= MARGIN && c.y >= MARGIN && c.x + size.w <= view.w - MARGIN && c.y + size.h <= view.h - MARGIN;

  const candidates = [
    { x: target.left - size.w - GAP, y: clampY(cy - size.h / 2) },
    { x: target.right + GAP, y: clampY(cy - size.h / 2) },
    { x: clampX(cx - size.w / 2), y: target.top - size.h - GAP },
    { x: clampX(cx - size.w / 2), y: target.bottom + GAP },
  ];
  for (const c of candidates) if (inView(c) && !overlaps({ ...c, w: size.w, h: size.h }, avoid)) return c;

  // No clear side: sit inside the target's top-right corner, nudged clear of the panel.
  let c = { x: clampX(target.right - size.w - GAP), y: clampY(target.top + GAP) };
  if (overlaps({ ...c, w: size.w, h: size.h }, avoid) && avoid) c = { x: clampX(avoid.left - size.w - GAP), y: c.y };
  return c;
}
