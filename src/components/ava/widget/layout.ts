// Synced from ava-assistant. Do not edit here: change it there and run tools/sync-to-travlr.mjs.
/** How the person likes AVA set out: where she sits, whether she is hidden or in focus mode, and the daily briefing. Kept in this browser only. */
export interface LayoutPrefs {
  /** Distance of her window from the bottom-right corner, in px. Unset until the person moves her. */
  right?: number;
  bottom?: number;
  /** Only a small tab is left on the screen edge. */
  hidden: boolean;
  /** She keeps out of the way: no briefing, she never opens or flies out on her own. She still answers when asked. */
  focus: boolean;
  /** The once-a-day summary of what needs the person. */
  briefing: boolean;
  /** Local date (YYYY-MM-DD) of the last briefing, so it comes once a day. */
  briefedOn?: string;
}

export const LAYOUT_KEY = 'ava.layout.v1';
export const defaultLayout = (): LayoutPrefs => ({ hidden: false, focus: false, briefing: true });

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && Math.abs(v) < 100_000 ? Math.round(v) : undefined);

export function parseLayout(raw: string | null | undefined): LayoutPrefs {
  const base = defaultLayout();
  if (!raw) return base;
  try {
    const v = JSON.parse(raw) as Record<string, unknown>;
    if (!v || typeof v !== 'object') return base;
    const right = num(v.right), bottom = num(v.bottom);
    return {
      hidden: v.hidden === true,
      focus: v.focus === true,
      briefing: v.briefing !== false,
      briefedOn: typeof v.briefedOn === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v.briefedOn) ? v.briefedOn : undefined,
      ...(right !== undefined && bottom !== undefined ? { right, bottom } : {})
    };
  } catch {
    return base;
  }
}

export function loadLayout(): LayoutPrefs {
  try { return parseLayout(window.localStorage.getItem(LAYOUT_KEY)); } catch { return defaultLayout(); }
}
export function saveLayout(p: LayoutPrefs) {
  try { window.localStorage.setItem(LAYOUT_KEY, JSON.stringify(p)); } catch { /* private mode: it simply is not remembered */ }
}

const MARGIN = 8;
/** Keeps her window fully on screen: a saved position from a bigger window can never leave her stranded off the edge. */
export function clampPosition(pos: { right: number; bottom: number }, box: { w: number; h: number }, view: { w: number; h: number }) {
  const limit = (v: number, size: number, room: number) => Math.round(Math.min(Math.max(MARGIN, v), Math.max(MARGIN, room - size - MARGIN)));
  return { right: limit(pos.right, box.w, view.w), bottom: limit(pos.bottom, box.h, view.h) };
}

export const dayKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Whether the daily briefing is due: switched on, not in focus mode, and not already given today. */
export const briefingDue = (p: LayoutPrefs, today = dayKey()) => p.briefing && !p.focus && !p.hidden && p.briefedOn !== today;
