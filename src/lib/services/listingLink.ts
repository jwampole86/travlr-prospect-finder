import 'server-only';
import type { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { getZillowPropertyDetails } from '@/lib/services/rapidApiRealEstateService';
import { airdnaAddress } from '@/lib/services/airdnaEstimate';
import { normStreet } from '@/lib/normStreet';

type Db = ReturnType<typeof getSupabaseAdmin>;
export interface LinkLead { id: string; address: string; city?: string | null; state?: string | null; zip?: string | null; beds?: number | null; baths?: number | null }
export type LinkResult = { status: 'found'; url: string } | { status: 'related'; url: string; address: string } | { status: 'not_found'; reason: string } | { status: 'error'; reason: string };

const hasUnit = (s: string) => /\b(unit|apt|apartment|suite|ste)\b|#\s*\w+/i.test(s);

/** Why a returned listing is not this lead's home, or null when it is. Exact street match only: a wrong link is worse than none. */
function mismatch(lead: LinkLead, got: { address: string; state: string; zip: string }): string | null {
  const messy = lead.address.includes(',');
  const want = normStreet(lead.address);
  const have = normStreet(got.address.replace(/\b(unit|apt|apartment|suite|ste)\b.*$/i, '').replace(/#.*$/, ''));
  if (!have) return 'no_street';
  if (hasUnit(got.address) && !hasUnit(lead.address)) return 'unit_level_record';
  if (want.split(' ')[0] !== have.split(' ')[0]) return 'house_number_differs';
  if (want !== have && !(messy && want.startsWith(have + ' ') && have.split(' ').length >= 3)) return 'street_differs';
  const wantState = messy ? lead.address.match(/,\s*([A-Za-z]{2})\b/)?.[1] : lead.state;
  if (wantState && got.state && wantState.toUpperCase() !== got.state.toUpperCase()) return 'state_differs';
  if (!messy && lead.zip && got.zip && String(lead.zip).slice(0, 5) !== String(got.zip).slice(0, 5)) return 'zip_differs';
  return null;
}

/** Finds the lead's Zillow page by address, saves the link (and blank facts the listing gives), and records that a search was made. */
export async function findListingLink(db: Db, lead: LinkLead): Promise<LinkResult> {
  const query = airdnaAddress({ address: lead.address, city: lead.city, state: lead.state, zip: lead.zip });
  const res = await getZillowPropertyDetails([query]).catch(() => null);
  if (!res?.ok) return { status: 'error', reason: res?.error ?? 'Zillow lookup failed' };

  const now = new Date().toISOString();
  const row = res.listings[0];
  const why = !row || !row.listingUrl ? 'not_found' : mismatch(lead, { address: row.address, state: row.state, zip: row.zip });
  if (why === 'unit_level_record' && row?.listingUrl) {
    // Zillow has only one unit of this building, which may not be the lead's: kept as a labeled reference, never as the direct link.
    const { data: ev } = await db.from('leads').select('listing_evidence').eq('id', lead.id).maybeSingle();
    await db.from('leads').update({ listing_link_lookup_at: now, listing_evidence: { ...((ev?.listing_evidence as Record<string, unknown>) ?? {}), related_zillow: { url: row.listingUrl, address: row.address, beds: row.beds ?? null, found_at: now } } }).eq('id', lead.id);
    return { status: 'related', url: row.listingUrl, address: row.address };
  }
  if (why || !row?.listingUrl) { await db.from('leads').update({ listing_link_lookup_at: now }).eq('id', lead.id); return { status: 'not_found', reason: why ?? 'not_found' }; }

  const { data: cur } = await db.from('leads').select('beds,baths,listing_source_url,source_listing_id,listing_agent_name,listing_agent_phone,mls_number').eq('id', lead.id).maybeSingle();
  const update: Record<string, unknown> = { listing_url: row.listingUrl, listing_link_lookup_at: now };
  if (!cur?.listing_source_url) update.listing_source_url = row.listingUrl;
  if (!cur?.source_listing_id && row.externalId) update.source_listing_id = String(row.externalId);
  if (!Number(cur?.beds) && row.beds && row.beds > 0 && row.beds <= 12) { update.beds = Math.round(row.beds); update.beds_source = 'zillow'; }
  if (!Number(cur?.baths) && row.baths && row.baths > 0) { update.baths = row.baths; update.baths_source = 'zillow'; }
  if (!cur?.listing_agent_name && row.listingAgentName) update.listing_agent_name = row.listingAgentName;
  if (!cur?.listing_agent_phone && row.listingAgentPhone) update.listing_agent_phone = row.listingAgentPhone;
  if (!cur?.mls_number && row.mlsNumber) update.mls_number = row.mlsNumber;
  await db.from('leads').update(update).eq('id', lead.id);
  return { status: 'found', url: row.listingUrl };
}
