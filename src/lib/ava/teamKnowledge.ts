import type { KnowledgeEntry } from './knowledge';

export const TEAM_SOURCE = "Your team's guidance";
export type TeamStatus = 'draft' | 'published' | 'retired';
const STATUSES: TeamStatus[] = ['draft', 'published', 'retired'];

export interface TeamEntryInput { title: string; answer: string; keywords: string[]; status: TeamStatus }

// eslint-disable-next-line no-control-regex
const clean = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, ' ').replace(/[ \t]+/g, ' ').trim().slice(0, max) : '');

/** Validates what an admin typed. Returns the cleaned entry, or the first problem in plain words. */
export function cleanTeamEntry(raw: unknown, { partial = false }: { partial?: boolean } = {}): { ok: true; value: Partial<TeamEntryInput> } | { ok: false; error: string } {
  const b = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const value: Partial<TeamEntryInput> = {};
  if (!partial || 'title' in b) {
    const title = clean(b.title, 200);
    if (title.length < 3) return { ok: false, error: 'Give the question or topic a short title (at least 3 characters).' };
    value.title = title;
  }
  if (!partial || 'answer' in b) {
    const answer = clean(b.answer, 1500);
    if (answer.length < 10) return { ok: false, error: 'Write the answer in a sentence or two (at least 10 characters).' };
    value.answer = answer;
  }
  if (!partial || 'keywords' in b) {
    const list = Array.isArray(b.keywords) ? b.keywords : typeof b.keywords === 'string' ? b.keywords.split(',') : [];
    value.keywords = [...new Set(list.map((k) => clean(k, 40).toLowerCase()).filter(Boolean))].slice(0, 12);
  }
  if ('status' in b || !partial) {
    const status = b.status === undefined ? 'published' : b.status;
    if (!STATUSES.includes(status as TeamStatus)) return { ok: false, error: 'Status must be draft, published or retired.' };
    value.status = status as TeamStatus;
  }
  if (partial && !Object.keys(value).length) return { ok: false, error: 'Nothing to change.' };
  return { ok: true, value };
}

/** A stored row as one of AVA's approved help entries. */
export function toKnowledgeEntry(row: { id: string; title: string; answer: string; keywords?: string[] | null }): KnowledgeEntry {
  return { id: `team-${row.id}`, title: row.title, keywords: row.keywords ?? [], answer: row.answer, source: TEAM_SOURCE, kind: 'team' };
}
