import { describe, expect, it } from 'vitest';
import { leadRef, messageAllowed, renderPartnerMessage, type MessageContext } from './partnerMessages';

const ctx: MessageContext = {
  brand: 'NAVEO Homes', senderName: 'Jen', partnerName: 'Sarah', leadRef: 'AZ-2026-A1B2C3', address: '4105 E Bujia Segunda, Tucson, AZ 85718', market: 'Tucson',
  ownerName: 'Pat Owner', ownerPhone: '+15205550100', intent: 'Replied that they may sell', feePercent: 25, protectionEndsOn: '2027-05-10', payeeName: 'Desert Peak Realty LLC',
  paymentMethod: 'ACH', paymentDueDays: 15, sentOn: '2026-11-10', status: 'Contacted the owner', commissionNote: null
};

describe('partner emails', () => {
  it('builds a short reference from the state, year and referral id', () => {
    expect(leadRef('az', 'a1b2c3d4-0000', '2026-11-10T00:00:00Z')).toBe('AZ-2026-A1B2C3');
    expect(leadRef(null, 'x', '2026-01-01T00:00:00Z')).toBe('XX-2026-X');
  });

  it('the lead packet carries the reference, property, owner details, terms and how to report', () => {
    const m = renderPartnerMessage('intro', ctx);
    expect(m.subject).toBe('Lead AZ-2026-A1B2C3 – 4105 E Bujia Segunda, Tucson, AZ 85718');
    for (const part of ['Lead reference: AZ-2026-A1B2C3', 'Owner: Pat Owner', 'Phone: +15205550100', '25% of your commission', 'protected until 2027-05-10', 'within 7 days', 'Lead AZ-2026-A1B2C3 – Contacted']) expect(m.body).toContain(part);
    expect(m.body).not.toMatch(/manag|earn while|guarantee/i);
  });

  it('leaves out owner details that were not provided', () => {
    const m = renderPartnerMessage('intro', { ...ctx, ownerName: null, ownerPhone: null, intent: null, feePercent: null, protectionEndsOn: null });
    expect(m.body).not.toMatch(/Owner:|Phone:|What we know/);
    expect(m.body).toContain('as in Exhibit A');
  });

  it('asks for a status, and for the commission and its date when a deal closes', () => {
    expect(renderPartnerMessage('nudge', ctx).body).toContain('currently showing as "Contacted the owner"');
    const c = renderPartnerMessage('closed', ctx);
    expect(c.subject).toContain('closed: fee details');
    expect(c.body).toContain('25% of your gross commission');
    expect(c.body).toContain('within 15 business days after you receive your commission');
    expect(c.body).toContain('Payee: Desert Peak Realty LLC (ACH)');
    expect(c.body).toContain('the commission you received and the date');
  });

  it('does not nag: no repeat nudge inside three days, fee details only once closed, nothing after a referral is finished', () => {
    const now = new Date('2026-11-10T12:00:00Z');
    expect(messageAllowed('nudge', 'contacted', '2026-11-09T12:00:00Z', now)).toMatch(/3 days/);
    expect(messageAllowed('nudge', 'contacted', '2026-11-06T12:00:00Z', now)).toBeNull();
    expect(messageAllowed('closed', 'listed', null, now)).toMatch(/closed referral/);
    expect(messageAllowed('closed', 'closed', null, now)).toBeNull();
    expect(messageAllowed('intro', 'dead', null, now)).toMatch(/finished/);
    expect(messageAllowed('intro', 'sent', '2026-11-10T06:00:00Z', now)).toMatch(/a day/);
  });
});
