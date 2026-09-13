'use client';

import { useMemo } from 'react';
import { Building2 } from 'lucide-react';
import KPIBentoGrid from '@/app/components/KPIBentoGrid';
import TopLeadsTable from '@/app/components/TopLeadsTable';
import { mockLeads } from '@/data/mockLeads';
import { PROSPECT_FINDER_PLANS, type PlanId } from '@/lib/pricing/prospectFinderPlans';

interface PlanPreviewStats {
  totalLeads: number;
  regulationFriendly: number;
  avgScore: number;
  activeLeads: number;
  actionNeededLeads: number;
  estimatedMonthlyRevenue: number;
  highPriority: number;
  fullyVerified: number;
  unassignedPriority: number;
  assignedLeads: number;
  verifiedOwner: number;
  verifiedNumber: number;
  phoneAvailable: number;
  newLeads: number;
  scaleLabel: string;
  scopeBadge?: string;
}

// Same real dashboard widgets rendered with tier-appropriate illustrative numbers, so each
// plan tab shows an obviously-related but distinctly-scaled "screenshot" of the product.
const PLAN_PREVIEW_STATS: Record<PlanId, PlanPreviewStats> = {
  starter: {
    totalLeads: 186, regulationFriendly: 62, avgScore: 71, activeLeads: 48,
    actionNeededLeads: 14, estimatedMonthlyRevenue: 21400, highPriority: 12,
    fullyVerified: 96, unassignedPriority: 9, assignedLeads: 140, verifiedOwner: 118,
    verifiedNumber: 104, phoneAvailable: 130, newLeads: 22,
    scaleLabel: 'Solo agent · 1 market',
  },
  pro: {
    totalLeads: 640, regulationFriendly: 240, avgScore: 76, activeLeads: 168,
    actionNeededLeads: 46, estimatedMonthlyRevenue: 78200, highPriority: 51,
    fullyVerified: 412, unassignedPriority: 24, assignedLeads: 520, verifiedOwner: 470,
    verifiedNumber: 430, phoneAvailable: 505, newLeads: 58,
    scaleLabel: 'Growing team · 3 markets',
  },
  business: {
    totalLeads: 1248, regulationFriendly: 412, avgScore: 78, activeLeads: 340,
    actionNeededLeads: 94, estimatedMonthlyRevenue: 186400, highPriority: 94,
    fullyVerified: 812, unassignedPriority: 37, assignedLeads: 905, verifiedOwner: 940,
    verifiedNumber: 870, phoneAvailable: 1020, newLeads: 86,
    scaleLabel: 'Multi-agent team · 6 markets',
  },
  enterprise: {
    totalLeads: 5420, regulationFriendly: 1980, avgScore: 82, activeLeads: 1640,
    actionNeededLeads: 412, estimatedMonthlyRevenue: 742000, highPriority: 388,
    fullyVerified: 3860, unassignedPriority: 61, assignedLeads: 4750, verifiedOwner: 4980,
    verifiedNumber: 4610, phoneAvailable: 5120, newLeads: 340,
    scaleLabel: 'Enterprise rollup · 14 markets · 42 agents',
    scopeBadge: 'Multi-Org Rollup',
  },
};

export default function PlanPreviewShowcase({ planId }: { planId: PlanId }) {
  const stats = PLAN_PREVIEW_STATS[planId];
  const plan = PROSPECT_FINDER_PLANS[planId];

  // Enterprise gets the full sorted set (more rows to imply larger scale); other tiers show fewer.
  const topLeads = useMemo(() => {
    const sorted = [...mockLeads].sort((a, b) => b.prospectScore - a.prospectScore);
    return planId === 'enterprise' ? sorted : sorted.slice(0, 4);
  }, [planId]);

  return (
    <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 border-b border-border bg-muted/30">
        <div className="flex items-center gap-2">
          <Building2 size={14} className="text-primary" />
          <span className="text-xs font-semibold text-foreground">{plan.name} plan preview</span>
        </div>
        <div className="flex items-center gap-2">
          {stats.scopeBadge && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-primary/10 text-primary">{stats.scopeBadge}</span>
          )}
          <span className="text-[10px] text-muted-foreground">{stats.scaleLabel}</span>
        </div>
      </div>
      <div className="p-4 sm:p-5 space-y-4">
        <KPIBentoGrid
          totalLeads={stats.totalLeads}
          regulationFriendly={stats.regulationFriendly}
          avgScore={stats.avgScore}
          activeLeads={stats.activeLeads}
          actionNeededLeads={stats.actionNeededLeads}
          estimatedMonthlyRevenue={stats.estimatedMonthlyRevenue}
          highPriority={stats.highPriority}
          fullyVerified={stats.fullyVerified}
          unassignedPriority={stats.unassignedPriority}
          assignedLeads={stats.assignedLeads}
          verifiedOwner={stats.verifiedOwner}
          verifiedNumber={stats.verifiedNumber}
          phoneAvailable={stats.phoneAvailable}
          newLeads={stats.newLeads}
        />
        <TopLeadsTable leads={topLeads} />
      </div>
      <p className="px-5 pb-4 text-[10px] text-muted-foreground">Sample data for illustration purposes only.</p>
    </div>
  );
}
