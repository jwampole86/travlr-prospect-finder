'use client';

import React, { useMemo, useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import KPIBentoGrid from '@/app/components/KPIBentoGrid';
import RegulationPieChart from '@/app/components/RegulationPieChart';
import StageFunnelChart from '@/app/components/StageFunnelChart';
import TopLeadsTable from '@/app/components/TopLeadsTable';
import { mockLeads } from '@/data/mockLeads';
import { LIGHT_VARS, DARK_VARS } from '../_theme';

// Renders the REAL dashboard widgets (KPIBentoGrid, RegulationPieChart, StageFunnelChart,
// TopLeadsTable) against sanitized fixture data so marketing screenshots stay pixel-accurate
// to the live product. Includes a light/dark toggle so both themes can be captured.
export default function DashboardPreviewPage() {
  const [dark, setDark] = useState(false);

  // Scale the small fixture set up so the funnel/pie read like an active portfolio
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
    <div className={dark ? 'dark' : ''} style={dark ? DARK_VARS : LIGHT_VARS}>
      <div className="min-h-screen bg-background p-6 sm:p-8 transition-colors">
        <div className="max-w-6xl mx-auto space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold text-foreground">Dashboard</h1>
              <p className="text-xs text-muted-foreground mt-0.5">Sample data for illustration purposes only</p>
            </div>
            <button
              type="button"
              onClick={() => setDark((d) => !d)}
              className="flex items-center gap-2 text-xs font-medium px-3 py-1.5 rounded-full border border-border bg-card text-foreground hover:bg-muted transition-colors"
            >
              {dark ? <Sun size={13} /> : <Moon size={13} />}
              {dark ? 'Light mode' : 'Dark mode'}
            </button>
          </div>

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
      </div>
    </div>
  );
}
