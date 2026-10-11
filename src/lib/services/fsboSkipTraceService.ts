import type { SupabaseClient } from '@supabase/supabase-js';
import { resolveResidentsByAddress, type ResidentMatch } from './skipTracingProvider';

export const UNDISCLOSED_ADDRESS_PREFIX = 'Address Not Disclosed';
const STALE_RUNNING_MS = 15 * 60 * 1000;

/**
 * Standalone-home leads with a real street address and no contact name yet, where the resident of record is
 * worth tracing: luxury, owner-listed, for-sale (the resident is usually the owner), or a rental with no agent/broker.
 * Apartment units and agent-managed rentals are excluded: the person at the address would be a tenant.
 */
export function isSkipTraceEligible(lead: {
  isFsbo?: boolean | null;
  isApartmentCommunity?: boolean | null;
  address?: string | null;
  contactName?: string | null;
  priceType?: 'sale' | 'rent' | null;
  hasListingAttribution?: boolean | null;
  luxury?: boolean | null;
}): boolean {
  // Luxury homes are worth a contact lookup even when an agent is listed.
  const worthTracing = !!lead.isFsbo || !!lead.luxury || lead.priceType === 'sale' || (lead.priceType === 'rent' && !lead.hasListingAttribution);
  return worthTracing
    && !lead.isApartmentCommunity
    && !lead.contactName
    && !!lead.address
    && !lead.address.startsWith(UNDISCLOSED_ADDRESS_PREFIX)
    && /\d/.test(lead.address)
    && !/#|\b(apt|unit|ste|suite)\b/i.test(lead.address);
}

export interface FsboSkipTraceSummary {
  claimed: number;
  found: number;
  possible: number;
  noMatch: number;
  errors: number;
  apiCalls: number;
  stoppedEarly?: 'RATE_LIMITED' | 'DEADLINE';
}

const last10 = (phone?: string | null) => (phone || '').replace(/\D/g, '').slice(-10);

function describeMatch(m: ResidentMatch) {
  return { name: m.name, matchType: m.matchType, phones: m.phones.map(p => p.raw), emails: m.emails };
}

/**
 * Claims PENDING leads (or one specific lead), runs the address skip trace, and writes the
 * resident of record as contact/owner name. Names are never marked verified: a resident
 * at the address is a lead to confirm, not proof of ownership.
 */
export async function runFsboSkipTrace(
  db: SupabaseClient,
  opts: { limit?: number; deadlineMs?: number; leadId?: string } = {}
): Promise<FsboSkipTraceSummary> {
  const limit = Math.min(50, Math.max(1, opts.limit ?? 15));
  const deadline = opts.deadlineMs ? Date.now() + opts.deadlineMs : null;
  const summary: FsboSkipTraceSummary = { claimed: 0, found: 0, possible: 0, noMatch: 0, errors: 0, apiCalls: 0 };

  const staleCutoff = new Date(Date.now() - STALE_RUNNING_MS).toISOString();
  const queueFilter = `skip_trace_status.eq.PENDING,and(skip_trace_status.eq.RUNNING,skip_traced_at.lt.${staleCutoff})`;
  const columns = 'id,address,city,state,zip,contact_name,contact_phone,listing_agent_phone,secondary_phones,price_type,is_fsbo';

  const candidateQuery = db.from('leads').select(columns);
  const { data: candidates, error } = opts.leadId
    ? await candidateQuery.eq('id', opts.leadId)
    : await candidateQuery.or(queueFilter).order('luxury', { ascending: false, nullsFirst: false }).order('created_at').limit(limit);
  if (error || !candidates) return summary;

  for (const lead of candidates) {
    if (deadline && Date.now() > deadline) { summary.stoppedEarly = 'DEADLINE'; break; }

    const now = new Date().toISOString();
    const claim = db.from('leads').update({ skip_trace_status: 'RUNNING', skip_traced_at: now }).eq('id', lead.id);
    const { data: claimed } = await (opts.leadId ? claim : claim.or(queueFilter)).select('id');
    if (!claimed || claimed.length === 0) continue; // another worker got it first
    summary.claimed++;

    const street = String(lead.address || '');
    if (!lead.city || !lead.state || !lead.zip || street.startsWith(UNDISCLOSED_ADDRESS_PREFIX) || !/\d/.test(street)) {
      await db.from('leads').update({ skip_trace_status: 'NO_MATCH', skip_traced_at: now, skip_trace_result: { reason: 'insufficient_address' } }).eq('id', lead.id);
      summary.noMatch++;
      continue;
    }

    const result = await resolveResidentsByAddress({ street, city: lead.city, state: lead.state, zip: lead.zip });
    summary.apiCalls += result.apiCalls;

    if (result.status === 'RATE_LIMITED') {
      // Quota/auth problem, not a lack of data: put the lead back in the queue and stop the run.
      await db.from('leads').update({ skip_trace_status: 'PENDING', skip_traced_at: null }).eq('id', lead.id);
      summary.stoppedEarly = 'RATE_LIMITED';
      break;
    }
    if (result.status === 'ERROR') {
      await db.from('leads').update({ skip_trace_status: 'ERROR', skip_traced_at: now, skip_trace_result: { error: result.error } }).eq('id', lead.id);
      summary.errors++;
      continue;
    }
    if (result.status === 'NO_MATCH') {
      await db.from('leads').update({ skip_trace_status: 'NO_MATCH', skip_traced_at: now, skip_trace_result: { reason: 'no_resident_at_address', apiCalls: result.apiCalls } }).eq('id', lead.id);
      summary.noMatch++;
      continue;
    }

    const [primary, ...alternates] = result.matches;
    const listingPhone = last10(lead.contact_phone) || last10(lead.listing_agent_phone);
    const phoneMatchesListing = !!listingPhone && primary.phones.some(p => last10(p.e164) === listingPhone);
    const primaryPhone = primary.phones.find(p => p.isPrimary) ?? primary.phones[0];
    // A phone matching the listing's own phone is the only corroboration of ownership, not just residency.
    const confidence = phoneMatchesListing ? 'HIGH' : primary.matchType === 'CURRENT_RESIDENT' ? 'MEDIUM' : 'LOW';

    const resultJson = {
      provider: 'SKIP_TRACING_API',
      matchType: primary.matchType,
      confidence,
      phoneMatchesListing,
      personId: primary.personId,
      primary: describeMatch(primary),
      alternates: alternates.map(describeMatch),
      apiCalls: result.apiCalls,
    };

    // A previous resident with no phone corroboration is often a relative or former occupant. Keep it
    // for an agent to review, but never put it in contact_name, which drives outreach.
    if (confidence === 'LOW') {
      await db.from('leads').update({ skip_trace_status: 'POSSIBLE_MATCH', skip_traced_at: now, skip_trace_result: resultJson }).eq('id', lead.id);
      summary.possible++;
      continue;
    }

    const update: Record<string, unknown> = {
      skip_trace_status: 'FOUND',
      skip_traced_at: now,
      skip_trace_result: resultJson,
    };
    if (!lead.contact_name) {
      update.contact_name = primary.name;
      // At a for-sale or owner-listed home the resident is the owner; at a managed rental they may be the tenant.
      if (lead.price_type === 'sale' || lead.is_fsbo) {
        update.owner_name = primary.name;
        update.owner_source = 'SKIP_TRACING_API';
      }
    }
    if (primaryPhone && !lead.contact_phone) {
      update.contact_phone = primaryPhone.e164;
      update.has_phone = true;
      update.phone_source = 'SKIP_TRACING_API';
    }
    const known = new Set([lead.contact_phone, ...(lead.secondary_phones || [])].map(last10));
    const extraPhones = primary.phones.map(p => p.e164).filter(p => !known.has(last10(p)) && p !== primaryPhone?.e164);
    if (extraPhones.length > 0) update.secondary_phones = [...(lead.secondary_phones || []), ...extraPhones];

    await db.from('leads').update(update).eq('id', lead.id);
    const { error: logError } = await db.from('lead_activity_log').insert({
      lead_id: lead.id,
      activity_type: 'ENRICHMENT',
      activity_data: {
        description: `Skip trace found ${primary.name} (${primary.matchType === 'CURRENT_RESIDENT' ? 'current' : 'previous'} resident of record)${phoneMatchesListing ? '; phone matches the listing' : ''}.`,
        provider: 'SKIP_TRACING_API',
        matchType: primary.matchType,
        phoneMatchesListing,
      },
      performed_by_name: 'Skip trace (automatic)',
      created_at: now,
    });
    if (logError) console.warn('[fsbo-skip-trace] activity log insert failed:', logError.message);
    summary.found++;
  }
  return summary;
}
