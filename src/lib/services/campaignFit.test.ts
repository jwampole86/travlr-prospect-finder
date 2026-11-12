import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { campaignFitReason, type OutreachLead } from './estimateOutreachSms';

const lead = (over: Partial<OutreachLead>): OutreachLead => ({
  id: 'l1', address: '12412 Wildwood Dr', city: 'Rogers', state: 'AR', zip: '72756', owner_name: null, contact_name: null, contact_phone: null,
  verified_owner: null, verified_number: null, source: 'Zillow', sms_opt_in: null, sms_opted_out_at: null, ...over,
});

describe('campaignFitReason for homes that are for sale', () => {
  it('keeps a for-sale home listed with a broker out, even in a campaign opened to for-sale homes', () => {
    expect(campaignFitReason(lead({ price_type: 'sale', listing_broker_name: 'Collier & Associates- Rogers Branch' }))).toBe('already_listed');
  });

  it('leaves an owner-listed for-sale home as an ordinary for-sale lead', () => {
    expect(campaignFitReason(lead({ price_type: 'sale', is_fsbo: true }))).toBe('for_sale');
    expect(campaignFitReason(lead({ price_type: 'sale' }))).toBe('for_sale');
  });

  it('does not change how rentals are judged', () => {
    expect(campaignFitReason(lead({ price_type: 'rent' }))).toBeNull();
    expect(campaignFitReason(lead({ price_type: 'rent', listing_agent_name: 'Jo' }))).toBe('agent_listed');
  });
});
