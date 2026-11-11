import { describe, expect, it } from 'vitest';
import { OUTREACH_STEPS, fill, mailtoHref, nextTouch, render, unfilled } from './partnerOutreach';

const vars = { first_name: 'Sarah', market: 'Tucson', your_name: 'Jen', your_phone: '520-555-0100', your_email: 'jen@example.com' };

describe('the recruiting sequence', () => {
  it('has the three cold emails on days 0, 3 and 7, then the terms and agreement emails', () => {
    expect(OUTREACH_STEPS.map((s) => [s.id, s.dayOffset])).toEqual([['first', 0], ['bump', 3], ['last', 7], ['terms', null], ['agreement', null]]);
  });

  it('fills every merge field and leaves no bracket behind', () => {
    for (const s of OUTREACH_STEPS) {
      const m = render(s, vars);
      expect(unfilled(m.subject + m.body), s.id).toEqual([]);
    }
    expect(render(OUTREACH_STEPS[0], vars).subject).toBe('Seller-intent referrals in Tucson: referral partnership');
    expect(render(OUTREACH_STEPS[0], vars).body).toContain('Hi Sarah,');
  });

  it('reports which fields are still missing', () => {
    expect(unfilled(render(OUTREACH_STEPS[1], { market: 'Tucson' }).body)).toEqual(['first_name', 'your_name']);
    expect(fill('{{a}}', {})).toBe('{{a}}');
  });

  it('promises nothing that is not in the agreement: paid only on close, no upfront fee, status updates, 180-day protection', () => {
    const all = OUTREACH_STEPS.map((s) => s.body).join('\n');
    expect(all).toMatch(/only (when|if) you close/i);
    expect(all).toMatch(/No upfront lead fees/);
    expect(all).toMatch(/180-day protection/);
    expect(all).not.toMatch(/guarantee|manag/i);
    expect(OUTREACH_STEPS[4].body).toMatch(/license is confirmed active/);
  });

  it('builds a mail link', () => {
    expect(mailtoHref('a@b.co', 'Hi & bye', 'Line 1\nLine 2')).toBe('mailto:a@b.co?subject=Hi%20%26%20bye&body=Line%201%0ALine%202');
  });
});

describe('when the next email is due', () => {
  const start = '2026-11-02T15:00:00Z';
  it('starts with the first email, then the bump after 3 days, the last note after 7, then waits', () => {
    expect(nextTouch(null, 0).step).toBe('first');
    expect(nextTouch(start, 1, new Date('2026-11-04T00:00:00Z'))).toEqual({ step: 'bump', label: 'Send the day-3 bump', dueOn: '2026-11-05', overdue: false });
    expect(nextTouch(start, 1, new Date('2026-11-06T00:00:00Z')).overdue).toBe(true);
    expect(nextTouch(start, 2, new Date('2026-11-08T00:00:00Z'))).toMatchObject({ step: 'last', dueOn: '2026-11-09', overdue: false });
    expect(nextTouch(start, 3).step).toBe('done');
  });
});
