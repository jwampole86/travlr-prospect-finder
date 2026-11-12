import { describe, expect, it } from 'vitest';
import { channelFee, channelRate, summarizeChannelFees } from './channelFee';

describe('channelRate', () => {
  it('is 10%, or 8% from 10 live homes', () => {
    expect(channelRate(1)).toBe(0.1);
    expect(channelRate(9)).toBe(0.1);
    expect(channelRate(10)).toBe(0.08);
  });
});

describe('channelFee', () => {
  it('charges nothing in the first 60 days after the homes go live', () => {
    expect(channelFee({ bookedOn: '2027-03-01', liveDate: '2027-01-01', total: 1200, partnerHomes: 5 })).toEqual({ rate: 0, fee: 0, net: 1200, intro: true });
  });
  it('charges 10% from day 60: a $1,200 stay costs $120 and leaves $1,080', () => {
    expect(channelFee({ bookedOn: '2027-03-02', liveDate: '2027-01-01', total: 1200, partnerHomes: 5 })).toEqual({ rate: 0.1, fee: 120, net: 1080, intro: false });
  });
  it('charges 8% for a partner with 10 or more homes', () => {
    expect(channelFee({ bookedOn: '2027-06-01', liveDate: '2027-01-01', total: 1200, partnerHomes: 12 }).fee).toBe(96);
  });
  it('never charges before a live date is recorded', () => {
    expect(channelFee({ bookedOn: '2027-06-01', liveDate: null, total: 1200, partnerHomes: 12 }).fee).toBe(0);
  });
  it('reads a timestamp as its date and rounds to cents', () => {
    expect(channelFee({ bookedOn: '2027-06-01T15:30:00Z', liveDate: '2027-01-01', total: 333.33, partnerHomes: 1 }).fee).toBe(33.33);
  });
  it('treats a bad total as zero', () => {
    expect(channelFee({ bookedOn: '2027-06-01', liveDate: '2027-01-01', total: Number.NaN, partnerHomes: 1 }).fee).toBe(0);
  });
});

describe('summarizeChannelFees', () => {
  it('totals each partner using that partner\'s own home count and live date', () => {
    const b = (reference: string, partner: string, total: number, bookedOn: string) => ({ reference, partner, title: 'Home', check_in: '2027-07-01', check_out: '2027-07-04', total, bookedOn, liveDate: '2027-01-01' });
    const { lines, partners } = summarizeChannelFees(
      [b('NV-AAAAAA', 'Alpha', 1000, '2027-06-01'), b('NV-BBBBBB', 'Alpha', 500, '2027-01-10'), b('NV-CCCCCC', 'Beta', 1000, '2027-06-01')],
      { Alpha: 12, Beta: 2 },
    );
    expect(lines.map((l) => l.fee)).toEqual([80, 0, 100]);
    expect(partners).toEqual([
      { partner: 'Alpha', homes: 12, bookings: 2, total: 1500, fee: 80, introBookings: 1 },
      { partner: 'Beta', homes: 2, bookings: 1, total: 1000, fee: 100, introBookings: 0 },
    ]);
  });
});
