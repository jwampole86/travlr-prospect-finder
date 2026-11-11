import { describe, expect, it } from 'vitest';
import { estimateStrRevenue } from './strEstimate';

describe('estimateStrRevenue', () => {
  it('gives different homes different figures instead of one number per bedroom count', () => {
    const cheap = estimateStrRevenue({ price: 235_000, priceType: 'sale', beds: 3 });
    const mid = estimateStrRevenue({ price: 600_000, priceType: 'sale', beds: 3 });
    const pricey = estimateStrRevenue({ price: 1_800_000, priceType: 'sale', beds: 3 });
    expect(cheap.netMonthly).toBeLessThan(mid.netMonthly);
    expect(mid.netMonthly).toBeLessThan(pricey.netMonthly);
    // Occupancy softens as the nightly rate rises, so revenue grows slower than the rate.
    expect(pricey.occupancy).toBeLessThan(cheap.occupancy);
  });

  it('adds bedrooms at the same price and keeps net at 65% of gross', () => {
    const three = estimateStrRevenue({ price: 500_000, priceType: 'sale', beds: 3 });
    const five = estimateStrRevenue({ price: 500_000, priceType: 'sale', beds: 5 });
    expect(five.grossMonthly).toBeGreaterThan(three.grossMonthly);
    expect(three.netMonthly).toBe(Math.round(three.grossMonthly * 0.65));
    expect(three.grossMonthly).toBe(Math.round(three.adr * 30 * (three.occupancy / 100)));
  });

  it('prices a rental from its monthly rent, near 1.2x rent', () => {
    const est = estimateStrRevenue({ price: 2_200, priceType: 'rent', beds: 2 });
    expect(est.grossMonthly / 2_200).toBeGreaterThan(0.9);
    expect(est.grossMonthly / 2_200).toBeLessThan(1.6);
  });

  it('falls back to bedrooms when the price is unusable', () => {
    const est = estimateStrRevenue({ price: 12, priceType: 'sale', beds: 4 });
    expect(est.basis).toBe('bedrooms');
    expect(est.occupancy).toBe(57);
  });

  it('blends AirDNA figures in by confidence', () => {
    const base = estimateStrRevenue({ price: 750_000, priceType: 'sale', beds: 4 });
    const high = estimateStrRevenue({ price: 750_000, priceType: 'sale', beds: 4, airdna: { adr: 240, occupancy: 68, confidence: 'High' } });
    const low = estimateStrRevenue({ price: 750_000, priceType: 'sale', beds: 4, airdna: { adr: 240, occupancy: 68, confidence: 'Low' } });
    expect(high).toMatchObject({ adr: 240, occupancy: 68, basis: 'airdna' });
    expect(low.basis).toBe('airdna_blend');
    expect(low.adr).toBeGreaterThan(Math.min(base.adr, 240) - 1);
    expect(low.adr).toBeLessThan(Math.max(base.adr, 240) + 1);
  });
});
