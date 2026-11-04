// Synced from ava-assistant. Do not edit here: change it there and run tools/sync-to-travlr.mjs.
import type { AvaHost, TourDefinition } from '../host/types';
import { suggestionsFor, toursForRole } from '../host/types';
import type { SourceNote } from './brain';

export interface Followup { kind: 'ask' | 'tour'; label: string; tourId?: string }

export interface FollowupInput {
  host: AvaHost;
  /** Everything the user has typed or tapped so far, oldest first. */
  asked: string[];
  /** The sources of AVA's latest answer, if it had any. */
  sources?: SourceNote[];
  /** Tours already walked through, so they are not offered again straight away. */
  toursDone?: string[];
  max?: number;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
const words = (s: string) => new Set(norm(s).split(' ').filter((w) => w.length > 2));

/** "Help: Lead verification" -> "lead verification". */
const topicOf = (citation: string) => citation.replace(/^[^:]+:\s*/, '').trim();

function relatedTour(tours: TourDefinition[], text: string, done: string[]): TourDefinition | null {
  const w = words(text);
  let best: { t: TourDefinition; hits: number } | null = null;
  for (const t of tours) {
    if (done.includes(t.id)) continue;
    const hits = [...(t.keywords ?? []), ...t.title.split(' ')].filter((k) => w.has(norm(k))).length;
    if (hits > 0 && (!best || hits > best.hits)) best = { t, hits };
  }
  return best?.t ?? null;
}

/**
 * The next things worth asking after an answer, most relevant first: topics related to what was just explained, a tour of the
 * screen it came from, and the standard starting points the user has not tried yet. Nothing already asked is offered again.
 */
export function nextFollowups({ host, asked, sources, toursDone = [], max = 5 }: FollowupInput): Followup[] {
  const out: Followup[] = [];
  const seen = new Set(asked.map(norm));
  const push = (f: Followup) => {
    const key = norm(f.label);
    if (!key || seen.has(key) || out.length >= max) return;
    seen.add(key);
    out.push(f);
  };

  const tours = toursForRole(host);
  const last = asked.at(-1) ?? '';
  const knowledge = (sources ?? []).find((s) => s.kind === 'knowledge');
  const leads = (sources ?? []).find((s) => s.kind === 'leads');

  if (knowledge?.citations?.length) {
    const [first, ...rest] = knowledge.citations;
    const tour = relatedTour(tours, `${first} ${last}`, toursDone);
    if (tour) push({ kind: 'tour', label: `Tour: ${tour.title}`, tourId: tour.id });
    for (const c of rest.slice(0, 2)) push({ kind: 'ask', label: `Tell me about ${topicOf(c).toLowerCase()}` });
  }

  if (leads && (leads.count ?? 0) > 0) {
    if (host.role && host.role !== 'homeowner') push({ kind: 'ask', label: 'Create a follow-up for the top lead' });
    const tour = relatedTour(tours, 'leads filter', toursDone);
    if (tour) push({ kind: 'tour', label: `Tour: ${tour.title}`, tourId: tour.id });
  }

  for (const label of suggestionsFor(host)) push({ kind: 'ask', label });
  for (const t of tours) if (!toursDone.includes(t.id)) push({ kind: 'tour', label: `Tour: ${t.title}`, tourId: t.id });
  return out;
}
