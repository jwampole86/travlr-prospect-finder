// Synced from ava-assistant. Do not edit here: change it there and run tools/sync-to-travlr.mjs.
import { describe, expect, it } from 'vitest';
import { anonymousTopic, applyEvent, buildVocabulary, describeProfile, emptyProfile, experience, favoritePages, parseEvent, personalizationNote, personalizeSuggestions, topicId, verbosity, type LearnEvent, type Profile } from './learning';

const T0 = '2026-11-06T10:00:00.000Z';
const run = (events: LearnEvent[], p: Profile = emptyProfile(T0)) => events.reduce((acc, e, i) => applyEvent(acc, e, `2026-11-06T10:${String(i).padStart(2, '0')}:00.000Z`), p);

describe('parseEvent', () => {
  it('accepts only known events with clean ids', () => {
    expect(parseEvent({ kind: 'tour_completed', tourId: 'lead-filters' })).toEqual({ kind: 'tour_completed', tourId: 'lead-filters' });
    expect(parseEvent({ kind: 'feedback', rating: -1, topic: 'lead-verification', reason: 'too_long' })).toMatchObject({ rating: -1, reason: 'too_long' });
    expect(parseEvent({ kind: 'input', modality: 'voice' })).toEqual({ kind: 'input', modality: 'voice' });
  });
  it.each([
    [{ kind: 'tour_completed', tourId: 'Has Spaces And CAPS' }],
    [{ kind: 'page_opened', page: '../../etc/passwd' }],
    [{ kind: 'tool_used', tool: 'drop_tables' }],
    [{ kind: 'feedback', rating: 5, topic: null }],
    [{ kind: 'feedback', rating: 1, topic: null, reason: 'because i said so' }],
    [{ kind: 'question', topic: 'x'.repeat(80) }],
    [{ kind: 'transcript', text: 'what the user said' }],
    ['text'], [null], [42],
  ])('rejects %j', (raw) => expect(parseEvent(raw)).toBeNull());
  it('drops unknown fields, so free text cannot ride along', () => {
    const e = parseEvent({ kind: 'question', topic: 'lead-verification', text: 'my secret question', userId: 'u1' });
    expect(e).toEqual({ kind: 'question', topic: 'lead-verification' });
  });
});

describe('topicId', () => {
  it('turns a help-article label into a short id', () => {
    expect(topicId('Help: Lead verification')).toBe('lead-verification');
    expect(topicId('In-app guide: Map View')).toBe('map-view');
    expect(topicId(null)).toBeNull();
    expect(topicId('???')).toBeNull();
  });
});

describe('applyEvent', () => {
  it('learns from tours, pages, tools and input habits', () => {
    const p = run([
      { kind: 'tour_completed', tourId: 'lead-filters' }, { kind: 'tour_stopped', tourId: 'dashboard' },
      { kind: 'page_opened', page: 'pipeline' }, { kind: 'page_opened', page: 'pipeline' },
      { kind: 'tool_used', tool: 'search_leads' }, { kind: 'input', modality: 'voice' }, { kind: 'wake_used' },
    ]);
    expect(p.tours['lead-filters'].done).toBe(1);
    expect(p.tours.dashboard.stopped).toBe(1);
    expect(p.pages.pipeline.n).toBe(2);
    expect(p.tools.search_leads).toBe(1);
    expect(p.input).toEqual({ voice: 1, text: 0, wake: 1 });
  });

  it('learns nothing while personalization is off, and goes back to learning when it is on', () => {
    const off = { ...emptyProfile(T0), personalization: false };
    expect(run([{ kind: 'page_opened', page: 'pipeline' }], off)).toEqual(off);
    expect(run([{ kind: 'page_opened', page: 'pipeline' }], { ...off, personalization: true }).pages.pipeline.n).toBe(1);
  });

  it('is pure: the profile it was given is not changed', () => {
    const p = emptyProfile(T0);
    applyEvent(p, { kind: 'page_opened', page: 'pipeline' }, T0);
    expect(p.pages).toEqual({});
  });

  it('keeps maps bounded by dropping the least recently used entries', () => {
    const events: LearnEvent[] = Array.from({ length: 90 }, (_, i) => ({ kind: 'page_opened', page: `page-${i}` }));
    const p = events.reduce((acc, e, i) => applyEvent(acc, e, new Date(Date.UTC(2026, 10, 6, 10, 0, i)).toISOString()), emptyProfile(T0));
    expect(Object.keys(p.pages)).toHaveLength(60);
    expect(p.pages['page-89']).toBeDefined();
    expect(p.pages['page-0']).toBeUndefined();
  });
});

describe('experience, style and favourites', () => {
  it('grows with use', () => {
    expect(experience(emptyProfile(T0))).toBe('new');
    const some = run(Array.from({ length: 6 }, () => ({ kind: 'tool_used', tool: 'search_leads' }) as LearnEvent));
    expect(experience(some)).toBe('growing');
    const lots = run([...Array.from({ length: 5 }, () => ({ kind: 'tour_completed', tourId: 'a' }) as LearnEvent), ...Array.from({ length: 8 }, () => ({ kind: 'tool_used', tool: 'search_leads' }) as LearnEvent)]);
    expect(experience(lots)).toBe('experienced');
  });
  it('only moves away from "normal" after the same feedback twice', () => {
    const one = run([{ kind: 'feedback', rating: -1, topic: null, reason: 'too_long' }]);
    expect(verbosity(one)).toBe('normal');
    const two = run([{ kind: 'feedback', rating: -1, topic: null, reason: 'too_long' }, { kind: 'feedback', rating: -1, topic: null, reason: 'too_long' }]);
    expect(verbosity(two)).toBe('brief');
    const back = run([...Array(2).fill({ kind: 'feedback', rating: -1, topic: null, reason: 'too_short' })]);
    expect(verbosity(back)).toBe('detailed');
  });
  it('favourites need repeat visits', () => {
    const p = run([{ kind: 'page_opened', page: 'a' }, { kind: 'page_opened', page: 'b' }, { kind: 'page_opened', page: 'b' }]);
    expect(favoritePages(p)).toEqual(['b']);
  });
});

describe('personalizationNote', () => {
  it('is nothing when off, or when there is nothing to say', () => {
    expect(personalizationNote(null)).toBeNull();
    expect(personalizationNote({ ...emptyProfile(T0), personalization: false })).toBeNull();
    expect(personalizationNote(emptyProfile(T0))).toBeNull();
  });
  it('describes preferences from ids and counts only', () => {
    const p = run([
      ...Array(2).fill({ kind: 'feedback', rating: -1, topic: 'lead-verification', reason: 'too_long' }),
      { kind: 'tour_completed', tourId: 'lead-filters' }, { kind: 'page_opened', page: 'pipeline' }, { kind: 'page_opened', page: 'pipeline' },
      ...Array(7).fill({ kind: 'tool_used', tool: 'search_leads' }),
    ]);
    const note = personalizationNote(p, { 'lead-filters': 'Lead filters' })!;
    expect(note).toMatch(/short answers/i);
    expect(note).toMatch(/Lead filters/);
    expect(note).toMatch(/pipeline/);
    expect(note).toMatch(/lead-verification/);
    expect(note.length).toBeLessThanOrEqual(700);
  });
});

describe('personalizeSuggestions', () => {
  const base = ['Find my highest-priority leads', 'How does lead verification work?', 'Show me how to filter', 'Create a follow-up'];
  const tours = [{ id: 'lead-filters', title: 'Lead filters' }, { id: 'dashboard', title: 'Dashboard' }];
  it('leaves everything alone with no profile or with personalization off', () => {
    expect(personalizeSuggestions(null, base, tours)).toEqual({ suggestions: base, tours });
    expect(personalizeSuggestions({ ...emptyProfile(T0), personalization: false }, base, tours).suggestions).toEqual(base);
  });
  it('puts what the person does first, and finished tours last', () => {
    const p = run([...Array(4).fill({ kind: 'tool_used', tool: 'create_followup' }), { kind: 'tour_completed', tourId: 'lead-filters' }]);
    const r = personalizeSuggestions(p, base, tours);
    expect(r.suggestions[0]).toBe('Create a follow-up');
    expect(r.suggestions).toHaveLength(base.length);
    expect(r.tours.map((t) => t.id)).toEqual(['dashboard', 'lead-filters']);
  });
});

describe('describeProfile', () => {
  it('shows everything in plain words', () => {
    const lines = describeProfile(run([{ kind: 'tour_completed', tourId: 'lead-filters' }]), { 'lead-filters': 'Lead filters' });
    expect(lines.find((l) => l.label === 'Tours finished')!.detail).toBe('Lead filters');
    expect(lines.length).toBeGreaterThanOrEqual(5);
  });
});

describe('anonymousTopic', () => {
  const vocab = buildVocabulary(['Export your leads to a spreadsheet', 'Lead verification and filters', 'Pipeline board']);
  it('keeps only product words: names, numbers and emails cannot survive', () => {
    const t = anonymousTopic('Can you export Nathan McNair 555-123-4567 nathan@example.com leads to spreadsheet?', vocab)!;
    expect(t).toBe('export leads spreadsheet');
    expect(t).not.toMatch(/nathan|mcnair|example|555|@/);
  });
  it('gives nothing when too little product vocabulary is left', () => {
    expect(anonymousTopic('hi', vocab)).toBeNull();
    expect(anonymousTopic('Nathan McNair 555-1234 and 90210', vocab)).toBeNull();
    expect(anonymousTopic('export my cat photos', vocab)).toBeNull();
  });
  it('builds a vocabulary without filler words', () => {
    expect(vocab.has('export')).toBe(true);
    expect(vocab.has('your')).toBe(false);
  });
});
