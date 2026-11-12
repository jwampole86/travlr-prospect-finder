import { describe, expect, it } from 'vitest';
import { analyzeSale, type SaleFacts } from './saleAnalysis';

const base: SaleFacts = { priceType: 'sale', price: 500_000, daysOnMarket: 20, priceCuts: 0, lastSoldPrice: null, lastSoldDate: null, ownerListed: null, regulation: 'Allowed', estimatedNetMonthly: 3000, repliedYes: false, declined: false };

describe('analyzeSale', () => {
  it('keeps an agent-listed home on the buyer side: no listing pitch, rental management only', () => {
    const a = analyzeSale({ ...base, ownerListed: false });
    expect(a.path.key).toBe('buyer_side_only');
    expect(a.path.label).toBe('Already Listed – Buyer Side Only');
    expect(a.summary).toMatch(/sale stays with the listing broker/);
    expect(a.talkingPoints.join(' ')).toMatch(/Do not ask to list/);
  });

  it('scores a stale, price-cut, owner-listed home above a fresh agent-listed one', () => {
    const fresh = analyzeSale(base);
    const stale = analyzeSale({ ...base, daysOnMarket: 130, priceCuts: 2, ownerListed: true });
    expect(stale.motivationScore!).toBeGreaterThan(fresh.motivationScore!);
    expect(stale.motivationLabel).toBe('High');
  });

  it('works out seller proceeds after selling costs without promising a price', () => {
    const a = analyzeSale(base);
    expect(a.proceeds).toEqual({ low: 441_700, high: 465_000, costPct: 7 });
    expect(a.summary).toContain('Best path');
  });

  it('notes a fast resale and the change from the last sale price', () => {
    const recent = new Date(Date.now() - 100 * 86_400_000).toISOString().slice(0, 10);
    const a = analyzeSale({ ...base, price: 400_000, lastSoldPrice: 253_500, lastSoldDate: recent });
    expect(a.history).toMatchObject({ lastSoldPrice: 253_500, changePct: 58 });
    expect(a.motivationReasons.join(' ')).toMatch(/fast resale/);
  });

  it('treats a rental listing as a rental-management conversation, with no sale score', () => {
    const a = analyzeSale({ ...base, priceType: 'rent', price: 2200 });
    expect(a.motivationScore).toBeNull();
    expect(a.proceeds).toBeNull();
    expect(a.path.key).toBe('long_term_rental');
  });

  it('does not start a conversation with an owner who declined', () => {
    expect(analyzeSale({ ...base, declined: true }).summary).toMatch(/declined/);
  });
});
