'use client';

import { useMemo } from 'react';
import { Building2 } from 'lucide-react';
import KPIBentoGrid from '@/app/components/KPIBentoGrid';
import TopLeadsTable from '@/app/components/TopLeadsTable';
import { SHOWCASE_LEADS } from '@/app/welcome/preview/_shared/showcaseLeads';
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
    totalLeads: 150, regulationFriendly: 50, avgScore: 71, activeLeads: 40,
    actionNeededLeads: 11, estimatedMonthlyRevenue: 17600, highPriority: 10,
    fullyVerified: 52, unassignedPriority: 7, assignedLeads: 112, verifiedOwner: 96,
    verifiedNumber: 84, phoneAvailable: 104, newLeads: 50,
    scaleLabel: 'Solo agent · 1 market · about 3 months of leads',
  },
  pro: {
    totalLeads: 450, regulationFriendly: 168, avgScore: 76, activeLeads: 118,
    actionNeededLeads: 32, estimatedMonthlyRevenue: 64000, highPriority: 36,
    fullyVerified: 160, unassignedPriority: 17, assignedLeads: 368, verifiedOwner: 330,
    verifiedNumber: 300, phoneAvailable: 355, newLeads: 150,
    scaleLabel: 'Growing team · 3 markets · about 3 months of leads',
  },
  business: {
    totalLeads: 1200, regulationFriendly: 396, avgScore: 78, activeLeads: 320,
    actionNeededLeads: 88, estimatedMonthlyRevenue: 172000, highPriority: 90,
    fullyVerified: 430, unassignedPriority: 34, assignedLeads: 960, verifiedOwner: 900,
    verifiedNumber: 820, phoneAvailable: 960, newLeads: 400,
    scaleLabel: 'Multi-agent team · 6 markets · about 3 months of leads',
  },
  enterprise: {
    totalLeads: 4800, regulationFriendly: 1700, avgScore: 84, activeLeads: 1350,
    actionNeededLeads: 310, estimatedMonthlyRevenue: 640000, highPriority: 300,
    fullyVerified: 1800, unassignedPriority: 41, assignedLeads: 4400, verifiedOwner: 4300,
    verifiedNumber: 3900, phoneAvailable: 4400, newLeads: 1600,
    scaleLabel: 'Enterprise rollup · 22 markets · 68 agents · custom allowances',
    scopeBadge: 'Multi-Org Rollup',
  },
};

export default function PlanPreviewShowcase({ planId }: { planId: PlanId }) {
  const stats = PLAN_PREVIEW_STATS[planId];
  const plan = PROSPECT_FINDER_PLANS[planId];

  // Enterprise gets the full sorted set (more rows to imply larger scale); other tiers show fewer.
  const topLeads = useMemo(() => {
    const sorted = [...SHOWCASE_LEADS].sort((a, b) => b.prospectScore - a.prospectScore);
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
