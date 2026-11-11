import { describe, expect, it } from 'vitest';
import { naveoIntent, parseNaveoLead } from './naveoLead';

describe('parseNaveoLead', () => {
  it('requires an address and a valid email', () => {
    expect(parseNaveoLead({ email: 'a@b.com' })).toEqual({ ok: false, error: 'address is required' });
    expect(parseNaveoLead({ address: '1 Main', email: 'nope' }).ok).toBe(false);
    expect(parseNaveoLead(null).ok).toBe(false);
  });

  it('normalizes and bounds the fields', () => {
    const r = parseNaveoLead({ submission_id: 's1', name: ' Olive ', email: ' O@X.com ', address: '1 Main St', state: 'tx', beds: '3', baths: 9999, timeline_months: 4, str_interest: true, follow_up_consent: 'yes', notes: 'n'.repeat(5000) });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).toMatchObject({ submissionId: 's1', name: 'Olive', email: 'o@x.com', state: 'TX', beds: 3, baths: null, timelineMonths: 4, strInterest: true, followUpConsent: false });
    expect(r.value.notes).toHaveLength(1000);
  });
});

describe('naveoIntent', () => {
  const base = { submissionId: null, name: 'A', email: 'a@b.com', phone: null, address: '1', city: null, state: null, propertyType: null, beds: null, baths: null, condition: null, timelineMonths: null, strInterest: false, followUpConsent: false, notes: null };

  it('is always an explicit signal, raised by a short timeline and a phone number', () => {
    expect(naveoIntent(base)).toMatchObject({ level: 'explicit', score: 70, timeline: null });
    expect(naveoIntent({ ...base, timelineMonths: 2, phone: '555' })).toMatchObject({ score: 85, timeline: '2 months' });
    expect(naveoIntent({ ...base, timelineMonths: 1 }).timeline).toBe('1 month');
    expect(naveoIntent({ ...base, timelineMonths: 0 }).timeline).toBe('asap');
  });
});
