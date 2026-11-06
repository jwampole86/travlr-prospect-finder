// Synced from ava-assistant. Do not edit here: change it there and run tools/sync-to-travlr.mjs.
/**
 * Action cards: what AVA offers to do next, drawn under an answer. The server builds them from real tool results (never from the model's
 * text) and the browser accepts only this fixed, validated shape. A card can open things and ask questions on its own, but anything that
 * changes data is only ever *prepared* from a card: it goes back to the server, which asks for the user's approval before it runs.
 */
export type CardAction =
  | { kind: 'open_lead'; label: string; leadId: string; focus?: 'verification' }
  | { kind: 'open_page'; label: string; page: string }
  | { kind: 'prepare'; label: string; tool: string; args: Record<string, string | number | boolean> }
  | { kind: 'ask'; label: string; text: string }
  | { kind: 'export'; label: string };

export interface AvaCard {
  id: string;
  title: string;
  meta?: string;
  /** Short reasons behind the answer, so a result is explained and not just listed. */
  why?: string[];
  actions: CardAction[];
}

const ID_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
const TOOL_RE = /^[a-z][a-z_]{0,39}$/;
const ARG_KEY_RE = /^[A-Za-z][A-Za-z0-9]{0,23}$/;

// eslint-disable-next-line no-control-regex
const clean = (v: unknown, max: number): string | undefined => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max) || undefined : undefined);

function parseAction(raw: unknown): CardAction | null {
  if (!raw || typeof raw !== 'object') return null;
  const a = raw as Record<string, unknown>;
  const label = clean(a.label, 40);
  if (!label) return null;
  switch (a.kind) {
    case 'open_lead':
      return typeof a.leadId === 'string' && ID_RE.test(a.leadId) ? { kind: 'open_lead', label, leadId: a.leadId, focus: a.focus === 'verification' ? 'verification' : undefined } : null;
    case 'open_page':
      return typeof a.page === 'string' && /^[a-z0-9][a-z0-9-]{0,47}$/.test(a.page) ? { kind: 'open_page', label, page: a.page } : null;
    case 'prepare': {
      if (typeof a.tool !== 'string' || !TOOL_RE.test(a.tool) || !a.args || typeof a.args !== 'object') return null;
      const args: Record<string, string | number | boolean> = {};
      for (const [k, v] of Object.entries(a.args as Record<string, unknown>).slice(0, 8)) {
        if (!ARG_KEY_RE.test(k)) continue;
        if (typeof v === 'string') { const s = clean(v, 300); if (s !== undefined) args[k] = s; }
        else if (typeof v === 'number' && Number.isFinite(v)) args[k] = v;
        else if (typeof v === 'boolean') args[k] = v;
      }
      return { kind: 'prepare', label, tool: a.tool, args };
    }
    case 'ask': {
      const text = clean(a.text, 200);
      return text ? { kind: 'ask', label, text } : null;
    }
    case 'export':
      return { kind: 'export', label };
    default:
      return null;
  }
}

export function parseCards(raw: unknown): AvaCard[] {
  if (!Array.isArray(raw)) return [];
  const out: AvaCard[] = [];
  for (const c of raw.slice(0, 6)) {
    if (!c || typeof c !== 'object') continue;
    const card = c as Record<string, unknown>;
    const title = clean(card.title, 120);
    if (!title) continue;
    const actions = (Array.isArray(card.actions) ? card.actions : []).slice(0, 4).map(parseAction).filter((x): x is CardAction => !!x);
    const why = (Array.isArray(card.why) ? card.why : []).map((w) => clean(w, 100)).filter((w): w is string => !!w).slice(0, 4);
    out.push({ id: clean(card.id, 64) ?? `card_${out.length}`, title, meta: clean(card.meta, 120), why: why.length ? why : undefined, actions });
  }
  return out;
}

/** The progress of one change AVA prepared, shown as a card in the chat: prepared, approved, run, confirmed. */
export type ActionStatus = 'awaiting' | 'running' | 'done' | 'failed' | 'cancelled';
export interface ActionCard { id: string; summary: string; status: ActionStatus }

export const ACTION_STEPS = ['Prepared', 'Approved', 'Done', 'Confirmed'] as const;
/** How many steps are complete for a status, and whether the card ended badly. */
export function actionProgress(status: ActionStatus): { complete: number; ended: 'ok' | 'bad' | null } {
  switch (status) {
    case 'awaiting': return { complete: 1, ended: null };
    case 'running': return { complete: 2, ended: null };
    case 'done': return { complete: 4, ended: 'ok' };
    case 'failed': return { complete: 2, ended: 'bad' };
    case 'cancelled': return { complete: 1, ended: 'bad' };
  }
}
