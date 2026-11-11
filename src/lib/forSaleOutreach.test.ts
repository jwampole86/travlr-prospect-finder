import { describe, expect, it } from 'vitest';
import { forSaleListingMessage, forSaleOutreachMessage, HOMES_CADENCE_SMS } from './forSaleOutreach';

describe('the one-to-one message for a home for sale', () => {
  const m = forSaleOutreachMessage({ address: '4105 E Bujia Segunda, Tucson, AZ 85718', agentFirstName: 'Jen' });

  it('leads with who is writing and the property, then the licensed-broker offer and the bridge, and ends on one ask', () => {
    expect(m).toBe(
      "Hi — Jen with NAVEO Homes. Reaching out about 4105 E Bujia Segunda, Tucson, AZ 85718. If a sale is on the table, we connect owners with a licensed local broker to guide the sale, and if the home will sit empty while it's listed, NAVEO Stays may be able to run it as a short-term rental in the meantime.\nWorth a short conversation?\n— Jen"
    );
  });

  it('keeps the old opener, the management pitch and any promise out', () => {
    expect(m).not.toMatch(/caught my eye|wanted to connect|came across|manag|earn while|guarantee/i);
    expect(forSaleListingMessage('1 Pine St')).toMatch(/^Hi — NAVEO Homes here\. Reaching out about 1 Pine St\./);
  });

  it('is the same wording in the cadence text, with no management pitch', () => {
    const t = HOMES_CADENCE_SMS.initial_outreach;
    expect(t).toMatch(/Reaching out about \{\{address\}\}/);
    expect(t).toContain('licensed local broker');
    expect(t).not.toMatch(/manag/i);
  });
});
