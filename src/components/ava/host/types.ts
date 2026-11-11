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

/** A screen AVA can take the user to. `id` matches the `data-ava-anchor` of its menu item once "nav-" is added. */
export interface AvaPage {
  id: string;
  title: string;
  route: string;
  /** What the page is for, so AVA can pick the right one from a description. */
  hint?: string;
}

export interface AvaSelection {
  leadId?: string;
  leadName?: string;
}

/** What the open screen shows, so "this one" and "these filters" mean something. Reported by the page itself, never guessed. */
export interface AvaScreen {
  title?: string;
  /** Active filters and sorting, as label -> value. */
  filters?: Record<string, string | number | boolean>;
  /** What is open on the screen: a property, a portfolio, a record. */
  open?: { kind: string; label: string; id?: string };
  counts?: { shown?: number; total?: number };
  /** The page can export what it is showing (the host must also provide `exportLeads`). */
  canExport?: boolean;
}

/** What the browser tells the server about the current screen. Shapes the prompt only; the server owns authorization. */
export interface AvaContext {
  route: string;
  anchors: string[];
  features: string[];
  tours: Array<{ id: string; title: string }>;
  /** Screens AVA may take the user to, for this user. */
  pages: Array<{ id: string; title: string; hint?: string }>;
  selection: AvaSelection;
  screen: AvaScreen;
  /** The user's local hour (0-23), so the briefing can greet them properly. */
  localHour: number;
}

export interface AvaHost {
  /** Where `/models/ava.glb` and `/brand/avyro-mark.png` are served from, without a trailing slash. */
  assetBase: string;
  /** Prefix for `/api/ava/*`. */
  apiBase: string;
  /** Where AVA's natural spoken voice comes from (POST { text, voice } -> audio). Without it she uses the browser's own voice. */
  voiceUrl?: string;
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
  /** Screens AVA can open and point at in the menu. Must only list pages this user may open. */
  pages?: AvaPage[];
  /** Opens whatever hides the element AVA is about to point at (a collapsed menu category, say). */
  reveal?: (anchorId: string) => void;
  getSelection?: () => AvaSelection;
  /** What the open screen shows (filters, the open record, how many records match). */
  getScreen?: () => AvaScreen;
  /** Opens one lead on its own screen. `verification` asks the page to bring the verification section into view. */
  openLead?: (leadId: string, focus?: 'verification') => void;
  /** Exports what the screen is showing, as the user's own click would. Returns how many records were exported. */
  exportLeads?: () => number | Promise<number>;
  /** Give the person a short summary the first time they open AVA each day (they can turn it off). */
  briefing?: boolean;
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
    .filter((id) => id && !id.startsWith('nav-')) // menu items are reached through go_to_page, so they do not crowd out the page's own anchors
    .slice(0, 30);
}

export function buildContext(host: AvaHost): AvaContext {
  return {
    route: host.getRoute(),
    anchors: visibleAnchors(),
    features: host.features ?? [],
    tours: toursForRole(host).map((t) => ({ id: t.id, title: t.title })),
    pages: (host.pages ?? []).slice(0, 90).map((p) => ({ id: p.id, title: p.title, hint: p.hint })),
    selection: host.getSelection?.() ?? {},
    screen: { ...(host.getScreen?.() ?? {}), canExport: !!host.exportLeads && host.getScreen?.().canExport === true },
    localHour: new Date().getHours()
  };
}
