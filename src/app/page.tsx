'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import AppLayout from '@/components/AppLayout';
import dynamic from 'next/dynamic';
import type { Lead } from '@/data/mockLeads';
import { createClient } from '@/lib/supabase/client';
import { trackDashboardViewed } from '@/lib/mixpanel';
import { usePortfolio } from '@/contexts/PortfolioContext';
import { useAuth } from '@/contexts/AuthContext';
import { useDashboardLeads } from '@/lib/hooks/useDashboardLeads';
import type { DashboardLead } from '@/lib/hooks/useDashboardLeads';
import { useLiveRevenue } from '@/lib/hooks/useLiveRevenue';
import { useRealtime } from '@/components/RealtimeProvider';
import { ChevronDown, ChevronUp, AlertTriangle, RefreshCw } from 'lucide-react';

// ─── Lazy-load ALL heavy/non-critical components ──────────────────────────────
const DashboardHeader = dynamic(() => import('./components/DashboardHeader'), {
  ssr: false,
  loading: () => (
    <div className="h-16 bg-card rounded-xl border border-border animate-pulse" />
  ),
});

const KPIBentoGrid = dynamic(() => import('./components/KPIBentoGrid'), {
  ssr: false,
  loading: () => (
    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 sm:gap-4">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={`kpi-skel-${i}`} className={`${i === 0 ? 'col-span-2' : ''} bg-card rounded-xl border border-border p-4 min-h-[100px] animate-pulse`} />
      ))}
    </div>
  ),
});

const TopLeadsTable = dynamic(() => import('./components/TopLeadsTable'), {
  ssr: false,
  loading: () => (
    <div className="bg-card rounded-xl border border-border overflow-hidden animate-pulse min-h-[200px]" />
  ),
});

const SyncStatusTicker = dynamic(() => import('./components/SyncStatusTicker'), {
  ssr: false,
  loading: () => (
    <div className="bg-card rounded-xl border border-border p-4 min-h-[80px] animate-pulse" />
  ),
});

const StageFunnelChart = dynamic(() => import('./components/StageFunnelChart'), {
  ssr: false,
  loading: () => (
    <div className="bg-card rounded-xl border border-border p-5 min-h-[220px] animate-pulse">
      <div className="h-4 w-32 bg-muted rounded mb-4" />
      <div className="h-40 w-full bg-muted rounded-lg" />
    </div>
  ),
});

const RegulationPieChart = dynamic(() => import('./components/RegulationPieChart'), {
  ssr: false,
  loading: () => (
    <div className="bg-card rounded-xl border border-border p-5 min-h-[220px] animate-pulse">
      <div className="h-4 w-32 bg-muted rounded mb-4" />
      <div className="h-40 w-40 bg-muted rounded-full mx-auto" />
    </div>
  ),
});

const ActivityFeed = dynamic(() => import('./components/ActivityFeed'), {
  ssr: false,
  loading: () => (
    <div className="bg-card rounded-xl border border-border p-5 min-h-[200px] animate-pulse">
      <div className="h-4 w-32 bg-muted rounded mb-4" />
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex gap-3 py-2">
          <div className="w-4 h-4 bg-muted rounded-full shrink-0 mt-0.5" />
          <div className="flex-1 h-4 bg-muted rounded" />
        </div>
      ))}
    </div>
  ),
});

const Base44WarmLeadBadge = dynamic(() => import('./components/Base44WarmLeadBadge'), { ssr: false });
const RegulationSummaryPanel = dynamic(() => import('./components/RegulationSummaryPanel'), { ssr: false });

const DashboardKPIMonitor = dynamic(() => import('@/components/DashboardKPIMonitor'), {
  ssr: false,
  loading: () => null,
});

// ─── Anchor nav items ─────────────────────────────────────────────────────────
// Order must match the actual section order rendered below.
const ANCHORS = [
  { id: 'section-overview', label: 'Overview' },
  { id: 'section-state-regs', label: 'State Regulations' },
  { id: 'section-pipeline', label: 'Pipeline' },
  { id: 'section-top-leads', label: 'Top Leads' },
  { id: 'section-city-regs', label: 'City Regulations' },
  { id: 'section-activity', label: 'Activity' },
  { id: 'section-data-sync', label: 'Data Sync' },
];

// ─── Section error boundary ───────────────────────────────────────────────────
interface SectionErrorProps {
  title: string;
  onRetry?: () => void;
}
function SectionError({ title, onRetry }: SectionErrorProps) {
  return (
    <div className="bg-card rounded-xl border border-destructive/30 p-5 flex flex-col items-center justify-center gap-2 min-h-[80px]">
      <AlertTriangle size={16} className="text-destructive" />
      <p className="text-xs font-medium text-destructive">Unable to load {title}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="flex items-center gap-1 text-[11px] text-primary hover:underline mt-1"
        >
          <RefreshCw size={10} /> Retry
        </button>
      )}
    </div>
  );
}

// ─── Section skeleton ─────────────────────────────────────────────────────────
function SectionSkeleton({ height = 220 }: { height?: number }) {
  return (
    <div
      className="bg-card rounded-xl border border-border animate-pulse"
      style={{ minHeight: height }}
    />
  );
}

// ─── Collapsible section wrapper ──────────────────────────────────────────────
interface CollapsibleSectionProps {
  id: string;
  title: string;
  subtitle?: string;
  storageKey: string;
  children: React.ReactNode;
}

function CollapsibleSection({ id, title, subtitle, storageKey, children }: CollapsibleSectionProps) {
  const [expanded, setExpanded] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    try {
      const stored = localStorage.getItem(storageKey);
      return stored === null ? true : stored === 'true';
    } catch {
      return true;
    }
  });

  const toggle = useCallback(() => {
    setExpanded((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(storageKey, String(next));
      } catch {
        // ignore
      }
      return next;
    });
  }, [storageKey]);

  return (
    <div id={id} className="scroll-mt-20">
      <button
        onClick={toggle}
        className="w-full flex items-center justify-between px-1 py-1 mb-2 group"
        aria-expanded={expanded}
      >
        <div className="text-left">
          <span className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors">
            {title}
          </span>
          {subtitle && (
            <span className="ml-2 text-xs text-muted-foreground">{subtitle}</span>
          )}
        </div>
        <span className="text-muted-foreground group-hover:text-primary transition-colors">
          {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </span>
      </button>
      {expanded && children}
    </div>
  );
}

/**
 * Convert a DashboardLead (minimal DB shape) to the Lead interface
 * expected by TopLeadsTable and DashboardCharts.
 */
function dashboardLeadToLead(dl: DashboardLead): Lead {
  return {
    id: dl.id,
    address: dl.address ?? '',
    city: dl.city ?? '',
    state: dl.state ?? '',
    zip: dl.zip ?? '',
    lat: 0,
    lng: 0,
    beds: dl.beds ?? 0,
    baths: dl.baths ?? 0,
    price: dl.price ?? 0,
    priceType: 'rent',
    source: (dl.source as Lead['source']) ?? 'Other',
    stage: (dl.stage as Lead['stage']) ?? 'New Lead',
    regulationStatus: (dl.regulation_status as Lead['regulationStatus']) ?? 'Unknown',
    prospectScore: dl.prospect_score ?? 0,
    daysOnMarket: 0,
    lastChecked: dl.created_at ?? '',
    listingUrl: dl.listing_url ?? '',
    notes: '',
    contactName: dl.contact_name ?? undefined,
    contactPhone: dl.contact_phone ?? undefined,
    tags: [],
    estimatedADR: 0,
    estimatedOccupancy: 0,
    estimatedGrossMonthly: 0,
    estimatedNetMonthly: dl.estimated_net_monthly ?? 0,
    photos: [],
    createdAt: dl.created_at ?? '',
    updatedAt: dl.created_at ?? '',
  };
}

export default function DashboardPage() {
  const { selectedPortfolio } = usePortfolio();
  const { role, user, loading: authLoading } = useAuth();
  const isAgentRole = role === 'agent';
  const isAdmin = role === 'admin' || role === 'owner';

  // ── Performance trace (admin only) ──────────────────────────────────────
  const traceRef = useRef<Record<string, number>>({});
  const markTrace = useCallback((label: string) => {
    if (typeof performance !== 'undefined') {
      traceRef.current[label] = Math.round(performance.now());
    }
  }, []);

  useEffect(() => {
    markTrace('page_init');
  }, [markTrace]);

  const portfolioState = selectedPortfolio.stateCode !== 'all' ? selectedPortfolio.stateCode : undefined;

  const { topLeads: rawTopLeads, stats, stageBreakdown, regulationBreakdown, topLoading, statsLoading, topLeadsError, statsError, refresh, refreshTopLeads, refreshStats } = useDashboardLeads(portfolioState, !authLoading);

  // Independent live revenue hook — never blocks other Dashboard sections
  const {
    liveRevenue,
    loading: liveRevenueLoading,
    error: liveRevenueError,
    refresh: refreshLiveRevenue,
  } = useLiveRevenue(portfolioState, !authLoading);

  // Track when each section resolves
  useEffect(() => {
    if (!statsLoading) markTrace('stats_resolved');
  }, [statsLoading, markTrace]);

  useEffect(() => {
    if (!topLoading) markTrace('top_leads_resolved');
  }, [topLoading, markTrace]);

  const topLeads: Lead[] = rawTopLeads.map(dashboardLeadToLead);

  // ── Agent commission payout ──────────────────────────────────────────────
  const [commissionPayout, setCommissionPayout] = useState<{
    pendingPayout: number;
    nextPayoutDate?: string;
    nextPayoutAmount?: number;
    totalEarnedCurrentPeriod: number;
    totalEarnedLifetime: number;
  } | undefined>(undefined);

  useEffect(() => {
    if (!isAgentRole || !user?.id) return;
    const supabase = createClient();
    let cancelled = false;
    supabase
      .from('agent_commission_payouts')
      .select('pending_payout, next_payout_date, next_payout_amount, total_earned_current_period, total_earned_lifetime')
      .eq('agent_id', user.id)
      .single()
      .then(({ data }) => {
        if (cancelled || !data) return;
        setCommissionPayout({
          pendingPayout: data.pending_payout ?? 0,
          nextPayoutDate: data.next_payout_date
            ? new Date(data.next_payout_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
            : undefined,
          nextPayoutAmount: data.next_payout_amount ?? 0,
          totalEarnedCurrentPeriod: data.total_earned_current_period ?? 0,
          totalEarnedLifetime: data.total_earned_lifetime ?? 0,
        });
      });
    return () => { cancelled = true; };
  }, [isAgentRole, user?.id]);

  // ── Mixpanel tracking ────────────────────────────────────────────────────
  useEffect(() => {
    if (statsLoading) return;
    trackDashboardViewed({
      totalLeads: stats.totalLeads,
      avgScore: stats.avgScore,
      activeLeads: stats.activeLeads,
      estimatedMonthlyRevenue: liveRevenueError ? undefined : liveRevenue,
    });
  }, [statsLoading, stats, liveRevenue, liveRevenueError]);

  // ── Realtime subscription — refresh on any leads change ─────────────────
  useEffect(() => {
    if (authLoading) return;
    const supabase = createClient();
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const channel = supabase
      .channel('dashboard-leads-direct')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'leads' }, () => {
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => refresh(), 5000);
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
      if (debounceTimer) clearTimeout(debounceTimer);
    };
  }, [authLoading, refresh]);

  // ── Real-time live indicator ─────────────────────────────────────────────
  const { lastUpdate, isConnected } = useRealtime();
  const [liveUpdateMsg, setLiveUpdateMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!lastUpdate) return;
    if (lastUpdate.table !== 'leads') return;
    const addr = String(lastUpdate.record?.address ?? 'A lead');
    let msg = '';
    if (lastUpdate.type === 'new_lead') msg = `New lead: ${addr}`;
    else if (lastUpdate.type === 'lead_stage_change') {
      const to = String(lastUpdate.record?.stage ?? '');
      msg = `${addr} → ${to}`;
    } else if (lastUpdate.type === 'lead_updated') msg = `${addr} updated`;
    if (msg) {
      setLiveUpdateMsg(msg);
      const t = setTimeout(() => setLiveUpdateMsg(null), 5000);
      return () => clearTimeout(t);
    }
  }, [lastUpdate]);

  // ── Smooth scroll handler ────────────────────────────────────────────────
  const scrollTo = useCallback((id: string) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  return (
    <AppLayout>
      <div className="px-3 sm:px-6 py-4 sm:py-5 max-w-screen-2xl mx-auto space-y-4 sm:space-y-6">
        <DashboardHeader onLeadsRefreshed={refresh} />

        {/* Real-time live indicator */}
        {(liveUpdateMsg || isConnected) && (
          <div className="flex items-center gap-2 px-4 py-2 bg-emerald-500/5 border border-emerald-500/20 rounded-xl">
            <span className={`w-2 h-2 rounded-full shrink-0 ${isConnected ? 'bg-emerald-500 animate-pulse' : 'bg-muted-foreground'}`} />
            <p className="text-xs text-emerald-700 dark:text-emerald-400 flex-1">
              {liveUpdateMsg ? (
                <><span className="font-semibold">Live:</span> {liveUpdateMsg}</>
              ) : (
                'Real-time updates active — changes by any agent appear instantly'
              )}
            </p>
          </div>
        )}

        {/* KPI Monitor — Admin only, hourly reconciliation */}
        {isAdmin && !statsLoading && (
          <DashboardKPIMonitor
            displayedStats={{
              totalLeads: stats.totalLeads,
              highPriority: stats.highPriority,
              avgScore: stats.avgScore,
              actionNeededLeads: stats.actionNeededLeads,
              fullyVerified: stats.fullyVerified,
              phoneAvailable: stats.phoneAvailable,
              unassignedPriority: stats.unassignedPriority,
              assignedLeads: stats.assignedLeads,
              activeLeads: stats.activeLeads,
              regulationFriendly: stats.regulationFriendly,
            }}
            portfolioState={portfolioState}
            isAdmin={isAdmin}
          />
        )}

        {/* ── ANCHOR NAVIGATION ─────────────────────────────────────────── */}
        <nav
          aria-label="Dashboard sections"
          className="flex flex-wrap items-center gap-1 sm:gap-2 px-1"
        >
          {ANCHORS.map((anchor) => (
            <button
              key={anchor.id}
              onClick={() => scrollTo(anchor.id)}
              className="text-[11px] sm:text-xs font-medium px-2.5 py-1 rounded-full bg-muted hover:bg-primary/10 hover:text-primary text-muted-foreground transition-colors whitespace-nowrap"
            >
              {anchor.label}
            </button>
          ))}
        </nav>

        {/* ── 1. KPI SUMMARY CARDS ──────────────────────────────────────── */}
        <div id="section-overview" className="scroll-mt-20">
          {statsLoading ? (
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 sm:gap-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={`kpi-skel-${i}`} className={`${i === 0 ? 'col-span-2' : ''} bg-card rounded-xl border border-border p-4 min-h-[100px] animate-pulse`} />
              ))}
            </div>
          ) : statsError ? (
            <SectionError title="KPI Summary" onRetry={refreshStats} />
          ) : (
            <KPIBentoGrid
              totalLeads={stats.totalLeads}
              regulationFriendly={stats.regulationFriendly}
              avgScore={stats.avgScore}
              activeLeads={stats.activeLeads}
              actionNeededLeads={stats.actionNeededLeads}
              estimatedMonthlyRevenue={liveRevenueError ? null : liveRevenue}
              highPriority={stats.highPriority}
              fullyVerified={stats.fullyVerified}
              unassignedPriority={stats.unassignedPriority}
              assignedLeads={stats.assignedLeads}
              verifiedOwner={stats.verifiedOwner}
              verifiedNumber={stats.verifiedNumber}
              phoneAvailable={stats.phoneAvailable}
              newLeads={stats.newLeads}
              luxuryProspects={stats.luxuryProspects}
              luxuryFullyVerified={stats.luxuryFullyVerified}
              luxuryVerifiedNumber={stats.luxuryVerifiedNumber}
              luxuryPriority={stats.luxuryPriority}
              luxuryUnassignedPriority={stats.luxuryUnassignedPriority}
              activePortfolios={(stats as { activePortfolios?: number }).activePortfolios ?? 0}
              isAgentRole={isAgentRole}
              commissionPayout={commissionPayout}
            />
          )}
        </div>

        {/* ── 2. STATE REGULATIONS ──────────────────────────────────────── */}
        <CollapsibleSection
          id="section-state-regs"
          title="State Regulations"
          subtitle="State STR compliance breakdown"
          storageKey="dashboard_collapse_state_regs"
        >
          {/* Independent loading — does NOT wait for topLoading */}
          {statsLoading ? (
            <SectionSkeleton height={220} />
          ) : statsError ? (
            <SectionError title="State Regulations" onRetry={refreshStats} />
          ) : (
            <RegulationPieChart regulationBreakdown={regulationBreakdown} />
          )}
        </CollapsibleSection>

        {/* ── 4. PIPELINE BY STAGE ──────────────────────────────────────── */}
        <div id="section-pipeline" className="scroll-mt-20">
          <div className="px-1 mb-2">
            <span className="text-sm font-semibold text-foreground">Pipeline by Stage</span>
            <span className="ml-2 text-xs text-muted-foreground">Lead distribution across funnel</span>
          </div>
          {/* Independent loading — does NOT wait for topLoading */}
          {statsLoading ? (
            <SectionSkeleton height={220} />
          ) : statsError ? (
            <SectionError title="Pipeline" onRetry={refreshStats} />
          ) : (
            <StageFunnelChart stageBreakdown={stageBreakdown} />
          )}
        </div>

        {/* ── 5. TOP SCORED LEADS ───────────────────────────────────────── */}
        <div id="section-top-leads" className="scroll-mt-20">
          <div className="px-1 mb-2">
            <span className="text-sm font-semibold text-foreground">Top Scored Leads</span>
            <span className="ml-2 text-xs text-muted-foreground">Highest priority properties for outreach</span>
          </div>
          {topLoading ? (
            <div className="bg-card rounded-xl border border-border overflow-hidden animate-pulse">
              <div className="px-5 py-4 border-b border-border flex items-center justify-between">
                <div className="h-4 w-32 bg-muted rounded" />
                <div className="h-7 w-24 bg-muted rounded-lg" />
              </div>
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={`tl-skel-${i}`} className="flex items-center gap-4 px-5 py-3 border-b border-border last:border-0">
                  <div className="h-4 w-40 bg-muted rounded" />
                  <div className="h-4 w-16 bg-muted rounded" />
                  <div className="h-4 w-20 bg-muted rounded" />
                  <div className="h-6 w-24 bg-muted rounded-full ml-auto" />
                </div>
              ))}
            </div>
          ) : topLeadsError ? (
            <SectionError title="Top Scored Leads" onRetry={refreshTopLeads} />
          ) : (
            <TopLeadsTable leads={topLeads} />
          )}
        </div>

        {/* ── 6. CITY REGULATIONS ───────────────────────────────────────── */}
        <CollapsibleSection
          id="section-city-regs"
          title="City Regulations"
          subtitle="STR rules by market · verified jurisdiction data"
          storageKey="dashboard_collapse_city_regs"
        >
          {/* Separate instance with city-specific title — fetches independently */}
          <RegulationSummaryPanel showHeader={false} />
        </CollapsibleSection>

        {/* ── 7. RECENT ACTIVITY ────────────────────────────────────────── */}
        <div id="section-activity" className="scroll-mt-20">
          <div className="px-1 mb-2">
            <span className="text-sm font-semibold text-foreground">Recent Activity</span>
            <span className="ml-2 text-xs text-muted-foreground">Latest changes across all leads</span>
          </div>
          {/* ActivityFeed fetches its own data independently — never blocked by dashboard loading */}
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 sm:gap-5">
            <div className="xl:col-span-2">
              <ActivityFeed />
            </div>
            <div className="space-y-4">
              <Base44WarmLeadBadge />
            </div>
          </div>
        </div>

        {/* ── 8. DATA SOURCE SYNC ───────────────────────────────────────── */}
        <CollapsibleSection
          id="section-data-sync"
          title="Data Source Sync"
          subtitle="Live source health and ingestion status"
          storageKey="dashboard_collapse_data_sync"
        >
          {/* SyncStatusTicker fetches its own data independently */}
          <SyncStatusTicker onLeadsRefreshed={refresh} />
        </CollapsibleSection>

      </div>
    </AppLayout>
  );
}

const EmailTemplate: React.FC = () => {
  return <div>{/* EmailTemplate placeholder */}</div>;
};

export { EmailTemplate };