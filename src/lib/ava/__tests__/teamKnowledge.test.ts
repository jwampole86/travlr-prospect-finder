import { describe, expect, it } from 'vitest';
import { TEAM_SOURCE, cleanTeamEntry, toKnowledgeEntry } from '../teamKnowledge';
import { createTravlrBackend } from '../travlrBackend';

describe('what an admin types', () => {
  it('cleans a new answer and defaults it to published', () => {
    const r = cleanTeamEntry({ title: '  How do I get a W-9?  ', answer: 'Ask  the office\u0000 manager, who keeps them on file.', keywords: 'w9, tax form, W9 ,' });
    expect(r).toEqual({ ok: true, value: { title: 'How do I get a W-9?', answer: 'Ask the office manager, who keeps them on file.', keywords: ['w9', 'tax form'], status: 'published' } });
  });

  it('says what is wrong in plain words', () => {
    expect(cleanTeamEntry({ title: 'a', answer: 'long enough answer' })).toMatchObject({ ok: false, error: expect.stringContaining('title') });
    expect(cleanTeamEntry({ title: 'Fine title', answer: 'short' })).toMatchObject({ ok: false, error: expect.stringContaining('answer') });
    expect(cleanTeamEntry({ title: 'Fine title', answer: 'long enough answer', status: 'deleted' })).toMatchObject({ ok: false });
  });

  it('limits length and the number of keywords', () => {
    const r = cleanTeamEntry({ title: 'x'.repeat(500), answer: 'y'.repeat(5000), keywords: Array.from({ length: 40 }, (_, i) => `k${i}`) });
    if (!r.ok) throw new Error('expected ok');
    expect(r.value.title).toHaveLength(200);
    expect(r.value.answer).toHaveLength(1500);
    expect(r.value.keywords).toHaveLength(12);
  });

  it('checks only what was sent when editing, and refuses an empty edit', () => {
    expect(cleanTeamEntry({ status: 'retired' }, { partial: true })).toEqual({ ok: true, value: { status: 'retired' } });
    expect(cleanTeamEntry({}, { partial: true })).toMatchObject({ ok: false });
    expect(cleanTeamEntry({ answer: 'tiny' }, { partial: true })).toMatchObject({ ok: false });
  });

  it('becomes an approved help entry with its own source', () => {
    expect(toKnowledgeEntry({ id: 'abc', title: 'T', answer: 'A long answer here.', keywords: null })).toEqual({ id: 'team-abc', title: 'T', keywords: [], answer: 'A long answer here.', source: TEAM_SOURCE, kind: 'team' });
  });
});

/** A chainable fake of just the query the backend makes for team answers. */
const fakeDb = (rows: Array<Record<string, unknown>>) => ({
  from: (table: string) => {
    let result = table === 'ava_kb_entries' ? [...rows] : [];
    const q: any = {
      select: () => q,
      eq: (c: string, v: unknown) => { result = result.filter((r) => r[c] === v); return q; },
      limit: () => Promise.resolve({ data: result }),
    };
    return q;
  },
});

describe('AVA finds the team\'s own answers', () => {
  const rows = [
    { id: 'u1', organization_id: 'org-1', status: 'published', title: 'How do I get a W-9 form?', answer: 'Ask the office manager, who keeps every W-9 on file.', keywords: ['w9', 'tax'] },
    { id: 'u2', organization_id: 'org-1', status: 'draft', title: 'Parking policy for the office', answer: 'Park in lot B on weekdays only.', keywords: [] },
    { id: 'u3', organization_id: 'org-2', status: 'published', title: 'How do I get a W-9 form?', answer: 'Another company says something else.', keywords: [] },
  ];
  const backend = () => createTravlrBackend({ db: fakeDb(rows) as never, origin: 'x', forwardHeaders: {} });

  it('answers from this organization\'s published entry, with its source and title', async () => {
    const r = await backend().searchKnowledge({ query: 'How do I get a W-9 form?' }, { actor: { id: 'a', role: 'admin', organizationId: 'org-1' } });
    expect(r.entries[0]).toMatchObject({ title: 'How do I get a W-9 form?', source: TEAM_SOURCE, answer: expect.stringContaining('office manager') });
  });

  it('never shows drafts, retired answers or another organization\'s answers', async () => {
    const mine = await backend().searchKnowledge({ query: 'parking policy office' }, { actor: { id: 'a', role: 'admin', organizationId: 'org-1' } });
    expect(mine.entries).toEqual([]);
    const other = await backend().searchKnowledge({ query: 'How do I get a W-9 form?' }, { actor: { id: 'b', role: 'agent', organizationId: 'org-2' } });
    expect(other.entries[0].answer).toContain('Another company');
    const none = await backend().searchKnowledge({ query: 'How do I get a W-9 form?' }, { actor: { id: 'c', role: 'agent', organizationId: null } });
    expect(none.entries.some((e: { source: string }) => e.source === TEAM_SOURCE)).toBe(false);
  });

  it('still answers from the built-in help if the lookup fails', async () => {
    const broken = createTravlrBackend({ db: { from: () => { throw new Error('down'); } } as never, origin: 'x', forwardHeaders: {} });
    const r = await broken.searchKnowledge({ query: 'How do I clock in and track breaks?' }, { actor: { id: 'a', role: 'admin', organizationId: 'org-1' } });
    expect(r.entries.length).toBeGreaterThan(0);
  });
});
