/**
 * "Already Listed – Buyer Side Only". A home that is for sale and listed with an agent or broker has a listing agreement, so AVYRO does not take a
 * seller-side referral on it, does not ask the seller to move the listing, and does not suggest a partner to list it. What remains is the
 * rental side (NAVEO Stays, independently) and, only when AVYRO has an identified, interested buyer, an introduction to a licensed buyer's agent.
 * A home the owner is selling without an agent (FSBO) is not covered: a referral to a licensed broker is still the normal path there.
 * This is an operating rule for people using AVYRO, not legal advice; counsel should confirm it state by state.
 */
export const ALREADY_LISTED_LABEL = 'Already Listed – Buyer Side Only';

export const ALREADY_LISTED_EXPLANATION =
  'This home is for sale and listed with an agent. The sale side stays with the listing broker: do not contact the owner to list it or to replace their broker, and do not send it to a partner as a seller referral. ' +
  'Use it for short-term rental management (NAVEO Stays) if it is eligible, or, only if you have an identified interested buyer, introduce that buyer to a licensed buyer\u2019s agent in the property\u2019s state.';

export interface ListingFacts {
  price_type?: string | null;
  is_fsbo?: boolean | null;
  listing_agent_name?: string | null;
  listing_agent_phone?: string | null;
  listing_broker_name?: string | null;
  listing_broker_phone?: string | null;
  mls_number?: string | null;
  mls_source_name?: string | null;
  listing_active?: boolean | null;
  listing_status?: string | null;
  notes?: string | null;
}

const OFF_MARKET = /sold|off.?market|removed|expired|withdrawn|cancel|closed/i;

/** Zillow imports keep the listing brokerage in the lead notes ("... | Broker: Collier & Associates- Rogers Branch") when it was not saved as a field. */
export function brokerFromNotes(notes: string | null | undefined): string | null {
  const m = /(?:^|\|)\s*Broker:\s*([^|\n]+)/i.exec(String(notes ?? ''));
  const name = m?.[1]?.trim();
  return name && name.length >= 2 ? name : null;
}

export function alreadyListed(lead: ListingFacts | null | undefined): { flag: boolean; label: string; reason: string | null } {
  const none = { flag: false, label: ALREADY_LISTED_LABEL, reason: null };
  if (!lead || String(lead.price_type ?? '').toLowerCase() !== 'sale') return none;
  if (lead.is_fsbo === true) return none;
  if (OFF_MARKET.test(String(lead.listing_status ?? ''))) return none;
  const who = [lead.listing_agent_name, lead.listing_broker_name, brokerFromNotes(lead.notes)].find((v) => typeof v === 'string' && v.trim());
  if (who) return { flag: true, label: ALREADY_LISTED_LABEL, reason: `Listed with ${String(who).trim()}.` };
  if (typeof lead.mls_number === 'string' && lead.mls_number.trim()) return { flag: true, label: ALREADY_LISTED_LABEL, reason: `On the MLS (${lead.mls_number.trim()}).` };
  return none;
}

export const LISTING_COLUMNS = 'price_type,is_fsbo,listing_agent_name,listing_agent_phone,listing_broker_name,listing_broker_phone,mls_number,mls_source_name,listing_active,listing_status,notes';

export interface CurrentListing {
  /** True for a for-sale home that is on the market. */
  forSale: boolean;
  brokerage: string | null;
  agent: string | null;
  phone: string | null;
  mls: string | null;
  mlsSource: string | null;
  ownerListed: boolean;
}

const text = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);

/** Who the home is listed with, so a person sees the current broker before looking for another one. */
export function currentListing(lead: ListingFacts | null | undefined): CurrentListing | null {
  if (!lead || String(lead.price_type ?? '').toLowerCase() !== 'sale') return null;
  return {
    forSale: !OFF_MARKET.test(String(lead.listing_status ?? '')),
    brokerage: text(lead.listing_broker_name) ?? brokerFromNotes(lead.notes), agent: text(lead.listing_agent_name),
    phone: text(lead.listing_broker_phone) ?? text(lead.listing_agent_phone),
    mls: text(lead.mls_number), mlsSource: text(lead.mls_source_name), ownerListed: lead.is_fsbo === true,
  };
}
