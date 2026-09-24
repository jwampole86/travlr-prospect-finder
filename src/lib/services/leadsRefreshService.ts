'use client';

// ─── Per-portfolio refresh sources ────────────────────────────────────────────

export const REFRESH_SOURCES = [
  {
    name: 'Trulia',
    url: '/trulia-source-health',
    label: 'Trulia Source Integrity',
  },
  {
    name: 'Direct',
    url: '/lead-management',
    label: 'Manual & Master Uploads',
  },
  {
    name: 'MLS',
    url: '/lead-management?source=MLS',
    label: 'MLS / Licensed Sources',
  },
  {
    name: 'PropertyReach',
    url: '/contact-enrichment',
    label: 'PropertyReach Enrichment',
  },
];

/** Maximum leads per portfolio. Enforced as a soft cap with a visible warning. */
export const LEADS_PER_PORTFOLIO_CAP = 1000;

export interface RefreshResult {
  newLeads: number;
  updatedLeads: number;
  sources: string[];
  timestamp: string;
  error?: string;
  portfolioBreakdown?: Record<string, number>;
}

// Auto-refresh interval key for localStorage
const LAST_REFRESH_KEY = 'travlr_last_refresh';
const REFRESH_INTERVAL_MS = 1 * 60 * 60 * 1000; // 1 hour

export function getLastRefreshTime(): Date | null {
  if (typeof window === 'undefined') return null;
  const stored = localStorage.getItem(LAST_REFRESH_KEY);
  if (!stored) return null;
  return new Date(stored);
}

export function setLastRefreshTime(date: Date) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(LAST_REFRESH_KEY, date.toISOString());
}

export function shouldAutoRefresh(): boolean {
  const last = getLastRefreshTime();
  if (!last) return true;
  return Date.now() - last.getTime() > REFRESH_INTERVAL_MS;
}

export function getNextRefreshTime(): Date | null {
  const last = getLastRefreshTime();
  if (!last) return null;
  return new Date(last.getTime() + REFRESH_INTERVAL_MS);
}

/**
 * Lead refresh — DISABLED for synthetic generation.
 *
 * Previously this function generated invented address+city combinations and
 * inserted them as real leads. This caused mismatched addresses (e.g. a real
 * street from one city appearing under a different city/state) that could not
 * be verified on Zillow or HotPads.
 *
 * Real leads must come from actual source imports with verified listing URLs.
 * This function now returns a no-op result to prevent synthetic data insertion.
 */
export async function refreshLeadsFromSources(
  onProgress?: (msg: string) => void
): Promise<RefreshResult> {
  const now = new Date();
  onProgress?.('Refresh skipped — synthetic lead generation is disabled. Real leads come from verified source imports only.');
  setLastRefreshTime(now);
  return {
    newLeads: 0,
    updatedLeads: 0,
    sources: [],
    timestamp: now.toISOString(),
    error: undefined,
    portfolioBreakdown: {},
  };
}
