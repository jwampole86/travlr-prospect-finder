import { describe, expect, it } from 'vitest';
import { HOMES_OUTREACH_TEMPLATE, OUTREACH_TEMPLATE, resolveRecipientPersonalization, type SmsRecipient } from './smsPersonalizationService';
import { EMAIL_TEMPLATE_SEEDS_FOR_TEST } from './smsBrand.fixture';

const owner = (priceType: string | null): SmsRecipient => ({
  leadId: 'L1', phone: '+13035550100', contactName: 'Sam Owner', ownerName: 'Sam Owner', address: '12 Pine St', city: 'Denver', state: 'CO', zip: '80202',
  verifiedOwner: true, verifiedNumber: true, verifiedAddress: '12 Pine St, Denver, CO 80202', hasPhone: true, priceType,
});

describe('which NAVEO texts an owner', () => {
  it('a home for rent hears from NAVEO Stays, with the vacation-rental pitch', () => {
    const r = resolveRecipientPersonalization(owner('rent'), OUTREACH_TEMPLATE);
    expect(r.status).toBe('READY');
    expect(r.renderedMessage).toContain('Jennifer with NAVEO Stays');
    expect(r.renderedMessage).toContain('professionally managed STR');
    expect(r.renderedMessage).not.toMatch(/NAVEO Homes|travlr/i);
  });

  it('a home for sale hears from NAVEO Homes, with the options question and no rental-income pitch', () => {
    const r = resolveRecipientPersonalization(owner('sale'), OUTREACH_TEMPLATE);
    expect(r.status).toBe('READY');
    expect(r.renderedMessage).toContain('Jennifer with NAVEO Homes');
    expect(r.renderedMessage).toContain('Reply with 1, 2, 3 or 4');
    expect(r.renderedMessage).toContain('Reply STOP to opt out');
    expect(r.renderedMessage).not.toMatch(/STR|NAVEO Stays|travlr/i);
    expect(r.renderedMessage).not.toContain('{');
  });

  it('a type that is not known falls back to NAVEO Stays, and a person\'s own custom text is only branded, never swapped', () => {
    expect(resolveRecipientPersonalization(owner(null), OUTREACH_TEMPLATE).renderedMessage).toContain('NAVEO Stays');
    const custom = resolveRecipientPersonalization(owner('sale'), 'Hi {first_name}, {brand} here about {address}. Reply STOP to opt out.');
    expect(custom.renderedMessage).toBe('Hi Sam, NAVEO Homes here about 12 Pine St. Reply STOP to opt out.');
  });

  it('the standard texts keep the opt-out line and the question marker the reply routing relies on', () => {
    expect(OUTREACH_TEMPLATE).toContain('Reply STOP to opt out');
    expect(HOMES_OUTREACH_TEMPLATE).toContain('Reply with 1, 2, 3 or 4');
    for (const t of [OUTREACH_TEMPLATE, HOMES_OUTREACH_TEMPLATE]) expect(t).not.toMatch(/travlr/i);
  });
});

describe('no owner-facing default still says TRAVLR', () => {
  it('the email and text template seeds name NAVEO', () => {
    for (const body of EMAIL_TEMPLATE_SEEDS_FOR_TEST) expect(body).not.toMatch(/travlr/i);
  });
});
