// Synced from ava-assistant. Do not edit here: change it there and run tools/sync-to-travlr.mjs.
/**
 * Spec v2 coordinate rule: AVA faces +Z toward the viewer, so her LEFT side is +X, which is screen-right.
 * `gaze` is -1 (target on screen-left) .. 1 (target on screen-right).
 */
export const LEFT_AXIS_SIGN = 1;

/** The arm nearer to a guided UI target. */
export function nearerArm(gaze: number): 'left' | 'right' {
  return gaze * LEFT_AXIS_SIGN < 0 ? 'right' : 'left';
}
