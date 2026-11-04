// Synced from ava-assistant. Do not edit here: change it there and run tools/sync-to-travlr.mjs.
/** What an app (AVYRO/TRAVLR, or the sandbox) provides so AVA can live inside it. */
export type AvaRole = 'admin' | 'owner' | 'agent' | 'homeowner';

export interface TourStep {
  id: string;
  /** `data-ava-anchor` id of the element to point at. */
  anchor: string;
  /** Spoken/typed explanation for this step. */
  say: string;
  /** Screen the step lives on; AVA navigates there first if the user is elsewhere. */
  route?: string;
  side?: 'left' | 'right' | 'auto';
}

export interface TourDefinition {
  id: string;
  title: string;
  summary: string;
  /** Roles that may take this tour. */
  roles: AvaRole[];
  /** Words that make the offline demo pick this tour. */
  keywords?: string[];
  steps: TourStep[];
}

export interface AvaSelection {
  leadId?: string;
  leadName?: string;
}

/** What the browser tells the server about the current screen. Shapes the prompt only; the server owns authorization. */
export interface AvaContext {
  route: string;
  anchors: string[];
  features: string[];
  tours: Array<{ id: string; title: string }>;
  selection: AvaSelection;
}

export interface AvaHost {
  /** Where `/models/ava.glb` and `/brand/avyro-mark.png` are served from, without a trailing slash. */
  assetBase: string;
  /** Prefix for `/api/ava/*`. */
  apiBase: string;
  /**
   * When the assistant service is unreachable, play the built-in labelled demo script (sandbox only).
   * A real app sets this to false so AVA never shows sample data as if it were real.
   */
  offlineDemo: boolean;
  /** For UI hints (suggestions, tours) only. The server decides what is allowed from the signed-in session. */
  role: AvaRole | null;
  tours: TourDefinition[];
  features?: string[];
  getRoute: () => string;
  navigate: (route: string) => void;
  getSelection?: () => AvaSelection;
  /** Extra headers for API calls, e.g. a bearer token. Cookies are always sent. */
  getAuthHeaders?: () => Promise<Record<string, string>> | Record<string, string>;
  /** Lets the host override first-message suggestions. */
  suggestions?: (role: AvaRole | null) => string[];
}

export const DEFAULT_SUGGESTIONS: Record<AvaRole | 'none', string[]> = {
  admin: ['Find my highest-priority leads', 'How does lead verification work?', 'Show me how to filter', 'Create a follow-up'],
  owner: ['Find my highest-priority leads', 'How does lead verification work?', 'Show me how to filter', 'Create a follow-up'],
  agent: ['Find my highest-priority leads', 'How does lead verification work?', 'Show me how to filter', 'Create a follow-up'],
  homeowner: ['How does lead verification work?', 'Where do I find my property report?', 'Show me around'],
  none: ['How does lead verification work?', 'Show me around']
};

export function suggestionsFor(host: AvaHost): string[] {
  return host.suggestions?.(host.role) ?? DEFAULT_SUGGESTIONS[host.role ?? 'none'];
}

export function toursForRole(host: AvaHost): TourDefinition[] {
  return host.tours.filter((t) => host.role !== null && t.roles.includes(host.role));
}

const visible = (el: Element) => {
  const r = (el as HTMLElement).getBoundingClientRect();
  return r.width > 0 && r.height > 0;
};

export const anchorExists = (id: string): boolean => {
  if (typeof document === 'undefined') return false;
  const el = document.querySelector(`[data-ava-anchor="${CSS.escape(id)}"]`);
  return !!el && visible(el);
};

export function visibleAnchors(): string[] {
  if (typeof document === 'undefined') return [];
  return [...new Set([...document.querySelectorAll('[data-ava-anchor]')].filter(visible).map((el) => el.getAttribute('data-ava-anchor') ?? ''))]
    .filter(Boolean)
    .slice(0, 30);
}

export function buildContext(host: AvaHost): AvaContext {
  return {
    route: host.getRoute(),
    anchors: visibleAnchors(),
    features: host.features ?? [],
    tours: toursForRole(host).map((t) => ({ id: t.id, title: t.title })),
    selection: host.getSelection?.() ?? {}
  };
}
