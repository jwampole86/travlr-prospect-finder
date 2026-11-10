import { describe, expect, it } from 'vitest';
import { OUTREACH_BRANDS, applyOutreachBrand, outreachBrandFor } from './brands';

describe('which NAVEO a message comes from', () => {
  it('rent goes to NAVEO Stays, sale to NAVEO Homes, and anything unknown to Stays', () => {
    expect(outreachBrandFor('rent').name).toBe('NAVEO Stays');
    expect(outreachBrandFor('RENT').name).toBe('NAVEO Stays');
    expect(outreachBrandFor('sale').name).toBe('NAVEO Homes');
    expect(outreachBrandFor('Sale').name).toBe('NAVEO Homes');
    for (const v of [null, undefined, '', 'unknown']) expect(outreachBrandFor(v).key).toBe('stays');
  });

  it('never names TRAVLR, and never invents a website for NAVEO Homes', () => {
    for (const b of Object.values(OUTREACH_BRANDS)) { expect(JSON.stringify(b)).not.toMatch(/travlr/i); }
    expect(OUTREACH_BRANDS.homes.siteUrl).toBeNull();
    expect(OUTREACH_BRANDS.stays.siteUrl).toBe('https://staynaveo.com');
  });

  it('fills the brand fields in either brace style', () => {
    const t = 'Hi, {brand} here. {{brand}} | {brand_signature} | {{brand_site}}';
    expect(applyOutreachBrand(t, OUTREACH_BRANDS.stays)).toBe('Hi, NAVEO Stays here. NAVEO Stays | NAVEO Stays | staynaveo.com | staynaveo.com');
    expect(applyOutreachBrand('{brand_site}', OUTREACH_BRANDS.homes)).toBe('');
  });
});
