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
    expect(availabilityWindow('2027-01-01', '2030-01-01', today)).toHaveProperty('error');
  });
});

import { listingIdFilter, publicSale } from './listings';
import { performance } from './performance';
import { bookingFailure, parseBlock, parseBooking, parseReview } from './bookings';

describe('listingIdFilter', () => {
  it('accepts an AVYRO id or the id a home had on the old Stays site', () => {
    expect(listingIdFilter('f7a47311-fc6f-4e23-9d95-d395596f91db').column).toBe('id');
    expect(listingIdFilter('6acf59e8dfbfd8f047cbcfc0').column).toBe('stays_property_id');
  });
});

describe('publicSale', () => {
  it('shares only whether a home is for sale and its handover date', () => {
    expect(publicSale({ sale_status: { for_sale: true, handover_date: '2027-03-01', showing_note: 'secret' } })).toEqual({ for_sale: true, handover_date: '2027-03-01' });
    expect(publicSale({ sale_status: {} })).toEqual({ for_sale: false });
  });
});

describe('parseBooking', () => {
  const ok = { listing_id: 'abc', reference: 'NV-ABC123', guest_name: 'Pat', guest_email: 'P@X.CO', guests: 2, check_in: '2027-05-01', check_out: '2027-05-04' };
  it('accepts a valid booking and ignores any price the caller sends', () => {
    const r = parseBooking({ ...ok, total: 1, nightly_total: 1 });
    expect(r.ok && r.value.guestEmail).toBe('p@x.co');
    expect(r.ok && Object.keys(r.value)).not.toContain('total');
  });
  it('rejects bad references, dates and stay lengths', () => {
    expect(parseBooking({ ...ok, reference: 'x' }).ok).toBe(false);
    expect(parseBooking({ ...ok, check_out: '2027-05-01' }).ok).toBe(false);
    expect(parseBooking({ ...ok, check_out: '2027-07-01' }).ok).toBe(false);
    expect(parseBooking({ ...ok, check_in: '2027-02-30' }).ok).toBe(false);
  });
});

describe('bookingFailure', () => {
  it('maps the raised reasons to responses', () => {
    expect(bookingFailure('dates_taken')).toEqual({ status: 409, error: 'dates_taken' });
    expect(bookingFailure('boom').status).toBe(500);
  });
});

describe('parseBlock and parseReview', () => {
  it('never lets a caller place a booking or showing hold', () => {
    const r = parseBlock({ start_date: '2027-01-01', end_date: '2027-01-03', reason: 'booking' });
    expect(r.ok && r.value.reason).toBe('owner');
    expect(parseBlock({ start_date: '2027-01-03', end_date: '2027-01-01' }).ok).toBe(false);
  });
  it('requires a rating from 1 to 5', () => {
    expect(parseReview({ rating: 6 }).ok).toBe(false);
    expect(parseReview({ rating: 5, reference: 'NV-ABC123' }).ok).toBe(true);
  });
});

describe('performance', () => {
  it('clips nights to the window and counts revenue by check-in', () => {
    const out = performance([{ check_in: '2026-12-30', check_out: '2027-01-03', total: 400 }, { check_in: '2027-01-10', check_out: '2027-01-12', total: 200 }], '2027-01-01', '2027-01-11');
    expect(out).toMatchObject({ nights_booked: 3, window_nights: 10, occupancy_pct: 30, revenue: 200 });
  });
});
