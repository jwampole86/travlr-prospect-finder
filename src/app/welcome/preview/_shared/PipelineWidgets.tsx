'use client';

import { useMemo } from 'react';
import StageBadge from '@/components/ui/StageBadge';
import RegulationBadge from '@/components/ui/RegulationBadge';
import ProspectScoreBar from '@/components/ui/ProspectScoreBar';
import { mockLeads, stageOrder, type LeadStage, type Lead } from '@/data/mockLeads';

// Shared pipeline kanban content (real StageBadge/RegulationBadge/ProspectScoreBar) so the
// standalone preview route and the embedded /welcome showcase render identically.
export default function PipelineWidgets() {
  const columns = useMemo(() => {
    const byStage = {} as Record<LeadStage, Lead[]>;
    for (const stage of stageOrder) byStage[stage] = [];
    for (const lead of mockLeads) {
      if (!byStage[lead.stage]) byStage[lead.stage] = [];
      byStage[lead.stage].push(lead);
    }
    return stageOrder
      .filter((stage) => stage !== 'Not a Fit')
      .map((stage) => ({ stage, leads: byStage[stage] || [] }));
  }, []);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-6 gap-4">
      {columns.map(({ stage, leads }) => (
        <div key={stage} className="bg-card rounded-xl border border-border overflow-hidden">
          <div className="px-3 py-3 border-b border-border flex items-center justify-between gap-2">
            <StageBadge stage={stage} size="sm" />
            <span className="text-[11px] font-bold text-muted-foreground">{leads.length}</span>
          </div>
          <div className="p-2.5 space-y-2 min-h-[80px]">
            {leads.length === 0 ? (
              <p className="text-[11px] text-muted-foreground text-center py-4">No leads</p>
            ) : (
              leads.map((lead) => (
                <div key={lead.id} className="bg-muted/40 rounded-lg p-2.5 space-y-1.5">
                  <p className="text-xs font-semibold text-foreground truncate">{lead.address}</p>
                  <p className="text-[10px] text-muted-foreground">{lead.city}, {lead.state}</p>
                  <div className="flex items-center justify-between gap-1.5 flex-wrap">
                    <RegulationBadge status={lead.regulationStatus} size="sm" />
                    <ProspectScoreBar score={lead.prospectScore} />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
