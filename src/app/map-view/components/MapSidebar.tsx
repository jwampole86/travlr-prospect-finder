'use client';

import React from 'react';
import type { Lead } from '@/data/mockLeads';
import RegulationBadge from '@/components/ui/RegulationBadge';
import ProspectScoreBar from '@/components/ui/ProspectScoreBar';
import StageBadge from '@/components/ui/StageBadge';
import { X, MapPin } from 'lucide-react';

interface MapSidebarProps {
  leads: Lead[];
  selectedId: string | null;
  onSelect: (lead: Lead) => void;
  onClose: () => void;
}

function formatCurrency(n: number) {
  return '$' + n.toLocaleString('en-US');
}

export default function MapSidebar({ leads, selectedId, onSelect, onClose }: MapSidebarProps) {
  const sorted = [...leads].sort((a, b) => b.prospectScore - a.prospectScore);

  return (
    <div className="w-72 shrink-0 border-r border-border bg-card flex flex-col overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <MapPin size={14} className="text-primary" />
          <span className="text-sm font-semibold text-foreground">
            {leads.length} Properties
          </span>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-all"
          title="Collapse sidebar"
        >
          <X size={14} />
        </button>
      </div>

      {leads.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
          <MapPin size={24} className="text-muted-foreground mb-3" />
          <p className="text-sm font-medium text-foreground">No leads match filters</p>
          <p className="text-xs text-muted-foreground mt-1">Adjust filters to see more pins</p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto scrollbar-thin divide-y divide-border">
          {sorted.map((lead) => (
            <button
              key={lead.id}
              onClick={() => onSelect(lead)}
              className={`w-full text-left px-4 py-3 hover:bg-muted/50 transition-colors duration-100 ${
                selectedId === lead.id ? 'bg-primary/5 border-l-2 border-primary' : ''
              }`}
            >
              <div className="flex items-start justify-between gap-2 mb-1.5">
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-foreground truncate">{lead.address}</p>
                  <p className="text-[10px] text-muted-foreground">{lead.city}, {lead.state}</p>
                </div>
                <RegulationBadge status={lead.regulationStatus} size="sm" />
              </div>
              <div className="flex items-center gap-3 mb-1.5">
                <span className="text-[11px] text-muted-foreground font-mono-data">
                  {lead.beds}bd/{lead.baths}ba
                </span>
                <span className="text-[11px] font-mono-data text-foreground">
                  {formatCurrency(lead.price)}/mo
                </span>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex-1">
                  <ProspectScoreBar score={lead.prospectScore} />
                </div>
                <StageBadge stage={lead.stage} size="sm" />
              </div>
              <p className="text-[10px] text-success font-mono-data font-semibold mt-1">
                {formatCurrency(lead.estimatedNetMonthly)}/mo est. net
              </p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}