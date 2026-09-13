'use client';

import { useMemo } from 'react';
import KPIBentoGrid from '@/app/components/KPIBentoGrid';
import RegulationPieChart from '@/app/components/RegulationPieChart';
import StageFunnelChart from '@/app/components/StageFunnelChart';
import TopLeadsTable from '@/app/components/TopLeadsTable';
import { mockLeads } from '@/data/mockLeads';

// Shared dashboard widget content (real KPIBentoGrid/RegulationPieChart/StageFunnelChart/
// TopLeadsTable) so the standalone preview route and the embedded /welcome showcase render
// identically without duplicating the aggregation logic.
export default function DashboardWidgets() {
  const SCALE = 34;

  const stageBreakdown = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const lead of mockLeads) counts[lead.stage] = (counts[lead.stage] || 0) + 1;
    return Object.entries(counts).map(([stage, count]) => ({ stage, count: count * SCALE }));
  }, []);

  const regulationBreakdown = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const lead of mockLeads) counts[lead.regulationStatus] = (counts[lead.regulationStatus] || 0) + 1;
    return Object.entries(counts).map(([status, count]) => ({ status, count: count * SCALE }));
  }, []);

  const topLeads = useMemo(
    () => [...mockLeads].sort((a, b) => b.prospectScore - a.prospectScore),
    []
  );

  return (
    <div className="space-y-4">
      <KPIBentoGrid
        totalLeads={1248}
        regulationFriendly={412}
        avgScore={78}
        activeLeads={340}
        actionNeededLeads={94}
        estimatedMonthlyRevenue={186400}
        highPriority={94}
        fullyVerified={812}
        unassignedPriority={37}
        assignedLeads={905}
        verifiedOwner={940}
        verifiedNumber={870}
        phoneAvailable={1020}
        newLeads={86}
      />
      <RegulationPieChart regulationBreakdown={regulationBreakdown} />
      <div>
        <div className="mb-2">
          <span className="text-sm font-semibold text-foreground">Pipeline by Stage</span>
          <span className="ml-2 text-xs text-muted-foreground">Lead distribution across funnel</span>
        </div>
        <StageFunnelChart stageBreakdown={stageBreakdown} />
      </div>
      <TopLeadsTable leads={topLeads} />
    </div>
  );
}
