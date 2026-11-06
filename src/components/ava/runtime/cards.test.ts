// Synced from ava-assistant. Do not edit here: change it there and run tools/sync-to-travlr.mjs.
import { describe, expect, it } from 'vitest';
import { actionProgress, parseCards } from './cards';

describe('parseCards', () => {
  it('keeps a well-formed card and drops everything unknown', () => {
    const cards = parseCards([{
      id: 'lead_1', title: 'Hartwell Residence', meta: 'Score 96', why: ['Owner verified', ''], extra: 'ignored',
      actions: [
        { kind: 'open_lead', label: 'View lead', leadId: 'abc-123', focus: 'verification' },
        { kind: 'prepare', label: 'Create follow-up', tool: 'create_followup', args: { leadId: 'abc-123', leadName: 'Hartwell', nested: { x: 1 }, n: 3 } },
        { kind: 'run_script', label: 'Nope' }
      ]
    }]);
    expect(cards).toHaveLength(1);
    expect(cards[0].why).toEqual(['Owner verified']);
    expect(cards[0].actions.map((a) => a.kind)).toEqual(['open_lead', 'prepare']);
    expect(cards[0].actions[1]).toMatchObject({ args: { leadId: 'abc-123', leadName: 'Hartwell', n: 3 } });
    expect(JSON.stringify(cards)).not.toContain('nested');
  });

  it('refuses ids, tools and pages that could be used to reach somewhere else', () => {
    const cards = parseCards([{ title: 'x', actions: [
      { kind: 'open_lead', label: 'a', leadId: '../../admin' },
      { kind: 'open_page', label: 'b', page: 'https://evil.example' },
      { kind: 'prepare', label: 'c', tool: 'Drop Table', args: {} },
      { kind: 'ask', label: 'd', text: '   ' }
    ] }]);
    expect(cards[0].actions).toEqual([]);
  });

  it('limits how much a single answer can carry', () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ title: `Card ${i}`, actions: Array.from({ length: 9 }, (_, j) => ({ kind: 'export', label: `A${j}` })) }));
    const cards = parseCards(many);
    expect(cards).toHaveLength(6);
    expect(cards[0].actions).toHaveLength(4);
  });

  it('returns nothing for garbage', () => {
    expect(parseCards(null)).toEqual([]);
    expect(parseCards('x')).toEqual([]);
    expect(parseCards([null, 3, { title: '' }])).toEqual([]);
  });
});

describe('actionProgress', () => {
  it('walks prepare, approve, run, confirm and marks stopped ones', () => {
    expect(actionProgress('awaiting')).toEqual({ complete: 1, ended: null });
    expect(actionProgress('running')).toEqual({ complete: 2, ended: null });
    expect(actionProgress('done')).toEqual({ complete: 4, ended: 'ok' });
    expect(actionProgress('cancelled').ended).toBe('bad');
    expect(actionProgress('failed').ended).toBe('bad');
  });
});
