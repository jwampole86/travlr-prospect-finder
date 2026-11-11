import { describe, expect, it } from 'vitest';
import { availabilityWindow, publicBlocks, publicListing } from './listings';

describe('publicListing', () => {
  it('never returns private details, internal notes or ownership links', () => {
    const out = publicListing({ id: 'l1', title: 'T', price_per_night: '610', cleaning_fee: 200, private_details: { wifi: 'secret' }, quality_note: 'internal', lead_id: 'lead-1', organization_id: 'o', attributes: { rating: 4.9 }, amenities: ['Pool'] });
    expect(out).toMatchObject({ id: 'l1', price_per_night: 610, cleaning_fee: 200, rating: 4.9, amenities: ['Pool'], min_nights: 1 });
    for (const k of ['private_details', 'quality_note', 'lead_id', 'organization_id', 'eligibility', 'sale_status']) expect(out).not.toHaveProperty(k);
  });
});

describe('publicBlocks', () => {
  it('only tells bookings apart from other holds', () => {
    expect(publicBlocks([{ start_date: '2027-01-01', end_date: '2027-01-03', reason: 'showing' }, { start_date: '2027-02-01', end_date: '2027-02-02', reason: 'booking' }]).map((b) => b.kind)).toEqual(['blocked', 'booking']);
  });
});

describe('availabilityWindow', () => {
  const today = new Date('2027-01-01T00:00:00Z');
  it('defaults to a year from today', () => expect(availabilityWindow(null, null, today)).toEqual({ from: '2027-01-01', to: '2028-01-01' }));
  it('rejects bad or oversized windows', () => {
    expect(availabilityWindow('nope', null, today)).toHaveProperty('error');
    expect(availabilityWindow('2027-01-05', '2027-01-01', today)).toHaveProperty('error');
    expect(availabilityWindow('2027-01-01', '2029-01-01', today)).toHaveProperty('error');
  });
});
