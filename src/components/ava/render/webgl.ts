// Synced from ava-assistant. Do not edit here: change it there and run tools/sync-to-travlr.mjs.
/** True when the browser can create a WebGL context. Checked once; the 3D character needs it, the simple view does not. */
let cached: boolean | null = null;
export function webglAvailable(): boolean {
  if (cached !== null) return cached;
  try {
    const canvas = document.createElement('canvas');
    cached = !!(canvas.getContext('webgl2') || canvas.getContext('webgl'));
  } catch {
    cached = false;
  }
  return cached;
}

export type ViewMode = '3d' | '2d';

/**
 * AVA is always shown in 3D. The flat view exists only as a safety net for a browser that cannot do WebGL at all
 * (or when the 3D scene fails while running). It is never remembered, so a bad moment cannot leave her stuck in 2D.
 * `?avatar=2d` forces it for support and automated tests.
 */
export function initialViewMode(): ViewMode {
  try {
    if (new URLSearchParams(window.location.search).get('avatar') === '2d') return '2d';
  } catch { /* no window */ }
  return webglAvailable() ? '3d' : '2d';
}
