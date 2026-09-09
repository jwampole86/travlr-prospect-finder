'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import AppLayout from '@/components/AppLayout';
import KPIBentoGrid from '@/app/components/KPIBentoGrid';
import DashboardCharts from '@/app/components/DashboardCharts';
import TopLeadsTable from '@/app/components/TopLeadsTable';
import ActivityFeed from '@/app/components/ActivityFeed';
import RegulationSummaryPanel from '@/app/components/RegulationSummaryPanel';
import type { Lead } from '@/data/mockLeads';
import { leadsService } from '@/lib/services/leadsService';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { PORTFOLIOS } from '@/contexts/PortfolioContext';
import { RefreshCw, MapPin, ChevronDown, LayoutDashboard, ClipboardList } from 'lucide-react';

interface CommissionPayout {
  pendingPayout: number;
  nextPayoutDate?: string;
  nextPayoutAmount?: number;
  totalEarnedCurrentPeriod: number;
  totalEarnedLifetime: number;
}

export default function AgentDashboardPage() {
  const { user } = useAuth();
  const [allLeads, setAllLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const [assignedPortfolioKeys, setAssignedPortfolioKeys] = useState<string[]>([]);
  const [selectedPortfolioKey, setSelectedPortfolioKey] = useState<string>('all');
  const [portfolioDropdownOpen, setPortfolioDropdownOpen] = useState(false);
  const [commissionPayout, setCommissionPayout] = useState<CommissionPayout | undefined>(undefined);
  const batchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // ── Load agent's assigned portfolios from agent_invites ──────────────────
  useEffect(() => {
    if (!user?.id) return;
    const supabase = createClient();
    supabase
      .from('agent_invites')
      .select('assigned_portfolios')
      .eq('agent_user_id', user.id)
      .eq('status', 'completed')
      .single()
      .then(({ data }) => {
        if (data?.assigned_portfolios && data.assigned_portfolios.length > 0) {
          setAssignedPortfolioKeys(data.assigned_portfolios);
          setSelectedPortfolioKey(data.assigned_portfolios[0]);
        } else {
          // Fallback: show all if no specific assignment
          setAssignedPortfolioKeys([]);
          setSelectedPortfolioKey('all');
        }
      });
  }, [user?.id]);

  // ── Fetch leads ───────────────────────────────────────────────────────────
  const fetchLeads = useCallback(async () => {
    try {
      const dbLeads = await leadsService.getAll();
      setAllLeads(dbLeads);
      setLastRefreshed(new Date());
    } catch {
      // keep existing
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLeads();

    const supabase = createClient();
    const channel = supabase
      .channel('agent-dashboard-leads')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'leads' }, () => {
        if (batchTimerRef.current) clearTimeout(batchTimerRef.current);
        batchTimerRef.current = setTimeout(() => fetchLeads(), 2000);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      if (batchTimerRef.current) clearTimeout(batchTimerRef.current);
    };
  }, [fetchLeads]);

  // ── Commission payout ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!user?.id) return;
    const supabase = createClient();
    supabase
      .from('agent_commission_payouts')
      .select('pending_payout, next_payout_date, next_payout_amount, total_earned_current_period, total_earned_lifetime')
      .eq('agent_id', user.id)
      .single()
      .then(({ data }) => {
        if (data) {
          setCommissionPayout({
            pendingPayout: data.pending_payout ?? 0,
            nextPayoutDate: data.next_payout_date
              ? new Date(data.next_payout_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
              : undefined,
            nextPayoutAmount: data.next_payout_amount ?? 0,
            totalEarnedCurrentPeriod: data.total_earned_current_period ?? 0,
            totalEarnedLifetime: data.total_earned_lifetime ?? 0,
          });
        }
      });
  }, [user?.id]);

  // ── Close dropdown on outside click ──────────────────────────────────────
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setPortfolioDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // ── Derive visible portfolios for this agent ──────────────────────────────
  const agentPortfolios = assignedPortfolioKeys.length > 0
    ? PORTFOLIOS.filter((p) => p.key === 'all' || assignedPortfolioKeys.includes(p.key))
    : PORTFOLIOS;

  const selectedPortfolio = PORTFOLIOS.find((p) => p.key === selectedPortfolioKey) ?? PORTFOLIOS[0];

  // ── Filter leads to agent's zone ──────────────────────────────────────────
  const leads: Lead[] = (() => {
    // First scope to assigned portfolios (if any)
    const assignedStateCodes = assignedPortfolioKeys.length > 0
      ? PORTFOLIOS.filter((p) => assignedPortfolioKeys.includes(p.key)).map((p) => p.stateCode)
      : null;

    let filtered = assignedStateCodes
      ? allLeads.filter((l) => assignedStateCodes.includes(l.state ?? ''))
      : allLeads;

    // Then apply selected portfolio sub-filter
    if (selectedPortfolio.stateCode !== 'all') {
      filtered = filtered.filter((l) => l.state === selectedPortfolio.stateCode);
    }

    return filtered;
  })();

  // ── KPI calculations ──────────────────────────────────────────────────────
  const totalLeads = leads.length;
  const regulationFriendly = leads.filter(
    (l) => l.regulationStatus === 'Allowed' || l.regulationStatus === 'Restricted'
  ).length;
  const avgScore =
    totalLeads > 0
      ? Math.round(leads.reduce((sum, l) => sum + (l.prospectScore ?? 0), 0) / totalLeads)
      : 0;
  const activeLeads = leads.filter(
    (l) => l.stage !== 'Not a Fit' && l.stage !== 'Live'
  ).length;
  const actionNeededLeads = leads.filter(
    (l) => l.prospectScore >= 80 && l.stage === 'New Lead'
  ).length;
  const liveLeads = leads.filter((l) => l.stage === 'Live');
  const estimatedMonthlyRevenue = liveLeads.reduce(
    (sum, l) => sum + (l.estimatedNetMonthly ?? 0),
    0
  );
  const highPriority = leads.filter(
    (l) => l.prospectScore >= 80 && l.stage !== 'Not a Fit' && l.stage !== 'Live'
  ).length;

  // ── Zone label ────────────────────────────────────────────────────────────
  const zoneLabel = assignedPortfolioKeys.length > 0
    ? agentPortfolios
        .filter((p) => p.key !== 'all' && assignedPortfolioKeys.includes(p.key))
        .map((p) => p.abbr)
        .join(', ')
    : 'All Zones';

  return (
    <AppLayout>
      <div className="px-3 sm:px-6 py-4 sm:py-5 max-w-screen-2xl mx-auto space-y-4 sm:space-y-6">

        {/* ── Header ── */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <LayoutDashboard size={18} className="text-primary" />
            </div>
            <div>
              <h1 className="text-lg sm:text-xl font-bold text-foreground">My Portfolio Dashboard</h1>
              <div className="flex items-center gap-1.5 mt-0.5">
                <MapPin size={11} className="text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Zone: <span className="font-medium text-foreground">{zoneLabel}</span></span>
                {lastRefreshed && (
                  <span className="text-xs text-muted-foreground ml-2">
                    · Updated {lastRefreshed.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Portfolio sub-filter (only if agent has multiple assigned portfolios) */}
            {agentPortfolios.length > 2 && (
              <div className="relative" ref={dropdownRef}>
                <button
                  onClick={() => setPortfolioDropdownOpen((v) => !v)}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border bg-card text-sm font-medium text-foreground hover:border-primary/40 transition-colors"
                >
                  <span className={`w-2 h-2 rounded-full ${selectedPortfolio.color.replace('text-', 'bg-')}`} />
                  {selectedPortfolio.label}
                  <ChevronDown size={13} className={`transition-transform ${portfolioDropdownOpen ? 'rotate-180' : ''}`} />
                </button>
                {portfolioDropdownOpen && (
                  <div className="absolute right-0 mt-1 w-56 bg-card border border-border rounded-lg shadow-lg z-50 py-1">
                    {agentPortfolios.map((p) => (
                      <button
                        key={p.key}
                        onClick={() => { setSelectedPortfolioKey(p.key); setPortfolioDropdownOpen(false); }}
                        className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left hover:bg-muted transition-colors ${
                          selectedPortfolioKey === p.key ? 'text-primary font-medium' : 'text-foreground'
                        }`}
                      >
                        <span className={`w-2 h-2 rounded-full ${p.color.replace('text-', 'bg-')}`} />
                        {p.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Refresh button */}
            <button
              onClick={() => fetchLeads()}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border bg-card text-sm font-medium text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors"
            >
              <RefreshCw size={13} />
              <span className="hidden sm:inline">Refresh</span>
            </button>
          </div>
        </div>

        {/* ── Zone summary strip ── */}
        {assignedPortfolioKeys.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {agentPortfolios
              .filter((p) => p.key !== 'all')
              .map((p) => {
                const count = allLeads.filter((l) => l.state === p.stateCode).length;
                const isSelected = selectedPortfolioKey === p.key;
                return (
                  <button
                    key={p.key}
                    onClick={() => setSelectedPortfolioKey(isSelected ? 'all' : p.key)}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                      isSelected
                        ? 'border-primary bg-primary/10 text-primary' :'border-border bg-card text-muted-foreground hover:border-primary/30 hover:text-foreground'
                    }`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${p.color.replace('text-', 'bg-')}`} />
                    {p.abbr}
                    <span className="font-mono-data">{count.toLocaleString()}</span>
                  </button>
                );
              })}
            {selectedPortfolioKey !== 'all' && (
              <button
                onClick={() => setSelectedPortfolioKey('all')}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border border-dashed border-border text-muted-foreground hover:text-foreground transition-colors"
              >
                Show all zones
              </button>
            )}
          </div>
        )}

        {/* ── KPIs ── */}
        {loading ? (
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 sm:gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={`kpi-skel-${i}`}
                className={`${i === 0 ? 'col-span-2' : ''} bg-card rounded-xl border border-border p-4 min-h-[100px] animate-pulse`}
              />
            ))}
          </div>
        ) : (
          <KPIBentoGrid
            totalLeads={totalLeads}
            regulationFriendly={regulationFriendly}
            avgScore={avgScore}
            activeLeads={activeLeads}
            actionNeededLeads={actionNeededLeads}
            estimatedMonthlyRevenue={estimatedMonthlyRevenue}
            highPriority={highPriority}
            isAgentRole={true}
            commissionPayout={commissionPayout}
          />
        )}

        {/* ── Revenue estimate banner ── */}
        {!loading && liveLeads.length > 0 && (
          <div className="flex items-center justify-between px-4 py-3 rounded-lg bg-success/5 border border-success/20">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-success animate-pulse" />
              <span className="text-sm font-medium text-success">
                {liveLeads.length} Live {liveLeads.length === 1 ? 'property' : 'properties'} in your zone
              </span>
            </div>
            <span className="text-sm font-bold text-success font-mono-data">
              ${estimatedMonthlyRevenue.toLocaleString('en-US')}/mo est. net
            </span>
          </div>
        )}

        {/* ── Main content grid ── */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 sm:gap-5">
          <div className="xl:col-span-2 space-y-4 sm:space-y-5">
            <DashboardCharts leads={leads} />
            <TopLeadsTable leads={leads} />

            {/* Agent Lead Management shortcut */}
            <div className="flex items-center justify-between px-4 py-3 rounded-lg bg-card border border-border">
              <div className="flex items-center gap-2">
                <ClipboardList size={15} className="text-primary" />
                <div>
                  <p className="text-sm font-medium text-foreground">My Lead Management</p>
                  <p className="text-xs text-muted-foreground">Full table with filters, stage changes &amp; revenue estimator — scoped to your zone</p>
                </div>
              </div>
              <a
                href="/lead-management"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-colors shrink-0"
              >
                <ClipboardList size={12} />
                Open My Leads
              </a>
            </div>
          </div>
          <div className="space-y-4 sm:space-y-5">
            <ActivityFeed />
            <RegulationSummaryPanel />
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
