import { describe, expect, it } from 'vitest';
import { assessDual, timelineMonths, type DualInput } from './dualOpportunity';

const base: DualInput = {
  timeline: '4 months', occupancy: 'vacant', goals: [], regulationStatus: 'Allowed', estimatedNetMonthly: 3000,
  priceExpectationLow: 500000, priceExpectationHigh: 520000, listingStatus: 'not_listed', estDaysToSale: null, estSellingCostPct: null,
};

describe('timelineMonths', () => {
  it('reads common phrasings', () => {
    expect(timelineMonths('asap')).toBe(0);
    expect(timelineMonths('in 6 months')).toBe(6);
    expect(timelineMonths('2 weeks')).toBeLessThan(1);
    expect(timelineMonths('a year')).toBe(12);
    expect(timelineMonths('this spring')).toBeNull();
    expect(timelineMonths(null)).toBeNull();
  });
});

describe('assessDual', () => {
  it('recommends Sell + Earn when rentals are allowed, there is time and income', () => {
    const r = assessDual(base);
    expect(r.recommendation).toBe('sell_and_earn');
    expect(r.suggestedRoute).toBe('interim_rental');
    expect(r.stay.interimNet).toBe(9000);
    expect(r.sale.netLow).toBe(465000);
    expect(r.sale.netHigh).toBe(483600);
    expect(r.disclaimer).toMatch(/not an offer/i);
  });

  it('recommends renting while preparing for a long timeline', () => {
    expect(assessDual({ ...base, timeline: '8 months' }).recommendation).toBe('rent_while_preparing');
  });

  it.each([
    ['a tenant lives there', { occupancy: 'tenant_occupied' }],
    ['the sale is immediate', { timeline: 'asap' }],
    ['short-term rentals are prohibited', { regulationStatus: 'Prohibited' }],
    ['short-term rentals are restricted', { regulationStatus: 'Restricted' }],
    ['the rules are unknown', { regulationStatus: 'Unknown' }],
    ['the rules are missing', { regulationStatus: null }],
    ['there is no income estimate', { estimatedNetMonthly: null }],
    ['the home is already listed', { listingStatus: 'listed' }],
    ['the home is under contract', { listingStatus: 'under_contract' }],
  ] as Array<[string, Partial<DualInput>]>)('stays Sell only when %s', (_why, patch) => {
    const r = assessDual({ ...base, ...patch });
    expect(r.recommendation).toBe('sell_only');
    expect(r.reasons.length).toBeGreaterThan(0);
  });

  it('points an existing short-term rental to an investor exit, with a disclosure caution', () => {
    const r = assessDual({ ...base, occupancy: 'short_term_rental' });
    expect(r.recommendation).toBe('investor_exit');
    expect(r.cautions.join(' ')).toMatch(/disclosed/i);
  });

  it('says when figures are defaults and when there is no price to work from', () => {
    const r = assessDual({ ...base, priceExpectationLow: null, priceExpectationHigh: null });
    expect(r.sale.netLow).toBeNull();
    expect(r.cautions.join(' ')).toMatch(/default of 90 days/);
    expect(r.cautions.join(' ')).toMatch(/cannot be estimated/);
  });

  it('uses entered figures instead of defaults', () => {
    const r = assessDual({ ...base, estDaysToSale: 60, estSellingCostPct: 5 });
    expect(r.sale.netLow).toBe(475000);
    expect(r.cautions.join(' ')).not.toMatch(/default of/);
  });
});
