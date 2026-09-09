'use client';

import { createClient } from '@/lib/supabase/client';

export type LinkStatus = 'Active' | 'Stale' | 'Reposted' | 'Unavailable';

export interface LinkViabilityCheck {
  id: string;
  lead_id: string;
  source_key: string;
  listing_url: string | null;
  link_status: LinkStatus;
  checked_at: string;
  error_message: string | null;
  is_craigslist: boolean;
  rematch_attempted: boolean;
  rematch_found: boolean;
  rematch_url: string | null;
  rematch_confidence: number | null;
}

export interface SourceIntelligenceRun {
  id: string;
  run_at: string;
  source_key: string;
  total_checked: number;
  active_count: number;
  stale_count: number;
  reposted_count: number;
  error_count: number;
  duration_ms: number | null;
  triggered_by: string;
}

export interface SourceStats {
  source_key: string;
  source_name: string;
  total_leads: number;
  active_links: number;
  stale_links: number;
  reposted_links: number;
  unavailable_links: number;
  stale_ratio: number;
  last_run_at: string | null;
  last_run_success: number;
  last_run_errors: number;
  dedup_rate: number;
  avg_enrichment_stage: number;
  cost_per_lead: number;
}

// Source display names
const SOURCE_NAMES: Record<string, string> = {
  trulia: 'Trulia',
  rentcom: 'Rent.com',
  realtorcom: 'Realtor.com',
  padmapper: 'PadMapper',
  apartmentlist: 'Apartment List',
  dwellsy: 'Dwellsy',
  zillow: 'Zillow',
  hotpads: 'HotPads',
  craigslist: 'Craigslist',
  apartments: 'Apartments.com',
  str_permits: 'STR Permits',
};

// Simulated cost-per-lead by source (in USD)
const COST_PER_LEAD: Record<string, number> = {
  trulia: 0.12,
  rentcom: 0.09,
  realtorcom: 0.15,
  padmapper: 0.08,
  apartmentlist: 0.11,
  dwellsy: 0.07,
  zillow: 0.18,
  hotpads: 0.10,
  craigslist: 0.04,
  apartments: 0.13,
  str_permits: 0.02,
};

export const linkViabilityService = {
  /**
   * Run a viability check across all leads for all sources.
   * In production this would make HTTP HEAD requests to each listing_url.
   * Here we simulate the check using URL patterns and age heuristics.
   */
  async runViabilityCheck(sourceKey?: string): Promise<{ checked: number; updated: number; errors: number }> {
    const supabase = createClient();
    const startTime = Date.now();

    // Fetch leads that need checking (no check in last 7 days, or never checked)
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    let query = supabase
      .from('leads')
      .select('id, source, listing_url, link_status, link_last_checked_at, created_at')
      .or(`link_last_checked_at.is.null,link_last_checked_at.lt.${sevenDaysAgo}`)
      .limit(200);

    if (sourceKey) {
      query = query.eq('source', sourceKey);
    }

    const { data: leads, error } = await query;
    if (error || !leads) return { checked: 0, updated: 0, errors: 1 };

    let updated = 0;
    let errors = 0;
    const sourceRunMap: Record<string, { total: number; active: number; stale: number; reposted: number; err: number }> = {};

    for (const lead of leads) {
      const src = (lead.source as string) || 'unknown';
      if (!sourceRunMap[src]) {
        sourceRunMap[src] = { total: 0, active: 0, stale: 0, reposted: 0, err: 0 };
      }
      sourceRunMap[src].total++;

      try {
        const newStatus = await this._simulateLinkCheck(lead);
        const isCraigslist = src === 'craigslist';

        // Record the check
        await supabase.from('link_viability_checks').insert({
          lead_id: String(lead.id),
          source_key: src,
          listing_url: lead.listing_url || null,
          link_status: newStatus,
          checked_at: new Date().toISOString(),
          is_craigslist: isCraigslist,
          rematch_attempted: isCraigslist && newStatus === 'Stale',
          rematch_found: false,
        });

        // Update lead
        await supabase
          .from('leads')
          .update({
            link_status: newStatus,
            link_last_checked_at: new Date().toISOString(),
          })
          .eq('id', lead.id);

        if (newStatus === 'Active') sourceRunMap[src].active++;
        else if (newStatus === 'Stale') sourceRunMap[src].stale++;
        else if (newStatus === 'Reposted') sourceRunMap[src].reposted++;
        updated++;
      } catch {
        errors++;
        sourceRunMap[src].err++;
      }
    }

    // Record run summaries per source
    const durationMs = Date.now() - startTime;
    for (const [src, counts] of Object.entries(sourceRunMap)) {
      await supabase.from('source_intelligence_runs').insert({
        source_key: src,
        total_checked: counts.total,
        active_count: counts.active,
        stale_count: counts.stale,
        reposted_count: counts.reposted,
        error_count: counts.err,
        duration_ms: durationMs,
        triggered_by: 'scheduler',
      });
    }

    return { checked: leads.length, updated, errors };
  },

  /**
   * Simulate link check — in production replace with actual HTTP HEAD request
   */
  async _simulateLinkCheck(lead: { id: unknown; listing_url?: string | null; created_at?: string; source?: string }): Promise<LinkStatus> {
    const url = lead.listing_url;
    if (!url) return 'Unavailable';

    // Craigslist links expire after ~30 days
    if (lead.source === 'craigslist') {
      const ageMs = lead.created_at ? Date.now() - new Date(lead.created_at).getTime() : 0;
      const ageDays = ageMs / (1000 * 60 * 60 * 24);
      if (ageDays > 30) return Math.random() > 0.4 ? 'Stale' : 'Reposted';
      return 'Active';
    }

    // Generic: URLs with search params are likely stale search URLs
    if (url.includes('?') && (url.includes('filter') || url.includes('search') || url.includes('type='))) {
      return 'Stale';
    }

    // Simulate ~5% stale rate for non-Craigslist sources
    return Math.random() > 0.05 ? 'Active' : 'Stale';
  },

  /**
   * Get per-source statistics for the Source Intelligence page
   */
  async getSourceStats(): Promise<SourceStats[]> {
    const supabase = createClient();

    // Get lead counts per source with link status breakdown
    const { data: leads } = await supabase
      .from('leads')
      .select('source, link_status, prospect_score, enrichment_status');

    // Get latest run per source
    const { data: runs } = await supabase
      .from('source_intelligence_runs')
      .select('*')
      .order('run_at', { ascending: false })
      .limit(100);

    // Get dedup log counts per source
    const { data: dedupLogs } = await supabase
      .from('dedup_log')
      .select('source_a, source_b');

    const sourceMap: Record<string, {
      total: number; active: number; stale: number; reposted: number; unavailable: number;
      scores: number[]; enrichmentStages: number[];
    }> = {};

    for (const lead of leads || []) {
      const src = (lead.source as string) || 'unknown';
      if (!sourceMap[src]) {
        sourceMap[src] = { total: 0, active: 0, stale: 0, reposted: 0, unavailable: 0, scores: [], enrichmentStages: [] };
      }
      sourceMap[src].total++;
      const status = (lead.link_status as string) || 'Active';
      if (status === 'Active') sourceMap[src].active++;
      else if (status === 'Stale') sourceMap[src].stale++;
      else if (status === 'Reposted') sourceMap[src].reposted++;
      else sourceMap[src].unavailable++;

      if (lead.prospect_score) sourceMap[src].scores.push(lead.prospect_score as number);

      // Map enrichment_status to a numeric stage
      const stageMap: Record<string, number> = {
        'Not enriched': 0, 'Partial': 1, 'Complete': 2,
      };
      const stage = stageMap[(lead.enrichment_status as string) || 'Not enriched'] ?? 0;
      sourceMap[src].enrichmentStages.push(stage);
    }

    // Count dedups per source
    const dedupCounts: Record<string, number> = {};
    for (const log of dedupLogs || []) {
      const src = (log.source_a as string) || '';
      dedupCounts[src] = (dedupCounts[src] || 0) + 1;
    }

    // Get latest run per source
    const latestRunMap: Record<string, SourceIntelligenceRun> = {};
    for (const run of runs || []) {
      const src = run.source_key as string;
      if (!latestRunMap[src]) latestRunMap[src] = run as SourceIntelligenceRun;
    }

    const allSources = Object.keys(SOURCE_NAMES);
    return allSources.map((src) => {
      const data = sourceMap[src] || { total: 0, active: 0, stale: 0, reposted: 0, unavailable: 0, scores: [], enrichmentStages: [] };
      const latestRun = latestRunMap[src];
      const deduped = dedupCounts[src] || 0;
      const dedupRate = data.total > 0 ? Math.round((deduped / data.total) * 100) : 0;
      const avgEnrichment = data.enrichmentStages.length > 0
        ? data.enrichmentStages.reduce((a, b) => a + b, 0) / data.enrichmentStages.length
        : 0;
      const staleRatio = data.total > 0 ? Math.round(((data.stale + data.unavailable) / data.total) * 100) : 0;

      return {
        source_key: src,
        source_name: SOURCE_NAMES[src] || src,
        total_leads: data.total,
        active_links: data.active,
        stale_links: data.stale,
        reposted_links: data.reposted,
        unavailable_links: data.unavailable,
        stale_ratio: staleRatio,
        last_run_at: latestRun?.run_at || null,
        last_run_success: latestRun?.active_count || 0,
        last_run_errors: latestRun?.error_count || 0,
        dedup_rate: dedupRate,
        avg_enrichment_stage: Math.round(avgEnrichment * 10) / 10,
        cost_per_lead: COST_PER_LEAD[src] || 0.10,
      };
    });
  },

  /**
   * Get recent viability check history
   */
  async getRecentChecks(limit = 50): Promise<LinkViabilityCheck[]> {
    const supabase = createClient();
    const { data } = await supabase
      .from('link_viability_checks')
      .select('*')
      .order('checked_at', { ascending: false })
      .limit(limit);
    return (data || []) as LinkViabilityCheck[];
  },

  /**
   * Get Craigslist-specific stale link stats
   */
  async getCraigslistStats(): Promise<{
    total: number; active: number; stale: number; reposted: number; snapshotOnly: number; staleRatio: number;
  }> {
    const supabase = createClient();
    const { data } = await supabase
      .from('leads')
      .select('link_status, craigslist_link_status')
      .eq('source', 'craigslist');

    const counts = { total: 0, active: 0, stale: 0, reposted: 0, snapshotOnly: 0 };
    for (const lead of data || []) {
      counts.total++;
      const status = (lead.craigslist_link_status as string) || (lead.link_status as string) || 'Active';
      if (status === 'Active') counts.active++;
      else if (status === 'Stale') counts.stale++;
      else if (status === 'Reposted') counts.reposted++;
      else counts.snapshotOnly++;
    }
    const staleRatio = counts.total > 0 ? Math.round(((counts.stale + counts.snapshotOnly) / counts.total) * 100) : 0;
    return { ...counts, staleRatio };
  },
};
