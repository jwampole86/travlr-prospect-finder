import { describe, expect, it } from 'vitest';
import { addBusinessDays, computeFee, estimateFee, feeAfterCommission, isOverdue, ledger, protectionEnds, withinProtection } from './partnerFees';

describe('the fee on a closed referral', () => {
  it('is the agreed percentage of the partner\'s commission, to the cent', () => {
    expect(computeFee(15000, 25)).toBe(3750);
    expect(computeFee(15000, 30)).toBe(4500);
    expect(computeFee(12345.67, 27.5)).toBe(3395.06);
    expect(computeFee(null, 25)).toBeNull();
    expect(computeFee(15000, null)).toBeNull();
    expect(computeFee(-1, 25)).toBeNull();
    expect(computeFee(15000, 120)).toBeNull();
  });

  it('can be estimated from the price, assuming a 2.5% side commission, only as a rough figure', () => {
    expect(estimateFee(600000, 25)).toBe(3750);
    expect(estimateFee(600000, 25, 3)).toBe(4500);
    expect(estimateFee(null, 25)).toBeNull();
    expect(estimateFee(0, 25)).toBeNull();
  });

  it('is due the agreed business days after the partner is paid, skipping weekends', () => {
    expect(addBusinessDays('2026-11-09', 10)).toBe('2026-11-23');
    expect(addBusinessDays('2026-11-13', 1)).toBe('2026-11-16');
    expect(addBusinessDays('2026-11-14', 1)).toBe('2026-11-16');
    expect(addBusinessDays('2026-11-09', 0)).toBe('2026-11-09');
  });

  it('waits for the commission, then becomes due with its date', () => {
    expect(feeAfterCommission({ feePercent: 25, commissionReceived: null, receivedOn: null, dueDays: 10 })).toEqual({ fee_status: 'awaiting_commission', fee_amount: null, fee_due_on: null });
    expect(feeAfterCommission({ feePercent: null, commissionReceived: 15000, receivedOn: '2026-11-09', dueDays: 10 }).fee_status).toBe('awaiting_commission');
    expect(feeAfterCommission({ feePercent: 25, commissionReceived: 15000, receivedOn: '2026-11-09', dueDays: 10 })).toEqual({ fee_status: 'due', fee_amount: 3750, fee_due_on: '2026-11-23' });
    expect(feeAfterCommission({ feePercent: 25, commissionReceived: 15000, receivedOn: '2026-11-09', dueDays: null }).fee_due_on).toBe('2026-11-09');
  });
});

describe('late fees and the ledger', () => {
  const NOW = new Date('2026-12-01T12:00:00Z');
  it('marks a due or invoiced fee overdue once its date has passed, never a paid one', () => {
    expect(isOverdue({ fee_status: 'due', fee_due_on: '2026-11-23' }, NOW)).toBe(true);
    expect(isOverdue({ fee_status: 'invoiced', fee_due_on: '2026-12-05' }, NOW)).toBe(false);
    expect(isOverdue({ fee_status: 'paid', fee_due_on: '2026-11-01' }, NOW)).toBe(false);
  });

  it('adds up what is owed, late, paid and still waiting, and flags a short payment', () => {
    const l = ledger([
      { status: 'closed', fee_status: 'due', fee_amount: 3750, fee_due_on: '2026-11-23' },
      { status: 'closed', fee_status: 'invoiced', fee_amount: 4500, fee_due_on: '2026-12-20' },
      { status: 'closed', fee_status: 'paid', fee_amount: 2000, fee_due_on: '2026-10-01', fee_paid_amount: 1500 },
      { status: 'closed', fee_status: 'awaiting_commission', fee_amount: null, fee_due_on: null, close_price: 400000, fee_percent: 25 },
      { status: 'closed', fee_status: 'waived', fee_amount: 900, fee_due_on: null }
    ], NOW);
    expect(l).toEqual({ owed: 8250, overdue: 3750, overdueCount: 1, paid: 1500, awaitingCommission: 1, estimatedPending: 2500, partialShortfall: 500 });
  });
});

describe('the protection period', () => {
  it('runs from the day the lead was sent, and stays unset when no period is agreed', () => {
    expect(protectionEnds('2026-03-01T00:00:00Z', 180)).toBe('2026-08-28T00:00:00.000Z');
    expect(protectionEnds('2026-03-01T00:00:00Z', null)).toBeNull();
    expect(withinProtection('2026-08-28T00:00:00.000Z', new Date('2026-06-15T00:00:00Z'))).toBe(true);
    expect(withinProtection('2026-08-28T00:00:00.000Z', new Date('2026-09-15T00:00:00Z'))).toBe(false);
    expect(withinProtection(null)).toBe(false);
  });
});
