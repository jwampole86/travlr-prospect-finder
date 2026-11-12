import { describe, expect, it } from 'vitest';
import { referralTermsWarnings, STANDARD_REFERRAL_TERMS, STANDARD_TERMS_POINTS } from './referralTerms';

describe('standard referral terms', () => {
  it('keeps the standard above the floor and mentions payee and RESPA limits', () => {
    expect(STANDARD_REFERRAL_TERMS.feePercent).toBeGreaterThan(STANDARD_REFERRAL_TERMS.floorPercent);
    expect(STANDARD_TERMS_POINTS.join(' ')).toMatch(/licensed payee/);
    expect(STANDARD_TERMS_POINTS.join(' ')).toMatch(/RESPA/);
  });

  it('passes complete terms and flags gaps', () => {
    expect(referralTermsWarnings({ feePercent: '25', payeeName: 'Desert Peak Realty LLC', protectionDays: 180, responsibleBroker: 'A. Broker', agreementSignedOn: '2026-10-01' })).toEqual([]);
    const w = referralTermsWarnings({ feePercent: 15 }).join(' ');
    expect(w).toMatch(/below the 20% floor/);
    expect(w).toMatch(/legal payee/);
    expect(w).toMatch(/signed agreement/);
  });

  it('rejects an impossible fee', () => {
    expect(referralTermsWarnings({ feePercent: 150, payeeName: 'x', protectionDays: 1, responsibleBroker: 'x', agreementSignedOn: '2026-01-01' })[0]).toMatch(/between 0 and 100/);
  });
});
