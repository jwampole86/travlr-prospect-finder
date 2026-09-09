'use client';

import { createClient } from '@/lib/supabase/client';
import type { Lead, LeadStage } from '@/data/mockLeads';
import { recordStageChanged, recordLeadCreated, recordBulkUpdate } from '@/lib/services/activityService';
import { cacheGet, cacheSet, cacheDelete, cacheInvalidateAll, cacheIsStale, cacheIsRevalidating, cacheMarkRevalidating, CACHE_KEYS } from '@/lib/cache/leadsCache';

const VALID_BATH_VALUES = [1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5];

function roundToValidBaths(value: number): number {
  if (!value || isNaN(value)) return 2;
  return VALID_BATH_VALUES.reduce((prev, curr) =>
    Math.abs(curr - value) < Math.abs(prev - value) ? curr : prev
  );
}

// ─── REMOVED: FALLBACK_ADDRESSES and STATE_FALLBACK_ADDRESSES ─────────────────
// These pools of invented addresses were the root cause of mismatched leads:
// a real street number+name from one city was being combined with a different
// city/state, producing addresses that resolve to wrong locations on Zillow.
// Real leads must keep their exact original address, city, state, and listing URL.
// Leads with placeholder/missing addresses are marked is_synthetic=true and hidden.

const PLACEHOLDER_PATTERN = /^(Zillow|HotPads|Apartments\.com|Craigslist|Facebook Marketplace|Realtor\.com|LoopNet|Trulia|Redfin|MLS|Airbnb|VRBO|Direct|Referral|Other|Unknown)\s+Listing\s+#\d+$/i;
const IMPORTED_PATTERN = /^Imported Property/i;

function isPlaceholderAddress(address: string): boolean {
  if (!address || address.trim() === '') return true;
  return PLACEHOLDER_PATTERN.test(address.trim()) || IMPORTED_PATTERN.test(address.trim());
}

function dbRowToLead(row: Record<string, unknown>): Lead {
  const rawAddress = (row.address as string) || '';
  const id = row.id as string;

  const originalState = (row.state as string) || '';
  const originalCity = (row.city as string) || '';

  // If the address is a placeholder, mark as synthetic — do NOT replace with invented addresses.
  // Synthetic leads are filtered out of all normal queries; they will not appear in the UI.
  const hasSyntheticAddress = isPlaceholderAddress(rawAddress);

  return {
    id,
    address: rawAddress,
    city: originalCity || '',
    state: originalState || '',
    zip: (row.zip as string) || '',
    lat: (row.lat as number) || 39.7392,
    lng: (row.lng as number) || -104.9903,
    beds: (row.beds as number) || 3,
    baths: roundToValidBaths((row.baths as number) || 2),
    price: (row.price as number) || 2500,
    priceType: (row.price_type as 'sale' | 'rent') || 'rent',
    source: (row.source as Lead['source']) || 'Direct',
    stage: (row.stage as LeadStage) || 'New Lead',
    regulationStatus: (row.regulation_status as Lead['regulationStatus']) || 'Unknown',
    prospectScore: (row.prospect_score as number) || 60,
    daysOnMarket: (row.days_on_market as number) || 0,
    lastChecked: (row.last_checked as string) || '',
    listingUrl: (row.listing_url as string) || '',
    notes: (row.notes as string) || '',
    contactName: (row.contact_name as string) || undefined,
    contactPhone: (row.contact_phone as string) || (row.phone as string) || undefined,
    contactEmail: undefined,
    tags: (row.tags as string[]) || [],
    estimatedADR: (row.estimated_adr as number) || 200,
    estimatedOccupancy: (row.estimated_occupancy as number) || 65,
    estimatedGrossMonthly: (row.estimated_gross_monthly as number) || 3960,
    estimatedNetMonthly: (row.estimated_net_monthly as number) || 2772,
    photos: (row.photos as string[]) || [],
    createdAt: (row.created_at as string) || '',
    updatedAt: (row.updated_at as string) || '',
    // Mark as synthetic if the DB flag is set OR if the address is a placeholder
    isSynthetic: ((row.is_synthetic as boolean) ?? false) || hasSyntheticAddress,
    contactInfoRequested: (row.contact_info_requested as boolean) ?? false,
    contactInfoRequestedAt: (row.contact_info_requested_at as string) || undefined,
    // Address validation fields
    addrValidated: (row.addr_validated as boolean) ?? undefined,
    addrMismatch: (row.addr_mismatch as boolean) ?? false,
    // Verification fields
    verificationStatus: (row.verification_status as string) || 'CANDIDATE',
    verificationScore: (row.verification_score as number) ?? 0,
    verificationMethod: (row.verification_method as string) || undefined,
    verificationTimestamp: (row.verification_timestamp as string) || undefined,
    verifiedAddress: (row.verified_address as string) || undefined,
    normalizedAddress: (row.normalized_address as string) || undefined,
    apn: (row.apn as string) || undefined,
    propertyProvider: (row.property_provider as string) || undefined,
    providerPropertyId: (row.provider_property_id as string) || undefined,
    county: (row.county as string) || undefined,
    verificationNotes: (row.verification_notes as string) || undefined,
  };
}

function leadToDbRow(lead: Lead, userId?: string): Record<string, unknown> {
  return {
    id: lead.id,
    user_id: userId || null,
    address: lead.address,
    city: lead.city,
    state: lead.state,
    zip: lead.zip,
    lat: lead.lat,
    lng: lead.lng,
    beds: lead.beds,
    baths: lead.baths,
    price: lead.price,
    price_type: lead.priceType,
    source: lead.source,
    stage: lead.stage,
    regulation_status: lead.regulationStatus,
    prospect_score: lead.prospectScore,
    days_on_market: lead.daysOnMarket,
    last_checked: lead.lastChecked,
    listing_url: lead.listingUrl,
    notes: lead.notes,
    contact_name: lead.contactName || '',
    contact_phone: lead.contactPhone || '',
    // NOTE: 'email' column does not exist in leads table — intentionally omitted
    tags: lead.tags,
    estimated_adr: lead.estimatedADR,
    estimated_occupancy: lead.estimatedOccupancy,
    estimated_gross_monthly: lead.estimatedGrossMonthly,
    estimated_net_monthly: lead.estimatedNetMonthly,
    photos: lead.photos,
    created_at: lead.createdAt,
    updated_at: lead.updatedAt,
  };
}

export const leadsService = {
  /**
   * Fetch a single lead by ID — fast path used by LeadProfileContent.
   * 1. Check per-ID cache (set on previous profile visit)
   * 2. Check all-leads cache (warm if Lead Management was visited first)
   * 3. Check top-leads cache
   * 4. Fall back to single-row DB query
   */
  async getById(id: string): Promise<Lead | null> {
    const cacheKey = CACHE_KEYS.LEAD_BY_ID(id);

    // Fast path 1: per-ID cache
    const cached = cacheGet<Lead>(cacheKey);
    if (cached) {
      // Don't return synthetic leads from cache
      if (cached.isSynthetic) return null;
      return cached;
    }

    // Fast path 2: all-leads cache (populated when Lead Management is visited)
    const allLeads = cacheGet<Lead[]>(CACHE_KEYS.ALL_LEADS);
    if (allLeads) {
      const found = allLeads.find(l => l.id === id);
      if (found) {
        if (found.isSynthetic) return null;
        cacheSet(cacheKey, found);
        return found;
      }
    }

    // Fast path 3: top-leads cache
    const topLeads = cacheGet<Lead[]>(CACHE_KEYS.TOP_LEADS);
    if (topLeads) {
      const found = topLeads.find(l => l.id === id);
      if (found) {
        if (found.isSynthetic) return null;
        cacheSet(cacheKey, found);
        return found;
      }
    }

    const supabase = createClient();
    try {
      // Select only columns that exist — no email, no contact_email
      // Also filter out synthetic leads so Lead Profile never shows them
      const { data, error } = await supabase
        .from('leads').select('id,address,city,state,zip,lat,lng,beds,baths,price,price_type,source,stage,regulation_status,prospect_score,days_on_market,last_checked,listing_url,notes,contact_name,contact_phone,tags,estimated_adr,estimated_occupancy,estimated_gross_monthly,estimated_net_monthly,photos,created_at,updated_at,is_synthetic,contact_info_requested,contact_info_requested_at').eq('id', id).neq('is_synthetic', true)
        .maybeSingle();

      if (error || !data) return null;
      const lead = dbRowToLead(data as Record<string, unknown>);
      // Double-check: if address is a placeholder, treat as not found
      if (lead.isSynthetic) return null;
      cacheSet(cacheKey, lead);
      return lead;
    } catch {
      return null;
    }
  },

  /**
   * Fetch top-scored leads for the dashboard — DB-level ORDER + LIMIT
   * so we never pull thousands of rows just to show 6 cards.
   * Results are cached for 5 min with stale-while-revalidate.
   */
  async getTopLeads(limit = 20): Promise<Lead[]> {
    const cacheKey = CACHE_KEYS.TOP_LEADS;
    const cached = cacheGet<Lead[]>(cacheKey);

    // Stale-while-revalidate: return stale data immediately, refresh in background
    if (cached) {
      if (cacheIsStale(cacheKey) && !cacheIsRevalidating(cacheKey)) {
        cacheMarkRevalidating(cacheKey);
        // Background refresh — don't await
        this._fetchTopLeadsFromDB(limit).then(result => {
          if (result) cacheSet(cacheKey, result);
        }).catch(() => {});
      }
      return cached;
    }

    const result = await this._fetchTopLeadsFromDB(limit);
    if (result) {
      cacheSet(cacheKey, result);
      return result;
    }
    return [];
  },

  async _fetchTopLeadsFromDB(limit: number): Promise<Lead[] | null> {
    const supabase = createClient();
    try {
      // Select only columns that exist — no email, no contact_email
      const { data, error } = await supabase
        .from('leads').select('id,address,city,state,zip,beds,baths,price,price_type,source,stage,regulation_status,prospect_score,days_on_market,last_checked,listing_url,estimated_net_monthly,estimated_gross_monthly,estimated_adr,estimated_occupancy,tags,photos,created_at,updated_at,notes,contact_name,contact_phone,lat,lng').neq('stage', 'Not a Fit').neq('is_synthetic', true).order('prospect_score', { ascending: false })
        .limit(limit);

      if (error) {
        console.error('[leadsService] Top leads fetch error:', error.message, error.code, error.hint);
        return null;
      }

      if (!data || data.length === 0) {
        console.warn('[leadsService] Top leads query returned 0 rows — possible RLS policy issue or empty table');
      }

      const mapped = (data || []).map((row) => dbRowToLead(row as Record<string, unknown>));
      // Dedup by address+city+state: keep highest-scoring record per property
      const seen = new Map<string, Lead>();
      for (const lead of mapped) {
        const key = `${lead.address.toLowerCase().replace(/\s+/g, ' ').trim()}|${lead.city.toLowerCase().trim()}|${lead.state.toLowerCase().trim()}`;
        const existing = seen.get(key);
        if (!existing || lead.prospectScore > existing.prospectScore) {
          seen.set(key, lead);
        }
      }
      return Array.from(seen.values());
    } catch (err) {
      console.error('[leadsService] Unexpected error fetching top leads:', err);
      return null;
    }
  },

  async getAll(bypassCache = false): Promise<Lead[]> {
    if (!bypassCache) {
      const cached = cacheGet<Lead[]>(CACHE_KEYS.ALL_LEADS);
      if (cached) {
        // Stale-while-revalidate: background refresh if stale
        if (cacheIsStale(CACHE_KEYS.ALL_LEADS) && !cacheIsRevalidating(CACHE_KEYS.ALL_LEADS)) {
          cacheMarkRevalidating(CACHE_KEYS.ALL_LEADS);
          this._fetchAllLeadsFromDB().then(result => {
            if (result) {
              cacheSet(CACHE_KEYS.ALL_LEADS, result);
              // Warm top leads cache from full result
              const topSorted = [...result]
                .filter(l => l.stage !== 'Not a Fit')
                .sort((a, b) => b.prospectScore - a.prospectScore)
                .slice(0, 20);
              cacheSet(CACHE_KEYS.TOP_LEADS, topSorted);
            }
          }).catch(() => {});
        }
        return cached;
      }
    }

    const result = await this._fetchAllLeadsFromDB();
    if (result) {
      cacheSet(CACHE_KEYS.ALL_LEADS, result);
      // Warm top leads cache from full result
      const topSorted = [...result]
        .filter(l => l.stage !== 'Not a Fit')
        .sort((a, b) => b.prospectScore - a.prospectScore)
        .slice(0, 20);
      cacheSet(CACHE_KEYS.TOP_LEADS, topSorted);
      return result;
    }
    return [];
  },

  async _fetchAllLeadsFromDB(): Promise<Lead[] | null> {
    const supabase = createClient();
    try {
      // Paginate through all rows — Supabase default limit is 1000 rows per request.
      const PAGE_SIZE = 1000;
      let allRows: Record<string, unknown>[] = [];
      let from = 0;
      let hasMore = true;

      while (hasMore) {
        // Select only columns that exist — no email, no contact_email
        // Filter out synthetic leads — only fetch real leads for normal app use
        const { data, error } = await supabase
          .from('leads').select('id,address,city,state,zip,lat,lng,beds,baths,price,price_type,source,stage,regulation_status,prospect_score,days_on_market,last_checked,listing_url,notes,contact_name,contact_phone,tags,estimated_adr,estimated_occupancy,estimated_gross_monthly,estimated_net_monthly,photos,created_at,updated_at,is_synthetic,contact_info_requested,contact_info_requested_at').neq('is_synthetic', true).order('created_at', { ascending: false })
          .range(from, from + PAGE_SIZE - 1);

        if (error) {
          console.error('[leadsService] Leads fetch error:', error.message, error.code, error.hint);
          // If we already have some rows, return what we have rather than failing entirely
          if (allRows.length > 0) break;
          return null;
        }

        if (!data || data.length === 0) {
          hasMore = false;
        } else {
          allRows = allRows.concat(data as Record<string, unknown>[]);
          if (data.length < PAGE_SIZE) {
            hasMore = false;
          } else {
            from += PAGE_SIZE;
          }
        }
      }

      if (allRows.length === 0) {
        console.warn('[leadsService] Leads query returned 0 rows — possible RLS policy issue or empty table');
      }

      const mapped = allRows.map((row) => dbRowToLead(row));

      // ── Deduplicate by address+city+state: keep the highest-scoring record per property ──
      const seen = new Map<string, Lead>();
      for (const lead of mapped) {
        const key = `${lead.address.toLowerCase().replace(/\s+/g, ' ').trim()}|${lead.city.toLowerCase().trim()}|${lead.state.toLowerCase().trim()}`;
        const existing = seen.get(key);
        if (!existing || lead.prospectScore > existing.prospectScore) {
          seen.set(key, lead);
        }
      }
      return Array.from(seen.values());
    } catch (err) {
      console.error('[leadsService] Unexpected error fetching leads:', err);
      return null;
    }
  },

  async bulkInsert(leads: Lead[]): Promise<{ count: number; error?: string }> {
    const supabase = createClient();
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const userId = user?.id || null;

      // ── Reject leads with placeholder/synthetic addresses before inserting ──
      // This prevents invented address+city combinations from entering the DB.
      const FAKE_URL_DOMAINS = ['example.com', 'placeholder.com', 'synthetic.travlr', 'test.com'];
      const validLeads = leads.filter(lead => {
        // Reject placeholder addresses
        if (isPlaceholderAddress(lead.address)) return false;
        // Reject leads with fake/example listing URLs (generated leads, not real imports)
        if (lead.listingUrl) {
          try {
            const hostname = new URL(lead.listingUrl).hostname.toLowerCase();
            if (FAKE_URL_DOMAINS.some(d => hostname === d || hostname.endsWith('.' + d))) return false;
          } catch { /* invalid URL — allow through, address is real */ }
        }
        return true;
      });

      if (validLeads.length === 0) {
        return { count: 0 };
      }

      // ── Deduplicate incoming batch by address+city+state before inserting ──
      const batchSeen = new Map<string, Lead>();
      for (const lead of validLeads) {
        const key = `${lead.address.toLowerCase().replace(/\s+/g, ' ').trim()}|${lead.city.toLowerCase().trim()}|${lead.state.toLowerCase().trim()}`;
        const existing = batchSeen.get(key);
        if (!existing || lead.prospectScore > existing.prospectScore) {
          batchSeen.set(key, lead);
        }
      }
      const dedupedLeads = Array.from(batchSeen.values());

      const rows = dedupedLeads.map((l) => leadToDbRow(l, userId ?? undefined));

      // Upsert on id — DB unique index on address_fingerprint prevents cross-source dupes
      const { error } = await supabase.from('leads').upsert(rows, { onConflict: 'id' });

      if (error) {
        console.warn('Bulk insert error:', error.message);
        return { count: 0, error: error.message };
      }

      // Invalidate cache so next fetch reflects new data
      cacheInvalidateAll();

      // Record activity for each created lead (fire-and-forget)
      for (const lead of dedupedLeads) {
        recordLeadCreated({
          leadId: lead.id,
          address: lead.address,
          state: lead.state,
        }).catch(() => {});
      }

      return { count: dedupedLeads.length };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      return { count: 0, error: msg };
    }
  },

  async updateStage(id: string, stage: LeadStage): Promise<boolean> {
    const supabase = createClient();
    try {
      // Fetch current lead for activity context
      const { data: current } = await supabase
        .from('leads')
        .select('address, state, stage')
        .eq('id', id)
        .single();

      const { error } = await supabase
        .from('leads')
        .update({ stage, updated_at: new Date().toISOString() })
        .eq('id', id);

      if (!error && current) {
        const row = current as { address: string; state: string; stage: string };
        // Invalidate per-lead and top-leads cache
        cacheDelete(CACHE_KEYS.LEAD_BY_ID(id));
        cacheDelete(CACHE_KEYS.TOP_LEADS);
        cacheDelete(CACHE_KEYS.ALL_LEADS);
        recordStageChanged({
          leadId: id,
          address: row.address,
          state: row.state,
          previousStage: row.stage,
          newStage: stage,
        }).catch(() => {});
      }

      return !error;
    } catch {
      return false;
    }
  },

  /**
   * Update stage with optimistic concurrency control.
   * Returns 'conflict' if another user modified the record since it was loaded.
   */
  async updateStageWithVersion(id: string, stage: LeadStage, currentVersion: number): Promise<'ok' | 'conflict' | 'error'> {
    const supabase = createClient();
    try {
      // Check current DB version first
      const { data: current, error: fetchErr } = await supabase
        .from('leads')
        .select('version, address, state, stage')
        .eq('id', id)
        .single();

      if (fetchErr) return 'error';

      const row = current as Record<string, unknown>;
      const dbVersion = row?.version as number | undefined;
      if (dbVersion !== undefined && dbVersion !== currentVersion) {
        return 'conflict';
      }

      const { error } = await supabase
        .from('leads')
        .update({
          stage,
          updated_at: new Date().toISOString(),
          version: (currentVersion ?? 1) + 1,
        })
        .eq('id', id)
        .eq('version', currentVersion);

      if (error) return 'error';

      // Record activity (fire-and-forget)
      recordStageChanged({
        leadId: id,
        address: (row.address as string) || '',
        state: (row.state as string) || '',
        previousStage: (row.stage as string) || '',
        newStage: stage,
      }).catch(() => {});

      return 'ok';
    } catch {
      return 'error';
    }
  },

  async deleteLead(id: string): Promise<boolean> {
    const supabase = createClient();
    try {
      // Soft-delete: move to "Not a Fit" instead of hard-deleting
      // This preserves data integrity — leads are never silently removed
      const { error } = await supabase
        .from('leads')
        .update({ stage: 'Not a Fit', updated_at: new Date().toISOString() })
        .eq('id', id);
      return !error;
    } catch {
      return false;
    }
  },

  async bulkDelete(ids: string[]): Promise<boolean> {
    const supabase = createClient();
    try {
      // Soft-delete: move to "Not a Fit" instead of hard-deleting
      // This preserves data integrity — leads are never silently removed during bulk ops
      const { error } = await supabase
        .from('leads')
        .update({ stage: 'Not a Fit', updated_at: new Date().toISOString() })
        .in('id', ids);
      return !error;
    } catch {
      return false;
    }
  },

  async bulkUpdateStage(ids: string[], stage: LeadStage): Promise<boolean> {
    const supabase = createClient();
    try {
      const { error } = await supabase
        .from('leads')
        .update({ stage, updated_at: new Date().toISOString().split('T')[0] })
        .in('id', ids);

      if (!error && ids.length > 0) {
        recordBulkUpdate({
          count: ids.length,
          action: `moved to ${stage}`,
        }).catch(() => {});
      }

      return !error;
    } catch {
      return false;
    }
  },

  async seedInitialLeads(leads: Lead[]): Promise<void> {
    const supabase = createClient();
    try {
      const { count } = await supabase
        .from('leads')
        .select('*', { count: 'exact', head: true });

      // Only seed if truly empty — never cap at 1000
      if ((count ?? 0) === 0) {
        const rows = leads.map((l) => leadToDbRow(l));
        await supabase.from('leads').upsert(rows, { onConflict: 'id' });
      }
    } catch {
      // silent
    }
  },

  /** Get lead count per state for cap monitoring — uses aggregate count, not full row fetch */
  async getLeadCountsByState(): Promise<Record<string, number>> {
    // Check cache first
    const cached = cacheGet<Record<string, number>>(CACHE_KEYS.LEAD_COUNTS_BY_STATE);
    if (cached) return cached;

    // If we already have all leads cached, compute counts from cache (zero DB calls)
    const allLeadsCached = cacheGet<Lead[]>(CACHE_KEYS.ALL_LEADS);
    if (allLeadsCached) {
      const counts: Record<string, number> = {};
      for (const lead of allLeadsCached) {
        if (lead.state) counts[lead.state] = (counts[lead.state] ?? 0) + 1;
      }
      cacheSet(CACHE_KEYS.LEAD_COUNTS_BY_STATE, counts);
      return counts;
    }

    const supabase = createClient();
    try {
      // Paginate state column — minimal data transfer but must get all rows
      // Only count real (non-synthetic) leads
      const PAGE_SIZE = 1000;
      let allRows: { state: string }[] = [];
      let from = 0;
      let hasMore = true;

      while (hasMore) {
        const { data, error } = await supabase
          .from('leads')
          .select('state')
          .neq('is_synthetic', true)
          .range(from, from + PAGE_SIZE - 1);

        if (error || !data) break;

        allRows = allRows.concat(data as { state: string }[]);
        if (data.length < PAGE_SIZE) {
          hasMore = false;
        } else {
          from += PAGE_SIZE;
        }
      }

      const counts: Record<string, number> = {};
      for (const row of allRows) {
        if (row.state) counts[row.state] = (counts[row.state] ?? 0) + 1;
      }
      cacheSet(CACHE_KEYS.LEAD_COUNTS_BY_STATE, counts);
      return counts;
    } catch {
      return {};
    }
  },

  /** Bulk update state (and optionally city/zip) for portfolio re-tagging */
  async bulkRetag(ids: string[], state: string, city?: string, zip?: string): Promise<{ count: number; error?: string }> {
    const supabase = createClient();
    try {
      const updatePayload: Record<string, string> = {
        state,
        updated_at: new Date().toISOString().split('T')[0],
      };
      if (city) updatePayload.city = city;
      if (zip) updatePayload.zip = zip;

      const BATCH = 100;
      let totalUpdated = 0;

      for (let i = 0; i < ids.length; i += BATCH) {
        const batch = ids.slice(i, i + BATCH);
        const { error, count } = await supabase
          .from('leads')
          .update(updatePayload)
          .in('id', batch)
          .select('id', { count: 'exact', head: true });

        if (error) return { count: totalUpdated, error: error.message };
        totalUpdated += count ?? batch.length;
      }

      return { count: totalUpdated };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      return { count: 0, error: msg };
    }
  },
};
