import { describe, expect, it } from 'vitest';
import { alreadyListed, currentListing } from './alreadyListed';

describe('alreadyListed', () => {
  it('flags a for-sale home listed with an agent or broker', () => {
    expect(alreadyListed({ price_type: 'sale', listing_agent_name: 'Ryan Day' })).toMatchObject({ flag: true, reason: 'Listed with Ryan Day.' });
    expect(alreadyListed({ price_type: 'sale', listing_broker_name: 'RE/MAX Professionals' }).flag).toBe(true);
    expect(alreadyListed({ price_type: 'sale', mls_number: '2195244' }).reason).toMatch(/MLS/);
  });

  it('does not flag an owner-listed home, a rental, or a listing that is no longer active', () => {
    expect(alreadyListed({ price_type: 'sale', is_fsbo: true, listing_agent_name: 'Owner' }).flag).toBe(false);
    expect(alreadyListed({ price_type: 'rent', listing_agent_name: 'Ryan Day' }).flag).toBe(false);
    expect(alreadyListed({ price_type: 'sale', listing_agent_name: 'Ryan Day', listing_status: 'Sold' }).flag).toBe(false);
  });

  it('reads the listing brokerage from the lead notes when it was not saved as a field', () => {
    const lead = { price_type: 'sale', listing_active: false, notes: '4947 sqft | House for sale | Broker: Collier & Associates- Rogers Branch' };
    expect(alreadyListed(lead)).toMatchObject({ flag: true, reason: 'Listed with Collier & Associates- Rogers Branch.' });
    expect(currentListing(lead)).toMatchObject({ brokerage: 'Collier & Associates- Rogers Branch', forSale: true });
  });

  it('does not flag a sale lead with no listing agent on file', () => {
    expect(alreadyListed({ price_type: 'sale' }).flag).toBe(false);
    expect(alreadyListed(null).flag).toBe(false);
  });
});
