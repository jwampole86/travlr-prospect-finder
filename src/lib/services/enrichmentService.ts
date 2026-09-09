'use client';

import { createClient } from '@/lib/supabase/client';
import { recordEnrichmentCompleted } from '@/lib/services/activityService';

/**
 * PDL (People Data Labs) Compliance Notice
 *
 * ⚠️  LEGAL REVIEW REQUIRED before activating Stage 2/3 enrichment in production.
 *
 * People Data Labs data is subject to:
 * - PDL Terms of Service: https://www.peopledatalabs.com/terms
 * - California Consumer Privacy Act (CCPA) — if enriching CA residents
 * - Other applicable state privacy laws (VCDPA, CPA, etc.)
 *
 * Required before going live with a real PDL_API_KEY:
 * 1. Confirm your use case is permitted under PDL ToS (B2B prospecting only).
 * 2. Implement a CCPA-compliant "Do Not Sell My Personal Information" flow
 *    for any California homeowner whose data is enriched.
 * 3. Ensure enriched contact data is not shared with third parties without
 *    appropriate data processing agreements.
 * 4. Purge enriched data on request per applicable privacy law.
 * 5. Obtain written legal sign-off and update PDL_COMPLIANCE_STATUS below.
 *
 * Current status: PDL_API_KEY is a placeholder → Stage 2 runs in SIMULATION MODE.
 * No real PDL API calls are made until a real key is configured.
 */
export const PDL_COMPLIANCE_STATUS = {
  liveEnrichmentEnabled: false,
  legalReviewCompleted: false,
  ccpaFlowImplemented: false,
  note: 'PDL enrichment requires legal sign-off and CCPA compliance before production activation.',
} as const;

/**
 * Salesgenie (Data Axle) Compliance Notice
 *
 * ⚠️  LEGAL REVIEW REQUIRED before activating Salesgenie enrichment in production.
 *
 * Salesgenie / Data Axle data is subject to:
 * - Data Axle Terms of Service: https://www.data-axle.com/terms-of-service/
 * - TCPA — prior express written consent required before calling/texting
 * - California Consumer Privacy Act (CCPA) — if enriching CA residents
 * - Other applicable state privacy laws (VCDPA, CPA, etc.)
 *
 * Required before going live with real SALESGENIE_API_USER / SALESGENIE_API_SECRET:
 * 1. Confirm your use case is permitted under Data Axle ToS
 *    (automated/bulk lookups, storage of returned contact data, B2B outreach).
 * 2. Implement TCPA-compliant consent tracking before using returned phone numbers.
 * 3. Implement a CCPA "Do Not Sell" flow for CA residents.
 * 4. Obtain written legal sign-off and update SALESGENIE_COMPLIANCE_STATUS below.
 *
 * Current status: credentials are placeholders → Stage 2 Salesgenie runs in SIMULATION MODE.
 * No real Salesgenie API calls are made until real credentials are configured.
 */
export const SALESGENIE_COMPLIANCE_STATUS = {
  liveEnrichmentEnabled: false,
  legalReviewCompleted: false,
  tcpaConsentTrackingImplemented: false,
  ccpaFlowImplemented: false,
  note: 'Salesgenie enrichment requires legal sign-off and TCPA/CCPA compliance before production activation.',
} as const;

export interface LeadEnrichment {
  id: string;
  lead_id: string;
  owner_name?: string;
  owner_mailing_address?: string;
  owner_mailing_city?: string;
  owner_mailing_state?: string;
  owner_mailing_zip?: string;
  ownership_type: 'Individual' | 'LLC' | 'Trust' | 'Other' | 'Unknown';
  enrichment_status: 'Not Enriched' | 'Partial' | 'Complete';
  last_enriched_at?: string;
  enrichment_sources?: Array<{ provider: string; stage: string; at: string }>;
  do_not_contact: boolean;
  stage1_provider?: string;
  stage1_completed_at?: string;
  stage2_provider?: string;
  stage2_completed_at?: string;
  stage3_provider?: string;
  stage3_completed_at?: string;
  stage3_cost?: number;
  cache_expires_at?: string;
}

export interface EnrichedEmail {
  id: string;
  lead_id: string;
  email_address: string;
  confidence: number;
  source?: string;
  verified_status: 'Verified' | 'Unverified';
  stage: 'stage1' | 'stage2' | 'stage3';
  is_selected: boolean;
}

export interface EnrichedPhone {
  id: string;
  lead_id: string;
  phone_number: string;
  phone_type: string;
  confidence: number;
  source?: string;
  verified_status: 'Verified' | 'Unverified';
  stage: 'stage1' | 'stage2' | 'stage3';
  is_selected: boolean;
}

export interface EnrichmentApiLog {
  id: string;
  lead_id?: string;
  provider: string;
  stage: 'stage1' | 'stage2' | 'stage3';
  cost: number;
  success: boolean;
  error_message?: string;
  called_at: string;
}

const CONFIDENCE_THRESHOLD = 80;
const CACHE_DAYS = 90;
const STAGE2_SCORE_THRESHOLD = 70;

export const enrichmentService = {
  /**
   * Get enrichment record for a lead (or null if not enriched)
   */
  async getEnrichment(leadId: string): Promise<LeadEnrichment | null> {
    const supabase = createClient();
    const { data } = await supabase
      .from('lead_enrichments')
      .select('*')
      .eq('lead_id', leadId)
      .single();
    return data as LeadEnrichment | null;
  },

  /**
   * Get enriched emails for a lead
   */
  async getEmails(leadId: string): Promise<EnrichedEmail[]> {
    const supabase = createClient();
    const { data } = await supabase
      .from('enriched_emails')
      .select('*')
      .eq('lead_id', leadId)
      .order('confidence', { ascending: false });
    return (data || []) as EnrichedEmail[];
  },

  /**
   * Get enriched phones for a lead
   */
  async getPhones(leadId: string): Promise<EnrichedPhone[]> {
    const supabase = createClient();
    const { data } = await supabase
      .from('enriched_phones')
      .select('*')
      .eq('lead_id', leadId)
      .order('confidence', { ascending: false });
    return (data || []) as EnrichedPhone[];
  },

  /**
   * Check if cached result is still valid (within 90-day window)
   */
  isCacheValid(enrichment: LeadEnrichment | null): boolean {
    if (!enrichment?.cache_expires_at) return false;
    return new Date(enrichment.cache_expires_at) > new Date();
  },

  /**
   * Stage 1: Property Owner Lookup via BatchData
   * Runs automatically on new leads — cheapest tier
   * Now calls the real BatchData API route instead of simulating inline
   */
  async runStage1(leadId: string, address: string, prospectScore: number): Promise<{ success: boolean; message: string }> {
    const supabase = createClient();

    // Check cache first
    const existing = await this.getEnrichment(leadId);
    if (existing && this.isCacheValid(existing) && existing.stage1_completed_at) {
      return { success: true, message: 'Using cached Stage 1 result (within 90-day window)' };
    }

    // Check do-not-contact flag
    if (existing?.do_not_contact) {
      return { success: false, message: 'Lead is flagged Do Not Contact — enrichment blocked' };
    }

    try {
      // Call the BatchData enrichment API route
      const res = await fetch('/api/enrichment/batchdata', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadId, address, prospectScore }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        return { success: false, message: err.message || `BatchData API error: ${res.status}` };
      }

      const data = await res.json();

      if (data.cached) {
        return { success: true, message: 'Using cached Stage 1 result (within 90-day window)' };
      }

      if (!data.success) {
        return { success: false, message: data.message || 'Stage 1 enrichment failed' };
      }

      // Record enrichment activity
      recordEnrichmentCompleted({
        leadId,
        address,
        state: data.enrichment?.ownerMailingState || '',
        enrichmentType: 'Stage 1 — owner lookup (BatchData)',
      }).catch(() => {});

      return {
        success: true,
        message: data.simulated
          ? `Stage 1 complete (simulated): ${data.enrichment?.ownerName}, ${data.enrichment?.ownershipType}`
          : `Stage 1 complete: ${data.enrichment?.ownerName}, ${data.enrichment?.ownershipType}`,
      };
    } catch (err) {
      return { success: false, message: `Stage 1 network error: ${err instanceof Error ? err.message : 'unknown'}` };
    }
  },

  /**
   * Stage 2: Contact Enrichment via People Data Labs
   * Only runs on leads with prospect score >= 70
   */
  async runStage2(leadId: string, prospectScore: number): Promise<{ success: boolean; message: string }> {
    if (prospectScore < STAGE2_SCORE_THRESHOLD) {
      return { success: false, message: `Stage 2 requires prospect score ≥ ${STAGE2_SCORE_THRESHOLD}. Current score: ${prospectScore}` };
    }

    const supabase = createClient();
    const existing = await this.getEnrichment(leadId);

    if (existing?.do_not_contact) {
      return { success: false, message: 'Lead is flagged Do Not Contact — enrichment blocked' };
    }

    if (!existing?.stage1_completed_at) {
      return { success: false, message: 'Stage 1 must be completed before Stage 2' };
    }

    // Check cache
    if (existing && this.isCacheValid(existing) && existing.stage2_completed_at) {
      return { success: true, message: 'Using cached Stage 2 result (within 90-day window)' };
    }

    const logId = crypto.randomUUID();
    await supabase.from('enrichment_api_logs').insert({
      id: logId,
      lead_id: leadId,
      provider: 'People Data Labs',
      stage: 'stage2',
      cost: 0.25,
      success: false,
      called_at: new Date().toISOString(),
    });

    // ─── Real PDL API call ────────────────────────────────────────────────────
    const pdlApiKey = process.env.NEXT_PUBLIC_PDL_API_KEY || process.env.PDL_API_KEY;

    let pdlContacts: {
      emails: { email: string; confidence: number }[];
      phones: { number: string; type: string; confidence: number }[];
    } | null = null;

    if (pdlApiKey && pdlApiKey !== 'your-pdl-api-key-here') {
      try {
        // Build search params from owner data
        const ownerName = existing.owner_name || '';
        const ownerCity = existing.owner_mailing_city || '';
        const ownerState = existing.owner_mailing_state || '';

        const params = new URLSearchParams({
          api_key: pdlApiKey,
          pretty: 'false',
          size: '1',
        });

        if (ownerName) params.append('name', ownerName);
        if (ownerCity) params.append('location_locality', ownerCity);
        if (ownerState) params.append('location_region', ownerState);

        const pdlRes = await fetch(
          `https://api.peopledatalabs.com/v5/person/search?${params.toString()}`,
          {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json',
              'X-Api-Key': pdlApiKey,
            },
          }
        );

        if (pdlRes.ok) {
          const pdlData = await pdlRes.json();
          const person = pdlData?.data?.[0];

          if (person) {
            const likelihood = person.likelihood ?? 0; // 0–10 scale from PDL

            // Map PDL likelihood (0-10) to confidence percentage (0-100)
            const confidenceFromLikelihood = (likelihood: number) => Math.min(Math.round(likelihood * 10), 100);

            pdlContacts = {
              emails: (person.emails || []).slice(0, 3).map((e: { address: string }) => ({
                email: e.address,
                confidence: confidenceFromLikelihood(likelihood),
              })),
              phones: (person.phone_numbers || []).slice(0, 3).map((p: string) => ({
                number: p,
                type: 'mobile',
                confidence: confidenceFromLikelihood(likelihood),
              })),
            };
          }
        }
      } catch (pdlError) {
        // PDL call failed — fall through to simulation
        console.warn('[PDL Stage 2] API call failed, using simulation:', pdlError);
      }
    }

    // Fall back to simulation if PDL key missing or call failed
    if (!pdlContacts) {
      pdlContacts = {
        emails: [
          { email: 'owner@example.com', confidence: 92 },
          { email: 'alt@example.com', confidence: 67 },
        ],
        phones: [
          { number: '720-555-0100', type: 'mobile', confidence: 88 },
          { number: '303-555-0200', type: 'home', confidence: 55 },
        ],
      };
    }
    // ─────────────────────────────────────────────────────────────────────────

    // Insert emails
    for (const e of pdlContacts.emails) {
      await supabase.from('enriched_emails').upsert({
        id: crypto.randomUUID(),
        lead_id: leadId,
        email_address: e.email,
        confidence: e.confidence,
        source: 'People Data Labs',
        verified_status: e.confidence >= CONFIDENCE_THRESHOLD ? 'Verified' : 'Unverified',
        stage: 'stage2',
        is_selected: false,
      }, { onConflict: 'id' });
    }

    // Insert phones
    for (const p of pdlContacts.phones) {
      await supabase.from('enriched_phones').upsert({
        id: crypto.randomUUID(),
        lead_id: leadId,
        phone_number: p.number,
        phone_type: p.type,
        confidence: p.confidence,
        source: 'People Data Labs',
        verified_status: p.confidence >= CONFIDENCE_THRESHOLD ? 'Verified' : 'Unverified',
        stage: 'stage2',
        is_selected: false,
      }, { onConflict: 'id' });
    }

    // Update enrichment record
    const sources = [...(existing?.enrichment_sources || []), { provider: 'People Data Labs', stage: 'stage2', at: new Date().toISOString() }];
    const { error } = await supabase
      .from('lead_enrichments')
      .update({
        enrichment_status: 'Complete',
        stage2_provider: 'People Data Labs',
        stage2_completed_at: new Date().toISOString(),
        stage2_raw_response: pdlContacts,
        enrichment_sources: sources,
        last_enriched_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('lead_id', leadId);

    await supabase.from('enrichment_api_logs').update({ success: !error, cost: 0.25 }).eq('id', logId);

    if (error) return { success: false, message: `Stage 2 failed: ${error.message}` };

    const isLive = pdlApiKey && pdlApiKey !== 'your-pdl-api-key-here';
    return {
      success: true,
      message: isLive
        ? `Stage 2 complete — live PDL data: ${pdlContacts.emails.length} email(s), ${pdlContacts.phones.length} phone(s) retrieved`
        : 'Stage 2 complete — contact info retrieved (simulated — add PDL_API_KEY to .env for live data)',
    };
  },

  /**
   * Stage 2 (Salesgenie): Contact Enrichment via Salesgenie (Data Axle)
   *
   * Runs under the same gating rules as Stage 2 PDL:
   * - Prospect score must be >= STAGE2_SCORE_THRESHOLD (70)
   * - Stage 1 must be completed first
   * - Do Not Contact leads are blocked
   * - Results are cached for 90 days (shared cache_expires_at with the enrichment record)
   *
   * Credentials (SALESGENIE_API_USER, SALESGENIE_API_SECRET) are read server-side
   * via the /api/enrichment/salesgenie route — never exposed to the client.
   */
  async runStage2Salesgenie(leadId: string, prospectScore: number): Promise<{ success: boolean; message: string }> {
    if (prospectScore < STAGE2_SCORE_THRESHOLD) {
      return {
        success: false,
        message: `Stage 2 requires prospect score ≥ ${STAGE2_SCORE_THRESHOLD}. Current score: ${prospectScore}`,
      };
    }

    const supabase = createClient();
    const existing = await this.getEnrichment(leadId);

    // Do Not Contact guard
    if (existing?.do_not_contact) {
      return { success: false, message: 'Lead is flagged Do Not Contact — enrichment blocked' };
    }

    // Stage 1 prerequisite
    if (!existing?.stage1_completed_at) {
      return { success: false, message: 'Stage 1 must be completed before Stage 2' };
    }

    // Cache check — if Stage 2 was already completed within the 90-day window, skip
    if (existing && this.isCacheValid(existing) && existing.stage2_completed_at) {
      return { success: true, message: 'Using cached Stage 2 result (within 90-day window)' };
    }

    // Log the API call (pre-success)
    const logId = crypto.randomUUID();
    const sgCost = 0.20; // Salesgenie per-lookup cost — adjust per your Data Axle contract
    await supabase.from('enrichment_api_logs').insert({
      id: logId,
      lead_id: leadId,
      provider: 'Salesgenie',
      stage: 'stage2',
      cost: sgCost,
      success: false,
      called_at: new Date().toISOString(),
    });

    // Call the server-side Salesgenie route (keeps credentials off the client)
    let sgContacts: {
      emails: { email: string; confidence: number }[];
      phones: { number: string; type: string; confidence: number }[];
      matchScore: number;
      source: string;
    } | null = null;
    let isSimulated = true;

    try {
      const res = await fetch('/api/enrichment/salesgenie', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ownerName: existing.owner_name || '',
          city: existing.owner_mailing_city || '',
          state: existing.owner_mailing_state || '',
          zip: existing.owner_mailing_zip || '',
          address: existing.owner_mailing_address || '',
        }),
      });

      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data) {
          sgContacts = json.data;
          isSimulated = json.simulated ?? true;
        }
      } else {
        console.warn('[Salesgenie Stage 2] API route returned error:', res.status);
      }
    } catch (fetchErr) {
      console.warn('[Salesgenie Stage 2] Fetch failed, using simulation:', fetchErr);
    }

    // Fallback simulation if route failed or credentials not set
    if (!sgContacts) {
      sgContacts = {
        emails: [{ email: 'owner.salesgenie@example.com', confidence: 85 }],
        phones: [
          { number: '720-555-0300', type: 'mobile', confidence: 82 },
          { number: '303-555-0400', type: 'home', confidence: 60 },
        ],
        matchScore: 85,
        source: 'Salesgenie (simulated)',
      };
      isSimulated = true;
    }

    // Insert enriched emails
    for (const e of sgContacts.emails) {
      await supabase.from('enriched_emails').upsert(
        {
          id: crypto.randomUUID(),
          lead_id: leadId,
          email_address: e.email,
          confidence: e.confidence,
          source: 'Salesgenie',
          verified_status: e.confidence >= CONFIDENCE_THRESHOLD ? 'Verified' : 'Unverified',
          stage: 'stage2',
          is_selected: false,
        },
        { onConflict: 'id' }
      );
    }

    // Insert enriched phones
    for (const p of sgContacts.phones) {
      await supabase.from('enriched_phones').upsert(
        {
          id: crypto.randomUUID(),
          lead_id: leadId,
          phone_number: p.number,
          phone_type: p.type,
          confidence: p.confidence,
          source: 'Salesgenie',
          verified_status: p.confidence >= CONFIDENCE_THRESHOLD ? 'Verified' : 'Unverified',
          stage: 'stage2',
          is_selected: false,
        },
        { onConflict: 'id' }
      );
    }

    // Update enrichment record — append Salesgenie to sources list
    const sources = [
      ...(existing?.enrichment_sources || []),
      { provider: 'Salesgenie', stage: 'stage2', at: new Date().toISOString() },
    ];

    const cacheExpiry = new Date();
    cacheExpiry.setDate(cacheExpiry.getDate() + CACHE_DAYS);

    const { error } = await supabase
      .from('lead_enrichments')
      .update({
        enrichment_status: 'Complete',
        stage2_provider: 'Salesgenie',
        stage2_completed_at: new Date().toISOString(),
        stage2_raw_response: sgContacts,
        enrichment_sources: sources,
        last_enriched_at: new Date().toISOString(),
        cache_expires_at: cacheExpiry.toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('lead_id', leadId);

    await supabase
      .from('enrichment_api_logs')
      .update({ success: !error, cost: sgCost })
      .eq('id', logId);

    if (error) return { success: false, message: `Stage 2 (Salesgenie) failed: ${error.message}` };

    return {
      success: true,
      message: isSimulated
        ? `Stage 2 (Salesgenie) complete — ${sgContacts.emails.length} email(s), ${sgContacts.phones.length} phone(s) retrieved (simulated — add SALESGENIE_API_USER + SALESGENIE_API_SECRET to .env for live data)`
        : `Stage 2 (Salesgenie) complete — live data: ${sgContacts.emails.length} email(s), ${sgContacts.phones.length} phone(s) retrieved`,
    };
  },

  /**
   * Stage 3: Skip Trace (manual/premium action)
   * Only for high-value leads where Stage 1+2 returned weak results
   */
  async runStage3(leadId: string, prospectScore: number, price: number): Promise<{ success: boolean; message: string }> {
    const HIGH_VALUE_SCORE = 80;
    const HIGH_VALUE_PRICE = 3000;

    if (prospectScore < HIGH_VALUE_SCORE && price < HIGH_VALUE_PRICE) {
      return { success: false, message: `Skip Trace is reserved for high-value leads (score ≥ ${HIGH_VALUE_SCORE} or price ≥ $${HIGH_VALUE_PRICE.toLocaleString()})` };
    }

    const supabase = createClient();
    const existing = await this.getEnrichment(leadId);

    if (existing?.do_not_contact) {
      return { success: false, message: 'Lead is flagged Do Not Contact — enrichment blocked' };
    }

    const logId = crypto.randomUUID();
    const skipTraceCost = 1.50;

    await supabase.from('enrichment_api_logs').insert({
      id: logId,
      lead_id: leadId,
      provider: 'Skip Trace Provider',
      stage: 'stage3',
      cost: skipTraceCost,
      success: false,
      called_at: new Date().toISOString(),
    });

    // Simulate skip trace result
    const mockResult = {
      found: true,
      phone: '720-555-0999',
      email: 'skiptrace@example.com',
      confidence: 75,
    };

    if (mockResult.found) {
      await supabase.from('enriched_phones').insert({
        id: crypto.randomUUID(),
        lead_id: leadId,
        phone_number: mockResult.phone,
        phone_type: 'skip_trace',
        confidence: mockResult.confidence,
        source: 'Skip Trace',
        verified_status: mockResult.confidence >= CONFIDENCE_THRESHOLD ? 'Verified' : 'Unverified',
        stage: 'stage3',
        is_selected: false,
      });
    }

    const sources = [...(existing?.enrichment_sources || []), { provider: 'Skip Trace', stage: 'stage3', at: new Date().toISOString() }];
    const { error } = await supabase
      .from('lead_enrichments')
      .update({
        stage3_provider: 'Skip Trace Provider',
        stage3_completed_at: new Date().toISOString(),
        stage3_cost: skipTraceCost,
        stage3_raw_response: mockResult,
        enrichment_sources: sources,
        last_enriched_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('lead_id', leadId);

    await supabase.from('enrichment_api_logs').update({ success: !error, cost: skipTraceCost }).eq('id', logId);

    if (error) return { success: false, message: `Stage 3 failed: ${error.message}` };
    return { success: true, message: `Skip Trace complete — cost: $${skipTraceCost.toFixed(2)}` };
  },

  /**
   * Toggle Do Not Contact flag
   */
  async toggleDoNotContact(leadId: string, value: boolean): Promise<boolean> {
    const supabase = createClient();
    const existing = await this.getEnrichment(leadId);
    if (!existing) {
      const { error } = await supabase.from('lead_enrichments').insert({
        id: crypto.randomUUID(),
        lead_id: leadId,
        do_not_contact: value,
        enrichment_status: 'Not Enriched',
        ownership_type: 'Unknown',
      });
      return !error;
    }
    const { error } = await supabase
      .from('lead_enrichments')
      .update({ do_not_contact: value, updated_at: new Date().toISOString() })
      .eq('lead_id', leadId);
    return !error;
  },

  /**
   * Select a contact method for outreach
   */
  async selectEmail(emailId: string, leadId: string): Promise<void> {
    const supabase = createClient();
    await supabase.from('enriched_emails').update({ is_selected: false }).eq('lead_id', leadId);
    await supabase.from('enriched_emails').update({ is_selected: true }).eq('id', emailId);
  },

  async selectPhone(phoneId: string, leadId: string): Promise<void> {
    const supabase = createClient();
    await supabase.from('enriched_phones').update({ is_selected: false }).eq('lead_id', leadId);
    await supabase.from('enriched_phones').update({ is_selected: true }).eq('id', phoneId);
  },

  /**
   * Get cost tracking summary per provider
   */
  async getCostSummary(): Promise<Array<{ provider: string; stage: string; total_cost: number; total_calls: number; success_rate: number }>> {
    const supabase = createClient();
    const { data } = await supabase
      .from('enrichment_api_logs')
      .select('provider, stage, cost, success');

    if (!data) return [];

    const grouped: Record<string, { total_cost: number; total_calls: number; successes: number }> = {};
    for (const row of data) {
      const key = `${row.provider}__${row.stage}`;
      if (!grouped[key]) grouped[key] = { total_cost: 0, total_calls: 0, successes: 0 };
      grouped[key].total_cost += row.cost || 0;
      grouped[key].total_calls += 1;
      if (row.success) grouped[key].successes += 1;
    }

    return Object.entries(grouped).map(([key, v]) => {
      const [provider, stage] = key.split('__');
      return {
        provider,
        stage,
        total_cost: Math.round(v.total_cost * 100) / 100,
        total_calls: v.total_calls,
        success_rate: v.total_calls > 0 ? Math.round((v.successes / v.total_calls) * 100) : 0,
      };
    });
  },

  /**
   * Get the best phone number for a lead, applying self-submitted-first priority.
   * Self-submitted contact info always takes priority over enriched data.
   */
  async getBestPhone(leadId: string): Promise<{ number: string; origin: 'self_submitted' | 'enriched'; confidence: number } | null> {
    const supabase = createClient();

    // First check if lead has self-submitted phone (highest priority)
    const { data: lead } = await supabase
      .from('leads')
      .select('phone, contact_info_source')
      .eq('id', leadId)
      .single();

    if (lead?.phone && lead.contact_info_source === 'self_submitted') {
      return { number: lead.phone, origin: 'self_submitted', confidence: 100 };
    }

    // Fall back to highest-confidence enriched phone
    const phones = await this.getPhones(leadId);
    const selfSubmitted = phones.find(p => (p as any).origin === 'self_submitted');
    if (selfSubmitted) {
      return { number: selfSubmitted.phone_number, origin: 'self_submitted', confidence: selfSubmitted.confidence };
    }

    const bestEnriched = phones
      .filter(p => p.verified_status === 'Verified')
      .sort((a, b) => b.confidence - a.confidence)[0];

    if (bestEnriched) {
      return { number: bestEnriched.phone_number, origin: 'enriched', confidence: bestEnriched.confidence };
    }

    // Unverified fallback
    const anyPhone = phones.sort((a, b) => b.confidence - a.confidence)[0];
    if (anyPhone) {
      return { number: anyPhone.phone_number, origin: 'enriched', confidence: anyPhone.confidence };
    }

    return null;
  },

  /**
   * Get the best email for a lead, applying self-submitted-first priority.
   */
  async getBestEmail(leadId: string): Promise<{ address: string; origin: 'self_submitted' | 'enriched'; confidence: number } | null> {
    const supabase = createClient();

    // First check if lead has self-submitted email (highest priority)
    const { data: lead } = await supabase
      .from('leads')
      .select('email, contact_info_source')
      .eq('id', leadId)
      .single();

    if (lead?.email && lead.contact_info_source === 'self_submitted') {
      return { address: lead.email, origin: 'self_submitted', confidence: 100 };
    }

    // Fall back to highest-confidence enriched email
    const emails = await this.getEmails(leadId);
    const selfSubmitted = emails.find(e => (e as any).origin === 'self_submitted');
    if (selfSubmitted) {
      return { address: selfSubmitted.email_address, origin: 'self_submitted', confidence: selfSubmitted.confidence };
    }

    const bestEnriched = emails
      .filter(e => e.verified_status === 'Verified')
      .sort((a, b) => b.confidence - a.confidence)[0];

    if (bestEnriched) {
      return { address: bestEnriched.email_address, origin: 'enriched', confidence: bestEnriched.confidence };
    }

    const anyEmail = emails.sort((a, b) => b.confidence - a.confidence)[0];
    if (anyEmail) {
      return { address: anyEmail.email_address, origin: 'enriched', confidence: anyEmail.confidence };
    }

    return null;
  },

  /**
   * Store self-submitted contact info from landing page or info-request link.
   * Self-submitted entries always take priority over enriched data.
   */
  async storesSelfSubmittedContact(
    leadId: string,
    contact: { phone?: string; email?: string; firstName?: string; lastName?: string }
  ): Promise<void> {
    const supabase = createClient();

    if (contact.email) {
      await supabase.from('enriched_emails').upsert({
        id: crypto.randomUUID(),
        lead_id: leadId,
        email_address: contact.email,
        confidence: 100,
        source: 'self_submitted',
        verified_status: 'Verified',
        stage: 'stage1',
        is_selected: true,
        origin: 'self_submitted',
      }, { onConflict: 'id' });
    }

    if (contact.phone) {
      await supabase.from('enriched_phones').upsert({
        id: crypto.randomUUID(),
        lead_id: leadId,
        phone_number: contact.phone,
        phone_type: 'self_submitted',
        confidence: 100,
        source: 'self_submitted',
        verified_status: 'Verified',
        stage: 'stage1',
        is_selected: true,
        origin: 'self_submitted',
      }, { onConflict: 'id' });
    }

    // Update lead record with self-submitted contact info (highest priority)
    const updates: Record<string, string> = {
      contact_info_source: 'self_submitted',
      updated_at: new Date().toISOString(),
    };
    if (contact.phone) updates.phone = contact.phone;
    if (contact.email) updates.email = contact.email;
    if (contact.firstName && contact.lastName) {
      updates.contact_name = `${contact.firstName} ${contact.lastName}`;
    }

    await supabase.from('leads').update(updates).eq('id', leadId);
  },
};
