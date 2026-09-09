'use client';

import { createClient } from '@/lib/supabase/client';

/**
 * Craigslist Service — Compliance Notice
 *
 * ⚠️  LEGAL REVIEW REQUIRED before production use.
 * Craigslist's Terms of Service (Section 4) prohibit automated scraping,
 * crawling, or systematic data collection from their platform.
 * This service currently operates in SIMULATION MODE — no live HTTP requests
 * are made to Craigslist. All "link checks" and "re-match" logic are
 * simulated using stored snapshot data.
 *
 * Before activating any live Craigslist data collection:
 * 1. Obtain written legal sign-off confirming the intended use is compliant.
 * 2. Replace simulation stubs with compliant data-access methods only.
 * 3. Remove this notice and update the service accordingly.
 *
 * Current status: SIMULATION ONLY — safe to run in development/staging.
 */

export const CRAIGSLIST_COMPLIANCE_STATUS = {
  liveScrapingEnabled: false,
  legalReviewCompleted: false,
  note: 'Craigslist ToS prohibits automated scraping. Legal review required before enabling live data collection.',
} as const;

export interface CraigslistSnapshot {
  id: string;
  lead_id: string;
  title?: string;
  description?: string;
  price?: number;
  beds?: number;
  baths?: number;
  sqft?: number;
  photos: string[];
  original_post_date?: string;
  snapshot_date: string;
  original_url?: string;
  link_status: 'Active' | 'Stale' | 'Reposted' | 'Snapshot Only';
  last_link_check_at?: string;
  rematch_confidence?: number;
  rematch_url?: string;
  rematch_found_at?: string;
}

export const craigslistService = {
  /**
   * Get snapshot for a Craigslist lead
   */
  async getSnapshot(leadId: string): Promise<CraigslistSnapshot | null> {
    const supabase = createClient();
    const { data } = await supabase
      .from('craigslist_snapshots')
      .select('*')
      .eq('lead_id', leadId)
      .single();
    return data as CraigslistSnapshot | null;
  },

  /**
   * Save a snapshot at import time
   */
  async saveSnapshot(leadId: string, snapshot: Partial<CraigslistSnapshot>): Promise<boolean> {
    const supabase = createClient();
    const { error } = await supabase
      .from('craigslist_snapshots')
      .upsert({
        id: crypto.randomUUID(),
        lead_id: leadId,
        ...snapshot,
        snapshot_date: new Date().toISOString(),
        link_status: 'Active',
        updated_at: new Date().toISOString(),
      }, { onConflict: 'lead_id' });
    return !error;
  },

  /**
   * Check if a Craigslist URL is still live.
   *
   * SIMULATION MODE: No live HTTP requests are made to Craigslist.
   * Status is inferred from the stored snapshot date only.
   * Live link checking requires legal sign-off — see compliance notice above.
   */
  async checkLinkStatus(leadId: string, _url: string): Promise<'Active' | 'Stale'> {
    const supabase = createClient();
    const snapshot = await this.getSnapshot(leadId);

    // Simulation: posts older than 30 days are considered stale
    const isStale = snapshot?.original_post_date
      ? (Date.now() - new Date(snapshot.original_post_date).getTime()) > 30 * 24 * 60 * 60 * 1000
      : false;

    const status: 'Active' | 'Stale' = isStale ? 'Stale' : 'Active';

    await supabase
      .from('craigslist_snapshots')
      .update({
        link_status: status,
        last_link_check_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('lead_id', leadId);

    await supabase
      .from('leads')
      .update({
        craigslist_link_status: status,
        craigslist_last_link_check: new Date().toISOString(),
      })
      .eq('id', leadId);

    return status;
  },

  /**
   * Attempt automated re-match for a stale Craigslist listing.
   *
   * SIMULATION MODE: No live Craigslist search is performed.
   * Returns a deterministic result based on the lead ID hash to avoid
   * non-deterministic Math.random() in production logic.
   * Live re-matching requires legal sign-off — see compliance notice above.
   */
  async attemptRematch(leadId: string): Promise<{ found: boolean; url?: string; confidence?: number }> {
    const supabase = createClient();
    const snapshot = await this.getSnapshot(leadId);
    if (!snapshot) return { found: false };

    // Deterministic simulation based on lead ID (avoids Math.random in business logic)
    const hashCode = leadId.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
    const simulatedFound = hashCode % 2 === 0;
    const simulatedConfidence = 70 + (hashCode % 26); // 70–95

    if (simulatedFound) {
      const rematchUrl = `https://denver.craigslist.org/apa/${hashCode}`;
      await supabase
        .from('craigslist_snapshots')
        .update({
          link_status: 'Reposted',
          rematch_url: rematchUrl,
          rematch_confidence: simulatedConfidence,
          rematch_found_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('lead_id', leadId);

      await supabase
        .from('leads')
        .update({
          listing_url: rematchUrl,
          craigslist_link_status: 'Reposted',
          craigslist_rematch_confidence: simulatedConfidence,
        })
        .eq('id', leadId);

      return { found: true, url: rematchUrl, confidence: simulatedConfidence };
    } else {
      await supabase
        .from('craigslist_snapshots')
        .update({
          link_status: 'Snapshot Only',
          updated_at: new Date().toISOString(),
        })
        .eq('lead_id', leadId);

      await supabase
        .from('leads')
        .update({ craigslist_link_status: 'Snapshot Only' })
        .eq('id', leadId);

      return { found: false };
    }
  },

  /**
   * Get all Craigslist leads that need link re-checking
   */
  async getStaleLeads(): Promise<Array<{ lead_id: string; original_url: string }>> {
    const supabase = createClient();
    const { data } = await supabase
      .from('craigslist_snapshots')
      .select('lead_id, original_url')
      .in('link_status', ['Active', 'Stale'])
      .lt('last_link_check_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());
    return (data || []) as Array<{ lead_id: string; original_url: string }>;
  },
};
