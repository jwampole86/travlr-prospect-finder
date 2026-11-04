// Synced from ava-assistant. Do not edit here: change it there and run tools/sync-to-travlr.mjs.
import { describe, expect, it } from 'vitest';
import type { AvaHost, TourDefinition } from '../host/types';
import { nextFollowups } from './followups';

const tour = (id: string, title: string, keywords: string[]): TourDefinition => ({ id, title, summary: title, roles: ['agent', 'admin'], keywords, steps: [] });
const host = (role: AvaHost['role'] = 'agent'): AvaHost => ({
  assetBase: '', apiBase: '', offlineDemo: false, role, getRoute: () => '/', navigate: () => undefined,
  tours: [tour('lead-filters', 'Lead filters', ['filter', 'leads']), tour('dashboard', 'Dashboard', ['dashboard'])],
});
const labels = (f: { label: string }[]) => f.map((x) => x.label);

describe('nextFollowups', () => {
  it('after a help answer, offers related topics and a matching tour first', () => {
    const f = nextFollowups({
      host: host(), asked: ['How do I filter leads?'],
      sources: [{ kind: 'knowledge', label: 'Approved help', live: true, citations: ['Help: Saving filters', 'Help: Lead verification', 'Help: Exporting leads'] }],
    });
    expect(f[0]).toMatchObject({ kind: 'tour', tourId: 'lead-filters' });
    expect(labels(f)).toContain('Tell me about lead verification');
    expect(labels(f)).toContain('Tell me about exporting leads');
  });

  it('after a lead search, offers a follow-up and the filter tour', () => {
    const f = nextFollowups({ host: host(), asked: ['Find my highest-priority leads'], sources: [{ kind: 'leads', label: 'Leads', live: true, count: 3 }] });
    expect(labels(f)[0]).toBe('Create a follow-up for the top lead');
    expect(f.some((x) => x.tourId === 'lead-filters')).toBe(true);
  });

  it('never repeats what was already asked, in any capitalisation', () => {
    const f = nextFollowups({ host: host(), asked: ['how does lead verification work?', 'FIND MY HIGHEST-PRIORITY LEADS'] });
    expect(labels(f)).not.toContain('How does lead verification work?');
    expect(labels(f)).not.toContain('Find my highest-priority leads');
  });

  it('does not offer a tour that was just done, and keeps offering something after an unanswered question', () => {
    const f = nextFollowups({ host: host(), asked: ['zzz'], toursDone: ['lead-filters', 'dashboard'] });
    expect(f.some((x) => x.kind === 'tour')).toBe(false);
    expect(f.length).toBeGreaterThan(0);
  });

  it('does not push staff-only actions at a homeowner, and respects the limit', () => {
    const f = nextFollowups({ host: host('homeowner'), asked: [], sources: [{ kind: 'leads', label: 'Leads', live: true, count: 2 }], max: 2 });
    expect(labels(f).join(' ')).not.toMatch(/follow-up/i);
    expect(f).toHaveLength(2);
  });
});
