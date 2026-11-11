import { describe, expect, it } from 'vitest';
import { canMoveTo, commercialBlockers, licenseCheckAgeDays, licenseLookupFor, referralBlockers, scorePartner, type ReferralRow } from './partnerReferrals';

const NOW = new Date('2026-11-10T12:00:00Z');
const ago = (d: number) => new Date(NOW.getTime() - d * 86_400_000).toISOString();
const row = (status: ReferralRow['status'], sentDaysAgo: number, changedDaysAgo = sentDaysAgo): ReferralRow => ({ status, sent_at: ago(sentDaysAgo), status_at: ago(changedDaysAgo) });

describe('partner update rate', () => {
  it('has no rate until a referral is more than a week old, and a new referral is never held against the partner', () => {
    const s = scorePartner([row('sent', 2), row('sent', 6)], NOW);
    expect(s).toMatchObject({ total: 2, due: 0, rate: null, flag: 'ok', reason: null });
  });

  it('counts a referral as reported once it has any status beyond sent', () => {
    const s = scorePartner([row('contacted', 20, 3), row('listed', 30, 5), row('closed', 40, 10), row('sent', 3)], NOW);
    expect(s).toMatchObject({ due: 3, reported: 3, rate: 1, flag: 'ok', listed: 1, closed: 1, open: 3 });
  });

  it('watches a partner with one unacknowledged referral and flags one who has stopped reporting', () => {
    expect(scorePartner([row('contacted', 20, 3), row('sent', 12)], NOW)).toMatchObject({ flag: 'watch', silent: 1 });
    const stopped = scorePartner([row('sent', 15), row('sent', 20)], NOW);
    expect(stopped.flag).toBe('stopped');
    expect(stopped.reason).toMatch(/not been acknowledged/);
    expect(scorePartner([row('sent', 15), row('sent', 20), row('contacted', 25, 2)], NOW).reason).toMatch(/Only 1 of 3/);
  });

  it('flags a partner whose rate is under 70% once at least three referrals are due', () => {
    const s = scorePartner([row('listed', 20, 2), row('sent', 20), row('sent', 20), row('listed', 20, 2), row('closed', 20, 2)], NOW);
    expect(s).toMatchObject({ due: 5, reported: 3, flag: 'stopped' });
    expect(s.reason).toMatch(/3 of 5/);
  });

  it('flags open referrals that have gone a month without an update, and ignores finished ones', () => {
    expect(scorePartner([row('listed', 90, 45), row('under_contract', 80, 40)], NOW)).toMatchObject({ stale: 2, flag: 'stopped' });
    expect(scorePartner([row('listed', 90, 45), row('closed', 80, 40)], NOW)).toMatchObject({ stale: 1, flag: 'watch' });
    expect(scorePartner([row('closed', 90, 80), row('dead', 80, 70)], NOW)).toMatchObject({ stale: 0, flag: 'ok' });
  });
});

describe('sending a lead to a partner', () => {
  it('needs a verified license, legal review, the agreement on file and a partner still in play', () => {
    expect(referralBlockers({ license_status: 'verified', legal_reviewed: true, agreement_on_file: true, relationship_status: 'active' })).toEqual([]);
    expect(referralBlockers({ license_status: 'unverified', legal_reviewed: false, agreement_on_file: false, relationship_status: 'prospect' })).toHaveLength(3);
    expect(referralBlockers({ license_status: 'verified', legal_reviewed: true, agreement_on_file: true, relationship_status: 'paused' })).toEqual(['The partner is paused.']);
  });

  it('only moves forward, never back to sent, and never out of closed or dead', () => {
    expect(canMoveTo('sent', 'received')).toBe(true);
    expect(canMoveTo('listed', 'dead')).toBe(true);
    expect(canMoveTo('listed', 'sent')).toBe(false);
    expect(canMoveTo('closed', 'listed')).toBe(false);
    expect(canMoveTo('listed', 'listed')).toBe(false);
  });

  it('lets a dead referral come back only while the protection period runs', () => {
    expect(canMoveTo('dead', 'closed')).toBe(false);
    expect(canMoveTo('dead', 'listed', { reopenable: true })).toBe(true);
    expect(canMoveTo('dead', 'closed', { reopenable: true })).toBe(true);
    expect(canMoveTo('dead', 'received', { reopenable: true })).toBe(false);
    expect(canMoveTo('closed', 'listed', { reopenable: true })).toBe(false);
  });

  it('needs the fee, protection period, payment method and payee on record before a lead is sent', () => {
    expect(commercialBlockers({})).toHaveLength(4);
    expect(commercialBlockers({ referral_fee_percent: 25, protection_days: 180, payment_method: 'ach', payee_name: ' ' })).toHaveLength(1);
    expect(commercialBlockers({ referral_fee_percent: 25, protection_days: 180, payment_method: 'check', payee_name: 'Desert Peak Realty LLC' })).toEqual([]);
  });
});

describe('license checks', () => {
  it('points at the state\'s own site, and at ARELLO only as the fallback', () => {
    expect(licenseLookupFor('az').url).toContain('azre.gov');
    expect(licenseLookupFor('NV').url).toContain('red.nv.gov');
    expect(licenseLookupFor('CO').url).toContain('colorado.gov');
    expect(licenseLookupFor('TX').url).toContain('arello.org');
    expect(licenseLookupFor(null).url).toContain('arello.org');
  });
  it('reports how old a check is', () => {
    expect(licenseCheckAgeDays(ago(100), NOW)).toBe(100);
    expect(licenseCheckAgeDays(null, NOW)).toBeNull();
  });
});
