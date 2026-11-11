import { describe, expect, it } from 'vitest';
import { summarizePriceHistory } from './rapidApiRealEstateService';

describe('summarizePriceHistory', () => {
  it('reads the last sale and counts price cuts since', () => {
    const summary = summarizePriceHistory([
      { date: '2026-11-01', price: 380000, event: 'Price change' },
      { date: '2026-10-01', price: 400000, event: 'Price change' },
      { date: '2026-09-15', price: 390000, event: 'Listed for sale' },
      { date: '2026-08-18', price: 253500, event: 'Sold' },
    ]);
    expect(summary).toEqual({ lastSoldPrice: 253500, lastSoldDate: '2026-08-18', priceCuts: 1 });
  });

  it('handles a home with no sale or price changes', () => {
    expect(summarizePriceHistory([{ date: '2026-11-11', price: 400000, event: 'Listed for sale' }])).toEqual({ lastSoldPrice: null, lastSoldDate: null, priceCuts: 0 });
  });
});
