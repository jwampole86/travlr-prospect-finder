// Synced from ava-assistant. Do not edit here: change it there and run tools/sync-to-travlr.mjs.
/**
 * What AVA learns about one person, and how it shapes their experience.
 *
 * Principles, enforced by the shape of the data itself:
 *  - Only structured signals are kept: counts and ids (which tours were finished, which screens are opened, which tools are used,
 *    thumbs up/down with a coarse reason). Never what was typed or said, never lead or contact data, never audio.
 *  - It is for the person it describes: it tunes their own suggestions, tours and answer style. They can see it, switch it off, and erase it.
 *  - Sharing anything with the platform (anonymous, no user id) is a separate choice that is off until they turn it on.
 * Pure functions: no I/O, no clock except the one passed in.
 */

const ID_RE = /^[a-z0-9][a-z0-9_-]{0,47}$/;
const MAX = { tours: 30, pages: 60, topics: 40, tools: 12 } as const;

export type Reason = 'too_long' | 'too_short' | 'not_helpful' | 'wrong' | 'great';
export const REASONS: readonly Reason[] = ['too_long', 'too_short', 'not_helpful', 'wrong', 'great'];
export const KNOWN_TOOLS = ['search_leads', 'search_knowledge', 'create_followup', 'go_to_page', 'start_tour', 'show_on_screen'] as const;

export type LearnEvent =
  | { kind: 'tour_completed'; tourId: string }
  | { kind: 'tour_stopped'; tourId: string }
  | { kind: 'page_opened'; page: string }
  | { kind: 'tool_used'; tool: string }
  | { kind: 'question'; topic: string | null }
  | { kind: 'input'; modality: 'voice' | 'text' }
  | { kind: 'wake_used' }
  | { kind: 'feedback'; rating: 1 | -1; topic: string | null; reason?: Reason };

export interface Profile {
  v: 1;
  /** Use what AVA has learned to tailor this person's experience. On by default; it only ever affects their own use. */
  personalization: boolean;
  /** Share anonymous product-improvement signals (no user id, no text). Off until the person turns it on. */
  sharing: boolean;
  tours: Record<string, { done: number; stopped: number; at: string }>;
  pages: Record<string, { n: number; at: string }>;
  tools: Record<string, number>;
  topics: Record<string, { asked: number; up: number; down: number; at: string }>;
  input: { voice: number; text: number; wake: number };
  /** Counts of "too long" / "too short" feedback; the answer style is derived from them. */
  style: { tooLong: number; tooShort: number };
  updatedAt: string;
}

export const emptyProfile = (now = new Date().toISOString()): Profile => ({
  v: 1, personalization: true, sharing: false, tours: {}, pages: {}, tools: {}, topics: {},
  input: { voice: 0, text: 0, wake: 0 }, style: { tooLong: 0, tooShort: 0 }, updatedAt: now,
});

export const validId = (s: unknown): s is string => typeof s === 'string' && ID_RE.test(s);

/** "Help: Lead verification" -> "lead-verification". Used so a topic is a short stable id, never free text. */
export function topicId(label: string | null | undefined): string | null {
  const t = (label ?? '').replace(/^[^:]+:\s*/, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48);
  return validId(t) ? t : null;
}

/** Checks an event arriving over the network. Returns null for anything that is not exactly a known event with clean ids. */
export function parseEvent(raw: unknown): LearnEvent | null {
  if (!raw || typeof raw !== 'object') return null;
  const e = raw as Record<string, unknown>;
  switch (e.kind) {
    case 'tour_completed': case 'tour_stopped': return validId(e.tourId) ? { kind: e.kind, tourId: e.tourId } : null;
    case 'page_opened': return validId(e.page) ? { kind: 'page_opened', page: e.page } : null;
    case 'tool_used': return typeof e.tool === 'string' && (KNOWN_TOOLS as readonly string[]).includes(e.tool) ? { kind: 'tool_used', tool: e.tool } : null;
    case 'question': return e.topic === null || e.topic === undefined ? { kind: 'question', topic: null } : validId(e.topic) ? { kind: 'question', topic: e.topic } : null;
    case 'input': return e.modality === 'voice' || e.modality === 'text' ? { kind: 'input', modality: e.modality } : null;
    case 'wake_used': return { kind: 'wake_used' };
    case 'feedback': {
      if (e.rating !== 1 && e.rating !== -1) return null;
      const topic = e.topic === null || e.topic === undefined ? null : validId(e.topic) ? e.topic : undefined;
      if (topic === undefined) return null;
      const reason = e.reason === undefined ? undefined : (REASONS as readonly unknown[]).includes(e.reason) ? (e.reason as Reason) : null;
      if (reason === null) return null;
      return { kind: 'feedback', rating: e.rating, topic, ...(reason ? { reason } : {}) };
    }
    default: return null;
  }
}

/** Keeps a map small by dropping its least recently touched entries. */
function trim<T extends { at: string }>(map: Record<string, T>, max: number): Record<string, T> {
  const keys = Object.keys(map);
  if (keys.length <= max) return map;
  const keep = keys.sort((a, b) => map[b].at.localeCompare(map[a].at)).slice(0, max);
  return Object.fromEntries(keep.map((k) => [k, map[k]]));
}

/** Applies one event. With personalization off nothing is learned, so the profile is returned unchanged. */
export function applyEvent(p: Profile, e: LearnEvent, now = new Date().toISOString()): Profile {
  if (!p.personalization) return p;
  const next: Profile = { ...p, updatedAt: now };
  switch (e.kind) {
    case 'tour_completed': case 'tour_stopped': {
      const cur = p.tours[e.tourId] ?? { done: 0, stopped: 0, at: now };
      next.tours = trim({ ...p.tours, [e.tourId]: { ...cur, ...(e.kind === 'tour_completed' ? { done: cur.done + 1 } : { stopped: cur.stopped + 1 }), at: now } }, MAX.tours);
      break;
    }
    case 'page_opened': next.pages = trim({ ...p.pages, [e.page]: { n: (p.pages[e.page]?.n ?? 0) + 1, at: now } }, MAX.pages); break;
    case 'tool_used': next.tools = { ...p.tools, [e.tool]: (p.tools[e.tool] ?? 0) + 1 }; break;
    case 'question': if (e.topic) next.topics = trim({ ...p.topics, [e.topic]: { ...(p.topics[e.topic] ?? { asked: 0, up: 0, down: 0 }), asked: (p.topics[e.topic]?.asked ?? 0) + 1, at: now } }, MAX.topics); break;
    case 'input': next.input = { ...p.input, [e.modality]: p.input[e.modality] + 1 }; break;
    case 'wake_used': next.input = { ...p.input, wake: p.input.wake + 1 }; break;
    case 'feedback': {
      if (e.topic) {
        const cur = p.topics[e.topic] ?? { asked: 0, up: 0, down: 0, at: now };
        next.topics = trim({ ...p.topics, [e.topic]: { ...cur, up: cur.up + (e.rating === 1 ? 1 : 0), down: cur.down + (e.rating === -1 ? 1 : 0), at: now } }, MAX.topics);
      }
      if (e.reason === 'too_long') next.style = { ...p.style, tooLong: p.style.tooLong + 1 };
      if (e.reason === 'too_short') next.style = { ...p.style, tooShort: p.style.tooShort + 1 };
      break;
    }
  }
  return next;
}

export type Experience = 'new' | 'growing' | 'experienced';
export function experience(p: Profile): Experience {
  const done = Object.values(p.tours).reduce((n, t) => n + t.done, 0);
  const used = Object.values(p.tools).reduce((n, c) => n + c, 0);
  const pages = Object.keys(p.pages).length;
  const score = done * 3 + used + pages;
  return score >= 20 ? 'experienced' : score >= 6 ? 'growing' : 'new';
}

export type Verbosity = 'brief' | 'normal' | 'detailed';
export function verbosity(p: Profile): Verbosity {
  if (p.style.tooLong >= 2 && p.style.tooLong > p.style.tooShort) return 'brief';
  if (p.style.tooShort >= 2 && p.style.tooShort > p.style.tooLong) return 'detailed';
  return 'normal';
}

export function favoritePages(p: Profile, n = 3): string[] {
  return Object.entries(p.pages).filter(([, v]) => v.n >= 2).sort((a, b) => b[1].n - a[1].n || b[1].at.localeCompare(a[1].at)).slice(0, n).map(([k]) => k);
}

/** Topics the person marked unhelpful and not since marked helpful: worth explaining differently next time. */
export function strugglingTopics(p: Profile): string[] {
  return Object.entries(p.topics).filter(([, t]) => t.down > t.up).map(([k]) => k).slice(0, 5);
}

/**
 * A short note for AVA's instructions, built only from ids and counts above. It describes preferences; it contains nothing the person
 * typed, so it cannot carry an instruction. Empty when personalization is off or there is nothing to say yet.
 */
export function personalizationNote(p: Profile | null | undefined, tourTitles: Record<string, string> = {}): string | null {
  if (!p || !p.personalization) return null;
  const lines: string[] = [];
  const level = experience(p);
  if (level !== 'new') lines.push(`Experience with AVYRO: ${level}.${level === 'experienced' ? ' Skip the basics; be direct.' : ''}`);
  const v = verbosity(p);
  if (v === 'brief') lines.push('Prefers short answers.');
  if (v === 'detailed') lines.push('Prefers fuller explanations.');
  const done = Object.entries(p.tours).filter(([, t]) => t.done > 0).map(([k]) => tourTitles[k] ?? k).slice(0, 6);
  if (done.length) lines.push(`Has finished these tours (do not re-teach their basics): ${done.join(', ')}.`);
  const fav = favoritePages(p);
  if (fav.length) lines.push(`Often opens: ${fav.join(', ')}.`);
  const struggling = strugglingTopics(p);
  if (struggling.length) lines.push(`Found earlier answers on these unhelpful, so explain them differently: ${struggling.join(', ')}.`);
  if (p.input.voice > p.input.text && p.input.voice >= 3) lines.push('Usually speaks to AVA, so keep replies easy to hear.');
  return lines.length ? lines.join(' ').slice(0, 700) : null;
}

/** Suggestion chips: what this person actually does comes first, and finished tours step aside. */
export function personalizeSuggestions(p: Profile | null | undefined, base: string[], tours: Array<{ id: string; title: string }>): { suggestions: string[]; tours: Array<{ id: string; title: string }> } {
  if (!p || !p.personalization) return { suggestions: base, tours };
  const wants = (s: string): number => {
    const t = s.toLowerCase();
    let score = 0;
    if (/lead/.test(t) && /(find|priority|search|show)/.test(t)) score += p.tools.search_leads ?? 0;
    if (/follow-?up/.test(t)) score += p.tools.create_followup ?? 0;
    if (/(filter|where|show me how|take me)/.test(t)) score += (p.tools.go_to_page ?? 0) + (p.tools.show_on_screen ?? 0);
    if (/(how|what|why|work)/.test(t)) score += p.tools.search_knowledge ?? 0;
    return score;
  };
  const ranked = base.map((s, i) => ({ s, i, w: wants(s) })).sort((a, b) => b.w - a.w || a.i - b.i).map((x) => x.s);
  const finished = new Set(Object.entries(p.tours).filter(([, t]) => t.done > 0).map(([k]) => k));
  const open = tours.filter((t) => !finished.has(t.id));
  const done = tours.filter((t) => finished.has(t.id));
  return { suggestions: ranked, tours: [...open, ...done] };
}

export interface ProfileLine { label: string; detail: string }
/** Everything AVA has learned, in plain words, for the "Your AVA" screen. */
export function describeProfile(p: Profile, titles: Record<string, string> = {}): ProfileLine[] {
  const out: ProfileLine[] = [];
  out.push({ label: 'Experience', detail: experience(p) === 'new' ? 'Just getting started' : experience(p) === 'growing' ? 'Getting comfortable' : 'Experienced' });
  const v = verbosity(p);
  out.push({ label: 'Answer style', detail: v === 'brief' ? 'Short and to the point' : v === 'detailed' ? 'Fuller explanations' : 'Balanced (tell me if answers are too long or short)' });
  const done = Object.entries(p.tours).filter(([, t]) => t.done > 0).map(([k]) => titles[k] ?? k);
  out.push({ label: 'Tours finished', detail: done.length ? done.join(', ') : 'None yet' });
  const fav = favoritePages(p, 5);
  out.push({ label: 'Screens you open most', detail: fav.length ? fav.join(', ') : 'Not enough yet' });
  const talk = p.input.voice + p.input.text;
  out.push({ label: 'How you ask', detail: talk ? `${p.input.text} typed, ${p.input.voice} spoken${p.input.wake ? `, ${p.input.wake} with "Hey AVA"` : ''}` : 'Not enough yet' });
  const struggling = strugglingTopics(p);
  if (struggling.length) out.push({ label: 'Topics to explain differently', detail: struggling.join(', ') });
  return out;
}

/**
 * Reduces a question AVA could not answer to a few product words, so the team can see what people are missing without ever seeing what
 * anyone typed. Only words from the product's own vocabulary (its help articles, screens and features) survive, so names, addresses,
 * numbers, emails and phone numbers cannot, by construction; anything else is dropped.
 */
export function anonymousTopic(text: string, vocabulary: ReadonlySet<string>): string | null {
  const words = (text || '').toLowerCase().replace(/[^a-z\s]/g, ' ').split(/\s+/).filter((w) => w.length >= 3 && w.length <= 16 && vocabulary.has(w));
  const unique = [...new Set(words)].slice(0, 5).sort();
  return unique.length >= 2 ? unique.join(' ') : null;
}

/** The words a question may be reduced to: taken from the product's own text, minus everyday filler. */
const FILLER = new Set('the and for are but not you your with this that what when where which who how why can could would should have has had does did about from into onto over under please tell show give need want like just also any all some more most than then them they their there here its our out off one two get got let use using make made'.split(' '));
export function buildVocabulary(texts: string[]): Set<string> {
  const v = new Set<string>();
  for (const t of texts) for (const w of (t || '').toLowerCase().replace(/[^a-z\s]/g, ' ').split(/\s+/)) if (w.length >= 3 && w.length <= 16 && !FILLER.has(w)) v.add(w);
  return v;
}
